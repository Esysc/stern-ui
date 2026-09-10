import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { apiFetch } from '../../utils/api';
import { cachedFetch } from '../../utils/cache';
import { AutocompleteField } from '../common/AutocompleteField';
import { SelectField } from '../common/SelectField';
import { ResourceEditForm } from './ResourceEditForm';
const REFRESH_MS = 30000;
const KINDS_CACHE_TTL = 300000;

// Fallback kinds used when API discovery is unavailable
const KIND_OPTIONS = [
  { value: 'configmaps', label: 'ConfigMaps' },
  { value: 'secrets', label: 'Secrets' },
  { value: 'serviceaccounts', label: 'Service Accounts' },
  { value: 'roles', label: 'Roles' },
  { value: 'rolebindings', label: 'Role Bindings' },
  { value: 'clusterroles', label: 'Cluster Roles' },
  { value: 'clusterrolebindings', label: 'Cluster Role Bindings' },
  { value: 'deployments', label: 'Deployments' },
  { value: 'services', label: 'Services' },
  { value: 'ingresses', label: 'Ingresses' },
  { value: 'storageclasses', label: 'Storage Classes' },
  { value: 'nodes', label: 'Nodes' },
  { value: 'pods', label: 'Pods' },
];

const CLUSTER_SCOPED = new Set(['clusterroles', 'clusterrolebindings', 'storageclasses', 'nodes']);

// Normalize a discovered API resource into a selector option + scope flag.
// Group-qualified identifiers (name.group) disambiguate same-named resources.
function discoveredKindsToOptions(kinds) {
  if (!Array.isArray(kinds)) return null;
  const options = [];
  const scope = new Map();
  for (const it of kinds) {
    if (!it || typeof it !== 'object' || typeof it.name !== 'string') continue;
    const value = it.group ? `${it.name}.${it.group}` : it.name;
    if (scope.has(value)) continue;
    scope.set(value, it.namespaced !== false);
    const groupLabel = it.group ? ` · ${it.group}/${it.version || ''}` : '';
    options.push({ value, label: `${it.kind || value}${groupLabel}` });
  }
  if (options.length === 0) return null;
  return { options, scope };
}

