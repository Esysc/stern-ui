import PropTypes from 'prop-types';
import { memo } from 'react';

/**
 * Checkbox field component
 */
function CheckboxFieldComponent({ label, checked, onChange, idPrefix }) {
  const id = idPrefix ? `${idPrefix}-${label.toLowerCase().replaceAll(/\s+/g, '-')}` : label.toLowerCase().replaceAll(/\s+/g, '-');

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

CheckboxFieldComponent.propTypes = {
  label: PropTypes.string.isRequired,
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  idPrefix: PropTypes.string,
};

export const CheckboxField = memo(CheckboxFieldComponent);
