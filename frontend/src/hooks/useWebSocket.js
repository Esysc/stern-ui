import { useState, useCallback, useRef, useEffect } from 'react';
import { getWsHost, getWsProtocol, formatTimestamp } from '../utils/helpers';
import { detectLogLevel } from '../utils/logUtils';
import { MAX_LOGS, MAX_BUFFER } from '../constants';

/**
 * Custom hook for managing WebSocket connection to stern backend
 */
export function useWebSocket() {
  const [ws, setWs] = useState(null);
  const [logs, setLogs] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const pauseBufferRef = useRef([]);
  const isPausedRef = useRef(false);

  // Keep isPausedRef in sync with useEffect
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const connect = useCallback((config) => {
    if (ws) ws.close();
    pauseBufferRef.current = [];
    setIsPaused(false);
    isPausedRef.current = false;

    const params = new URLSearchParams();
    params.set('query', config.query || '.');
    if (config.namespace) params.set('namespace', config.namespace);
    if (config.selector) params.set('selector', config.selector);
    if (config.since) params.set('since', config.since);
    if (config.container) params.set('container', config.container);
    if (config.excludeContainer) params.set('excludeContainer', config.excludeContainer);
    if (config.excludePod) params.set('excludePod', config.excludePod);
    if (config.containerState && config.containerState !== 'all') {
      params.set('containerState', config.containerState);
    }
    if (config.include) params.set('include', config.include);
    if (config.exclude) params.set('exclude', config.exclude);
    if (config.highlight) params.set('highlight', config.highlight);
    if (config.tail) params.set('tail', config.tail);
    if (config.node) params.set('node', config.node);
    if (config.allNamespaces) params.set('allNamespaces', 'true');
    if (!config.initContainers) params.set('initContainers', 'false');
    if (!config.ephemeralContainers) params.set('ephemeralContainers', 'false');
    if (config.timestamps) params.set('timestamps', config.timestamps);
    if (config.noFollow) params.set('noFollow', 'true');
    if (config.context) params.set('context', config.context);
    if (config.maxLogRequests) params.set('maxLogRequests', config.maxLogRequests);

    const wsUrl = `${getWsProtocol()}//${getWsHost()}/ws/logs?${params.toString()}`;
    const newWs = new WebSocket(wsUrl);

    newWs.onopen = () => {
      setIsConnected(true);
      setLogs([]);
    };

    newWs.onmessage = (event) => {
      try {
        const line = JSON.parse(event.data);
        const logEntry = {
          timestamp: formatTimestamp(line.timestamp),
          pod: line.podName,
          container: line.containerName,
          namespace: line.namespace,
          node: line.nodeName,
          message: line.message,
          labels: line.labels,
          level: detectLogLevel(line.message)
        };

        if (isPausedRef.current) {
          pauseBufferRef.current.push(logEntry);
          if (pauseBufferRef.current.length > MAX_BUFFER) {
            pauseBufferRef.current = pauseBufferRef.current.slice(-MAX_BUFFER);
          }
        } else {
          setLogs(prev => [...prev, logEntry].slice(-MAX_LOGS));
        }
      } catch {
        const logEntry = {
          timestamp: formatTimestamp(),
          pod: 'system',
          container: 'parser',
          message: event.data,
          level: 'unknown'
        };
        if (!isPausedRef.current) {
          setLogs(prev => [...prev.slice(-(MAX_LOGS - 1)), logEntry]);
        }
      }
    };

    newWs.onclose = () => setIsConnected(false);
    newWs.onerror = () => setIsConnected(false);
    setWs(newWs);
  }, [ws]);

  const disconnect = useCallback(() => {
    ws?.close();
    setWs(null);
    setIsConnected(false);
  }, [ws]);

  const togglePause = useCallback(() => {
    if (isPaused) {
      // Resume: add buffered logs
      setLogs(prev => [...prev, ...pauseBufferRef.current].slice(-MAX_LOGS));
      pauseBufferRef.current = [];
    }
    setIsPaused(!isPaused);
  }, [isPaused]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const getBufferCount = useCallback(() => {
    return pauseBufferRef.current.length;
  }, []);

  return {
    logs,
    isConnected,
    isPaused,
    connect,
    disconnect,
    togglePause,
    clearLogs,
    getBufferCount
  };
}
