import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Header } from '../Header';

describe('Header', () => {
  it('renders the title', () => {
    render(<Header onClearSettings={() => {}} />);
    expect(screen.getByText('Stern Web UI')).toBeInTheDocument();
  });

  it('renders clear all settings button', () => {
    render(<Header onClearSettings={() => {}} />);
    expect(screen.getByRole('button', { name: /clear all settings/i })).toBeInTheDocument();
  });

  it('calls onClearSettings when clicking clear button', () => {
    const handleClear = vi.fn();
    render(<Header onClearSettings={handleClear} />);

    fireEvent.click(screen.getByRole('button', { name: /clear all settings/i }));

    expect(handleClear).toHaveBeenCalled();
  });

  it('renders link to stern repo', () => {
    render(<Header onClearSettings={() => {}} />);

    const link = screen.getByRole('link', { name: /powered by stern/i });
    expect(link).toHaveAttribute('href', 'https://github.com/stern/stern');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
