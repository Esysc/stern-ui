import PropTypes from 'prop-types';

/**
 * Tab bar for managing multiple streams
 */
export function StreamTabs({
  streams,
  activeStreamId,
  onSelectStream,
  onAddStream,
  onRemoveStream,
  onDetachStream
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap" role="tablist" aria-label="Stream tabs">
      <div className="flex gap-1 flex-wrap">
        {streams.map(stream => (
          <StreamTab
            key={stream.id}
            stream={stream}
            isActive={activeStreamId === stream.id}
            canRemove={streams.length > 1}
            onSelect={() => onSelectStream(stream.id)}
            onRemove={() => onRemoveStream(stream.id)}
            onDetach={() => onDetachStream(stream.id)}
          />
        ))}
      </div>
      <button
        onClick={onAddStream}
        className="ml-2 px-3 py-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        + Add Stream
      </button>
    </div>
  );
}

StreamTabs.propTypes = {
  streams: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired
  })).isRequired,
  activeStreamId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  onSelectStream: PropTypes.func.isRequired,
  onAddStream: PropTypes.func.isRequired,
  onRemoveStream: PropTypes.func.isRequired,
  onDetachStream: PropTypes.func.isRequired
};

function StreamTab({ stream, isActive, canRemove, onSelect, onRemove, onDetach }) {
  const handleRemove = (e) => {
    e.stopPropagation();
    onRemove();
  };

  const handleDetach = (e) => {
    e.stopPropagation();
    onDetach();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      role="tab"
      tabIndex={isActive ? 0 : -1}
      aria-selected={isActive}
      aria-label={`Switch to ${stream.name}`}
      className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        isActive
          ? 'border-green-500 bg-gray-800 text-white'
          : 'border-transparent text-gray-400 hover:text-white hover:bg-gray-800/50'
      }`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
    >
      <span>{stream.name}</span>
      <button
        type="button"
        onClick={handleDetach}
        className="text-gray-500 hover:text-blue-400 text-xs"
        title="Detach to new window"
        aria-label={`Detach ${stream.name} to a new window`}
      >
        ⧉
      </button>
      {canRemove && (
        <button
          type="button"
          onClick={handleRemove}
          className="text-gray-500 hover:text-red-400 text-xs"
          aria-label={`Close ${stream.name}`}
          title={`Close ${stream.name}`}
        >
          ✕
        </button>
      )}
    </div>
  );
}

StreamTab.propTypes = {
  stream: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired
  }).isRequired,
  isActive: PropTypes.bool.isRequired,
  canRemove: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  onDetach: PropTypes.func.isRequired
};
