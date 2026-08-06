import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { apiFetch } from '../../utils/api';

const REFRESH_MS = 30000;

const REASON_COLORS = {
  CrashLoopBackOff: 'text-red-400',
  ImagePullBackOff: 'text-red-400',
  ErrImagePull: 'text-red-400',
  Pending: 'text-yellow-400',
  Failed: 'text-red-400'
};

/**
 * Cluster health view - node status, pod phase summary, and pod issues
 */
export function HealthPanel({ context }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!context) return;
    setLoading(true);
    try {
      const d = await apiFetch(`/api/clusters/health?context=${encodeURIComponent(context)}`);
      setData(d);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const notReady = (data?.nodes || []).filter((n) => !n.ready).length;
  const issues = data?.issues || [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Cluster Health</h2>
        <button
          onClick={load}
          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
          aria-label="Refresh health"
        >
          Refresh
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">{error}</div>}
      {loading && <div className="mb-4 text-gray-500 text-sm">Loading…</div>}
      {!data && !loading && <div className="text-gray-500 text-sm">Select a cluster to view health.</div>}

      {data && (
        <>
          {notReady > 0 && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
              {notReady} node{notReady > 1 ? 's' : ''} not ready
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {(data.nodes || []).map((n) => (
              <div key={n.name} className={`bg-gray-800 rounded-lg border p-4 ${n.ready ? 'border-gray-700' : 'border-red-700'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold truncate">{n.name}</span>
                  <span className={n.ready ? 'text-green-400 text-sm' : 'text-red-400 text-sm'}>
                    {n.ready ? 'Ready' : 'NotReady'}
                  </span>
                </div>
                <div className="text-xs text-gray-400">
                  <div>CPU: {n.cpu} · Memory: {n.memory}</div>
                  <div>Kubelet: {n.version}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">Pods by Phase</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.podSummary || {}).map(([phase, count]) => (
                <span key={phase} className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm">
                  {phase}: <span className="text-cyan-300">{count}</span>
                </span>
              ))}
            </div>
          </div>

          <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">
            Pod Issues ({issues.length})
          </h3>
          <div className="bg-black border border-gray-800 rounded-lg overflow-auto max-h-[calc(100vh-400px)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-900">
                <tr className="text-left text-gray-400 border-b border-gray-800">
                  <th className="px-4 py-2 font-medium">Namespace</th>
                  <th className="px-4 py-2 font-medium">Pod</th>
                  <th className="px-4 py-2 font-medium">Reason</th>
                  <th className="px-4 py-2 font-medium">Restarts</th>
                  <th className="px-4 py-2 font-medium">Age</th>
                </tr>
              </thead>
              <tbody>
                {issues.length === 0 && (
                  <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-600">No issues</td></tr>
                )}
                {issues.map((p) => (
                  <tr key={`${p.namespace}/${p.name}`} className="border-b border-gray-900 hover:bg-gray-900">
                    <td className="px-4 py-2 text-gray-400">{p.namespace}</td>
                    <td className="px-4 py-2 text-gray-200">{p.name}</td>
                    <td className={`px-4 py-2 ${REASON_COLORS[p.reason] || 'text-yellow-400'}`}>{p.reason}</td>
                    <td className="px-4 py-2 text-gray-300">{p.restarts}</td>
                    <td className="px-4 py-2 text-gray-400">{p.age}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

HealthPanel.propTypes = {
  context: PropTypes.string.isRequired
};