function ageLabel(created) {
  if (!created) return '';
  const ms = Date.now() - new Date(created).getTime();
  if (Number.isNaN(ms) || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * Cluster resource browser - list configmaps, RBAC rules, workloads, etc.
 */
export function ResourcesPanel({ context }) {
  const [kind, setKind] = useState('configmaps');
  const [kindOptions, setKindOptions] = useState(KIND_OPTIONS);
  const [scope, setScope] = useState(null); // Map value -> namespaced (from discovery)
  const [namespace, setNamespace] = useState('');
  const [namespaces, setNamespaces] = useState([]);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailTab, setDetailTab] = useState('yaml');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  // A kind is cluster-scoped when live discovery says so, falling back to the
  // static set (which matches the backend's own fallback list)
  const isClusterScoped = useCallback(
    (k) => {
      if (scope?.has(k)) return !scope.get(k);
      const base = k.split('.')[0];
      return CLUSTER_SCOPED.has(k) || CLUSTER_SCOPED.has(base);
    },
    [scope]
  );

  const fetchDetail = useCallback(async (name, namespace, silent) => {
    setDetailError('');
    if (!silent) setDetailLoading(true);
    try {
      const params = new URLSearchParams({ context, kind, name });
      if (namespace && !isClusterScoped(kind)) params.set('namespace', namespace);
      const data = await apiFetch(`/api/clusters/resource-detail?${params}`);
      setDetail({ kind, name, namespace, yaml: data.yaml, object: data.object });
    } catch (e) {
      setDetailError(e.message);
    } finally {
      if (!silent) setDetailLoading(false);
    }
  }, [context, kind, isClusterScoped]);

  const openDetail = useCallback((name, namespace) => {
    setDetail({ kind, name, namespace });
    fetchDetail(name, namespace, false);
  }, [kind, fetchDetail]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') setDetail(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (!context) return;
    cachedFetch(`/api/clusters/resource-kinds?context=${encodeURIComponent(context)}`, { ttl: KINDS_CACHE_TTL })
      .then((kinds) => {
        const mapped = discoveredKindsToOptions(kinds);
        if (mapped) {
          setKindOptions(mapped.options);
          setScope(mapped.scope);
        }
      })
      .catch(() => {}); // keep static fallback options on failure
  }, [context]);

  useEffect(() => {
    if (!context) return;
    apiFetch(`/api/namespaces?context=${encodeURIComponent(context)}`)
      .then((list) => setNamespaces(Array.isArray(list) ? list.filter(n => typeof n === 'string') : []))
      .catch(() => setNamespaces([]));
  }, [context]);

  const load = useCallback(async () => {
    if (!context) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ context, kind });
      if (namespace && !isClusterScoped(kind)) params.set('namespace', namespace);
      const data = await apiFetch(`/api/clusters/resources?${params}`);
      setItems(data.items || []);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [context, kind, namespace, isClusterScoped]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-lg font-bold">Cluster Resources</h2>
        <div className="flex items-center gap-3">
          <div className="w-56">
            <SelectField
              label="Resource kind"
              value={kind}
              onChange={setKind}
              options={kindOptions}
              idPrefix="resources"
            />
          </div>
          {!isClusterScoped(kind) && (
            <div className="w-48">
              <AutocompleteField
                label="Namespace"
                value={namespace}
                onChange={setNamespace}
                suggestions={namespaces}
                placeholder="all"
                idPrefix="resources"
              />
            </div>
          )}
          <button
            onClick={load}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
            aria-label="Refresh resources"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">{error}</div>}
      {loading && <div className="mb-4 text-gray-500 text-sm">Loading…</div>}

      <div className="bg-black border border-gray-800 rounded-lg overflow-auto max-h-[calc(100vh-250px)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-900">
            <tr className="text-left text-gray-400 border-b border-gray-800">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Namespace</th>
              <th className="px-4 py-2 font-medium">Age</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading && (
              <tr><td colSpan="3" className="px-4 py-8 text-center text-gray-600">No resources</td></tr>
            )}
            {items.map((r, i) => (
              <tr
                key={`${r.name}-${i}`}
                className="border-b border-gray-900 align-top hover:bg-gray-900 cursor-pointer"
                onClick={() => openDetail(r.name, r.namespace)}
              >
                <td className="px-4 py-2 text-cyan-300 whitespace-nowrap">{r.name}</td>
                <td className="px-4 py-2 text-gray-300 whitespace-nowrap">{r.namespace || '—'}</td>
                <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{ageLabel(r.created)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDetail(null)}>
          <div
            className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <h3 className="font-bold text-cyan-300 break-all">{detail.kind}/{detail.name}</h3>
              <div className="flex items-center gap-2">
                <div className="flex rounded overflow-hidden border border-gray-700">
                  <button
                    onClick={() => setDetailTab('yaml')}
                    className={`px-3 py-1 text-sm ${detailTab === 'yaml' ? 'bg-gray-700 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'}`}
                    aria-label="Show YAML view"
                  >
                    YAML
                  </button>
                  <button
                    onClick={() => setDetailTab('form')}
                    className={`px-3 py-1 text-sm ${detailTab === 'form' ? 'bg-gray-700 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'}`}
                    aria-label="Show form view"
                  >
                    Form
                  </button>
                </div>
                <button
                  onClick={() => setDetail(null)}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                  aria-label="Close resource detail"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {detailError && <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">{detailError}</div>}
              {detailLoading && <div className="text-gray-500 text-sm">Loading…</div>}
              {detailTab === 'yaml' && detail.yaml && (
                <pre className="text-xs text-gray-300 whitespace-pre-wrap break-all font-mono">{detail.yaml}</pre>
              )}
              {detailTab === 'form' && detail.object && (
                <ResourceEditForm
                  context={context}
                  kind={detail.kind}
                  name={detail.name}
                  namespace={detail.namespace}
                  object={detail.object}
                  onUpdated={() => {
                    fetchDetail(detail.name, detail.namespace, true);
                    load();
                  }}
                  onDeleted={() => {
                    setDetail(null);
                    load();
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ResourcesPanel.propTypes = {
  context: PropTypes.string.isRequired
};
