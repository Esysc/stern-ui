import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InputField } from '../InputField';

describe('InputField', () => {
  it('renders with label', () => {
    render(<InputField label="Namespace" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Namespace')).toBeInTheDocument();
  });

  it('displays the current value', () => {
    render(<InputField label="Test" value="my-value" onChange={() => {}} />);
    expect(screen.getByDisplayValue('my-value')).toBeInTheDocument();
  });

  it('calls onChange when value changes', () => {
    const handleChange = vi.fn();
    render(<InputField label="Test" value="" onChange={handleChange} />);

    fireEvent.change(screen.getByLabelText('Test'), { target: { value: 'new-value' } });

    expect(handleChange).toHaveBeenCalledWith('new-value');
  });

  it('shows placeholder text', () => {
    render(<InputField label="Test" value="" onChange={() => {}} placeholder="Enter value" />);
    expect(screen.getByPlaceholderText('Enter value')).toBeInTheDocument();
  });

  it('can be disabled', () => {
    render(<InputField label="Test" value="" onChange={() => {}} disabled />);
    expect(screen.getByLabelText('Test')).toBeDisabled();
  });

  it('generates id from label', () => {
    render(<InputField label="My Label" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('My Label')).toHaveAttribute('id', 'my-label');
  });
});
