package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func setupRouter() *gin.Engine {
	return newRouter()
}

// TestStreamLogsEndpoint tests that the WebSocket endpoint is registered
func TestStreamLogsEndpoint(t *testing.T) {
	r := setupRouter()

	req, _ := http.NewRequest("GET", "/ws/logs?namespace=test-ns&query=.", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	// The upgrader will fail without a real WebSocket client, but the endpoint
	// should not return 404 or 405. It should respond with an error about the
	// upgrade failure or accept the request.
	assert.NotEqual(t, http.StatusNotFound, w.Code)
	assert.NotEqual(t, http.StatusMethodNotAllowed, w.Code)
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
		"/api/clusters/events?context=minikube",
		"/api/clusters/health?context=minikube",
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

// TestApplyManifestRejectsBadVerb verifies the apply endpoint validates input
func TestApplyManifestRejectsBadVerb(t *testing.T) {
	r := setupRouter()

	req, _ := http.NewRequest("POST", "/api/clusters/apply?context=minikube", strings.NewReader(`{"verb":"explode","yaml":"apiVersion: v1\nkind: Pod"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// TestResourcesRejectsUnknownKind verifies the resource browser only accepts whitelisted kinds
func TestResourcesRejectsUnknownKind(t *testing.T) {
	r := setupRouter()

	req, _ := http.NewRequest("GET", "/api/clusters/resources?context=minikube&kind=deployments.replicasets", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// TestResourceDetailRejectsBadName verifies resource names are validated
func TestResourceDetailRejectsBadName(t *testing.T) {
	r := setupRouter()

	req, _ := http.NewRequest("GET", "/api/clusters/resource-detail?context=minikube&kind=configmaps&name=-f", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// TestResolveKindRejectsUnsafeIdentifiers verifies kind identifiers are validated
// before reaching kubectl (pattern check happens before any cluster access)
func TestResolveKindRejectsUnsafeIdentifiers(t *testing.T) {
	cases := []struct {
		name string
		kind string
	}{
		{"empty", ""},
		{"uppercase", "ConfigMaps"},
		{"spaces", "config maps"},
		{"leading dash", "-f"},
		{"leading dot", ".configmaps"},
		{"shell metacharacters", "configmaps;rm"},
		{"newline", "configmaps\n"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, _, err := resolveKind("minikube", tc.kind)
			assert.Error(t, err, "kind %q should be rejected", tc.kind)
		})
	}
}

// TestParseResourceKinds verifies parsing of the real `kubectl api-resources -o json`
// payload shape: a single APIResourceList with a top-level "resources" array
func TestParseResourceKinds(t *testing.T) {
	payload := []byte(`{
		"kind": "APIResourceList",
		"apiVersion": "v1",
		"groupVersion": "",
		"resources": [
			{
				"name": "bindings",
				"singularName": "",
				"namespaced": true,
				"version": "v1",
				"kind": "Binding",
				"verbs": ["create"]
			},
			{
				"name": "configmaps",
				"singularName": "configmap",
				"namespaced": true,
				"version": "v1",
				"kind": "ConfigMap",
				"verbs": ["create", "get", "list"]
			},
			{
				"name": "deployments",
				"singularName": "deployment",
				"namespaced": true,
				"group": "apps",
				"version": "v1",
				"kind": "Deployment",
				"verbs": ["create", "get", "list"]
			}
		]
	}`)

	kinds, err := parseResourceKinds(payload)
	assert.NoError(t, err)
	// "bindings" is filtered out (no list/get verbs); the rest are sorted by Kind
	assert.Len(t, kinds, 2)
	assert.Equal(t, "ConfigMap", kinds[0].Kind)
	assert.Equal(t, "Deployment", kinds[1].Kind)
	assert.Equal(t, "apps", kinds[1].Group)
	assert.Equal(t, "deployments.apps", resourceIdentifier(kinds[1]))
}

// TestParseResourceKindsRejectsGarbage verifies malformed output is an error
func TestParseResourceKindsRejectsGarbage(t *testing.T) {
	t.Run("invalid json", func(t *testing.T) {
		_, err := parseResourceKinds([]byte("not json"))
		assert.Error(t, err)
	})

	t.Run("empty resource list", func(t *testing.T) {
		_, err := parseResourceKinds([]byte(`{"kind":"APIResourceList","resources":[]}`))
		assert.Error(t, err)
	})

	t.Run("no get/list verbs", func(t *testing.T) {
		_, err := parseResourceKinds([]byte(`{"kind":"APIResourceList","resources":[{"name":"bindings","kind":"Binding","verbs":["create"]}]}`))
		assert.Error(t, err)
	})
}

// TestResolveKindAcceptsWhitelistedFallback verifies whitelisted kinds resolve
// via the fallback path when API discovery is unavailable
func TestResolveKindAcceptsWhitelistedFallback(t *testing.T) {
	if _, err := exec.LookPath("kubectl"); err == nil {
		// If kubectl exists but has no cluster, discovery fails and the fallback
		// kicks in. If a real cluster is reachable, discovery confirms the kind.
		// Either way a known kind must not be rejected.
		_, _, err := resolveKind("minikube", "configmaps")
		assert.NoError(t, err, "configmaps should always resolve")
		return
	}

	_, _, err := resolveKind("minikube", "configmaps")
	assert.NoError(t, err, "configmaps should resolve via the static whitelist")
}

// TestLookupResource verifies discovery result lookup by identifier
func TestLookupResource(t *testing.T) {
	kinds := []apiResourceInfo{
		{Name: "configmaps", Kind: "ConfigMap", Namespaced: true, Verbs: []string{"get", "list"}},
		{Name: "deployments", Kind: "Deployment", Group: "apps", Namespaced: true, Verbs: []string{"get", "list"}},
		{Name: "nodes", Kind: "Node", Namespaced: false, Verbs: []string{"get", "list"}},
		{Name: "events", Kind: "Event", Namespaced: true, Verbs: []string{"get", "list"}},
		{Name: "events", Kind: "Event", Group: "events.k8s.io", Namespaced: true, Verbs: []string{"get", "list"}},
	}

	t.Run("group-qualified identifier", func(t *testing.T) {
		it, ok := lookupResource(kinds, "deployments.apps")
		assert.True(t, ok)
		assert.Equal(t, "Deployment", it.Kind)
		assert.True(t, it.Namespaced)
	})

	t.Run("groupless core resource", func(t *testing.T) {
		it, ok := lookupResource(kinds, "configmaps")
		assert.True(t, ok)
		assert.Equal(t, "ConfigMap", it.Kind)
		assert.True(t, it.Namespaced)
	})

	t.Run("name match falls back to core group", func(t *testing.T) {
		it, ok := lookupResource(kinds, "events")
		assert.True(t, ok)
		assert.Equal(t, "", it.Group, "core-group events should be preferred")
	})

	t.Run("unknown kind", func(t *testing.T) {
		_, ok := lookupResource(kinds, "widgets")
		assert.False(t, ok)
	})
}

// TestResourceKindsEndpoint tests the dynamic resource-kinds endpoint
func TestResourceKindsEndpoint(t *testing.T) {
	if _, err := exec.LookPath("kubectl"); err != nil {
		t.Skip("kubectl not found, skipping test")
	}

	r := setupRouter()

	req, _ := http.NewRequest("GET", "/api/clusters/resource-kinds?context=minikube", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.NotEqual(t, http.StatusNotFound, w.Code, "resource-kinds endpoint should be registered")

	if w.Code == http.StatusOK {
		var kinds []apiResourceInfo
		err := json.Unmarshal(w.Body.Bytes(), &kinds)
		assert.NoError(t, err, "Response should be a valid JSON array")
	}
}

// TestResourceKindsRegistered verifies the endpoint is registered without kubectl
func TestResourceKindsRegistered(t *testing.T) {
	r := setupRouter()

	req, _ := http.NewRequest("GET", "/api/clusters/resource-kinds?context=minikube", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.NotEqual(t, http.StatusNotFound, w.Code, "resource-kinds endpoint should exist")
}

// TestResourceDetailRejectsUnknownKind verifies dynamic kind validation on detail endpoint
func TestResourceDetailRejectsUnknownKind(t *testing.T) {
	if _, err := exec.LookPath("kubectl"); err != nil {
		t.Skip("kubectl not found, skipping test")
	}

	r := setupRouter()

	req, _ := http.NewRequest("GET", "/api/clusters/resource-detail?context=minikube&kind=notarealresource&name=x", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// TestValidatePatchOp verifies RFC 6902 operation validation
func TestValidatePatchOp(t *testing.T) {
	t.Run("valid replace", func(t *testing.T) {
		err := validatePatchOp(jsonPatchOp{Op: "replace", Path: "/metadata/labels/app", Value: json.RawMessage(`"web"`)})
		assert.NoError(t, err)
	})

	t.Run("valid remove", func(t *testing.T) {
		err := validatePatchOp(jsonPatchOp{Op: "remove", Path: "/spec/replicas"})
		assert.NoError(t, err)
	})

	t.Run("valid add with nested value", func(t *testing.T) {
		err := validatePatchOp(jsonPatchOp{Op: "add", Path: "/data", Value: json.RawMessage(`{"key":"value"}`)})
		assert.NoError(t, err)
	})

	t.Run("invalid op", func(t *testing.T) {
		err := validatePatchOp(jsonPatchOp{Op: "explode", Path: "/spec"})
		assert.Error(t, err)
	})

	t.Run("missing path", func(t *testing.T) {
		err := validatePatchOp(jsonPatchOp{Op: "replace", Value: json.RawMessage(`1`)})
		assert.Error(t, err)
	})

	t.Run("relative path", func(t *testing.T) {
		err := validatePatchOp(jsonPatchOp{Op: "replace", Path: "metadata/labels", Value: json.RawMessage(`{}`)})
		assert.Error(t, err)
	})

	t.Run("empty segment", func(t *testing.T) {
		err := validatePatchOp(jsonPatchOp{Op: "replace", Path: "/metadata//labels", Value: json.RawMessage(`{}`)})
		assert.Error(t, err)
	})

	t.Run("whitespace in segment", func(t *testing.T) {
		err := validatePatchOp(jsonPatchOp{Op: "replace", Path: "/metadata/labels/a b", Value: json.RawMessage(`"x"`)})
		assert.Error(t, err)
	})

	t.Run("control character in segment", func(t *testing.T) {
		err := validatePatchOp(jsonPatchOp{Op: "replace", Path: "/metadata/labels/a\nb", Value: json.RawMessage(`"x"`)})
		assert.Error(t, err)
	})

	t.Run("add without value", func(t *testing.T) {
		err := validatePatchOp(jsonPatchOp{Op: "add", Path: "/spec/replicas"})
		assert.Error(t, err)
	})

	t.Run("null value counts as present", func(t *testing.T) {
		err := validatePatchOp(jsonPatchOp{Op: "replace", Path: "/spec/replicas", Value: json.RawMessage(`null`)})
		assert.NoError(t, err)
	})

	t.Run("escaped pointer segments are allowed", func(t *testing.T) {
		// annotation key with slashes is escaped as ~1 in JSON pointers
		err := validatePatchOp(jsonPatchOp{
			Op:   "remove",
			Path: "/metadata/annotations/kubectl.kubernetes.io~1last-applied-configuration",
		})
		assert.NoError(t, err)
	})
}

// TestPatchResourceRejectsBadInput verifies the patch endpoint validates input
func TestPatchResourceRejectsBadInput(t *testing.T) {
	cases := []struct {
		name   string
		url    string
		body   string
		expect int
	}{
		{
			name:   "missing context",
			url:    "/api/clusters/resource-patch?kind=configmaps&name=cm-a",
			body:   `{"patch":[{"op":"replace","path":"/data/key","value":"v"}]}`,
			expect: http.StatusBadRequest,
		},
		{
			name:   "empty patch",
			url:    "/api/clusters/resource-patch?context=minikube&kind=configmaps&name=cm-a",
			body:   `{"patch":[]}`,
			expect: http.StatusBadRequest,
		},
		{
			name:   "invalid op",
			url:    "/api/clusters/resource-patch?context=minikube&kind=configmaps&name=cm-a",
			body:   `{"patch":[{"op":"explode","path":"/data/key","value":"v"}]}`,
			expect: http.StatusBadRequest,
		},
		{
			name:   "invalid name",
			url:    "/api/clusters/resource-patch?context=minikube&kind=configmaps&name=-f",
			body:   `{"patch":[{"op":"replace","path":"/data/key","value":"v"}]}`,
			expect: http.StatusBadRequest,
		},
		{
			name:   "unknown kind",
			url:    "/api/clusters/resource-patch?context=minikube&kind=notarealresource&name=x",
			body:   `{"patch":[{"op":"replace","path":"/spec/x","value":"v"}]}`,
			expect: http.StatusBadRequest,
		},
		{
			name:   "malformed json body",
			url:    "/api/clusters/resource-patch?context=minikube&kind=configmaps&name=cm-a",
			body:   `{"patch":`,
			expect: http.StatusBadRequest,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := setupRouter()

			req, _ := http.NewRequest("POST", tc.url, strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			assert.Equal(t, tc.expect, w.Code)
		})
	}
}

// TestScalableTargetKind verifies workload-kind to HPA scaleTargetRef mapping
func TestScalableTargetKind(t *testing.T) {
	cases := map[string]string{
		"deployments":       "Deployment",
		"deployments.apps":  "Deployment",
		"statefulsets":      "StatefulSet",
		"statefulsets.apps": "StatefulSet",
		"replicasets":       "ReplicaSet",
		"replicasets.apps":  "ReplicaSet",
	}
	for kind, want := range cases {
		got, ok := scalableTargetKind(kind)
		assert.True(t, ok, "%s should be scalable", kind)
		assert.Equal(t, want, got, kind)
	}

	for _, kind := range []string{"configmaps", "pods", "nodes", "services"} {
		_, ok := scalableTargetKind(kind)
		assert.False(t, ok, "%s should not be scalable", kind)
	}
}

// TestScaleInfoRejectsBadInput verifies the scale-info endpoint validates input
func TestScaleInfoRejectsBadInput(t *testing.T) {
	cases := []struct {
		name string
		url  string
	}{
		{"non-scalable kind", "/api/clusters/scale-info?context=minikube&kind=configmaps&name=cm-a&namespace=default"},
		{"bad name", "/api/clusters/scale-info?context=minikube&kind=deployments&name=-f&namespace=default"},
		{"missing namespace", "/api/clusters/scale-info?context=minikube&kind=deployments&name=app"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := setupRouter()

			req, _ := http.NewRequest("GET", tc.url, nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			assert.Equal(t, http.StatusBadRequest, w.Code)
		})
	}
}

// TestScaleInfoRegistered verifies the endpoint is registered
func TestScaleInfoRegistered(t *testing.T) {
	r := setupRouter()

	req, _ := http.NewRequest("GET", "/api/clusters/scale-info?context=minikube&kind=deployments&name=app&namespace=default", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.NotEqual(t, http.StatusNotFound, w.Code, "scale-info endpoint should exist")
}

// TestDrainNodeRejectsBadInput verifies node drain input validation
func TestDrainNodeRejectsBadInput(t *testing.T) {
	cases := []struct {
		name string
		url  string
	}{
		{"missing context", "/api/clusters/node-drain?name=node-1"},
		{"missing name", "/api/clusters/node-drain?context=minikube"},
		{"bad name", "/api/clusters/node-drain?context=minikube&name=-f"},
		{"name with spaces", "/api/clusters/node-drain?context=minikube&name=node%201"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := setupRouter()

			req, _ := http.NewRequest("POST", tc.url, nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			assert.Equal(t, http.StatusBadRequest, w.Code)
		})
	}
}

// TestDeleteResourceRejectsBadInput verifies delete input validation
func TestDeleteResourceRejectsBadInput(t *testing.T) {
	cases := []struct {
		name string
		url  string
	}{
		{"missing context", "/api/clusters/resource-delete?kind=configmaps&name=cm-a"},
		{"bad name", "/api/clusters/resource-delete?context=minikube&kind=configmaps&name=-f"},
		{"negative grace period", "/api/clusters/resource-delete?context=minikube&kind=configmaps&name=cm-a&gracePeriod=-1"},
		{"non-numeric grace period", "/api/clusters/resource-delete?context=minikube&kind=configmaps&name=cm-a&gracePeriod=abc"},
		{"unknown kind", "/api/clusters/resource-delete?context=minikube&kind=notarealresource&name=x"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := exec.LookPath("kubectl"); err != nil {
				t.Skip("kubectl not found, skipping test")
			}

			r := setupRouter()

			req, _ := http.NewRequest("POST", tc.url, nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			assert.Equal(t, http.StatusBadRequest, w.Code)
		})
	}
}

// TestDeleteResourceRegistered verifies the endpoint is registered
func TestDeleteResourceRegistered(t *testing.T) {
	r := setupRouter()

	req, _ := http.NewRequest("POST", "/api/clusters/resource-delete?context=minikube&kind=configmaps&name=cm-a", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.NotEqual(t, http.StatusNotFound, w.Code, "resource-delete endpoint should exist")
}

// TestNodeDrainRegistered verifies the endpoint is registered
func TestNodeDrainRegistered(t *testing.T) {
	r := setupRouter()

	req, _ := http.NewRequest("POST", "/api/clusters/node-drain?context=minikube&name=node-1", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.NotEqual(t, http.StatusNotFound, w.Code, "node-drain endpoint should exist")
}

// TestWSOriginPolicy verifies the WebSocket upgrader origin restrictions
func TestWSOriginPolicy(t *testing.T) {
	t.Run("allows same origin", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/", nil)
		req.Host = "localhost:8080"
		req.Header.Set("Origin", "http://localhost:8080")
		assert.True(t, upgrader.CheckOrigin(req), "Same-origin requests should be allowed")
	})

	t.Run("allows Vite dev origin", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/", nil)
		req.Host = "localhost:8080"
		req.Header.Set("Origin", "http://localhost:5173")
		assert.True(t, upgrader.CheckOrigin(req), "Vite dev origin should be allowed")
	})

	t.Run("rejects unknown origin", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/", nil)
		req.Host = "localhost:8080"
		req.Header.Set("Origin", "http://evil.example.com")
		assert.False(t, upgrader.CheckOrigin(req), "Unknown origins must be rejected")
	})

	t.Run("allows non-browser clients without Origin", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/", nil)
		assert.True(t, upgrader.CheckOrigin(req), "Non-browser clients without Origin should be allowed")
	})
}
