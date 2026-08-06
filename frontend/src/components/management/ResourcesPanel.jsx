import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { apiFetch } from '../../utils/api';
import { AutocompleteField } from '../common/AutocompleteField';
import { SelectField } from '../common/SelectField';

const REFRESH_MS = 30000;

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
  const [namespace, setNamespace] = useState('');
  const [namespaces, setNamespaces] = useState([]);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      if (namespace && !CLUSTER_SCOPED.has(kind)) params.set('namespace', namespace);
      const data = await apiFetch(`/api/clusters/resources?${params}`);
      setItems(data.items || []);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [context, kind, namespace]);

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
              options={KIND_OPTIONS}
              idPrefix="resources"
            />
          </div>
          {!CLUSTER_SCOPED.has(kind) && (
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
              <tr key={`${r.name}-${i}`} className="border-b border-gray-900 align-top hover:bg-gray-900">
                <td className="px-4 py-2 text-cyan-300 whitespace-nowrap">{r.name}</td>
                <td className="px-4 py-2 text-gray-300 whitespace-nowrap">{r.namespace || '—'}</td>
                <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{ageLabel(r.created)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

ResourcesPanel.propTypes = {
  context: PropTypes.string.isRequired
};
