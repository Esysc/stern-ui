import { useState, useEffect, useMemo } from 'react';
import { cachedFetch } from '../utils/cache';

/**
 * Custom hook for fetching autocomplete suggestions from the K8s API
 */
export function useAutoComplete(context, namespace) {
  const [namespaces, setNamespaces] = useState([]);
  const [pods, setPods] = useState([]);
  const [containers, setContainers] = useState([]);
  const [contexts, setContexts] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch namespaces, contexts, and nodes when context changes
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      try {
        const [nsRes, ctxRes, nodeRes] = await Promise.all([
          cachedFetch(`/api/namespaces?context=${context || ''}`, { ttl: 60_000 })
            .catch(() => []),
          cachedFetch('/api/contexts', { ttl: 60_000 }).catch(() => []),
          cachedFetch(`/api/nodes?context=${context || ''}`, { ttl: 60_000 })
            .catch(() => [])
        ]);
        setNamespaces(nsRes || []);
        setContexts(ctxRes || []);
        setNodes(nodeRes || []);
      } catch (e) {
        console.error('Failed to fetch autocomplete data:', e);

        // If we have a context but all requests failed, it might be invalid
        // Clear localStorage to prevent stuck state
        if (context) {
          console.warn('Context appears invalid, clearing localStorage:', context);
          // Clear all stern-ui config from localStorage
          Object.keys(localStorage)
            .filter(key => key.startsWith('stern-ui-config-'))
            .forEach(key => localStorage.removeItem(key));
        }

        setNamespaces([]);
        setContexts([]);
        setNodes([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [context]);

  // Fetch pods when namespace or context changes
  useEffect(() => {
    const fetchPods = async () => {
      // Only fetch if namespace is in the valid list
      if (!namespace || !namespaces.includes(namespace)) {
        setPods([]);
        return;
      }

      try {
        const params = new URLSearchParams();
        if (context) params.set('context', context);
        params.set('namespace', namespace);

        const res = await cachedFetch(`/api/pods?${params}`, { ttl: 8_000 })
          .catch(() => []);
        setPods(res || []);
      } catch (e) {
        console.error('Failed to fetch pods:', e);
        setPods([]);
      }
    };

    fetchPods();
  }, [namespace, context, namespaces]);

  // Fetch containers when namespace or context changes
  useEffect(() => {
    const fetchContainers = async () => {
      // Only fetch if namespace is in the valid list
      if (!namespace || !namespaces.includes(namespace)) {
        setContainers([]);
        return;
      }

      try {
        const params = new URLSearchParams();
        if (context) params.set('context', context);
        params.set('namespace', namespace);

        const res = await cachedFetch(`/api/containers?${params}`, { ttl: 8_000 })
          .catch(() => []);
        setContainers(res || []);
      } catch (e) {
        console.error('Failed to fetch containers:', e);
        setContainers([]);
      }
    };

    fetchContainers();
  }, [namespace, context, namespaces]);

  // Build structured options: { pod: 'name', containers: ['c1', 'c2'] }
  const options = useMemo(() => {
    const podMap = {};
    for (const pod of pods) {
      if (!podMap[pod]) {
        podMap[pod] = [];
      }
    }
    for (const container of containers) {
      const [pod, containerName] = container.split('/');
      if (podMap[pod] && !podMap[pod].includes(containerName)) {
        podMap[pod].push(containerName);
      }
    }
    return Object.entries(podMap).map(([pod, containers]) => ({
      pod,
      containers: containers.sort(),
    }));
  }, [pods, containers]);

  // Memoize the return object to prevent causing re-renders
  return useMemo(() => ({
    namespaces,
    pods,
    containers,
    contexts,
    nodes,
    options,
    loading
  }), [namespaces, pods, containers, contexts, nodes, options, loading]);
}
