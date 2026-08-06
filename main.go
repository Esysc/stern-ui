package main

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"sort"
	"strings"
	"sync"
	"text/template"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	stern "github.com/stern/stern/stern"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/fields"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
)

// Debug logging helper - checks DEBUG env var
var debugEnabled = os.Getenv("DEBUG") == "true"

func debugLog(format string, args ...interface{}) {
	if debugEnabled {
		log.Printf("[DEBUG] "+format, args...)
	}
}

//go:embed frontend/dist
var frontendFS embed.FS

var upgrader = websocket.Upgrader{
	CheckOrigin:      func(r *http.Request) bool { return true },
	HandshakeTimeout: 10 * time.Second,
	ReadBufferSize:   4096,
	WriteBufferSize:  4096,
}

// WebSocketWriter writes stern output to a WebSocket connection
type WebSocketWriter struct {
	conn      *websocket.Conn
	buf       *bytes.Buffer
	mu        sync.Mutex // Protects concurrent writes to websocket
	untilTime time.Time  // If set, filters out logs after this time
}

func (w *WebSocketWriter) Write(p []byte) (n int, err error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	// Set write deadline for each message
	w.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))

	// Write each line to the websocket
	lines := bytes.Split(p, []byte("\n"))
	for _, line := range lines {
		if len(line) == 0 {
			continue
		}

		// Filter by untilTime if set
		if !w.untilTime.IsZero() {
			var logEntry map[string]interface{}
			if err := json.Unmarshal(line, &logEntry); err == nil {
				// Extract timestamp from the message field
				// Log format: [2026-01-15T14:44:37.663Z] "GET /adm/v1/administrator/ping..."
				if message, ok := logEntry["message"].(string); ok && len(message) > 0 {
					// Check if message starts with [
					if message[0] == '[' {
						// Find the closing bracket
						endIdx := -1
						for i := 1; i < len(message) && i < 30; i++ {
							if message[i] == ']' {
								endIdx = i
								break
							}
						}

						if endIdx > 0 {
							timestampStr := message[1:endIdx]
							if logTime, err := time.Parse(time.RFC3339Nano, timestampStr); err == nil {
								// If log is after untilTime, skip it
								if logTime.After(w.untilTime) {
									continue
								}
							}
						}
					}
				}
			}
		}

		if err := w.conn.WriteMessage(websocket.TextMessage, line); err != nil {
			return 0, err
		}
	}
	return len(p), nil
}

// WriteMessage writes a message with the given type, protected by mutex
func (w *WebSocketWriter) WriteMessage(messageType int, data []byte) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	return w.conn.WriteMessage(messageType, data)
}

type streamParams struct {
	namespace           string
	selector            string
	query               string
	since               string
	container           string
	excludeContainer    string
	excludePod          string
	containerState      string
	include             string
	exclude             string
	highlight           string
	tail                string
	node                string
	allNamespaces       string
	initContainers      string
	ephemeralContainers string
	timestamps          string
	noFollow            string
	contextName         string
	maxLogRequests      string
	timeRangeMode       string
	sinceTime           string
	untilTime           string
}

func parseStreamParams(c *gin.Context) streamParams {
	return streamParams{
		namespace:           c.Query("namespace"),
		selector:            c.Query("selector"),
		query:               c.Query("query"),
		since:               c.Query("since"),
		container:           c.Query("container"),
		excludeContainer:    c.Query("excludeContainer"),
		excludePod:          c.Query("excludePod"),
		containerState:      c.Query("containerState"),
		include:             c.Query("include"),
		exclude:             c.Query("exclude"),
		highlight:           c.Query("highlight"),
		tail:                c.Query("tail"),
		node:                c.Query("node"),
		allNamespaces:       c.Query("allNamespaces"),
		initContainers:      c.Query("initContainers"),
		ephemeralContainers: c.Query("ephemeralContainers"),
		timestamps:          c.Query("timestamps"),
		noFollow:            c.Query("noFollow"),
		contextName:         c.Query("context"),
		maxLogRequests:      c.Query("maxLogRequests"),
		timeRangeMode:       c.Query("timeRangeMode"),
		sinceTime:           c.Query("sinceTime"),
		untilTime:           c.Query("untilTime"),
	}
}

