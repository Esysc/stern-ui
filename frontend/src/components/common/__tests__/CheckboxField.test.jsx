import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CheckboxField } from '../CheckboxField';

describe('CheckboxField', () => {
  it('renders with label', () => {
    render(<CheckboxField label="All Namespaces" checked={false} onChange={() => {}} />);
    expect(screen.getByLabelText('All Namespaces')).toBeInTheDocument();
  });

  it('reflects checked state', () => {
    render(<CheckboxField label="Option" checked={true} onChange={() => {}} />);
    expect(screen.getByLabelText('Option')).toBeChecked();
  });

  it('reflects unchecked state', () => {
    render(<CheckboxField label="Option" checked={false} onChange={() => {}} />);
    expect(screen.getByLabelText('Option')).not.toBeChecked();
  });

  it('calls onChange when clicked', () => {
    const handleChange = vi.fn();
    render(<CheckboxField label="Option" checked={false} onChange={handleChange} />);

    fireEvent.click(screen.getByLabelText('Option'));

    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when unchecking', () => {
    const handleChange = vi.fn();
    render(<CheckboxField label="Option" checked={true} onChange={handleChange} />);

    fireEvent.click(screen.getByLabelText('Option'));

    expect(handleChange).toHaveBeenCalledWith(false);
  });
});
