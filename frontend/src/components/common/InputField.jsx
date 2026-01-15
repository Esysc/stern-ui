import PropTypes from 'prop-types';
import { memo } from 'react';

/**
 * Basic input field component
 */
function InputFieldComponent({ label, value, onChange, onBlur, placeholder, disabled, idPrefix, type = 'text', min, max, compact = false, helperText }) {
  const id = idPrefix ? `${idPrefix}-${label.toLowerCase().replaceAll(/\s+/g, '-')}` : label.toLowerCase().replaceAll(/\s+/g, '-');

  return (
    <div>
      <label
        htmlFor={id}
        className={`block font-medium text-gray-300 ${compact ? 'text-xs mb-1' : 'text-sm mb-2'}`}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        className={`bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 text-white placeholder-gray-500 ${compact ? 'w-full text-sm' : 'w-full'} ${disabled ? 'opacity-50' : ''}`}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
      />
      {helperText && (
        <p className={`${compact ? 'text-xs mt-0.5' : 'text-sm mt-1'} text-gray-400`}>
          {helperText}
        </p>
      )}
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
  type: PropTypes.string,
  min: PropTypes.string,
  max: PropTypes.string,
  compact: PropTypes.bool,
  helperText: PropTypes.string,
};

InputFieldComponent.defaultProps = {
  placeholder: '',
  disabled: false,
};

export const InputField = memo(InputFieldComponent);
