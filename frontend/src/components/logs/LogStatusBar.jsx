import PropTypes from 'prop-types';

/**
 * Status bar showing connection status and log statistics
 */
export function LogStatusBar({
  isConnected,
  isPaused,
  filteredCount,
  totalCount,
  podCount,
  levelCounts = {}
}) {
  return (
    <div className="px-4 py-2 bg-gray-900 border-b border-gray-800 flex items-center justify-between text-xs">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-gray-400">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {isPaused && (
          <span className="text-yellow-500">⏸ Paused</span>
        )}
      </div>

      <div className="flex items-center gap-4 text-gray-400">
        <span>{filteredCount.toLocaleString()} / {totalCount.toLocaleString()} logs</span>
        <span>{podCount} pods</span>
        {levelCounts.error > 0 && (
          <span className="text-red-500">{levelCounts.error} errors</span>
        )}
        {levelCounts.warn > 0 && (
          <span className="text-yellow-500">{levelCounts.warn} warnings</span>
        )}
      </div>
    </div>
  );
}

LogStatusBar.propTypes = {
  isConnected: PropTypes.bool.isRequired,
  isPaused: PropTypes.bool.isRequired,
  filteredCount: PropTypes.number.isRequired,
  totalCount: PropTypes.number.isRequired,
  podCount: PropTypes.number.isRequired,
  levelCounts: PropTypes.shape({
    error: PropTypes.number,
    warn: PropTypes.number
  })
};
