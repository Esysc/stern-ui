package main

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"text/template"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	stern "github.com/stern/stern/stern"
	"k8s.io/apimachinery/pkg/fields"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
)

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
	conn *websocket.Conn
	buf  *bytes.Buffer
	mu   sync.Mutex // Protects concurrent writes to websocket
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
		if err := w.conn.WriteMessage(websocket.TextMessage, line); err != nil {
			return 0, err
		}
	}
	return len(p), nil
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
	if params.since != "" {
		sinceDuration, _ = time.ParseDuration(params.since)
	} else {
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

func parseRegexFilters(params streamParams) (*regexp.Regexp, *regexp.Regexp, []*regexp.Regexp, []*regexp.Regexp, []*regexp.Regexp, []*regexp.Regexp, []*regexp.Regexp, error) {
	queryRegex, err := regexp.Compile(params.query)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("invalid query regex: %w", err)
	}

	containerRegex := regexp.MustCompile(".*")
	if params.container != "" {
		containerRegex, err = regexp.Compile(params.container)
		if err != nil {
			return nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("invalid container regex: %w", err)
		}
	}

	includeRegexes, err := compileRegexList(params.include)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("invalid include filter: %w", err)
	}

	excludeRegexes, err := compileRegexList(params.exclude)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("invalid exclude filter: %w", err)
	}

	highlightRegexes, err := compileRegexList(params.highlight)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("invalid highlight filter: %w", err)
	}

	excludeContainerRegexes, err := compileRegexList(params.excludeContainer)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("invalid exclude container: %w", err)
	}

	excludePodRegexes, err := compileRegexList(params.excludePod)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("invalid exclude pod: %w", err)
	}

	return queryRegex, containerRegex, includeRegexes, excludeRegexes, highlightRegexes, excludeContainerRegexes, excludePodRegexes, nil
}

func streamLogs(c *gin.Context) {
	params := parseStreamParams(c)

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	clientset, kubeConfig, err := createKubeClient(params.contextName)
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf(`{"error":"%s"}`, err)))
		return
	}

	tailLines, sinceDuration, maxReq := parseNumericParams(params)
	namespaces := buildNamespaceList(params, kubeConfig)

	labelSelector, fieldSelector, err := parseSelectors(params)
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf(`{"error":"%s"}`, err)))
		return
	}

	containerStates := parseContainerStates(params.containerState)

	queryRegex, containerRegex, includeRegexes, excludeRegexes, highlightRegexes, excludeContainerRegexes, excludePodRegexes, err := parseRegexFilters(params)
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf(`{"error":"%s"}`, err)))
		return
	}

	// Create template with json function
	tmpl := template.Must(template.New("stern").Funcs(template.FuncMap{
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

	writer := &WebSocketWriter{conn: conn, buf: &bytes.Buffer{}}

	config := &stern.Config{
		Namespaces:            namespaces,
		PodQuery:              queryRegex,
		ExcludePodQuery:       excludePodRegexes,
		Timestamps:            params.timestamps != "",
		TimestampFormat:       stern.TimestampFormatDefault,
		Location:              time.Local,
		ContainerQuery:        containerRegex,
		ExcludeContainerQuery: excludeContainerRegexes,
		ContainerStates:       containerStates,
		Exclude:               excludeRegexes,
		Include:               includeRegexes,
		Highlight:             highlightRegexes,
		Since:                 sinceDuration,
		AllNamespaces:         params.allNamespaces == "true",
		LabelSelector:         labelSelector,
		FieldSelector:         fieldSelector,
		TailLines:             tailLines,
		Template:              tmpl,
		Follow:                params.noFollow != "true",
		InitContainers:        params.initContainers != "false",
		EphemeralContainers:   params.ephemeralContainers != "false",
		MaxLogRequests:        maxReq,
		Out:                   writer,
		ErrOut:                io.Discard,
	}

	// Use background context so stern doesn't get cancelled by HTTP request timeout
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Set WebSocket timeouts and handlers
	const (
		pongWait   = 60 * time.Second
		pingPeriod = 30 * time.Second
		writeWait  = 10 * time.Second
	)

	// Set initial read deadline and pong handler
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	// Start a goroutine to read (and discard) messages from client
	// This is needed to process pong responses and detect disconnects
	go func() {
		defer cancel()
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	// Periodic credential refresh wrapper
	// Recreate clientset every 30 minutes to ensure fresh credentials
	var clientMutex sync.Mutex
	go func() {
		ticker := time.NewTicker(30 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				clientMutex.Lock()
				newClientset, _, err := createKubeClient(params.contextName)
				if err == nil {
					clientset = newClientset
				}
				clientMutex.Unlock()
			case <-ctx.Done():
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
				conn.SetWriteDeadline(time.Now().Add(writeWait))
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
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

	if err := stern.Run(ctx, clientset, config); err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf(`{"error":"Stern error: %s"}`, err)))
	}
}

func main() {
	r := gin.Default()

	r.GET("/ws/logs", streamLogs)

	// API endpoints for autocomplete
	r.GET("/api/namespaces", getNamespaces)
	r.GET("/api/pods", getPods)
	r.GET("/api/containers", getContainers)
	r.GET("/api/contexts", getContexts)
	r.GET("/api/nodes", getNodes)

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
		data, err := fs.ReadFile(distFS, "index.html")
		if err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", data)
	})

	fmt.Println("Stern Web UI running on :8080")
	fmt.Println("Open http://localhost:8080 in your browser")
	if err := r.Run(":8080"); err != nil {
		panic(err)
	}
}

// getNamespaces returns list of kubernetes namespaces
func getNamespaces(c *gin.Context) {
	ctx := c.Query("context")
	args := []string{"get", "namespaces", "-o", "jsonpath={.items[*].metadata.name}"}
	if ctx != "" {
		args = append([]string{"--context", ctx}, args...)
	}

	cmd := exec.Command("kubectl", args...)
	output, err := cmd.Output()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
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
	output, err := cmd.Output()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	pods := strings.Fields(string(output))
	c.JSON(http.StatusOK, pods)
}

// getContainers returns list of container names in a namespace
func getContainers(c *gin.Context) {
	namespace := c.Query("namespace")
	ctx := c.Query("context")
	allNamespaces := c.Query("allNamespaces")

	args := []string{"get", "pods", "-o", "jsonpath={.items[*].spec.containers[*].name}"}
	if ctx != "" {
		args = append([]string{"--context", ctx}, args...)
	}
	if allNamespaces == "true" {
		args = append(args, "--all-namespaces")
	} else if namespace != "" {
		args = append(args, "-n", namespace)
	}

	cmd := exec.Command("kubectl", args...)
	output, err := cmd.Output()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	containers := strings.Fields(string(output))
	// Remove duplicates
	containerMap := make(map[string]bool)
	for _, container := range containers {
		containerMap[container] = true
	}
	unique := make([]string, 0, len(containerMap))
	for container := range containerMap {
		unique = append(unique, container)
	}
	c.JSON(http.StatusOK, unique)
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
	output, err := cmd.Output()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	nodes := strings.Fields(string(output))
	c.JSON(http.StatusOK, nodes)
}