func createKubeClient(contextName string) (kubernetes.Interface, clientcmd.ClientConfig, error) {
	loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
	configOverrides := &clientcmd.ConfigOverrides{}
	if contextName != "" {
		configOverrides.CurrentContext = contextName
	}

	kubeConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, configOverrides)
	restConfig, err := kubeConfig.ClientConfig()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to load kubeconfig: %w", err)
	}

	// Enable exec credential plugin auto-refresh (for gcloud, aws, az)
	// This allows credentials to be refreshed automatically on demand
	if restConfig.ExecProvider != nil {
		restConfig.ExecProvider.InstallHint = ""
	}

	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create Kubernetes client: %w", err)
	}

	return clientset, kubeConfig, nil
}

func parseNumericParams(params streamParams) (*int64, time.Duration, int) {
	var tailLines *int64
	if params.tail != "" && params.tail != "-1" {
		var t int64
		fmt.Sscanf(params.tail, "%d", &t)
		tailLines = &t
	}

	var sinceDuration time.Duration

	// Handle absolute time range mode
	if params.timeRangeMode == "absolute" && params.sinceTime != "" {
		// Parse the sinceTime as datetime-local format (YYYY-MM-DDTHH:MM)
		sinceT, err := time.Parse("2006-01-02T15:04", params.sinceTime)
		if err == nil {
			sinceDuration = time.Since(sinceT)
			if sinceDuration < 0 {
				sinceDuration = 0
			}
		}
	} else if params.since != "" {
		// Use relative time duration
		sinceDuration, _ = time.ParseDuration(params.since)
	} else {
		// Default: last 48 hours
		sinceDuration = 48 * time.Hour
	}

	maxReq := 50
	if params.maxLogRequests != "" {
		fmt.Sscanf(params.maxLogRequests, "%d", &maxReq)
	}

	return tailLines, sinceDuration, maxReq
}

func buildNamespaceList(params streamParams, kubeConfig clientcmd.ClientConfig) []string {
	if params.allNamespaces == "true" {
		return []string{""}
	}
	if params.namespace != "" {
		return []string{params.namespace}
	}
	ns, _, _ := kubeConfig.Namespace()
	if ns == "" {
		ns = "default"
	}
	return []string{ns}
}

func parseSelectors(params streamParams) (labels.Selector, fields.Selector, error) {
	var labelSelector labels.Selector
	var err error
	if params.selector != "" {
		labelSelector, err = labels.Parse(params.selector)
		if err != nil {
			return nil, nil, fmt.Errorf("invalid selector: %w", err)
		}
	} else {
		labelSelector = labels.Everything()
	}

	var fieldSelector fields.Selector
	if params.node != "" {
		fieldSelector, err = fields.ParseSelector(fmt.Sprintf("spec.nodeName=%s", params.node))
		if err != nil {
			return nil, nil, fmt.Errorf("invalid node filter: %w", err)
		}
	} else {
		fieldSelector = fields.Everything()
	}

	return labelSelector, fieldSelector, nil
}

func parseContainerStates(containerState string) []stern.ContainerState {
	if containerState != "" && containerState != "all" {
		return []stern.ContainerState{stern.ContainerState(containerState)}
	}
	return []stern.ContainerState{stern.RUNNING}
}

func compileRegexList(filterStr string) ([]*regexp.Regexp, error) {
	var regexes []*regexp.Regexp
	if filterStr == "" {
		return regexes, nil
	}

	for _, filter := range strings.Split(filterStr, ",") {
		if filter = strings.TrimSpace(filter); filter != "" {
			re, err := regexp.Compile(filter)
			if err != nil {
				return nil, err
			}
			regexes = append(regexes, re)
		}
	}
	return regexes, nil
}

func extractContainerName(input string) string {
	// Extract container name from "pod/container" format
	if strings.Contains(input, "/") {
		parts := strings.Split(input, "/")
		return parts[len(parts)-1]
	}
	return input
}

