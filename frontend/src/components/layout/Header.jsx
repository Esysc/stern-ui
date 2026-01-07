import PropTypes from 'prop-types';

/**
 * Application header with title
 */
export function Header({ isDetached, onClearSettings }) {
  return (
    <div className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
      <h1 className="text-xl font-bold bg-gradient-to-r from-green-400 to-cyan-400 bg-clip-text text-transparent">
        Stern Web UI {isDetached && <span className="text-sm text-gray-400">(Detached)</span>}
      </h1>
      <div className="flex items-center gap-4">
        {!isDetached && (
          <button
            onClick={onClearSettings}
            className="px-4 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
          >
            Clear All Settings
          </button>
        )}
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
  isDetached: PropTypes.bool,
  onClearSettings: PropTypes.func
};
