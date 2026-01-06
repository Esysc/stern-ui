import { memo } from 'react';
import PropTypes from 'prop-types';

/**
 * Help documentation for stream configuration
 */
const StreamHelpComponent = ({ isVisible, onClose }) => {
  if (!isVisible) return null;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-green-400">📚 Configuration Help</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
          aria-label="Close help"
        >
          ✕
        </button>
      </div>

      <div className="space-y-6 text-sm">
        {/* Basic Options */}
        <section>
          <h3 className="text-lg font-semibold text-blue-400 mb-3">Basic Options</h3>

          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-gray-300 mb-1">Namespace</h4>
              <p className="text-gray-400 mb-2">The Kubernetes namespace to stream logs from.</p>
              <div className="bg-gray-900 p-2 rounded">
                <code className="text-green-300">default</code> | <code className="text-green-300">kube-system</code> | <code className="text-green-300">production</code>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-300 mb-1">Selector (label)</h4>
              <p className="text-gray-400 mb-2">Kubernetes label selector to filter pods.</p>
              <div className="bg-gray-900 p-2 rounded space-y-1">
                <div><code className="text-green-300">app=myapp</code> - Single label</div>
                <div><code className="text-green-300">app=web,tier=frontend</code> - Multiple labels (AND)</div>
                <div><code className="text-green-300">app=api,version!=v1</code> - With negation</div>
                <div><code className="text-green-300">environment in (prod,staging)</code> - Set-based</div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-300 mb-1">Query (pod regex or resource/name)</h4>
              <p className="text-gray-400 mb-2">Regular expression to match pod names OR Kubernetes resource reference.</p>
              <div className="bg-gray-900 p-2 rounded space-y-1">
                <div><code className="text-green-300">.</code> - All pods (dot matches everything)</div>
                <div><code className="text-green-300">.*nginx.*</code> - Pods containing "nginx"</div>
                <div><code className="text-green-300">frontend-.*</code> - Pods starting with "frontend-"</div>
                <div><code className="text-green-300">deployment/nginx</code> - All pods from deployment</div>
                <div><code className="text-green-300">service/api</code> - All pods behind service</div>
                <div><code className="text-green-300">statefulset/redis</code> - All pods from statefulset</div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-300 mb-1">Since</h4>
              <p className="text-gray-400 mb-2">How far back to retrieve logs (Go duration format).</p>
              <div className="bg-gray-900 p-2 rounded space-y-1">
                <div><code className="text-green-300">5m</code> - Last 5 minutes</div>
                <div><code className="text-green-300">1h</code> - Last hour</div>
                <div><code className="text-green-300">24h</code> - Last 24 hours</div>
                <div><code className="text-green-300">48h</code> - Last 2 days (default)</div>
              </div>
            </div>
          </div>
        </section>

        {/* Container Filtering */}
        <section>
          <h3 className="text-lg font-semibold text-blue-400 mb-3">Container Filtering</h3>
          <p className="text-gray-400 mb-3 italic">
            ℹ️ Container filters apply to ALL matched pods. First select pods (via Selector/Query), then filter which containers within those pods to show.
          </p>

          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-gray-300 mb-1">Container</h4>
              <p className="text-gray-400 mb-2">Container name (exact match) or regular expression to match container names within selected pods.</p>
              <div className="bg-gray-900 p-2 rounded space-y-1">
                <div><code className="text-green-300">app</code> - Exact match: only container named "app"</div>
                <div><code className="text-green-300">nginx</code> - Exact match: only container named "nginx"</div>
                <div><code className="text-green-300">.*</code> - Regex: all containers</div>
                <div><code className="text-green-300">api|worker</code> - Regex: match "api" OR "worker" containers</div>
                <div><code className="text-green-300">.*-sidecar</code> - Regex: containers ending with "-sidecar"</div>
              </div>
              <p className="text-yellow-300 text-xs mt-2">
                💡 Tip: Plain names like "app" match exactly. Use regex patterns like ".*app.*" to match substrings.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-gray-300 mb-1">Exclude Containers</h4>
              <p className="text-gray-400 mb-2">Comma-separated list of container names/patterns to exclude.</p>
              <div className="bg-gray-900 p-2 rounded space-y-1">
                <div><code className="text-green-300">istio-proxy</code> - Exclude istio sidecar</div>
                <div><code className="text-green-300">istio-proxy,envoy</code> - Multiple exclusions</div>
                <div><code className="text-green-300">.*-sidecar</code> - Regex pattern</div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-300 mb-1">Exclude Pods</h4>
              <p className="text-gray-400 mb-2">Comma-separated list of pod names/patterns to exclude.</p>
              <div className="bg-gray-900 p-2 rounded space-y-1">
                <div><code className="text-green-300">kube-proxy.*</code> - Exclude kube-proxy pods</div>
                <div><code className="text-green-300">.*-test-.*</code> - Exclude test pods</div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-300 mb-1">Container State</h4>
              <p className="text-gray-400 mb-2">Which container states to include.</p>
              <div className="bg-gray-900 p-2 rounded space-y-1">
                <div><code className="text-green-300">running</code> - Only running containers (default)</div>
                <div><code className="text-green-300">waiting</code> - Waiting to start</div>
                <div><code className="text-green-300">terminated</code> - Stopped containers</div>
                <div><code className="text-green-300">all</code> - All states</div>
              </div>
            </div>
          </div>
        </section>

        {/* Log Filtering */}
        <section>
          <h3 className="text-lg font-semibold text-blue-400 mb-3">Log Filtering</h3>

          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-gray-300 mb-1">Include (regex, highlighted)</h4>
              <p className="text-gray-400 mb-2">Only show logs matching these patterns (comma-separated). Matched text is highlighted.</p>
              <div className="bg-gray-900 p-2 rounded space-y-1">
                <div><code className="text-green-300">error</code> - Only logs containing "error"</div>
                <div><code className="text-green-300">error,warn</code> - Logs with "error" OR "warn"</div>
                <div><code className="text-green-300">user.*login</code> - Regex pattern</div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-300 mb-1">Exclude (regex)</h4>
              <p className="text-gray-400 mb-2">Hide logs matching these patterns (comma-separated).</p>
              <div className="bg-gray-900 p-2 rounded space-y-1">
                <div><code className="text-green-300">health</code> - Hide health check logs</div>
                <div><code className="text-green-300">health,ping</code> - Multiple exclusions</div>
                <div><code className="text-green-300">GET /health|GET /ping</code> - Regex with OR</div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-300 mb-1">Highlight (regex)</h4>
              <p className="text-gray-400 mb-2">Highlight matching patterns in logs (comma-separated).</p>
              <div className="bg-gray-900 p-2 rounded space-y-1">
                <div><code className="text-green-300">ERROR</code> - Highlight "ERROR"</div>
                <div><code className="text-green-300">ERROR,WARN</code> - Multiple highlights</div>
                <div><code className="text-green-300">\d{'{'}3{'}'}\.\d{'{'}3{'}'}\.\d{'{'}3{'}'}\.\d{'{'}3{'}'}</code> - Highlight IP addresses</div>
              </div>
            </div>
          </div>
        </section>

        {/* Advanced Options */}
        <section>
          <h3 className="text-lg font-semibold text-blue-400 mb-3">Advanced Options</h3>

          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-gray-300 mb-1">Tail</h4>
              <p className="text-gray-400 mb-2">Number of lines to show from the end of logs per container.</p>
              <div className="bg-gray-900 p-2 rounded space-y-1">
                <div><code className="text-green-300">-1</code> - Show all lines (default)</div>
                <div><code className="text-green-300">100</code> - Last 100 lines</div>
                <div><code className="text-green-300">500</code> - Last 500 lines</div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-300 mb-1">Max Log Requests</h4>
              <p className="text-gray-400 mb-2">Maximum number of concurrent log streams to Kubernetes API.</p>
              <div className="bg-gray-900 p-2 rounded space-y-1">
                <div><code className="text-green-300">50</code> - Default (50 concurrent streams)</div>
                <div><code className="text-green-300">100</code> - Higher limit for more pods</div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-300 mb-1">Timestamps</h4>
              <p className="text-gray-400 mb-2">Include Kubernetes timestamps in logs.</p>
              <div className="bg-gray-900 p-2 rounded space-y-1">
                <div><code className="text-green-300">short</code> - HH:MM:SS</div>
                <div><code className="text-green-300">default</code> - RFC3339</div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-300 mb-1">Checkboxes</h4>
              <div className="bg-gray-900 p-2 rounded space-y-1">
                <div><strong className="text-gray-300">All Namespaces:</strong> Search across all namespaces</div>
                <div><strong className="text-gray-300">Init Containers:</strong> Include init container logs</div>
                <div><strong className="text-gray-300">Ephemeral Containers:</strong> Include ephemeral container logs</div>
                <div><strong className="text-gray-300">No Follow:</strong> Don't follow new logs (historical only)</div>
              </div>
            </div>
          </div>
        </section>

        {/* Tips */}
        <section>
          <h3 className="text-lg font-semibold text-yellow-400 mb-3">💡 Tips & Common Patterns</h3>

          <div className="space-y-3">
            <div>
              <h4 className="font-semibold text-gray-300 mb-1">Selecting specific container in a pod:</h4>
              <div className="bg-gray-900 p-2 rounded space-y-1 text-sm">
                <div>1. <strong>Query:</strong> <code className="text-green-300">my-pod-name</code> (or regex like <code className="text-green-300">my-pod-.*</code>)</div>
                <div>2. <strong>Container:</strong> <code className="text-green-300">nginx</code> (name of specific container)</div>
                <div className="text-gray-400 italic">→ Shows logs only from "nginx" container in matched pods</div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-300 mb-1">Multiple containers from same pods:</h4>
              <div className="bg-gray-900 p-2 rounded space-y-1 text-sm">
                <div><strong>Query:</strong> <code className="text-green-300">deployment/api</code></div>
                <div><strong>Container:</strong> <code className="text-green-300">app|sidecar</code></div>
                <div className="text-gray-400 italic">→ Shows logs from both "app" and "sidecar" containers</div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-300 mb-1">Exclude sidecar containers:</h4>
              <div className="bg-gray-900 p-2 rounded space-y-1 text-sm">
                <div><strong>Query:</strong> <code className="text-green-300">.</code> (all pods)</div>
                <div><strong>Exclude Containers:</strong> <code className="text-green-300">istio-proxy, envoy</code></div>
                <div className="text-gray-400 italic">→ Shows all containers except sidecars</div>
              </div>
            </div>
          </div>

          <ul className="list-disc list-inside space-y-2 text-gray-400 mt-4">
            <li>Use <code className="text-green-300">.</code> in Query field to match all pods</li>
            <li>Combine Selector and Query for precise filtering (AND logic)</li>
            <li>Container field filters WITHIN the pods matched by Query/Selector</li>
            <li>Regular expressions are case-insensitive by default</li>
            <li>Use the Search box below for client-side filtering of displayed logs</li>
            <li>Auto-scroll disables when you scroll up manually</li>
            <li>Logs are limited to 5000 entries in memory to prevent browser slowdown</li>
            <li>Use Pause button to freeze logs while investigating issues</li>
          </ul>
        </section>
      </div>
    </div>
  );
};

StreamHelpComponent.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired
};

export const StreamHelp = memo(StreamHelpComponent);
