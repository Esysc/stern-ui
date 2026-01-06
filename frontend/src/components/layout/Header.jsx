import PropTypes from 'prop-types';

/**
 * Application header with title and global settings
 */
export function Header({ persistSettings, onPersistSettingsChange }) {
  return (
    <div className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
      <h1 className="text-xl font-bold bg-gradient-to-r from-green-400 to-cyan-400 bg-clip-text text-transparent">
        Stern Web UI
      </h1>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-400">
          <input
            type="checkbox"
            checked={persistSettings}
            onChange={(e) => onPersistSettingsChange(e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-green-500"
          />{' '}
          Persist settings
        </label>
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
  persistSettings: PropTypes.bool.isRequired,
  onPersistSettingsChange: PropTypes.func.isRequired,
};
