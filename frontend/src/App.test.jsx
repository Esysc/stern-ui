import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';

// Mock fetch for autocomplete APIs
globalThis.fetch = vi.fn(() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve([])
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the header', () => {
    render(<App />);
    expect(screen.getByText(/Stern Web UI/i)).toBeInTheDocument();
  });

  it('renders input fields', () => {
    render(<App />);
    expect(screen.getByLabelText(/Namespace/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Selector/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Query/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Since/i)).toBeInTheDocument();
  });

  it('renders connect button', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /Connect/i })).toBeInTheDocument();
  });

  it('renders persist settings checkbox', () => {
    render(<App />);
    expect(screen.getByLabelText(/persist settings/i)).toBeInTheDocument();
  });

  it('renders default stream tab', () => {
    render(<App />);
    expect(screen.getByText('Stream 1')).toBeInTheDocument();
  });

  it('can add new stream tab', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /add stream/i }));

    expect(screen.getByText('Stream 1')).toBeInTheDocument();
    expect(screen.getByText('Stream 2')).toBeInTheDocument();
  });

  it('can switch between stream tabs', () => {
    render(<App />);

    // Add a second stream
    fireEvent.click(screen.getByRole('button', { name: /add stream/i }));

    // Click on Stream 2
    fireEvent.click(screen.getByText('Stream 2'));

    // Stream 2 should now be active (check for border class)
    const stream2Tab = screen.getByText('Stream 2').closest('div');
    expect(stream2Tab).toHaveClass('border-green-500');
  });

  it('can remove a stream tab', () => {
    render(<App />);

    // Add streams
    fireEvent.click(screen.getByRole('button', { name: /add stream/i }));
    expect(screen.getByText('Stream 2')).toBeInTheDocument();

    // Remove Stream 2
    const closeButtons = screen.getAllByRole('button', { name: /✕/i });
    fireEvent.click(closeButtons[1]); // Remove second stream

    expect(screen.queryByText('Stream 2')).not.toBeInTheDocument();
  });

  it('prevents removing last stream', () => {
    render(<App />);

    // With only one stream, close button should not be visible
    expect(screen.queryByRole('button', { name: /✕/i })).not.toBeInTheDocument();
  });

  it('renders container filter fields', () => {
    render(<App />);
    expect(screen.getByLabelText(/Container \(regex\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Exclude Containers/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Exclude Pods/i)).toBeInTheDocument();
  });

  it('renders log filter fields', () => {
    render(<App />);
    expect(screen.getByLabelText(/Include \(regex, highlighted\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Exclude \(regex\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Highlight \(regex\)/i)).toBeInTheDocument();
  });

  it('renders advanced options toggle', () => {
    render(<App />);
    expect(screen.getByText(/Advanced Options/i)).toBeInTheDocument();
  });

  it('shows advanced options when toggled', () => {
    render(<App />);

    fireEvent.click(screen.getByText(/Advanced Options/i));

    expect(screen.getByLabelText(/Tail Lines/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Node/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Context/i)).toBeInTheDocument();
  });

  it('renders level filter buttons', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /error/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /warn/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /info/i })).toBeInTheDocument();
  });

  it('renders search filter input', () => {
    render(<App />);
    expect(screen.getByPlaceholderText(/filter logs/i)).toBeInTheDocument();
  });

  it('renders clear button', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('renders auto-scroll button', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /auto-scroll/i })).toBeInTheDocument();
  });

  it('renders download button', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
  });

  it('toggles persist settings', () => {
    render(<App />);

    const checkbox = screen.getByLabelText(/persist settings/i);
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);

    expect(checkbox).toBeChecked();
  });
});