func compileContainerRegexList(filterStr string) ([]*regexp.Regexp, error) {
	// Like compileRegexList but extracts container names from "pod/container" format
	var regexes []*regexp.Regexp
	if filterStr == "" {
		return regexes, nil
	}

	for _, filter := range strings.Split(filterStr, ",") {
		if filter = strings.TrimSpace(filter); filter != "" {
			// Extract container name if in "pod/container" format
			containerName := extractContainerName(filter)

			// Check if it's already a regex pattern (contains regex special chars)
			// If not, make it an exact match by escaping and anchoring
			pattern := containerName
			if !strings.ContainsAny(pattern, ".*+?[]{}()^$|\\") {
				pattern = "^" + regexp.QuoteMeta(pattern) + "$"
			}

			re, err := regexp.Compile(pattern)
			if err != nil {
				return nil, err
			}
			regexes = append(regexes, re)
		}
	}
	return regexes, nil
}

func parseRegexFilters(params streamParams) (*regexp.Regexp, *regexp.Regexp, []*regexp.Regexp, []*regexp.Regexp, []*regexp.Regexp, []*regexp.Regexp, []*regexp.Regexp, error) {
	debugLog("=== parseRegexFilters ===")
	debugLog("  namespace: %q", params.namespace)
	debugLog("  selector: %q", params.selector)
	debugLog("  query: %q", params.query)
	debugLog("  container: %q", params.container)
	debugLog("  excludeContainer: %q", params.excludeContainer)
	debugLog("  excludePod: %q", params.excludePod)
	debugLog("  include: %q", params.include)
	debugLog("  exclude: %q", params.exclude)
	debugLog("  highlight: %q", params.highlight)
	debugLog("  since: %q", params.since)
	debugLog("  tail: %s", params.tail)
	debugLog("  allNamespaces: %q", params.allNamespaces)
	debugLog("========================")

	// Handle query regex - if container has pod/container format, extract pod name for query
	queryPattern := params.query
	if params.container != "" && strings.Contains(params.container, "/") {
		// Extract pod name from "pod/container" format
		parts := strings.Split(params.container, "/")
		if len(parts) >= 2 {
			podName := parts[0]
			debugLog("Container field contains pod/container format. Extracted pod name: %q", podName)
			// Override query to match only this specific pod
			queryPattern = "^" + regexp.QuoteMeta(podName) + "$"
			debugLog("Overriding query pattern to match specific pod: %q", queryPattern)
		}
	}

	queryRegex, err := regexp.Compile(queryPattern)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("invalid query regex: %w", err)
	}
	debugLog("Query regex compiled: %s", queryRegex.String())

	containerRegex := regexp.MustCompile(".*")
	if params.container != "" {
		// Extract container name from "pod/container" format if needed
		containerName := extractContainerName(params.container)
		debugLog("Extracted container name: %q from input: %q", containerName, params.container)

		// Check if it's already a regex pattern (contains regex special chars)
		// If not, make it an exact match by escaping and anchoring
		pattern := containerName
		if !strings.ContainsAny(pattern, ".*+?[]{}()^$|\\") {
			pattern = "^" + regexp.QuoteMeta(pattern) + "$"
		}
		debugLog("Container regex pattern: %q -> compiled regex: %s", pattern, pattern)

		containerRegex, err = regexp.Compile(pattern)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("invalid container regex: %w", err)
		}
	}

	includeRegexes, err := compileRegexList(params.include)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("invalid include filter: %w", err)
	}
	debugLog("Include regexes: %d patterns", len(includeRegexes))

	excludeRegexes, err := compileRegexList(params.exclude)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("invalid exclude filter: %w", err)
	}
	debugLog("Exclude regexes: %d patterns", len(excludeRegexes))

	highlightRegexes, err := compileRegexList(params.highlight)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("invalid highlight filter: %w", err)
	}
	debugLog("Highlight regexes: %d patterns", len(highlightRegexes))

	excludeContainerRegexes, err := compileContainerRegexList(params.excludeContainer)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("invalid exclude container: %w", err)
	}
	debugLog("Exclude container regexes: %d patterns", len(excludeContainerRegexes))

	excludePodRegexes, err := compileRegexList(params.excludePod)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("invalid exclude pod: %w", err)
	}
	debugLog("Exclude pod regexes: %d patterns", len(excludePodRegexes))

	return queryRegex, containerRegex, includeRegexes, excludeRegexes, highlightRegexes, excludeContainerRegexes, excludePodRegexes, nil
}

