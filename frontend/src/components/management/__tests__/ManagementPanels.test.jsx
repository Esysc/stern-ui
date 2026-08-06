import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventsPanel, HealthPanel, ApplyPanel, ResourcesPanel } from '../index';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('EventsPanel', () => {
  it('renders events from the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const isNamespaces = String(url).includes('/api/namespaces');
      return Promise.resolve({
        ok: true,
        json: async () => (isNamespaces
          ? ['default', 'kube-system']
          : [{ time: '2026-01-01T00:00:00Z', type: 'Warning', reason: 'BackOff', object: 'Pod/demo', message: 'Back-off restarting' }])
      });
    });

    render(<EventsPanel context="minikube" />);

    await waitFor(() => expect(screen.getByText('BackOff')).toBeInTheDocument());
    expect(screen.getByText('Pod/demo')).toBeInTheDocument();
  });

  it('populates the namespace field with cluster namespaces', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const isNamespaces = String(url).includes('/api/namespaces');
      return Promise.resolve({
        ok: true,
        json: async () => (isNamespaces ? ['default', 'kube-system'] : [])
      });
    });

    render(<EventsPanel context="minikube" />);

    fireEvent.focus(screen.getByLabelText('Namespace'));
    await waitFor(() => expect(screen.getByText('kube-system')).toBeInTheDocument());
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

describe('ResourcesPanel', () => {
  it('lists resources for the selected kind and filters by namespace', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/api/namespaces')) {
        return Promise.resolve({ ok: true, json: async () => ['default'] });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          kind: 'configmaps',
          items: [
            { name: 'cm-a', namespace: 'default', created: new Date().toISOString() },
            { name: 'cm-b', namespace: 'kube-system', created: '2026-01-01T00:00:00Z' }
          ]
        })
      });
    });

    render(<ResourcesPanel context="minikube" />);

    await waitFor(() => expect(screen.getByText('cm-a')).toBeInTheDocument());
    expect(screen.getByText('cm-b')).toBeInTheDocument();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/clusters/resources?context='),
      expect.anything()
    );
  });

  it('hides the namespace filter for cluster-scoped kinds', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ kind: 'nodes', items: [] }) });

    render(<ResourcesPanel context="minikube" />);

    fireEvent.focus(screen.getByLabelText('Resource kind'));
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Cluster Roles' }));

    expect(screen.queryByLabelText('Namespace')).not.toBeInTheDocument();
  });

  it('opens a resource detail on row click and closes it', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/api/namespaces')) {
        return Promise.resolve({ ok: true, json: async () => ['default'] });
      }
      if (u.includes('/api/clusters/resource-detail')) {
        return Promise.resolve({ ok: true, json: async () => ({ kind: 'configmaps', name: 'cm-a', yaml: 'apiVersion: v1\nkind: ConfigMap\ndata:\n  key: value' }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ kind: 'configmaps', items: [{ name: 'cm-a', namespace: 'default', created: new Date().toISOString() }] })
      });
    });

    render(<ResourcesPanel context="minikube" />);

    await waitFor(() => expect(screen.getByText('cm-a')).toBeInTheDocument());
    fireEvent.click(screen.getByText('cm-a'));

    await waitFor(() => expect(screen.getByText(/kind: ConfigMap/)).toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/clusters/resource-detail?'),
      expect.anything()
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close resource detail' }));
    expect(screen.queryByText(/kind: ConfigMap/)).not.toBeInTheDocument();
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
