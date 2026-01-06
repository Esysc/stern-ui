import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Header } from '../Header';

describe('Header', () => {
  it('renders the title', () => {
    render(<Header persistSettings={false} onPersistSettingsChange={() => {}} />);
    expect(screen.getByText('Stern Web UI')).toBeInTheDocument();
  });

  it('renders persist settings checkbox', () => {
    render(<Header persistSettings={false} onPersistSettingsChange={() => {}} />);
    expect(screen.getByLabelText(/persist settings/i)).toBeInTheDocument();
  });

  it('reflects persistSettings state - unchecked', () => {
    render(<Header persistSettings={false} onPersistSettingsChange={() => {}} />);
    expect(screen.getByLabelText(/persist settings/i)).not.toBeChecked();
  });

  it('reflects persistSettings state - checked', () => {
    render(<Header persistSettings={true} onPersistSettingsChange={() => {}} />);
    expect(screen.getByLabelText(/persist settings/i)).toBeChecked();
  });

  it('calls onPersistSettingsChange when toggling checkbox', () => {
    const handleChange = vi.fn();
    render(<Header persistSettings={false} onPersistSettingsChange={handleChange} />);

    fireEvent.click(screen.getByLabelText(/persist settings/i));

    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('renders link to stern repo', () => {
    render(<Header persistSettings={false} onPersistSettingsChange={() => {}} />);

    const link = screen.getByRole('link', { name: /powered by stern/i });
    expect(link).toHaveAttribute('href', 'https://github.com/stern/stern');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
