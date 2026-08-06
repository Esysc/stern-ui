import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

/**
 * Main log display area with auto-scroll capability
 */
export function LogViewer({
  logs = [],
  podColorMap = {},
  autoScroll = true
}) {
  const logEndRef = useRef(null);
  const containerRef = useRef(null);

  const scrollToTop = () => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const getLevelColor = (level) => {
    const colors = {
      error: 'text-red-500',
      warn: 'text-yellow-500',
      info: 'text-blue-500',
      debug: 'text-gray-500'
    };
    return colors[level?.toLowerCase()] || 'text-gray-300';
  };

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      {/* Jump to Top/Bottom Buttons */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
        <button
          onClick={scrollToTop}
          className="px-3 py-2 bg-gray-900/90 border border-gray-700 rounded text-gray-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          title="Jump to top"
          aria-label="Jump to top of logs"
        >
          ⬆️
        </button>
        <button
          onClick={scrollToBottom}
          className="px-3 py-2 bg-gray-900/90 border border-gray-700 rounded text-gray-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          title="Jump to bottom"
          aria-label="Jump to bottom of logs"
        >
          ⬇️
        </button>
      </div>

      {/* Log Content */}
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto font-mono p-4 text-sm"
    >
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            <p>No logs to display yet.</p>
            <p className="text-sm text-gray-600 mt-1">Update filters if needed, then click Connect to start streaming.</p>
          </div>
        ) : (
          logs.map((log, idx) => (
            <div
              key={`${log.pod}-${idx}-${log.message || log.text}`}
              className="flex gap-2 hover:bg-gray-900/50 whitespace-nowrap"
            >
              <span
                className="font-semibold select-none shrink-0"
                style={{ color: podColorMap[log.pod] || '#888' }}
              >
                [{log.pod}]
              </span>
              {log.level && (
                <span className={`font-semibold shrink-0 ${getLevelColor(log.level)}`}>
                  {log.level.toUpperCase()}
                </span>
              )}
              <span className="flex-1 text-gray-300">
                {log.message || log.text || ''}
              </span>
            </div>
          ))
        )}
        <div ref={logEndRef} />
    </div>
    </div>
  );
}

LogViewer.propTypes = {
  logs: PropTypes.arrayOf(
    PropTypes.shape({
      pod: PropTypes.string,
      level: PropTypes.string,
      message: PropTypes.string,
      text: PropTypes.string
    })
  ),
  podColorMap: PropTypes.object,
  autoScroll: PropTypes.bool
};
