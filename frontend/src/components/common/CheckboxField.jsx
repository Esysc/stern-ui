import PropTypes from 'prop-types';

/**
 * Checkbox field component
 */
export function CheckboxField({ label, checked, onChange }) {
  const id = label.toLowerCase().replaceAll(/\s+/g, '-');

  return (
    <div className="flex items-center gap-2 pt-6">
      <input
        id={id}
        type="checkbox"
        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-green-500 focus:ring-green-500"
        checked={checked}
        onChange={onChange}
      />
      <label htmlFor={id} className="text-sm text-gray-300">
        {label}
      </label>
    </div>
  );
}

CheckboxField.propTypes = {
  label: PropTypes.string.isRequired,
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
};
