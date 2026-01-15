/**
 * Select dropdown field component with filtering
 */
import PropTypes from 'prop-types';
import { memo, useState, useMemo, useRef } from 'react';

function SelectFieldComponent({ label, value, onChange, onBlur, options, idPrefix }) {
  const [showOptions, setShowOptions] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const inputRef = useRef(null);
  const id = idPrefix ? `${idPrefix}-${label.toLowerCase().replaceAll(/\s+/g, '-')}` : label.toLowerCase().replaceAll(/\s+/g, '-');

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    const term = searchTerm.toLowerCase();
    return options.filter(opt => opt.label.toLowerCase().includes(term));
  }, [options, searchTerm]);

  const selectedLabel = useMemo(() => {
    const selected = options.find(opt => opt.value === value);
    return selected ? selected.label : '';
  }, [options, value]);

  const handleSelect = (option) => {
    onChange({ target: { value: option.value } });
    setShowOptions(false);
    setSearchTerm('');
  };

  const handleInputChange = (e) => {
    const newSearchTerm = e.target.value;
    setSearchTerm(newSearchTerm);
    if (!showOptions) {
      setShowOptions(true);
    }
  };

  const handleFocus = () => {
    setShowOptions(true);
    setSearchTerm('');
  };

  const handleBlur = (e) => {
    setTimeout(() => {
      setShowOptions(false);
      setSearchTerm('');
    }, 150);
    if (onBlur) onBlur(e);
  };

  return (
    <div className="relative">
      <label
        htmlFor={id}
        className="block text-sm font-medium mb-2 text-gray-300"
      >
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-green-500 text-white placeholder-gray-500"
          value={showOptions ? searchTerm : selectedLabel}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Type to filter..."
          autoComplete="off"
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
          onMouseDown={(e) => {
            e.preventDefault();
            if (showOptions) {
              setShowOptions(false);
              setSearchTerm('');
            } else {
              setShowOptions(true);
            }
            setTimeout(() => inputRef.current?.focus(), 10);
          }}
          tabIndex={-1}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      {showOptions && filteredOptions.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-gray-700 border border-gray-600 rounded shadow-lg max-h-48 overflow-y-auto">
          {filteredOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`w-full text-left px-3 py-2 hover:bg-gray-600 ${value === option.value ? 'bg-green-600 text-white' : 'text-gray-200'}`}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(option);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      {showOptions && filteredOptions.length === 0 && searchTerm && (
        <div className="absolute z-20 w-full mt-1 bg-gray-700 border border-gray-600 rounded shadow-lg px-3 py-2 text-gray-400">
          No options match "{searchTerm}"
        </div>
      )}
    </div>
  );
}

SelectFieldComponent.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  onChange: PropTypes.func.isRequired,
  onBlur: PropTypes.func,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      label: PropTypes.string.isRequired,
    })
  ).isRequired,
  idPrefix: PropTypes.string,
};

export const SelectField = memo(SelectFieldComponent);
