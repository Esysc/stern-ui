/**
 * Action buttons for controlling a stream
 */
import { memo, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

const StreamActionsComponent = ({
  isConnected,
  isConnecting,
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
            disabled={isConnecting}
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
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-2 rounded font-medium transition-colors"
          disabled={isConnecting}
          aria-busy={isConnecting}
        >
          {isConnecting ? '⏳ Connecting...' : '▶ Connect'}
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
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleDownloadText = () => {
    onDownloadText();
    setIsOpen(false);
  };

  const handleDownloadJson = () => {
    onDownloadJson();
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Download logs"
      >
        ⬇ Download
      </button>
      <div
        className={`absolute top-full left-0 mt-1 bg-gray-700 rounded shadow-lg transition-all z-10 min-w-[9rem] ${
          isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
        }`}
        role="menu"
        aria-label="Download options"
      >
        <button
          onClick={handleDownloadText}
          className="block w-full text-left px-4 py-2 hover:bg-gray-600 rounded-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          role="menuitem"
        >
          As Text
        </button>
        <button
          onClick={handleDownloadJson}
          className="block w-full text-left px-4 py-2 hover:bg-gray-600 rounded-b focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          role="menuitem"
        >
          As JSON
        </button>
      </div>
    </div>
  );
}

StreamActionsComponent.propTypes = {
  isConnected: PropTypes.bool.isRequired,
  isConnecting: PropTypes.bool,
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
