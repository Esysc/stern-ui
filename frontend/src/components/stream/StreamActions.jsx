/**
 * Action buttons for controlling a stream
 */
import { memo } from 'react';
import PropTypes from 'prop-types';

const StreamActionsComponent = ({
  isConnected,
  isPaused,
  autoScroll,
  bufferCount,
  onConnect,
  onDisconnect,
  onTogglePause,
  onClear,
  onAutoScrollToggle,
  onDownloadText,
  onDownloadJson
}) => {
  return (
    <div className="flex gap-3 flex-wrap">
      {isConnected ? (
        <>
          <button
            onClick={onDisconnect}
            className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded font-medium transition-colors"
          >
            ⏹ Disconnect
          </button>
          <button
            onClick={onTogglePause}
            className={`px-6 py-2 rounded font-medium transition-colors ${
              isPaused ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-600 hover:bg-gray-500'
            }`}
          >
            {isPaused ? `▶ Resume (${bufferCount} buffered)` : '⏸ Pause'}
          </button>
        </>
      ) : (
        <button
          onClick={onConnect}
          className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded font-medium transition-colors"
        >
          ▶ Connect
        </button>
      )}
      <button
        onClick={onClear}
        className="bg-gray-600 hover:bg-gray-500 px-6 py-2 rounded transition-colors"
      >
        Clear
      </button>
      <button
        onClick={onAutoScrollToggle}
        className={`px-4 py-2 rounded transition-colors ${
          autoScroll ? 'bg-blue-600' : 'bg-gray-600 hover:bg-gray-500'
        }`}
      >
        Auto-scroll {autoScroll ? '✓' : ''}
      </button>
      <DownloadDropdown
        onDownloadText={onDownloadText}
        onDownloadJson={onDownloadJson}
      />
    </div>
  );
}

function DownloadDropdown({ onDownloadText, onDownloadJson }) {
  return (
    <div className="relative group">
      <button className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded transition-colors">
        ⬇ Download
      </button>
      <div className="absolute top-full left-0 mt-1 bg-gray-700 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
        <button
          onClick={onDownloadText}
          className="block w-full text-left px-4 py-2 hover:bg-gray-600 rounded-t"
        >
          As Text
        </button>
        <button
          onClick={onDownloadJson}
          className="block w-full text-left px-4 py-2 hover:bg-gray-600 rounded-b"
        >
          As JSON
        </button>
      </div>
    </div>
  );
};

StreamActionsComponent.propTypes = {
  isConnected: PropTypes.bool.isRequired,
  isPaused: PropTypes.bool.isRequired,
  autoScroll: PropTypes.bool.isRequired,
  bufferCount: PropTypes.number.isRequired,
  onConnect: PropTypes.func.isRequired,
  onDisconnect: PropTypes.func.isRequired,
  onTogglePause: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
  onAutoScrollToggle: PropTypes.func.isRequired,
  onDownloadText: PropTypes.func.isRequired,
  onDownloadJson: PropTypes.func.isRequired
};

export const StreamActions = memo(StreamActionsComponent);

DownloadDropdown.propTypes = {
  onDownloadText: PropTypes.func.isRequired,
  onDownloadJson: PropTypes.func.isRequired
};
