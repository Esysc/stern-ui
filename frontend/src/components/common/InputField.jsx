import PropTypes from 'prop-types';

/**
 * Basic input field component
 */
export function InputField({ label, value, onChange, placeholder, disabled }) {
  const id = label.toLowerCase().replaceAll(/\s+/g, '-');

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
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}

InputField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  disabled: PropTypes.bool,
};

InputField.defaultProps = {
  placeholder: '',
  disabled: false,
};
