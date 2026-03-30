import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

/**
 * Main log display area with auto-scroll capability
 */
export function LogViewer({
  logs = [],
  podColorMap = {},
  autoScroll = true,
  fontSize = 14,
  isFullscreen = false,
  showLineNumbers = true,
  wrapText = false,
  onToggleFullscreen,
  onFontSizeChange,
  onToggleLineNumbers,
  onToggleWrap
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
      fontSize: PropTypes.number,
      isFullscreen: PropTypes.bool,
      showLineNumbers: PropTypes.bool,
      wrapText: PropTypes.bool,
      onToggleFullscreen: PropTypes.func,
      onFontSizeChange: PropTypes.func,
      onToggleLineNumbers: PropTypes.func,
      onToggleWrap: PropTypes.func
    };
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
      {/* Floating Controls */}
      <div className="absolute top-2 right-2 z-10 flex gap-2">
        {/* Font Size Controls */}
        <div className="flex gap-1 bg-gray-900/90 border border-gray-700 rounded px-2 py-1 backdrop-blur-sm">
          <button
            onClick={() => onFontSizeChange?.(Math.max(10, fontSize - 2))}
            className="text-gray-400 hover:text-white px-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Decrease font size"
            aria-label="Decrease log font size"
          >
            A-
          </button>
          <span className="text-gray-500 px-1">{fontSize}px</span>
          <button
            onClick={() => onFontSizeChange?.(Math.min(24, fontSize + 2))}
            className="text-gray-400 hover:text-white px-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Increase font size"
            aria-label="Increase log font size"
          >
            A+
          </button>
        </div>

        {/* Line Numbers Toggle */}
        <button
          onClick={onToggleLineNumbers}
          className={`px-3 py-1 rounded border transition-colors ${
            showLineNumbers
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-gray-900/90 border-gray-700 text-gray-400 hover:text-white'
          } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
          title={showLineNumbers ? 'Hide line numbers' : 'Show line numbers'}
          aria-label={showLineNumbers ? 'Hide line numbers' : 'Show line numbers'}
        >
          #
        </button>

        {/* Text Wrap Toggle */}
        <button
          onClick={onToggleWrap}
          className={`px-3 py-1 rounded border transition-colors ${
            wrapText
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-gray-900/90 border-gray-700 text-gray-400 hover:text-white'
          } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
          title={wrapText ? 'Disable text wrap' : 'Enable text wrap'}
          aria-label={wrapText ? 'Disable text wrap' : 'Enable text wrap'}
        >
          ↩️
        </button>

        {/* Fullscreen Toggle */}
        <button
          onClick={onToggleFullscreen}
          className="px-3 py-1 bg-gray-900/90 border border-gray-700 rounded text-gray-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen'}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? '🗗' : '🗖'}
        </button>
      </div>

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
      className="flex-1 overflow-y-auto font-mono p-4"
      style={{ fontSize: `${fontSize}px` }}
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
              className={`flex gap-2 hover:bg-gray-900/50 ${wrapText ? '' : 'whitespace-nowrap'}`}
            >
              {showLineNumbers && (
                <span className="text-gray-600 select-none shrink-0 text-right" style={{ minWidth: '3em' }}>
                  {idx + 1}
                </span>
              )}
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
              <span className={`flex-1 text-gray-300 ${wrapText ? 'break-words' : ''}`}>
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