func createSternTemplate() *template.Template {
	return template.Must(template.New("stern").Funcs(template.FuncMap{
		"json": func(in interface{}) (string, error) {
			b, err := json.Marshal(in)
			if err != nil {
				return "", err
			}
			return string(b), nil
		},
	}).Parse(
		`{"namespace":"{{.Namespace}}","podName":"{{.PodName}}","containerName":"{{.ContainerName}}","nodeName":"{{.NodeName}}","message":{{.Message | json}}}` + "\n",
	))
}

type sternConfigParams struct {
	params                  streamParams
	namespaces              []string
	labelSelector           labels.Selector
	fieldSelector           fields.Selector
	tailLines               *int64
	sinceDuration           time.Duration
	maxReq                  int
	containerStates         []stern.ContainerState
	queryRegex              *regexp.Regexp
	containerRegex          *regexp.Regexp
	includeRegexes          []*regexp.Regexp
	excludeRegexes          []*regexp.Regexp
	highlightRegexes        []*regexp.Regexp
	excludeContainerRegexes []*regexp.Regexp
	excludePodRegexes       []*regexp.Regexp
	writer                  *WebSocketWriter
	untilTime               time.Time
}

func buildSternConfig(cfg sternConfigParams) *stern.Config {
	tmpl := createSternTemplate()

	return &stern.Config{
		Namespaces:            cfg.namespaces,
		PodQuery:              cfg.queryRegex,
		ExcludePodQuery:       cfg.excludePodRegexes,
		Timestamps:            cfg.params.timestamps != "",
		TimestampFormat:       stern.TimestampFormatDefault,
		Location:              time.Local,
		ContainerQuery:        cfg.containerRegex,
		ExcludeContainerQuery: cfg.excludeContainerRegexes,
		ContainerStates:       cfg.containerStates,
		Exclude:               cfg.excludeRegexes,
		Include:               cfg.includeRegexes,
		Highlight:             cfg.highlightRegexes,
		Since:                 cfg.sinceDuration,
		AllNamespaces:         cfg.params.allNamespaces == "true",
		LabelSelector:         cfg.labelSelector,
		FieldSelector:         cfg.fieldSelector,
		TailLines:             cfg.tailLines,
		Template:              tmpl,
		Follow:                cfg.params.noFollow != "true",
		InitContainers:        cfg.params.initContainers != "false",
		EphemeralContainers:   cfg.params.ephemeralContainers != "false",
		MaxLogRequests:        cfg.maxReq,
		Out:                   cfg.writer,
		ErrOut:                io.Discard,
	}
}

