import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { apiFetch } from '../../utils/api';
import { AutocompleteField } from '../common/AutocompleteField';

const REFRESH_MS = 30000;

/**
 * Cluster events view - newest first, optional namespace filter, auto-refresh
 */
export function EventsPanel({ context }) {
  const [events, setEvents] = useState([]);
  const [namespace, setNamespace] = useState('');
  const [namespaces, setNamespaces] = useState([]);
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
      const params = new URLSearchParams({ context });
      if (namespace) params.set('namespace', namespace);
      const data = await apiFetch(`/api/clusters/events?${params}`);
      setEvents(data || []);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [context, namespace]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const typeClass = (type) => (type === 'Warning' ? 'text-yellow-400' : 'text-green-400');

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Cluster Events</h2>
        <div className="flex items-center gap-3">
          <div className="w-56">
            <AutocompleteField
              label="Namespace"
              value={namespace}
              onChange={setNamespace}
              suggestions={namespaces}
              placeholder="all"
              idPrefix="events"
            />
          </div>
          <button
            onClick={load}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
            aria-label="Refresh events"
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
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Reason</th>
              <th className="px-4 py-2 font-medium">Object</th>
              <th className="px-4 py-2 font-medium">Message</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && !loading && (
              <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-600">No events</td></tr>
            )}
            {events.map((e, i) => (
              <tr key={`${e.time}-${i}`} className="border-b border-gray-900 align-top hover:bg-gray-900">
                <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{e.time}</td>
                <td className={`px-4 py-2 whitespace-nowrap ${typeClass(e.type)}`}>{e.type}</td>
                <td className="px-4 py-2 text-cyan-300 whitespace-nowrap">{e.reason}</td>
                <td className="px-4 py-2 text-gray-300 whitespace-nowrap">{e.object}</td>
                <td className="px-4 py-2 text-gray-400">{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

EventsPanel.propTypes = {
  context: PropTypes.string.isRequired
};
