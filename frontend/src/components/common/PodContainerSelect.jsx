/**
 * Pod/container selector. Multi-select:
 * click a pod to expand its containers, toggle a container's checkbox to
 * include/exclude it. Multiple containers, across the same or different
 * pods, can be selected at once.
 *
 * Props:
 *   options   - [{ pod, containers: ['c1', ...] }]
 *   selected  - ['pod/container', ...] (or ['pod'] for a legacy whole-pod value)
 *   onChange  - (nextSelected: string[]) => void
 */
import PropTypes from 'prop-types';
import { memo, useState, useMemo, useRef } from 'react';

function PodContainerSelectComponent({ options = [], selected = [], onChange, idPrefix }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [expandedPods, setExpandedPods] = useState(() => new Set());
  const containerRef = useRef(null);

  const filteredPods = useMemo(() => {
    const term = filter.toLowerCase();
    return options.filter((o) => o.pod.toLowerCase().includes(term));
  }, [options, filter]);

  const togglePodExpand = (pod) => {
    setExpandedPods((prev) => {
      const next = new Set(prev);
      if (next.has(pod)) next.delete(pod);
      else next.add(pod);
      return next;
    });
  };

  const toggleValue = (value) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const clearAll = (e) => {
    e.stopPropagation();
    onChange([]);
    setOpen(false);
    setExpandedPods(new Set());
  };

  const id = idPrefix ? `${idPrefix}-pod-container` : 'pod-container';

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-sm font-medium mb-2 text-gray-300">
        Pod / Container
      </label>
      <div
        id={id}
        ref={containerRef}
        className="flex items-center gap-2 flex-wrap bg-gray-700 border border-gray-600 rounded px-3 py-2 cursor-pointer hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 min-h-[2.5rem]"
        onClick={() => { setOpen(!open); setFilter(''); }}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={0}
      >
        {selected.length > 0 ? (
          selected.map((value) => {
            const [pod, container] = value.split('/');
            return (
              <span key={value} className="inline-flex items-center gap-1 bg-gray-600 rounded px-2 py-0.5 text-xs text-white">
                <span className="font-semibold">{pod}</span>
                {container && <><span className="text-gray-400">/</span><span>{container}</span></>}
                <button
                  type="button"
                  className="text-gray-400 hover:text-white"
                  onClick={(e) => { e.stopPropagation(); toggleValue(value); }}
                  aria-label={`Remove ${value}`}
                >
                  ×
                </button>
              </span>
            );
          })
        ) : (
          <span className="text-gray-500 text-sm">Select pods/containers</span>
        )}
        <svg className="w-4 h-4 ml-auto text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
        </svg>
      </div>

      {open && (
        <div className="absolute z-30 w-72 mt-1 bg-gray-700 border border-gray-600 rounded shadow-lg max-h-72 overflow-y-auto">
          <div className="sticky top-0 bg-gray-700 px-3 py-1.5 border-b border-gray-600 flex items-center gap-2">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
              placeholder="Filter pods..."
              autoFocus
            />
            {selected.length > 0 && (
              <button
                type="button"
                className="text-xs text-gray-400 hover:text-white"
                onClick={clearAll}
              >
                Clear
              </button>
            )}
          </div>
          {filteredPods.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-400">No pods</div>
          )}
          {filteredPods.map(({ pod, containers }) => {
            const isExpanded = expandedPods.has(pod);
            const podContainerValues = containers.map((c) => `${pod}/${c}`);
            const selectedCount = podContainerValues.filter((v) => selected.includes(v)).length;
            return (
              <div key={pod} className="border-b border-gray-600/50">
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-600 ${selectedCount > 0 ? 'bg-green-900/30' : ''}`}
                  onClick={() => togglePodExpand(pod)}
                  role="option"
                  aria-selected={selectedCount > 0}
                >
                  <span className="text-sm font-semibold text-white truncate flex-1">{pod}</span>
                  <span className="text-xs text-gray-500 shrink-0">
                    {selectedCount > 0 ? `${selectedCount}/${containers.length} selected` : `${containers.length} ctr`}
                  </span>
                </div>
                {isExpanded && (
                  <div className="bg-gray-800/50">
                    {containers.length === 0 && (
                      <div className="px-3 py-1 text-sm text-gray-500">No containers</div>
                    )}
                    {containers.map((c) => {
                      const value = `${pod}/${c}`;
                      const isContainerSelected = selected.includes(value);
                      return (
                        <div
                          key={c}
                          className={`flex items-center gap-2 px-6 py-1 cursor-pointer hover:bg-gray-600 ${isContainerSelected ? 'bg-green-900/30' : ''}`}
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); toggleValue(value); }}
                        >
                          <input
                            type="checkbox"
                            checked={isContainerSelected}
                            onChange={() => {}}
                            className="shrink-0"
                            aria-label={`Select ${value}`}
                          />
                          <span className="text-sm text-gray-300">{c}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

PodContainerSelectComponent.propTypes = {
  options: PropTypes.arrayOf(
    PropTypes.shape({
      pod: PropTypes.string.isRequired,
      containers: PropTypes.arrayOf(PropTypes.string).isRequired,
    })
  ),
  selected: PropTypes.arrayOf(PropTypes.string),
  onChange: PropTypes.func.isRequired,
  idPrefix: PropTypes.string,
};

export const PodContainerSelect = memo(PodContainerSelectComponent);