func setupWebSocketHandlers(conn *websocket.Conn, ctx context.Context, cancel context.CancelFunc, writer *WebSocketWriter) {
	const (
		pongWait   = 60 * time.Second
		pingPeriod = 30 * time.Second
	)

	// Set initial read deadline and pong handler
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	// Start a goroutine to read (and discard) messages from client
	go func() {
		defer cancel()
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	// Start ping/pong to keep WebSocket alive
	go func() {
		ticker := time.NewTicker(pingPeriod)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if err := writer.WriteMessage(websocket.PingMessage, nil); err != nil {
					cancel()
					return
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	// Monitor WebSocket for close from client
	conn.SetCloseHandler(func(code int, text string) error {
		cancel()
		return nil
	})
}

func startCredentialRefresher(ctx context.Context, clientset *kubernetes.Interface, contextName string, clientMutex *sync.Mutex) {
	go func() {
		ticker := time.NewTicker(30 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				clientMutex.Lock()
				newClientset, _, err := createKubeClient(contextName)
				if err == nil {
					*clientset = newClientset
				}
				clientMutex.Unlock()
			case <-ctx.Done():
				return
			}
		}
	}()
}

func streamLogs(c *gin.Context) {
	params := parseStreamParams(c)

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	writer := &WebSocketWriter{conn: conn, buf: &bytes.Buffer{}}

	clientset, kubeConfig, err := createKubeClient(params.contextName)
	if err != nil {
		_ = writer.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf(`{"error":"%s"}`, err)))
		return
	}

	tailLines, sinceDuration, maxReq := parseNumericParams(params)
	namespaces := buildNamespaceList(params, kubeConfig)

	labelSelector, fieldSelector, err := parseSelectors(params)
	if err != nil {
		_ = writer.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf(`{"error":"%s"}`, err)))
		return
	}

	containerStates := parseContainerStates(params.containerState)

	queryRegex, containerRegex, includeRegexes, excludeRegexes, highlightRegexes, excludeContainerRegexes, excludePodRegexes, err := parseRegexFilters(params)
	if err != nil {
		_ = writer.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf(`{"error":"%s"}`, err)))
		return
	}

	// Parse untilTime if provided
	var untilTime time.Time
	if params.timeRangeMode == "absolute" && params.untilTime != "" {
		parsedTime, err := time.Parse("2006-01-02T15:04", params.untilTime)
		if err == nil {
			untilTime = parsedTime
			writer.untilTime = untilTime
			// Automatically disable follow mode when untilTime is set
			// This ensures stern stops after reaching the end time
			params.noFollow = "true"
		}
	}

	config := buildSternConfig(sternConfigParams{
		params:                  params,
		namespaces:              namespaces,
		labelSelector:           labelSelector,
		fieldSelector:           fieldSelector,
		tailLines:               tailLines,
		sinceDuration:           sinceDuration,
		maxReq:                  maxReq,
		containerStates:         containerStates,
		queryRegex:              queryRegex,
		containerRegex:          containerRegex,
		includeRegexes:          includeRegexes,
		excludeRegexes:          excludeRegexes,
		highlightRegexes:        highlightRegexes,
		excludeContainerRegexes: excludeContainerRegexes,
		excludePodRegexes:       excludePodRegexes,
		writer:                  writer,
		untilTime:               untilTime,
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	setupWebSocketHandlers(conn, ctx, cancel, writer)

	var clientMutex sync.Mutex
	startCredentialRefresher(ctx, &clientset, params.contextName, &clientMutex)

	if err := stern.Run(ctx, clientset, config); err != nil {
		_ = writer.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf(`{"error":"Stern error: %s"}`, err)))
	}
}

func main() {
	r := newRouter()

	fmt.Println("Stern Web UI running on :8080")
	fmt.Println("Open http://localhost:8080 in your browser")
	if err := r.Run(":8080"); err != nil {
		panic(err)
	}
}

// newRouter builds the gin engine with all routes and the SPA fallback.
func newRouter() *gin.Engine {
	r := gin.Default()

	r.GET("/ws/logs", streamLogs)

	// API endpoints for autocomplete
	r.GET("/api/namespaces", getNamespaces)
	r.GET("/api/pods", getPods)
	r.GET("/api/containers", getContainers)
	r.GET("/api/contexts", getContexts)
	r.GET("/api/nodes", getNodes)
	r.GET("/api/pod-metadata", getPodMetadata)

	// API endpoints for cluster management
	r.GET("/api/clusters/events", getClusterEvents)
	r.GET("/api/clusters/health", getClusterHealth)
	r.POST("/api/clusters/apply", applyManifest)
	r.GET("/api/clusters/resources", getClusterResources)

	// Serve embedded static files from frontend/dist
	distFS, err := fs.Sub(frontendFS, "frontend/dist")
	if err != nil {
		panic(err)
	}

	// Serve assets directory
	assetsFS, err := fs.Sub(distFS, "assets")
	if err != nil {
		panic(err)
	}
	r.StaticFS("/assets", http.FS(assetsFS))

	// Serve vite.svg
	r.GET("/vite.svg", func(c *gin.Context) {
		data, err := fs.ReadFile(distFS, "vite.svg")
		if err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		c.Data(http.StatusOK, "image/svg+xml", data)
	})

	// Serve index.html for all other routes (SPA fallback)
	r.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") || strings.HasPrefix(c.Request.URL.Path, "/ws/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		data, err := fs.ReadFile(distFS, "index.html")
		if err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", data)
	})

	return r
}

