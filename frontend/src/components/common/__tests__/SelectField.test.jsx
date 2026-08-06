import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SelectField } from '../SelectField';

const options = [
  { value: 'all', label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'waiting', label: 'Waiting' },
];

describe('SelectField', () => {
  it('renders with label', () => {
    render(<SelectField label="Container State" value="all" onChange={() => {}} options={options} />);
    expect(screen.getByLabelText('Container State')).toBeInTheDocument();
  });

  it('displays all options when opened', () => {
    render(<SelectField label="State" value="all" onChange={() => {}} options={options} />);

    fireEvent.focus(screen.getByLabelText('State'));

    expect(screen.getByRole('option', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Running' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Waiting' })).toBeInTheDocument();
  });

  it('displays the selected option label', () => {
    render(<SelectField label="State" value="running" onChange={() => {}} options={options} />);
    expect(screen.getByLabelText('State')).toHaveValue('Running');
  });

  it('calls onChange when an option is selected', () => {
    const handleChange = vi.fn();
    render(<SelectField label="State" value="all" onChange={handleChange} options={options} />);

    fireEvent.focus(screen.getByLabelText('State'));
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Waiting' }));

    expect(handleChange).toHaveBeenCalledWith('waiting');
  });
});
