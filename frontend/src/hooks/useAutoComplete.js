import { useState, useEffect, useMemo } from 'react';
import { getApiBase } from '../utils/helpers';

/**
 * Custom hook for fetching autocomplete suggestions from the K8s API
 */
export function useAutoComplete(context, namespace, allNamespaces) {
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
      const base = getApiBase();

      try {
        const [nsRes, ctxRes, nodeRes] = await Promise.all([
          fetch(`${base}/api/namespaces?context=${context || ''}`).then(r => r.ok ? r.json() : []),
          fetch(`${base}/api/contexts`).then(r => r.ok ? r.json() : []),
          fetch(`${base}/api/nodes?context=${context || ''}`).then(r => r.ok ? r.json() : [])
        ]);
        setNamespaces(nsRes || []);
        setContexts(ctxRes || []);
        setNodes(nodeRes || []);
      } catch (e) {
        console.error('Failed to fetch autocomplete data:', e);
        setNamespaces([]);
        setContexts([]);
        setNodes([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [context]);

  // Fetch pods when namespace changes
  useEffect(() => {
    const fetchPods = async () => {
      const base = getApiBase();

      try {
        const params = new URLSearchParams();
        if (namespace) params.set('namespace', namespace);
        if (context) params.set('context', context);
        if (allNamespaces) params.set('allNamespaces', 'true');

        const res = await fetch(`${base}/api/pods?${params}`);
        if (res.ok) {
          setPods(await res.json() || []);
        } else {
          setPods([]);
        }
      } catch (e) {
        console.error('Failed to fetch pods:', e);
        setPods([]);
      }
    };

    fetchPods();
  }, [namespace, context, allNamespaces]);

  // Fetch containers when namespace changes
  useEffect(() => {
    const fetchContainers = async () => {
      const base = getApiBase();

      try {
        const params = new URLSearchParams();
        if (namespace) params.set('namespace', namespace);
        if (context) params.set('context', context);
        if (allNamespaces) params.set('allNamespaces', 'true');

        const res = await fetch(`${base}/api/containers?${params}`);
        if (res.ok) {
          setContainers(await res.json() || []);
        } else {
          setContainers([]);
        }
      } catch (e) {
        console.error('Failed to fetch containers:', e);
        setContainers([]);
      }
    };

    fetchContainers();
  }, [namespace, context, allNamespaces]);

  // Memoize the return object to prevent causing re-renders
  return useMemo(() => ({
    namespaces,
    pods,
    containers,
    contexts,
    nodes,
    loading
  }), [namespaces, pods, containers, contexts, nodes, loading]);
}