// getNamespaces returns list of kubernetes namespaces
func getNamespaces(c *gin.Context) {
	ctx := c.Query("context")
	args := []string{"get", "namespaces", "-o", "jsonpath={.items[*].metadata.name}"}
	if ctx != "" {
		args = append([]string{"--context", ctx}, args...)
	}

	cmd := exec.Command("kubectl", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[ERROR] Failed to get namespaces (context=%s): %v, output: %s", ctx, err, string(output))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "details": string(output)})
		return
	}

	namespaces := strings.Fields(string(output))
	c.JSON(http.StatusOK, namespaces)
}

// getPods returns list of pods in a namespace
func getPods(c *gin.Context) {
	namespace := c.Query("namespace")
	ctx := c.Query("context")
	allNamespaces := c.Query("allNamespaces")

	args := []string{"get", "pods", "-o", "jsonpath={.items[*].metadata.name}"}
	if ctx != "" {
		args = append([]string{"--context", ctx}, args...)
	}
	if allNamespaces == "true" {
		args = append(args, "--all-namespaces")
	} else if namespace != "" {
		args = append(args, "-n", namespace)
	}

	cmd := exec.Command("kubectl", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[ERROR] Failed to get pods (context=%s, namespace=%s): %v, output: %s", ctx, namespace, err, string(output))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "details": string(output)})
		return
	}

	pods := strings.Fields(string(output))
	c.JSON(http.StatusOK, pods)
}

// getContainers returns list of container names in pod/container format
func getContainers(c *gin.Context) {
	namespace := c.Query("namespace")
	ctx := c.Query("context")
	allNamespaces := c.Query("allNamespaces")

	// Get pods with their containers in format: podName containerName1 containerName2...
	args := []string{"get", "pods", "-o", "jsonpath={range .items[*]}{.metadata.name}{\" \"}{range .spec.containers[*]}{.name}{\" \"}{end}{\"\\n\"}{end}"}
	if ctx != "" {
		args = append([]string{"--context", ctx}, args...)
	}
	if allNamespaces == "true" {
		args = append(args, "--all-namespaces")
	} else if namespace != "" {
		args = append(args, "-n", namespace)
	}

	cmd := exec.Command("kubectl", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[ERROR] Failed to get containers (context=%s, namespace=%s): %v, output: %s", ctx, namespace, err, string(output))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "details": string(output)})
		return
	}

	// Parse output and create pod/container pairs
	var containers []string
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		podName := fields[0]
		// Each subsequent field is a container name
		for _, containerName := range fields[1:] {
			containers = append(containers, fmt.Sprintf("%s/%s", podName, containerName))
		}
	}

	c.JSON(http.StatusOK, containers)
}

// getContexts returns list of kubernetes contexts
func getContexts(c *gin.Context) {
	cmd := exec.Command("kubectl", "config", "get-contexts", "-o", "name")
	output, err := cmd.Output()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	contexts := strings.Fields(string(output))
	c.JSON(http.StatusOK, contexts)
}

// getNodes returns list of kubernetes nodes
func getNodes(c *gin.Context) {
	ctx := c.Query("context")
	args := []string{"get", "nodes", "-o", "jsonpath={.items[*].metadata.name}"}
	if ctx != "" {
		args = append([]string{"--context", ctx}, args...)
	}

	cmd := exec.Command("kubectl", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[ERROR] Failed to get nodes (context=%s): %v, output: %s", ctx, err, string(output))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "details": string(output)})
		return
	}

	nodes := strings.Fields(string(output))
	c.JSON(http.StatusOK, nodes)
}

// getPodMetadata returns pod metadata including creation time
func getPodMetadata(c *gin.Context) {
	namespace := c.Query("namespace")
	podName := c.Query("pod")
	ctx := c.Query("context")

	if podName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pod parameter is required"})
		return
	}

	if namespace == "" {
		namespace = "default"
	}

	// Get pod creation timestamp
	args := []string{"get", "pod", podName, "-o", "jsonpath={.metadata.creationTimestamp}"}
	if ctx != "" {
		args = append([]string{"--context", ctx}, args...)
	}
	args = append(args, "-n", namespace)

	cmd := exec.Command("kubectl", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[ERROR] Failed to get pod metadata (context=%s, namespace=%s, pod=%s): %v, output: %s", ctx, namespace, podName, err, string(output))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "details": string(output)})
		return
	}

	creationTime := strings.TrimSpace(string(output))
	// Parse and convert to datetime-local format (YYYY-MM-DDTHH:MM)
	if creationTime != "" {
		t, err := time.Parse(time.RFC3339, creationTime)
		if err == nil {
			creationTime = t.Format("2006-01-02T15:04")
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"creationTime": creationTime,
	})
}

