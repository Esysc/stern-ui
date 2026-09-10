package main

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"text/template"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	stern "github.com/stern/stern/stern"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/fields"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
	"sigs.k8s.io/yaml"
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
	CheckOrigin:      checkWebSocketOrigin,
	HandshakeTimeout: 10 * time.Second,
	ReadBufferSize:   4096,
	WriteBufferSize:  4096,
}

// allowedOrigins contains host[:port] values (besides the request's own host)
// that may open WebSocket connections. Defaults to the Vite dev server so the
// frontend can reach the backend during development. Extend via ALLOWED_ORIGINS.
var allowedOrigins = func() map[string]struct{} {
	set := map[string]struct{}{
		"localhost:5173": {},
		"127.0.0.1:5173": {},
	}
	for _, o := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
		if o = strings.ToLower(strings.TrimSpace(o)); o != "" {
			set[o] = struct{}{}
		}
	}
	return set
}()

// checkWebSocketOrigin restricts WebSocket upgrades to the app's own origin
// (or explicitly allowed origins), so third-party pages can't proxy the
// kubectl/stern operations exposed by the backend to localhost.
func checkWebSocketOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		// Non-browser clients (curl, tests, desktop apps) don't send Origin.
		return true
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if strings.EqualFold(u.Host, r.Host) {
		return true
	}
	_, ok := allowedOrigins[strings.ToLower(u.Host)]
	return ok
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
	if err := w.conn.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil {
		return 0, err
	}

	// Write each line to the websocket
	lines := bytes.Split(p, []byte("\n"))
	for _, line := range lines {
		if len(line) == 0 {
			continue
		}

		if w.shouldSkipLine(line) {
			continue
		}

		if err := w.conn.WriteMessage(websocket.TextMessage, line); err != nil {
			return 0, err
		}
	}
	return len(p), nil
}

func (w *WebSocketWriter) shouldSkipLine(line []byte) bool {
	if w.untilTime.IsZero() {
		return false
	}

	logTime, ok := parseLogTime(line)
	if !ok {
		return false
	}

	return logTime.After(w.untilTime)
}

func parseLogTime(line []byte) (time.Time, bool) {
	var logEntry map[string]interface{}
	if err := json.Unmarshal(line, &logEntry); err != nil {
		return time.Time{}, false
	}

	message, ok := logEntry["message"].(string)
	if !ok {
		return time.Time{}, false
	}

	timestampStr, ok := extractTimestamp(message)
	if !ok {
		return time.Time{}, false
	}

	logTime, err := time.Parse(time.RFC3339Nano, timestampStr)
	if err != nil {
		return time.Time{}, false
	}

	return logTime, true
}

func extractTimestamp(message string) (string, bool) {
	if len(message) == 0 || message[0] != '[' {
		return "", false
	}

	maxEnd := len(message)
	if maxEnd > 30 {
		maxEnd = 30
	}

	for i := 1; i < maxEnd; i++ {
		if message[i] == ']' {
			return message[1:i], true
		}
	}

	return "", false
}

// WriteMessage writes a message with the given type, protected by mutex
func (w *WebSocketWriter) WriteMessage(messageType int, data []byte) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if err := w.conn.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil {
		return err
	}
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

// kubeClientEntry caches a Kubernetes client per context along with the config
// used to build it, so multiple streams/requests reuse the same connection
// pool instead of creating a new client per WebSocket connection.
type kubeClientEntry struct {
	mu         sync.Mutex
	clientset  *kubernetes.Interface
	kubeConfig clientcmd.ClientConfig
}

var (
	kubeClientCache   = map[string]*kubeClientEntry{}
	kubeClientCacheMu sync.Mutex
)

