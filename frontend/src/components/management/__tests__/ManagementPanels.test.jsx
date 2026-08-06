import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventsPanel, HealthPanel, ApplyPanel } from '../index';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('EventsPanel', () => {
  it('renders events from the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [{ time: '2026-01-01T00:00:00Z', type: 'Warning', reason: 'BackOff', object: 'Pod/demo', message: 'Back-off restarting' }]
    });

    render(<EventsPanel context="minikube" />);

    await waitFor(() => expect(screen.getByText('BackOff')).toBeInTheDocument());
    expect(screen.getByText('Pod/demo')).toBeInTheDocument();
  });
});

describe('HealthPanel', () => {
  it('renders node status and pod issues', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        nodes: [{ name: 'node-1', ready: true, cpu: '8', memory: '32Gi', version: 'v1.30' }],
        podSummary: { Running: 5, Failed: 1 },
        issues: [{ namespace: 'default', name: 'bad-pod', reason: 'CrashLoopBackOff', restarts: 3, age: '10m' }]
      })
    });

    render(<HealthPanel context="minikube" />);

    await waitFor(() => expect(screen.getByText('node-1')).toBeInTheDocument());
    expect(screen.getByText('CrashLoopBackOff')).toBeInTheDocument();
    expect(screen.getByText('bad-pod')).toBeInTheDocument();
  });
});

describe('ApplyPanel', () => {
  it('posts YAML and shows kubectl output', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ output: 'pod/example created' })
    });

    render(<ApplyPanel context="minikube" />);

    const textarea = screen.getByLabelText(/Manifest YAML/i);
    fireEvent.change(textarea, { target: { value: 'apiVersion: v1\nkind: Pod' } });

    fireEvent.click(screen.getByRole('button', { name: /^Apply$/ }));

    await waitFor(() => expect(screen.getByText('pod/example created')).toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/clusters/apply?context='),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
