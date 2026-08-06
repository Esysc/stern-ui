import PropTypes from 'prop-types';

const VIEWS = [
  { id: 'logs', label: 'Logs' },
  { id: 'events', label: 'Events' },
  { id: 'health', label: 'Health' },
  { id: 'resources', label: 'Resources' },
  { id: 'apply', label: 'Apply' }
];

/**
 * Application header with title, cluster selector, and view tabs
 */
export function Header({
  onClearSettings,
  contexts = [],
  context = '',
  onContextChange = () => {},
  view = 'logs',
  onViewChange = () => {},
  onAddStream = () => {},
  streamCount = 0
}) {
  return (
    <div className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between gap-6 flex-wrap">
      <div className="flex items-center gap-6">
        <h1 className="text-xl font-bold bg-gradient-to-r from-green-400 to-cyan-400 bg-clip-text text-transparent whitespace-nowrap">
          Stern Web UI
        </h1>
        <nav className="flex items-center gap-1">
          {VIEWS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => onViewChange(id)}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                view === id
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
              }`}
              aria-label={`View ${label}`}
              aria-current={view === id ? 'page' : undefined}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-4">
        {view === 'logs' && (
          <button
            onClick={onAddStream}
            className="px-4 py-1 bg-green-700 hover:bg-green-600 text-white rounded text-sm transition-colors"
            aria-label="Add stream"
          >
            + Add Stream{streamCount > 0 ? ` (${streamCount})` : ''}
          </button>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-400">
          Cluster
          <select
            value={context}
            onChange={(e) => onContextChange(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Cluster"
          >
            {contexts.length === 0 && <option value="">No contexts</option>}
            {contexts.map((ctx) => (
              <option key={ctx} value={ctx}>{ctx}</option>
            ))}
          </select>
        </label>
        <button
          onClick={onClearSettings}
          className="px-4 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
        >
          Clear All Settings
        </button>
        <a
          href="https://github.com/stern/stern"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 hover:text-gray-300 text-sm"
        >
          Powered by stern
        </a>
      </div>
    </div>
  );
}

Header.propTypes = {
  onClearSettings: PropTypes.func,
  contexts: PropTypes.arrayOf(PropTypes.string),
  context: PropTypes.string,
  onContextChange: PropTypes.func,
  view: PropTypes.string,
  onViewChange: PropTypes.func,
  onAddStream: PropTypes.func,
  streamCount: PropTypes.number
};
