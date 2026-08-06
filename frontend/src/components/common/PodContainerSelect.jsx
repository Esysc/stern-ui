/**
 * Pod/container selector. Single-select:
 * click a pod to expand its containers, click a container to select it.
 *
 * Props:
 *   options   - [{ pod, containers: ['c1', ...] }]
 *   selected  - ['pod/container'] (or [] / ['pod'])
 *   onChange  - (nextSelected: string[]) => void
 */
import PropTypes from 'prop-types';
import { memo, useState, useMemo, useRef } from 'react';

function PodContainerSelectComponent({ options = [], selected = [], onChange, idPrefix }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [expandedPod, setExpandedPod] = useState(null);
  const containerRef = useRef(null);

  const selectedValue = selected[0] || '';
  const [selectedPod, selectedContainer] = selectedValue.split('/');
  const selectedPodFull = selectedPod && !selectedContainer ? selectedPod : selectedValue;

  const filteredPods = useMemo(() => {
    const term = filter.toLowerCase();
    return options.filter((o) => o.pod.toLowerCase().includes(term));
  }, [options, filter]);

  const togglePod = (pod) => {
    setExpandedPod(expandedPod === pod ? null : pod);
    setFilter('');
  };

  const selectContainer = (pod, container) => {
    onChange([`${pod}/${container}`]);
    setOpen(false);
    setExpandedPod(null);
  };

  const clear = (e) => {
    e.stopPropagation();
    onChange([]);
    setOpen(false);
    setExpandedPod(null);
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
        className="flex items-center gap-2 bg-gray-700 border border-gray-600 rounded px-3 py-2 cursor-pointer hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
        onClick={() => { setOpen(!open); setFilter(''); }}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={0}
      >
        {selectedValue ? (
          <span className="inline-flex items-center gap-1 bg-gray-600 rounded px-2 py-0.5 text-xs text-white">
            <span className="font-semibold">{selectedPod}</span>
            {selectedContainer && <><span className="text-gray-400">/</span><span>{selectedContainer}</span></>}
            <button
              type="button"
              className="text-gray-400 hover:text-white"
              onClick={clear}
              aria-label={`Remove ${selectedValue}`}
            >
              ×
            </button>
          </span>
        ) : (
          <span className="text-gray-500 text-sm">Select a pod</span>
        )}
        <svg className="w-4 h-4 ml-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            {selectedValue && (
              <button
                type="button"
                className="text-xs text-gray-400 hover:text-white"
                onClick={clear}
              >
                Clear
              </button>
            )}
          </div>
          {filteredPods.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-400">No pods</div>
          )}
          {filteredPods.map(({ pod, containers }) => {
            const isExpanded = expandedPod === pod;
            const isSelected = selectedPodFull === pod;
            return (
              <div key={pod} className="border-b border-gray-600/50">
                <div
                  className={`flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-gray-600 ${isSelected ? 'bg-green-900/30' : ''}`}
                  onClick={() => togglePod(pod)}
                  role="option"
                  aria-selected={isSelected}
                >
                  <span className="text-sm font-semibold text-white truncate">{pod}</span>
                  {isSelected ? (
                    <svg className="w-3 h-3 text-green-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <span className="text-xs text-gray-500 shrink-0">{containers.length} ctr</span>
                  )}
                </div>
                {isExpanded && (
                  <div className="bg-gray-800/50">
                    {containers.length === 0 && (
                      <div className="px-3 py-1 text-sm text-gray-500">No containers</div>
                    )}
                    {containers.map((c) => {
                      const value = `${pod}/${c}`;
                      const isContainerSelected = selectedValue === value;
                      return (
                        <div
                          key={c}
                          className={`flex items-center justify-between px-6 py-1 cursor-pointer hover:bg-gray-600 ${isContainerSelected ? 'bg-green-900/30' : ''}`}
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); selectContainer(pod, c); }}
                        >
                          <span className="text-sm text-gray-300">{c}</span>
                          {isContainerSelected && (
                            <svg className="w-3 h-3 text-green-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
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
