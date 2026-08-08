import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

const ROW_HEIGHT = 20;
const OVERSCAN = 12;
const FOLLOW_THRESHOLD = 40;

/**
 * Main log display area with virtualized rendering and auto-scroll capability.
 * Only renders the rows visible in the viewport plus an overscan buffer,
 * so DOM work stays constant regardless of how many logs are buffered.
 */
export function LogViewer({
  logs = [],
  podColorMap = {},
  autoScroll = true
}) {
  const containerRef = useRef(null);
  const followedRef = useRef(true);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });

  // Track scroll position and viewport size. Mark whether user is pinned to
  // the bottom so incoming logs only scroll if they're still at the tail.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const update = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD;
      followedRef.current = autoScroll && atBottom;
      setViewport({ scrollTop: el.scrollTop, height: el.clientHeight });
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [autoScroll]);

  // Jump to the tail whenever new logs arrive while pinned to the bottom.
  const prevLengthRef = useRef(0);
  useEffect(() => {
    const el = containerRef.current;
    const prevLength = prevLengthRef.current;
    prevLengthRef.current = logs.length;
    if (prevLength >= logs.length) return;
    if (!el || logs.length === 0 || !followedRef.current) return;
    el.scrollTop = el.scrollHeight;
    followedRef.current = true;
  }, [logs]);

  const scrollToTop = () => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    const el = containerRef.current;
    if (!el) return;
    followedRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
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

  // Compute the visible slice from the current scroll position.
  const totalHeight = logs.length * ROW_HEIGHT;
  const firstVisible = Math.floor(viewport.scrollTop / ROW_HEIGHT);
  const visibleCount = Math.ceil(viewport.height / ROW_HEIGHT) + OVERSCAN * 2;
  const start = Math.max(0, firstVisible - OVERSCAN);
  const end = Math.min(logs.length, start + visibleCount);
  const visibleLogs = logs.slice(start, end);

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
          <>
            <div style={{ height: totalHeight, position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${start * ROW_HEIGHT}px)`
                }}
              >
                {visibleLogs.map((log, idx) => {
                  const absoluteIdx = start + idx;
                  return (
                    <div
                      key={log.id ?? `${log.pod}-${absoluteIdx}-${log.message || log.text}`}
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
                  );
                })}
              </div>
            </div>
          </>
        )}
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