// getKubeClient returns a cached Kubernetes client for a context, creating and
// wiring up the credential refresher on first use. Safe for concurrent use.
func getKubeClient(contextName string) (*kubeClientEntry, error) {
	kubeClientCacheMu.Lock()
	if entry, ok := kubeClientCache[contextName]; ok {
		kubeClientCacheMu.Unlock()
		return entry, nil
	}
	kubeClientCacheMu.Unlock()

	clientset, kubeConfig, err := createKubeClient(contextName)
	if err != nil {
		return nil, err
	}

	entry := &kubeClientEntry{clientset: &clientset, kubeConfig: kubeConfig}

	kubeClientCacheMu.Lock()
	if existing, ok := kubeClientCache[contextName]; ok {
		kubeClientCacheMu.Unlock()
		return existing, nil
	}
	kubeClientCache[contextName] = entry
	kubeClientCacheMu.Unlock()

	startCredentialRefresher(context.Background(), entry.clientset, contextName, &entry.mu)
	return entry, nil
}

// snapshot returns a copy of the current client, safe in relation to the
// background credential refresh which swaps the underlying client.
func (e *kubeClientEntry) snapshot() kubernetes.Interface {
	e.mu.Lock()
	defer e.mu.Unlock()
	return *e.clientset
}

func parseNumericParams(params streamParams) (*int64, time.Duration, int) {
	var tailLines *int64
	if params.tail != "" && params.tail != "-1" {
		var t int64
		if _, err := fmt.Sscanf(params.tail, "%d", &t); err == nil {
			tailLines = &t
		}
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
		if _, err := fmt.Sscanf(params.maxLogRequests, "%d", &maxReq); err != nil {
			maxReq = 50
		}
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

// splitContainerTokens splits a comma-separated container filter into trimmed,
// non-empty tokens. Each token is either "container" or "pod/container".
func splitContainerTokens(containerStr string) []string {
	var tokens []string
	for _, t := range strings.Split(containerStr, ",") {
		if t = strings.TrimSpace(t); t != "" {
			tokens = append(tokens, t)
		}
	}
	return tokens
}

// extractUniquePodNames returns the escaped, de-duplicated pod names found in
// "pod/container" tokens, preserving first-seen order.
func extractUniquePodNames(tokens []string) []string {
	var podNames []string
	seen := make(map[string]bool)
	for _, t := range tokens {
		if !strings.Contains(t, "/") {
			continue
		}
		pod := strings.SplitN(t, "/", 2)[0]
		if pod == "" || seen[pod] {
			continue
		}
		seen[pod] = true
		podNames = append(podNames, regexp.QuoteMeta(pod))
	}
	return podNames
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

	// container is a comma-separated list of tokens, each "container" or "pod/container",
	// allowing multiple containers (optionally across multiple pods) to be tailed at once.
	containerTokens := splitContainerTokens(params.container)

	// Handle query regex - if any token has pod/container format, restrict query to those pod(s)
	queryPattern := params.query
	if podNames := extractUniquePodNames(containerTokens); len(podNames) > 0 {
		if len(podNames) == 1 {
			queryPattern = "^" + podNames[0] + "$"
		} else {
			queryPattern = "^(" + strings.Join(podNames, "|") + ")$"
		}
		debugLog("Container tokens specify pod(s). Overriding query pattern to match: %q", queryPattern)
	}

	queryRegex, err := regexp.Compile(queryPattern)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("invalid query regex: %w", err)
	}
	debugLog("Query regex compiled: %s", queryRegex.String())

	containerRegex := regexp.MustCompile(".*")
	if len(containerTokens) > 0 {
		var patterns []string
		for _, t := range containerTokens {
			containerName := extractContainerName(t)
			pattern := containerName
			if !strings.ContainsAny(pattern, ".*+?[]{}()^$|\\") {
				pattern = "^" + regexp.QuoteMeta(pattern) + "$"
			}
			patterns = append(patterns, pattern)
		}
		combined := strings.Join(patterns, "|")
		debugLog("Container regex pattern: %q -> compiled regex: %s", params.container, combined)

		containerRegex, err = regexp.Compile(combined)
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
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	_ = conn.SetReadDeadline(time.Now().Add(pongWait))

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
	defer func() { _ = conn.Close() }()

	writer := &WebSocketWriter{conn: conn, buf: &bytes.Buffer{}}

	clientsetEntry, err := getKubeClient(params.contextName)
	if err != nil {
		_ = writer.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf(`{"error":"%s"}`, err)))
		return
	}
	kubeConfig := clientsetEntry.kubeConfig
	clientset := clientsetEntry.snapshot()

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
	r.GET("/api/clusters/resource-kinds", getResourceKinds)
	r.GET("/api/clusters/events", getClusterEvents)
	r.GET("/api/clusters/health", getClusterHealth)
	r.POST("/api/clusters/apply", applyManifest)
	r.GET("/api/clusters/resources", getClusterResources)
	r.GET("/api/clusters/resource-detail", getResourceDetail)
	r.POST("/api/clusters/resource-patch", patchResource)
	r.POST("/api/clusters/resource-delete", deleteResource)
	r.GET("/api/clusters/scale-info", getScaleInfo)
	r.POST("/api/clusters/node-drain", drainNode)

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
		args = append(args, "--namespace="+namespace)
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
		args = append(args, "--namespace="+namespace)
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
	args = append(args, "--namespace="+namespace)

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

	entry, err := getKubeClient(ctxName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	clientset := entry.snapshot()

	events, err := clientset.CoreV1().Events(namespace).List(c.Request.Context(), metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type eventDTO struct {
		Time      string `json:"time"`
		FirstSeen string `json:"firstSeen"`
		Type      string `json:"type"`
		Reason    string `json:"reason"`
		Object    string `json:"object"`
		Namespace string `json:"namespace"`
		Source    string `json:"source"`
		Count     int32  `json:"count"`
		Message   string `json:"message"`
	}

	result := make([]eventDTO, 0, len(events.Items))
	for _, e := range events.Items {
		t := e.LastTimestamp.Time
		if t.IsZero() {
			t = e.EventTime.Time
		}
		first := e.FirstTimestamp.Time
		result = append(result, eventDTO{
			Time:      t.Format(time.RFC3339),
			FirstSeen: first.Format(time.RFC3339),
			Type:      e.Type,
			Reason:    e.Reason,
			Object:    fmt.Sprintf("%s/%s", e.InvolvedObject.Kind, e.InvolvedObject.Name),
			Namespace: e.Namespace,
			Source:    e.Source.Component,
			Count:     e.Count,
			Message:   e.Message,
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

	entry, err := getKubeClient(ctxName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	clientset := entry.snapshot()

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

// Resource kinds browsable in the UI (plural, may include API group suffix).
// Used only as a fallback when API discovery is unavailable (e.g. no cluster access).
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

// dynamicKindPattern restricts resource kind identifiers to safe characters.
// Kinds are passed as a single kubectl argument, so anything outside
// lowercase letters, digits, dots and dashes is rejected outright.
var dynamicKindPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9.-]*$`)

// apiResourceInfo describes one browsable API resource type
type apiResourceInfo struct {
	Name       string   `json:"name"`
	Kind       string   `json:"kind"`
	Group      string   `json:"group"`
	Version    string   `json:"version"`
	Namespaced bool     `json:"namespaced"`
	Verbs      []string `json:"verbs"`
}

func resourceIdentifier(it apiResourceInfo) string {
	if it.Group == "" {
		return it.Name
	}
	return it.Name + "." + it.Group
}

func hasVerb(verbs []string, want string) bool {
	for _, v := range verbs {
		if v == want {
			return true
		}
	}
	return false
}

const resourceKindsTTL = 5 * time.Minute

type resourceKindsCacheEntry struct {
	kinds     []apiResourceInfo
	expiresAt time.Time
}

var resourceKindsCache = struct {
	mu      sync.Mutex
	entries map[string]resourceKindsCacheEntry
}{entries: make(map[string]resourceKindsCacheEntry)}

// listResourceKinds returns the resource types that support list+get for a
// context, discovered via `kubectl api-resources`. Results are cached per
// context for resourceKindsTTL so repeated panel loads stay cheap.
func listResourceKinds(ctxName string) ([]apiResourceInfo, error) {
	resourceKindsCache.mu.Lock()
	defer resourceKindsCache.mu.Unlock()

	if entry, ok := resourceKindsCache.entries[ctxName]; ok && time.Now().Before(entry.expiresAt) {
		return entry.kinds, nil
	}

	cmd := exec.Command("kubectl", "--context", ctxName, "api-resources", "--verbs=list", "-o", "json")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("kubectl api-resources failed: %s: %s", err.Error(), strings.TrimSpace(string(output)))
	}

	kinds, err := parseResourceKinds(output)
	if err != nil {
		return nil, err
	}

	resourceKindsCache.entries[ctxName] = resourceKindsCacheEntry{kinds: kinds, expiresAt: time.Now().Add(resourceKindsTTL)}
	return kinds, nil
}

// parseResourceKinds extracts browsable resource types from
// `kubectl api-resources -o json` output, which is a single APIResourceList:
// {"kind":"APIResourceList","resources":[{"name":"configmaps",...},...]}
func parseResourceKinds(output []byte) ([]apiResourceInfo, error) {
	var list struct {
		Kind      string            `json:"kind"`
		Resources []apiResourceInfo `json:"resources"`
		Items     []apiResourceInfo `json:"items"` // legacy fallback
	}
	if err := json.Unmarshal(output, &list); err != nil {
		return nil, fmt.Errorf("failed to parse kubectl api-resources output: %w", err)
	}

	resources := list.Resources
	if len(resources) == 0 {
		resources = list.Items
	}
	if len(resources) == 0 {
		return nil, fmt.Errorf("kubectl api-resources output contained no resources")
	}

	kinds := make([]apiResourceInfo, 0, len(resources))
	for _, it := range resources {
		if !hasVerb(it.Verbs, "get") || !hasVerb(it.Verbs, "list") {
			continue
		}
		kinds = append(kinds, it)
	}
	sort.Slice(kinds, func(i, j int) bool { return kinds[i].Kind < kinds[j].Kind })
	if len(kinds) == 0 {
		return nil, fmt.Errorf("kubectl api-resources output contained no browsable resource types")
	}
	return kinds, nil
}

// lookupResource finds a discovered resource by identifier (name or name.group)
func lookupResource(kinds []apiResourceInfo, kind string) (apiResourceInfo, bool) {
	for _, it := range kinds {
		if resourceIdentifier(it) == kind {
			return it, true
		}
	}
	// Prefer the core-group resource when the identifier is groupless
	for _, it := range kinds {
		if it.Group == "" && it.Name == kind {
			return it, true
		}
	}
	for _, it := range kinds {
		if it.Name == kind {
			return it, true
		}
	}
	return apiResourceInfo{}, false
}

// resolveKind validates a kind identifier and determines whether it is
// cluster-scoped. Kinds are resolved against the context's API discovery when
// reachable; the static whitelist is used as a fallback when discovery fails
// (e.g. offline test environments). The `known` flag reports whether the kind
// was confirmed by live discovery.
func resolveKind(ctxName, kind string) (clusterScoped bool, known bool, err error) {
	if !dynamicKindPattern.MatchString(kind) {
		return false, false, fmt.Errorf("unsupported resource kind %q", kind)
	}

	kinds, derr := listResourceKinds(ctxName)
	if derr != nil {
		// Discovery unavailable: fall back to the static whitelist (exact
		// identifier match — legacy callers send groupless kinds)
		if resourceWhitelist[kind] == "" {
			return false, false, fmt.Errorf("unsupported resource kind %q", kind)
		}
		return clusterScopedResources[kind], false, nil
	}

	it, ok := lookupResource(kinds, kind)
	if !ok {
		return false, false, fmt.Errorf("unsupported resource kind %q", kind)
	}
	return !it.Namespaced, true, nil
}

// getResourceKinds returns the browsable resource types for a context,
// including CRDs, so the UI can build its resource-kind selector dynamically.
func getResourceKinds(c *gin.Context) {
	ctxName := c.Query("context")
	kinds, err := listResourceKinds(ctxName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, kinds)
}

// getClusterResources lists a resource kind for a context
func getClusterResources(c *gin.Context) {
	ctxName := c.Query("context")
	kind := strings.ToLower(strings.TrimSpace(c.Query("kind")))
	namespace := strings.TrimSpace(c.Query("namespace"))

	clusterScoped, _, err := resolveKind(ctxName, kind)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	args := []string{"--context", ctxName, "get", kind, "-o", "json"}
	if namespace != "" && !clusterScoped {
		args = append(args, "--namespace="+namespace)
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

// getResourceDetail returns the full YAML plus the parsed object of a single
// resource. The parsed object powers the dynamic edit form in the UI.
func getResourceDetail(c *gin.Context) {
	ctxName := c.Query("context")
	kind := strings.ToLower(strings.TrimSpace(c.Query("kind")))
	name := strings.TrimSpace(c.Query("name"))
	namespace := strings.TrimSpace(c.Query("namespace"))

	clusterScoped, _, err := resolveKind(ctxName, kind)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !validResourceName(name) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid resource name"})
		return
	}

	args := []string{"--context", ctxName, "get", kind, name, "-o", "json"}
	if namespace != "" && !clusterScoped {
		args = append(args, "--namespace="+namespace)
	}

	cmd := exec.Command("kubectl", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "details": string(output)})
		return
	}

	var obj map[string]interface{}
	if err := json.Unmarshal(output, &obj); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse kubectl output: " + err.Error()})
		return
	}

	yamlOut, err := yaml.Marshal(obj)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to render YAML: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"kind": kind, "name": name, "yaml": string(yamlOut), "object": obj})
}

// validResourceName applies the same name validation used by detail and patch
func validResourceName(name string) bool {
	return name != "" && !strings.HasPrefix(name, "-") && !strings.ContainsAny(name, " \t\n")
}

// maxPatchOps caps the number of JSON Patch operations per request
const maxPatchOps = 200

// jsonPatchOp is one RFC 6902 operation
type jsonPatchOp struct {
	Op    string          `json:"op"`
	Path  string          `json:"path"`
	Value json.RawMessage `json:"value,omitempty"`
}

// validatePatchOp checks a single patch operation. Paths must be valid JSON
// pointers whose decoded segments contain no whitespace, since they are logged
// and passed to kubectl as part of the patch document.
func validatePatchOp(op jsonPatchOp) error {
	switch op.Op {
	case "add", "replace", "remove":
	default:
		return fmt.Errorf("op must be add, replace or remove")
	}
	if op.Path == "" || !strings.HasPrefix(op.Path, "/") {
		return fmt.Errorf("path must be a JSON pointer starting with /")
	}
	for _, seg := range strings.Split(op.Path, "/")[1:] {
		decoded := strings.ReplaceAll(strings.ReplaceAll(seg, "~1", "/"), "~0", "~")
		if decoded == "" {
			return fmt.Errorf("path %q has an empty segment", op.Path)
		}
		if strings.ContainsFunc(decoded, func(r rune) bool { return r == ' ' || unicode.IsControl(r) }) {
			return fmt.Errorf("path %q contains whitespace or control characters", op.Path)
		}
	}
	if op.Op != "remove" && len(op.Value) == 0 {
		return fmt.Errorf("op %q requires a value", op.Op)
	}
	return nil
}

// patchResource applies an RFC 6902 JSON Patch to a single resource via kubectl
func patchResource(c *gin.Context) {
	ctxName := c.Query("context")
	if strings.TrimSpace(ctxName) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "context is required"})
		return
	}
	kind := strings.ToLower(strings.TrimSpace(c.Query("kind")))
	name := strings.TrimSpace(c.Query("name"))
	namespace := strings.TrimSpace(c.Query("namespace"))

	clusterScoped, _, err := resolveKind(ctxName, kind)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !validResourceName(name) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid resource name"})
		return
	}

	var req struct {
		Patch []jsonPatchOp `json:"patch"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON body: " + err.Error()})
		return
	}
	if len(req.Patch) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "patch is empty"})
		return
	}
	if len(req.Patch) > maxPatchOps {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("too many patch ops: %d (max %d)", len(req.Patch), maxPatchOps)})
		return
	}
	for i, op := range req.Patch {
		if err := validatePatchOp(op); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("patch op %d: %s", i, err)})
			return
		}
	}

	patchBytes, err := json.Marshal(req.Patch)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to encode patch: " + err.Error()})
		return
	}

	args := []string{"--context", ctxName, "patch", kind, name, "--type=json", "-p", string(patchBytes)}
	if namespace != "" && !clusterScoped {
		args = append(args, "--namespace="+namespace)
	}

	cmd := exec.Command("kubectl", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "details": string(output)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"output": string(output)})
}

