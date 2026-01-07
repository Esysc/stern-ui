/**
 * Select dropdown field component
 */
import PropTypes from 'prop-types';
import { memo } from 'react';

function SelectFieldComponent({ label, value, onChange, onBlur, options, idPrefix }) {
  const id = idPrefix ? `${idPrefix}-${label.toLowerCase().replaceAll(/\s+/g, '-')}` : label.toLowerCase().replaceAll(/\s+/g, '-');

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium mb-2 text-gray-300"
      >
        {label}
      </label>
      <select
        id={id}
        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 text-white"
        value={value}
        onChange={onChange}
        onBlur={onBlur}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
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
