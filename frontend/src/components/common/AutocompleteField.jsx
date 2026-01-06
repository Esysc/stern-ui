import { useState, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';

/**
 * Input field with autocomplete suggestions
 */
export function AutocompleteField({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  suggestions = [],
  disabled,
  multiple = false // Support comma-separated multiple values
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef(null);
  const id = label.toLowerCase().replaceAll(/\s+/g, '-');

  const filteredSuggestions = useMemo(() => {
    if (!suggestions || suggestions.length === 0) return [];

    // For multi-select, get the word after the last comma
    const currentWord = multiple
      ? value.substring(value.lastIndexOf(',') + 1).trim()
      : value;

    // Filter out already selected items in multi-select mode
    const existingItems = multiple ? value.split(',').map(v => v.trim()).filter(Boolean) : [];

    if (currentWord && currentWord.trim()) {
      return suggestions
        .filter(s => !existingItems.includes(s) && s.toLowerCase().includes(currentWord.toLowerCase()))
        .slice(0, 20);
    }
    // Show all suggestions when no filter (excluding already selected)
    return suggestions.filter(s => !existingItems.includes(s)).slice(0, 20);
  }, [value, suggestions, multiple]);

  const handleSelect = (suggestion) => {
    if (multiple) {
      // Find the last comma and replace everything after it
      const lastComma = value.lastIndexOf(',');
      const before = lastComma >= 0 ? value.substring(0, lastComma + 1) : '';
      const newValue = before + (before ? ' ' : '') + suggestion + ', ';
      onChange(newValue);
    } else {
      onChange(suggestion);
    }
    setShowSuggestions(false);
    // Keep focus for adding more items
    if (multiple) {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
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
          className={`w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-green-500 text-white placeholder-gray-500 ${disabled ? 'opacity-50' : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={(e) => {
            setTimeout(() => setShowSuggestions(false), 150);
            if (onBlur) onBlur(e);
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
        />
        {suggestions.length > 0 && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
            onClick={() => {
              inputRef.current?.focus();
              setShowSuggestions(!showSuggestions);
            }}
            tabIndex={-1}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-gray-700 border border-gray-600 rounded shadow-lg max-h-48 overflow-y-auto">
          {filteredSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-gray-600 cursor-pointer text-sm"
              onMouseDown={() => handleSelect(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

AutocompleteField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onBlur: PropTypes.func,
  placeholder: PropTypes.string,
  suggestions: PropTypes.arrayOf(PropTypes.string),
  disabled: PropTypes.bool,
  multiple: PropTypes.bool
};