// runKubectl executes kubectl with a context and returns stdout on success
func runKubectl(ctxName string, args ...string) ([]byte, error) {
	cmd := exec.Command("kubectl", append([]string{"--context", ctxName}, args...)...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return output, fmt.Errorf("kubectl %s: %s: %s", strings.Join(args, " "), err.Error(), strings.TrimSpace(string(output)))
	}
	return output, nil
}

// scalableBaseKinds maps workload kinds exposing spec.replicas to their
// API Kind name (used to match HPA scaleTargetRef)
var scalableBaseKinds = map[string]string{
	"deployments":  "Deployment",
	"statefulsets": "StatefulSet",
	"replicasets":  "ReplicaSet",
}

// scalableTargetKind returns the workload Kind targeted by HPAs for a kind identifier
func scalableTargetKind(kind string) (string, bool) {
	base := kind
	if i := strings.Index(base, "."); i >= 0 {
		base = base[:i]
	}
	target, ok := scalableBaseKinds[base]
	return target, ok
}

// getScaleInfo returns replica status and any HPAs targeting a scalable workload
func getScaleInfo(c *gin.Context) {
	ctxName := c.Query("context")
	kind := strings.ToLower(strings.TrimSpace(c.Query("kind")))
	name := strings.TrimSpace(c.Query("name"))
	namespace := strings.TrimSpace(c.Query("namespace"))

	targetKind, ok := scalableTargetKind(kind)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("kind %q is not scalable", kind)})
		return
	}
	if !validResourceName(name) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid resource name"})
		return
	}
	if namespace == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "namespace is required for scale info"})
		return
	}

	var workload struct {
		Spec struct {
			Replicas *int32 `json:"replicas"`
		} `json:"spec"`
		Status struct {
			Replicas      int32 `json:"replicas"`
			ReadyReplicas int32 `json:"readyReplicas"`
		} `json:"status"`
	}
	out, err := runKubectl(ctxName, "get", kind, name, "-o", "json", "--namespace="+namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "details": ""})
		return
	}
	if err := json.Unmarshal(out, &workload); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse kubectl output: " + err.Error()})
		return
	}

	type hpaDTO struct {
		Name            string `json:"name"`
		MinReplicas     *int32 `json:"minReplicas"`
		MaxReplicas     int32  `json:"maxReplicas"`
		CurrentReplicas int32  `json:"currentReplicas"`
		TargetLabel     string `json:"targetLabel"`
	}
	hpas := make([]hpaDTO, 0)
	hpaOut, herr := runKubectl(ctxName, "get", "horizontalpodautoscalers", "-o", "json", "--namespace="+namespace)
	if herr == nil {
		var list struct {
			Items []struct {
				Metadata struct {
					Name string `json:"name"`
				} `json:"metadata"`
				Spec struct {
					MinReplicas    *int32 `json:"minReplicas"`
					MaxReplicas    int32  `json:"maxReplicas"`
					ScaleTargetRef struct {
						Kind string `json:"kind"`
						Name string `json:"name"`
					} `json:"scaleTargetRef"`
					Metrics []struct {
						Type     string `json:"type"`
						Resource struct {
							Target struct {
								Type               string `json:"type"`
								AverageUtilization *int32 `json:"averageUtilization"`
							} `json:"target"`
						} `json:"resource"`
					} `json:"metrics"`
				} `json:"spec"`
				Status struct {
					CurrentReplicas int32 `json:"currentReplicas"`
				} `json:"status"`
			} `json:"items"`
		}
		if err := json.Unmarshal(hpaOut, &list); err == nil {
			for _, h := range list.Items {
				ref := h.Spec.ScaleTargetRef
				if !strings.EqualFold(ref.Kind, targetKind) || ref.Name != name {
					continue
				}
				targetLabel := ""
				for _, m := range h.Spec.Metrics {
					if m.Type == "Resource" && m.Resource.Target.Type == "Utilization" && m.Resource.Target.AverageUtilization != nil {
						targetLabel = fmt.Sprintf("CPU %d%%", *m.Resource.Target.AverageUtilization)
						break
					}
				}
				hpas = append(hpas, hpaDTO{
					Name:            h.Metadata.Name,
					MinReplicas:     h.Spec.MinReplicas,
					MaxReplicas:     h.Spec.MaxReplicas,
					CurrentReplicas: h.Status.CurrentReplicas,
					TargetLabel:     targetLabel,
				})
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"kind":          kind,
		"name":          name,
		"replicas":      workload.Spec.Replicas,
		"readyReplicas": workload.Status.ReadyReplicas,
		"hpas":          hpas,
	})
}

