/**
 * Action buttons for controlling a stream
 */
import { memo } from 'react';
import PropTypes from 'prop-types';

const StreamActionsComponent = ({
  isConnected,
  isConnecting,
  isPaused,
  onConnect,
  onDisconnect,
  onTogglePause,
  onClear
}) => {
  return (
    <div className="flex gap-2">
      {isConnected ? (
        <>
          <button
            onClick={onDisconnect}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-medium transition-colors"
            disabled={isConnecting}
          >
            Disconnect
          </button>
          <button
            onClick={onTogglePause}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              isPaused ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-600 hover:bg-gray-500'
            }`}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
        </>
      ) : (
        <button
          onClick={onConnect}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded font-medium transition-colors"
          disabled={isConnecting}
          aria-busy={isConnecting}
        >
          {isConnecting ? 'Connecting...' : 'Connect'}
        </button>
      )}
      <button
        onClick={onClear}
        className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded transition-colors"
      >
        Clear
      </button>
    </div>
  );
};

StreamActionsComponent.propTypes = {
  isConnected: PropTypes.bool.isRequired,
  isConnecting: PropTypes.bool,
  isPaused: PropTypes.bool.isRequired,
  onConnect: PropTypes.func.isRequired,
  onDisconnect: PropTypes.func.isRequired,
  onTogglePause: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired
};

export const StreamActions = memo(StreamActionsComponent);
