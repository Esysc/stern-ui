import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

/**
 * Main log display area with auto-scroll capability
 */
export function LogViewer({
  logs = [],
  podColorMap = {},
  autoScroll = true,
  onAutoScrollChange
}) {
  const logEndRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
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
      autoScroll: PropTypes.bool,
      onAutoScrollChange: PropTypes.func
    };
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    if (isAtBottom && !autoScroll) {
      onAutoScrollChange?.(true);
    } else if (!isAtBottom && autoScroll) {
      onAutoScrollChange?.(false);
    }
  };

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
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto font-mono text-sm p-4"
      onScroll={handleScroll}
    >
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            No logs to display. Check your configuration and start streaming.
          </div>
        ) : (
          logs.map((log, idx) => (
            <div key={`${log.pod}-${idx}-${log.message || log.text}`} className="flex gap-2 hover:bg-gray-900/50">
              <span className="text-gray-600 select-none">{idx + 1}</span>
              <span
                className="font-semibold select-none"
                style={{ color: podColorMap[log.pod] || '#888' }}
              >
                [{log.pod}]
              </span>
              {log.level && (
                <span className={`font-semibold ${getLevelColor(log.level)}`}>
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
  );
}
