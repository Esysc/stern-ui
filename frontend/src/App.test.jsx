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

  it('renders the header', async () => {
    render(<App />);
    expect(await screen.findByText(/Stern Web UI/i)).toBeInTheDocument();
  });

  it('renders essential filter input fields', async () => {
    render(<App />);
    expect(await screen.findByLabelText(/Namespace/i)).toBeInTheDocument();
    expect(await screen.findByText(/Pod \/ Container/i)).toBeInTheDocument();
  });

  it('renders connect button', async () => {
    render(<App />);
    expect(await screen.findByRole('button', { name: /Connect/i })).toBeInTheDocument();
  });

  it('renders clear button', async () => {
    render(<App />);
    // Target the Clear button in StreamActions (not "Clear All Settings" in header)
    expect(await screen.findByRole('button', { name: /^Clear$/i })).toBeInTheDocument();
  });

  it('renders view tabs', async () => {
    render(<App />);
    expect(await screen.findByRole('button', { name: /View Logs/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /View Events/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /View Health/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /View Apply/i })).toBeInTheDocument();
  });

  it('renders cluster selector', async () => {
    render(<App />);
    expect(await screen.findByLabelText(/Cluster/i)).toBeInTheDocument();
  });

  it('adds a new stream when Add Stream is clicked', async () => {
    render(<App />);
    const addBtn = await screen.findByRole('button', { name: /Add Stream/i });
    fireEvent.click(addBtn);

    // Now two stream panels should be present (each has its own Connect button)
    const connectButtons = await screen.findAllByRole('button', { name: /^Connect/i });
    expect(connectButtons).toHaveLength(2);
  });

  it('closes a stream via the Close button', async () => {
    render(<App />);
    const addBtn = await screen.findByRole('button', { name: /Add Stream/i });
    fireEvent.click(addBtn);

    const closeButtons = await screen.findAllByRole('button', { name: /Close stream/i });
    fireEvent.click(closeButtons[0]);

    const connectButtons = await screen.findAllByRole('button', { name: /^Connect/i });
    expect(connectButtons).toHaveLength(1);
  });
});
