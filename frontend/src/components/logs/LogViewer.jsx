import { useEffect, useRef, useState, useMemo } from 'react';
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
  // Measured row heights keyed by log id, so wrapped rows contribute their
  // real height to the virtualized geometry. Stored in state so render-phase
  // computations (prefix sums) can read them without touching a ref.
  const [rowHeights, setRowHeights] = useState(() => new Map());

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
    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update);
      observer.observe(el);
    }

    return () => {
      el.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [autoScroll]);

  // Reset measurements when the underlying log set changes (e.g. filter
  // changes or a fresh stream) so stale heights never apply to new content.
  // Adjusting state during render is the React-sanctioned pattern for
  // deriving state from a prop change.
  const [prevFirstId, setPrevFirstId] = useState(null);
  const firstId = logs[0]?.id;
  if (firstId !== prevFirstId) {
    setPrevFirstId(firstId);
    setRowHeights(new Map());
  }

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

  // Re-pin to the tail after measurements change the total height while the
  // user is still following the stream.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !followedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [rowHeights]);

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

  // Record a rendered row's real height so wrapped lines contribute their
  // actual size to the virtualized geometry.
  const measureRow = (el, id) => {
    if (!el) return;
    const h = el.offsetHeight;
    setRowHeights((prev) => {
      if (prev.get(id) === h) return prev;
      const next = new Map(prev);
      next.set(id, h);
      return next;
    });
  };

  // Prefix sums over measured heights (fallback to ROW_HEIGHT for rows not
  // yet rendered/measured) so wrapped rows contribute their real height.
  const prefix = useMemo(() => {
    const arr = new Float64Array(logs.length + 1);
    for (let i = 0; i < logs.length; i++) {
      arr[i + 1] = arr[i] + (rowHeights.get(logs[i].id) ?? ROW_HEIGHT);
    }
    return arr;
  }, [logs, rowHeights]);

  const totalHeight = prefix[logs.length];

  // Locate the visible slice: binary search for the first row at/after the
  // scroll offset, then walk forward until the viewport + overscan budget.
  const visSlice = useMemo(() => {
    if (logs.length === 0) {
      return { start: 0, end: 0, padTop: 0, padBottom: 0 };
    }
    let lo = 0;
    let hi = logs.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (prefix[mid] <= viewport.scrollTop) lo = mid;
      else hi = mid - 1;
    }
    const start = Math.max(0, lo - OVERSCAN);
    const budget = viewport.height + OVERSCAN * ROW_HEIGHT;
    // Advance while the next row's top edge is within the budget. Requiring
    // the whole row to fit (prefix[end + 1] - prefix[start]) would drop any
    // row taller than the budget — e.g. one very long wrapped line — and
    // render zero rows, blanking the log window.
    let end = start;
    while (end < logs.length && prefix[end] - prefix[start] < budget) end++;
    return {
      start,
      end,
      padTop: prefix[start],
      padBottom: totalHeight - prefix[end]
    };
  }, [prefix, totalHeight, viewport.scrollTop, viewport.height, logs.length]);

  const visibleLogs = logs.slice(visSlice.start, visSlice.end);

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
      className="flex-1 overflow-y-auto overflow-x-hidden font-mono p-4 text-sm"
    >
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            <p>No logs to display yet.</p>
            <p className="text-sm text-gray-600 mt-1">Update filters if needed, then click Connect to start streaming.</p>
          </div>
        ) : (
          <>
            <div style={{ height: visSlice.padTop }} aria-hidden="true" />
            {visibleLogs.map((log, idx) => {
              const absoluteIdx = visSlice.start + idx;
              return (
                <div
                  key={log.id ?? `${log.pod}-${absoluteIdx}-${log.message || log.text}`}
                  ref={(el) => measureRow(el, log.id ?? absoluteIdx)}
                  className="flex gap-2 hover:bg-gray-900/50 whitespace-pre-wrap break-words"
                  style={{ minHeight: ROW_HEIGHT, lineHeight: '20px' }}
                >
                  <span
                    className="font-semibold shrink-0"
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
            <div style={{ height: visSlice.padBottom }} aria-hidden="true" />
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
