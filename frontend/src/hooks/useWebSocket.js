import { useState, useCallback, useRef, useEffect } from 'react';
import { getWsHost, getWsProtocol, formatTimestamp } from '../utils/helpers';
import { detectLogLevel } from '../utils/logUtils';
import { MAX_LOGS, MAX_BUFFER } from '../constants';

// Debug logging helper - only logs when DEBUG env var is set
const debug = (...args) => {
  if (import.meta.env.VITE_DEBUG === 'true' || localStorage.getItem('stern-ui-debug') === 'true') {
    console.log('[useWebSocket]', ...args);
  }
};

/**
 * Helper to set parameter if value exists
 */
function setParamIfExists(params, key, value) {
  if (value) params.set(key, value);
}

/**
 * Build WebSocket URL parameters from config
 */
function buildWsParams(config) {
  const params = new URLSearchParams();
  params.set('query', config.query || '.');

  setParamIfExists(params, 'namespace', config.namespace);
  setParamIfExists(params, 'selector', config.selector);
  setParamIfExists(params, 'container', config.container);
  setParamIfExists(params, 'excludeContainer', config.excludeContainer);
  setParamIfExists(params, 'excludePod', config.excludePod);
  setParamIfExists(params, 'include', config.include);
  setParamIfExists(params, 'exclude', config.exclude);
  setParamIfExists(params, 'highlight', config.highlight);
  setParamIfExists(params, 'tail', config.tail);
  setParamIfExists(params, 'node', config.node);
  setParamIfExists(params, 'timestamps', config.timestamps);
  setParamIfExists(params, 'context', config.context);

  // Time range parameters
  setParamIfExists(params, 'timeRangeMode', config.timeRangeMode);

  // Only send since if in relative mode (or no mode set)
  if (!config.timeRangeMode || config.timeRangeMode === 'relative') {
    setParamIfExists(params, 'since', config.since);
  }

  // Only send sinceTime/untilTime if in absolute mode
  if (config.timeRangeMode === 'absolute') {
    // Convert local datetime to UTC for backend
    if (config.sinceTime) {
      const localDate = new Date(config.sinceTime);
      const utcTime = localDate.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM in UTC
      params.set('sinceTime', utcTime);
    }
    if (config.untilTime) {
      const localDate = new Date(config.untilTime);
      const utcTime = localDate.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM in UTC
      params.set('untilTime', utcTime);
    }
  }

  // Increase maxLogRequests when searching all namespaces
  const maxLogRequests = config.allNamespaces && !config.namespace ? '500' : (config.maxLogRequests || '50');
  params.set('maxLogRequests', maxLogRequests);

  if (config.containerState && config.containerState !== 'all') {
    params.set('containerState', config.containerState);
  }
  // Only set allNamespaces=true if no namespace is specified
  if (config.allNamespaces && !config.namespace) params.set('allNamespaces', 'true');
  if (!config.initContainers) params.set('initContainers', 'false');
  if (!config.ephemeralContainers) params.set('ephemeralContainers', 'false');
  if (config.noFollow) params.set('noFollow', 'true');

  return params;
}

/**
 * Parse log line into log entry
 */
function parseLogLine(line) {
  return {
    timestamp: formatTimestamp(line.timestamp),
    pod: line.podName,
    container: line.containerName,
    namespace: line.namespace,
    node: line.nodeName,
    message: line.message,
    labels: line.labels,
    level: detectLogLevel(line.message)
  };
}

/**
 * Create fallback log entry for parse errors
 */
function createFallbackLogEntry(data) {
  return {
    timestamp: formatTimestamp(),
    pod: 'system',
    container: 'parser',
    message: data,
    level: 'unknown'
  };
}

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
  const wsRef = useRef(null);
  const configRef = useRef(null);
  const untilTimeRef = useRef(null);

  // Keep refs in sync
  useEffect(() => {
    wsRef.current = ws;
  }, [ws]);

  // Keep isPausedRef in sync with useEffect
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const handleLogMessage = useCallback((event) => {
    try {
      const line = JSON.parse(event.data);
      const logEntry = parseLogLine(line);

      // Filter by untilTime if in absolute mode
      if (untilTimeRef.current) {
        const logTime = new Date(line.timestamp);
        const untilTime = new Date(untilTimeRef.current);
        if (logTime > untilTime) {
          // Log is after the until time, skip it
          return;
        }
      }

      if (isPausedRef.current) {
        pauseBufferRef.current.push(logEntry);
        if (pauseBufferRef.current.length > MAX_BUFFER) {
          pauseBufferRef.current = pauseBufferRef.current.slice(-MAX_BUFFER);
        }
      } else {
        setLogs(prev => [...prev, logEntry].slice(-MAX_LOGS));
      }
    } catch {
      const logEntry = createFallbackLogEntry(event.data);
      if (!isPausedRef.current) {
        setLogs(prev => [...prev.slice(-(MAX_LOGS - 1)), logEntry]);
      }
    }
  }, []);

  const connect = useCallback((config) => {
    // Close existing connection using ref
    if (wsRef.current) {
      debug('Closing existing WebSocket before reconnecting');
      wsRef.current.close();
    }

    // Store config and until time for filtering
    configRef.current = config;
    if (config.timeRangeMode === 'absolute' && config.untilTime) {
      // Convert datetime-local to ISO format for comparison
      untilTimeRef.current = config.untilTime.replace('T', 'T') + ':00Z';
    } else {
      untilTimeRef.current = null;
    }

    pauseBufferRef.current = [];
    setIsPaused(false);
    isPausedRef.current = false;

    const params = buildWsParams(config);
    const wsUrl = `${getWsProtocol()}//${getWsHost()}/ws/logs?${params.toString()}`;
    debug('WebSocket URL:', wsUrl);
    const newWs = new WebSocket(wsUrl);

    newWs.onopen = () => {
      debug('WebSocket connected');
      setIsConnected(true);
      setLogs([]);
    };

    newWs.onmessage = handleLogMessage;

    newWs.onclose = () => {
      debug('WebSocket closed');
      setIsConnected(false);
    };

    newWs.onerror = (error) => {
      debug('WebSocket error:', error);
      setIsConnected(false);
    };

    setWs(newWs);
  }, [handleLogMessage]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      debug('Disconnecting WebSocket');
      wsRef.current.close();
    }
    setWs(null);
    setIsConnected(false);
  }, []);

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