// getClusterEvents returns kubernetes events for a context, newest first
func getClusterEvents(c *gin.Context) {
	ctxName := c.Query("context")
	namespace := c.Query("namespace")

	clientset, _, err := createKubeClient(ctxName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	events, err := clientset.CoreV1().Events(namespace).List(c.Request.Context(), metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type eventDTO struct {
		Time    string `json:"time"`
		Type    string `json:"type"`
		Reason  string `json:"reason"`
		Object  string `json:"object"`
		Message string `json:"message"`
		Count   int32  `json:"count"`
	}

	result := make([]eventDTO, 0, len(events.Items))
	for _, e := range events.Items {
		t := e.LastTimestamp.Time
		if t.IsZero() {
			t = e.EventTime.Time
		}
		result = append(result, eventDTO{
			Time:    t.Format(time.RFC3339),
			Type:    e.Type,
			Reason:  e.Reason,
			Object:  fmt.Sprintf("%s/%s", e.InvolvedObject.Kind, e.InvolvedObject.Name),
			Message: e.Message,
			Count:   e.Count,
		})
	}

	sort.SliceStable(result, func(i, j int) bool { return result[i].Time > result[j].Time })
	c.JSON(http.StatusOK, result)
}

func nodeReady(node corev1.Node) bool {
	for _, cond := range node.Status.Conditions {
		if cond.Type == corev1.NodeReady {
			return cond.Status == corev1.ConditionTrue
		}
	}
	return false
}

func podIssueReason(pod corev1.Pod) string {
	if pod.Status.Phase == corev1.PodFailed || pod.Status.Phase == corev1.PodPending {
		return string(pod.Status.Phase)
	}
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
			return cs.State.Waiting.Reason
		}
		if cs.LastTerminationState.Terminated != nil && cs.LastTerminationState.Terminated.Reason != "" {
			return cs.LastTerminationState.Terminated.Reason
		}
	}
	return ""
}