// nodeDrainTimeout caps how long a drain may run (evictions can be slow)
const nodeDrainTimeout = 5 * time.Minute

// drainNode drains a node via kubectl (cordons it and evicts its pods)
func drainNode(c *gin.Context) {
	ctxName := c.Query("context")
	name := strings.TrimSpace(c.Query("name"))
	if strings.TrimSpace(ctxName) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "context is required"})
		return
	}
	if !validResourceName(name) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid node name"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), nodeDrainTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "kubectl", "--context", ctxName, "drain", name, "--ignore-daemonsets", "--delete-emptydir-data", "--force")
	output, err := cmd.CombinedOutput()
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			status = http.StatusGatewayTimeout
		}
		c.JSON(status, gin.H{"error": err.Error(), "details": string(output)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"output": string(output)})
}

// deleteResource deletes a single resource, optionally with a grace period
func deleteResource(c *gin.Context) {
	ctxName := c.Query("context")
	if strings.TrimSpace(ctxName) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "context is required"})
		return
	}
	kind := strings.ToLower(strings.TrimSpace(c.Query("kind")))
	name := strings.TrimSpace(c.Query("name"))
	namespace := strings.TrimSpace(c.Query("namespace"))
	graceStr := strings.TrimSpace(c.Query("gracePeriod"))

	clusterScoped, _, err := resolveKind(ctxName, kind)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !validResourceName(name) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid resource name"})
		return
	}

	args := []string{"--context", ctxName, "delete", kind, name}
	if namespace != "" && !clusterScoped {
		args = append(args, "--namespace="+namespace)
	}
	if graceStr != "" {
		grace, gerr := strconv.Atoi(graceStr)
		if gerr != nil || grace < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid gracePeriod: must be a non-negative integer"})
			return
		}
		if grace == 0 {
			// kubectl requires --force alongside --grace-period=0
			args = append(args, "--force", "--grace-period=0")
		} else {
			args = append(args, fmt.Sprintf("--grace-period=%d", grace))
		}
	}

	cmd := exec.Command("kubectl", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "details": string(output)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"output": string(output)})
}
