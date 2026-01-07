import PropTypes from 'prop-types';
import { memo } from 'react';

/**
 * Basic input field component
 */
function InputFieldComponent({ label, value, onChange, onBlur, placeholder, disabled, idPrefix }) {
  const id = idPrefix ? `${idPrefix}-${label.toLowerCase().replaceAll(/\s+/g, '-')}` : label.toLowerCase().replaceAll(/\s+/g, '-');

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium mb-2 text-gray-300"
      >
        {label}
      </label>
      <input
        id={id}
        className={`w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 text-white placeholder-gray-500 ${disabled ? 'opacity-50' : ''}`}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}

InputFieldComponent.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  onChange: PropTypes.func.isRequired,
  onBlur: PropTypes.func,
  placeholder: PropTypes.string,
  disabled: PropTypes.bool,
  idPrefix: PropTypes.string,
};

InputFieldComponent.defaultProps = {
  placeholder: '',
  disabled: false,
};

export const InputField = memo(InputFieldComponent);