// getClusterHealth returns node status and pod issues for a context
func getClusterHealth(c *gin.Context) {
	ctxName := c.Query("context")
	namespace := c.Query("namespace")

	clientset, _, err := createKubeClient(ctxName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	nodes, err := clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	pods, err := clientset.CoreV1().Pods(metav1.NamespaceAll).List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// If a namespace is specified, filter pods to that namespace
	if namespace != "" {
		podItems := pods.Items
		filtered := make([]corev1.Pod, 0, len(podItems))
		for _, p := range podItems {
			if p.Namespace == namespace {
				filtered = append(filtered, p)
			}
		}
		pods.Items = filtered
	}

	type nodeDTO struct {
		Name    string `json:"name"`
		Ready   bool   `json:"ready"`
		CPU     string `json:"cpu"`
		Memory  string `json:"memory"`
		Version string `json:"version"`
	}
	nodeList := make([]nodeDTO, 0, len(nodes.Items))
	for _, n := range nodes.Items {
		nodeList = append(nodeList, nodeDTO{
			Name:    n.Name,
			Ready:   nodeReady(n),
			CPU:     n.Status.Capacity.Cpu().String(),
			Memory:  n.Status.Capacity.Memory().String(),
			Version: n.Status.NodeInfo.KubeletVersion,
		})
	}

	type issueDTO struct {
		Namespace string `json:"namespace"`
		Name      string `json:"name"`
		Reason    string `json:"reason"`
		Restarts  int32  `json:"restarts"`
		Age       string `json:"age"`
	}
	var issues []issueDTO
	podSummary := map[string]int{}
	for _, p := range pods.Items {
		podSummary[string(p.Status.Phase)]++
		if reason := podIssueReason(p); reason != "" {
			restarts := int32(0)
			for _, cs := range p.Status.ContainerStatuses {
				restarts += cs.RestartCount
			}
			issues = append(issues, issueDTO{
				Namespace: p.Namespace,
				Name:      p.Name,
				Reason:    reason,
				Restarts:  restarts,
				Age:       time.Since(p.CreationTimestamp.Time).Round(time.Minute).String(),
			})
		}
	}
	// ponytail: capped at 200, oldest issues are dropped if the cluster has more
	if len(issues) > 200 {
		issues = issues[:200]
	}

	c.JSON(http.StatusOK, gin.H{
		"nodes":      nodeList,
		"podSummary": podSummary,
		"issues":     issues,
	})
}

const maxYAMLBytes = 2 * 1024 * 1024 // 2 MB cap

// applyManifest applies or deletes a YAML manifest against a context via kubectl
func applyManifest(c *gin.Context) {
	ctxName := c.Query("context")

	var req struct {
		Verb string `json:"verb"`
		YAML string `json:"yaml"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON body: " + err.Error()})
		return
	}

	verb := strings.TrimSpace(req.Verb)
	if verb == "" {
		verb = "apply"
	}
	if verb != "apply" && verb != "delete" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "verb must be 'apply' or 'delete'"})
		return
	}

	if len(req.YAML) > maxYAMLBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("yaml too large: %d bytes (max %d)", len(req.YAML), maxYAMLBytes)})
		return
	}

	// Basic YAML sanity: must start with apiVersion, kind, or be a multi-doc
	trimmed := strings.TrimSpace(req.YAML)
	if trimmed == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "yaml is empty"})
		return
	}
	if !strings.HasPrefix(trimmed, "apiVersion") && !strings.Contains(trimmed, "---") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "yaml must start with apiVersion or be a multi-document (---)"})
		return
	}

	cmd := exec.Command("kubectl", "--context", ctxName, verb, "-f", "-")
	cmd.Stdin = strings.NewReader(req.YAML)
	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "output": string(output)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"output": string(output)})
}

// Resource kinds browsable in the UI (plural, may include API group suffix)
var resourceWhitelist = map[string]string{
	"configmaps":          "configmaps",
	"secrets":             "secrets",
	"serviceaccounts":     "serviceaccounts",
	"roles":               "roles.rbac.authorization.k8s.io",
	"rolebindings":        "rolebindings.rbac.authorization.k8s.io",
	"clusterroles":        "clusterroles.rbac.authorization.k8s.io",
	"clusterrolebindings": "clusterrolebindings.rbac.authorization.k8s.io",
	"deployments":         "deployments.apps",
	"services":            "services",
	"ingresses":           "ingresses.networking.k8s.io",
	"storageclasses":      "storageclasses.storage.k8s.io",
	"nodes":               "nodes",
	"pods":                "pods",
}

// Kinds that are cluster-scoped and therefore reject -n
var clusterScopedResources = map[string]bool{
	"clusterroles":        true,
	"clusterrolebindings": true,
	"storageclasses":      true,
	"nodes":               true,
}

// getClusterResources lists a whitelisted resource kind for a context
func getClusterResources(c *gin.Context) {
	ctxName := c.Query("context")
	kind := strings.ToLower(strings.TrimSpace(c.Query("kind")))
	namespace := strings.TrimSpace(c.Query("namespace"))

	resource, ok := resourceWhitelist[kind]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("unsupported resource kind %q", kind)})
		return
	}

	args := []string{"--context", ctxName, "get", resource, "-o", "json"}
	if namespace != "" && !clusterScopedResources[kind] {
		args = append(args, "-n", namespace)
	}

	cmd := exec.Command("kubectl", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "details": string(output)})
		return
	}

	var list struct {
		Items []struct {
			Metadata struct {
				Name              string `json:"name"`
				Namespace         string `json:"namespace"`
				CreationTimestamp string `json:"creationTimestamp"`
			} `json:"metadata"`
		} `json:"items"`
	}
	if err := json.Unmarshal(output, &list); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse kubectl output: " + err.Error()})
		return
	}

	items := make([]gin.H, 0, len(list.Items))
	for _, it := range list.Items {
		items = append(items, gin.H{
			"name":      it.Metadata.Name,
			"namespace": it.Metadata.Namespace,
			"created":   it.Metadata.CreationTimestamp,
		})
	}
	c.JSON(http.StatusOK, gin.H{"kind": kind, "items": items})
}
