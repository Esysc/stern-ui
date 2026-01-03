package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func setupRouter() *gin.Engine {
	r := gin.New()
	r.GET("/ws/logs", streamLogs)
	r.GET("/api/namespaces", getNamespaces)
	r.GET("/api/pods", getPods)
	r.GET("/api/contexts", getContexts)
	r.GET("/api/nodes", getNodes)
	return r
}

// TestStreamLogsEndpoint tests that the WebSocket endpoint is registered
func TestStreamLogsEndpoint(t *testing.T) {
	r := setupRouter()

	req, _ := http.NewRequest("GET", "/ws/logs?namespace=test-ns&query=.", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	// Since we're not using a real WebSocket client, the upgrader will fail
	// but we verify the endpoint exists (not 404)
	assert.NotEqual(t, http.StatusNotFound, w.Code)
}

// TestStreamLogsQueryParams tests various query parameter combinations
func TestStreamLogsQueryParams(t *testing.T) {
	r := setupRouter()

	testCases := []struct {
		name  string
		query string
	}{
		{"basic query", "/ws/logs?query=."},
		{"with namespace", "/ws/logs?query=nginx&namespace=default"},
		{"with selector", "/ws/logs?query=.&selector=app=web"},
		{"with since", "/ws/logs?query=.&since=1h"},
		{"with container filter", "/ws/logs?query=.&container=api&excludeContainer=sidecar"},
		{"with all namespaces", "/ws/logs?query=.&allNamespaces=true"},
		{"with context", "/ws/logs?query=.&context=minikube"},
		{"with advanced options", "/ws/logs?query=.&tail=100&node=worker-1&timestamps=short"},
		{"full options", "/ws/logs?query=nginx&namespace=prod&selector=app=web&since=30m&container=main&exclude=health&highlight=error&tail=500"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req, _ := http.NewRequest("GET", tc.query, nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			assert.NotEqual(t, http.StatusNotFound, w.Code, "Endpoint should exist for: %s", tc.name)
		})
	}
}

// TestGetNamespacesEndpoint tests the namespaces API endpoint
func TestGetNamespacesEndpoint(t *testing.T) {
	// Skip if kubectl is not available
	if _, err := exec.LookPath("kubectl"); err != nil {
		t.Skip("kubectl not found, skipping test")
	}

	r := setupRouter()

	req, _ := http.NewRequest("GET", "/api/namespaces", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	// Should return 200 or 500 (if cluster not available), but not 404
	assert.NotEqual(t, http.StatusNotFound, w.Code)

	if w.Code == http.StatusOK {
		var namespaces []string
		err := json.Unmarshal(w.Body.Bytes(), &namespaces)
		assert.NoError(t, err, "Response should be valid JSON array")
	}
}

// TestGetNamespacesWithContext tests namespaces endpoint with context parameter
func TestGetNamespacesWithContext(t *testing.T) {
	if _, err := exec.LookPath("kubectl"); err != nil {
		t.Skip("kubectl not found, skipping test")
	}

	r := setupRouter()

	req, _ := http.NewRequest("GET", "/api/namespaces?context=minikube", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.NotEqual(t, http.StatusNotFound, w.Code)
}

// TestGetPodsEndpoint tests the pods API endpoint
func TestGetPodsEndpoint(t *testing.T) {
	if _, err := exec.LookPath("kubectl"); err != nil {
		t.Skip("kubectl not found, skipping test")
	}

	r := setupRouter()

	testCases := []struct {
		name  string
		query string
	}{
		{"without namespace", "/api/pods"},
		{"with namespace", "/api/pods?namespace=default"},
		{"all namespaces", "/api/pods?allNamespaces=true"},
		{"with context", "/api/pods?namespace=kube-system&context=minikube"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req, _ := http.NewRequest("GET", tc.query, nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			assert.NotEqual(t, http.StatusNotFound, w.Code)

			if w.Code == http.StatusOK {
				var pods []string
				err := json.Unmarshal(w.Body.Bytes(), &pods)
				assert.NoError(t, err, "Response should be valid JSON array")
			}
		})
	}
}

// TestGetContextsEndpoint tests the contexts API endpoint
func TestGetContextsEndpoint(t *testing.T) {
	if _, err := exec.LookPath("kubectl"); err != nil {
		t.Skip("kubectl not found, skipping test")
	}

	r := setupRouter()

	req, _ := http.NewRequest("GET", "/api/contexts", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.NotEqual(t, http.StatusNotFound, w.Code)

	if w.Code == http.StatusOK {
		var contexts []string
		err := json.Unmarshal(w.Body.Bytes(), &contexts)
		assert.NoError(t, err, "Response should be valid JSON array")
	}
}

// TestGetNodesEndpoint tests the nodes API endpoint
func TestGetNodesEndpoint(t *testing.T) {
	if _, err := exec.LookPath("kubectl"); err != nil {
		t.Skip("kubectl not found, skipping test")
	}

	r := setupRouter()

	req, _ := http.NewRequest("GET", "/api/nodes", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.NotEqual(t, http.StatusNotFound, w.Code)

	if w.Code == http.StatusOK {
		var nodes []string
		err := json.Unmarshal(w.Body.Bytes(), &nodes)
		assert.NoError(t, err, "Response should be valid JSON array")
	}
}

// TestGetNodesWithContext tests nodes endpoint with context parameter
func TestGetNodesWithContext(t *testing.T) {
	if _, err := exec.LookPath("kubectl"); err != nil {
		t.Skip("kubectl not found, skipping test")
	}

	r := setupRouter()

	req, _ := http.NewRequest("GET", "/api/nodes?context=minikube", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.NotEqual(t, http.StatusNotFound, w.Code)
}

// TestAPIEndpointsExist verifies all API endpoints are registered
func TestAPIEndpointsExist(t *testing.T) {
	r := setupRouter()

	endpoints := []string{
		"/ws/logs?query=.",
		"/api/namespaces",
		"/api/pods",
		"/api/contexts",
		"/api/nodes",
	}

	for _, endpoint := range endpoints {
		t.Run(endpoint, func(t *testing.T) {
			req, _ := http.NewRequest("GET", endpoint, nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			assert.NotEqual(t, http.StatusNotFound, w.Code, "Endpoint %s should exist", endpoint)
		})
	}
}

// TestCORSUpgrader tests that the WebSocket upgrader allows all origins
func TestCORSUpgrader(t *testing.T) {
	// Verify the upgrader is configured to allow all origins
	dummyReq, _ := http.NewRequest("GET", "/", nil)
	dummyReq.Header.Set("Origin", "http://localhost:5173")

	result := upgrader.CheckOrigin(dummyReq)
	assert.True(t, result, "Upgrader should allow all origins")
}
