import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { StreamConfig } from './StreamConfig';
import { StreamActions } from './StreamActions';
import { LogViewer, LogStatusBar } from '../logs';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useAutoComplete } from '../../hooks/useAutoComplete';
import { useDisplaySettings } from '../../hooks/useDisplaySettings';
import { saveConfig } from '../../utils/storage';
import {
  buildPodColorMap,
  countLogLevels,
  filterLogs
} from '../../utils/logUtils';
import { DEFAULT_CONFIG } from '../../constants';

/**
 * A single log stream panel. Owns its own WebSocket connection and config.
 */
export function StreamPanel({ streamId, initialConfig, onStreamStateChange, isActive = true, context, onRemove }) {
  const [config, setConfig] = useState(() => {
    return {
      ...DEFAULT_CONFIG,
      ...initialConfig,
      query: initialConfig?.query || '.'
    };
  });

  const displaySettings = useDisplaySettings();

  const {
    logs,
    isConnected,
    isConnecting,
    connectionError,
    isPaused,
    connect,
    disconnect,
    togglePause,
    clearLogs
  } = useWebSocket();

  const autocomplete = useAutoComplete(config.context, config.namespace);

  // Sync the globally selected cluster (from the header) into the stream config.
  useEffect(() => {
    if (context && config.context !== context) {
      setConfig(prev => ({ ...prev, context }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);

  // Auto-populate context if missing and contexts are available (only on initial load)
  useEffect(() => {
    if (!config.context && autocomplete.contexts.length > 0 && !isConnected) {
      setConfig(prev => ({ ...prev, context: autocomplete.contexts[0] }));
    }
  }, [config.context, autocomplete.contexts, isConnected]);

  // Save config to storage
  useEffect(() => {
    saveConfig(streamId, { ...config, wasConnected: isConnected });
  }, [config, streamId, isConnected]);

  // Share latest stream runtime state with parent.
  useEffect(() => {
    onStreamStateChange?.({ streamId, config, isConnected });
  }, [streamId, config, isConnected, onStreamStateChange]);

  // Auto-connect when the stream was previously connected
  useEffect(() => {
    if (config.wasConnected && !isConnected && config.query) {
      const timer = setTimeout(() => {
        const cleanConfig = { ...config };
        delete cleanConfig.wasConnected;
        connect(cleanConfig);
      }, 200);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const podColorMap = useMemo(() => {
    if (!isActive) return {};
    return buildPodColorMap(logs);
  }, [logs, isActive]);

  const levelCounts = useMemo(() => {
    if (!isActive) return { error: 0, warn: 0, info: 0, debug: 0, total: 0 };
    return countLogLevels(logs);
  }, [logs, isActive]);

  const filteredLogs = useMemo(() => {
    if (!isActive) return logs;
    return filterLogs(logs, {
      query: config.query,
      container: config.container
    });
  }, [logs, config.query, config.container, isActive]);

  const handleConnect = useCallback(() => {
    // eslint-disable-next-line no-unused-vars
    const { wasConnected, ...cleanConfig } = config;
    connect(cleanConfig);
  }, [connect, config]);

  // Auto-reconnect when essential server-side filters change (if already connected)
  const prevConfigRef = useRef(config);
  const reconnectTimerRef = useRef(null);

  useEffect(() => {
    if (!isConnected) {
      prevConfigRef.current = config;
      return;
    }

    const prev = prevConfigRef.current;
    const curr = config;

    const essentialServerSideFiltersChanged =
      prev.namespace !== curr.namespace ||
      prev.containerState !== curr.containerState ||
      prev.allNamespaces !== curr.allNamespaces ||
      prev.node !== curr.node ||
      prev.context !== curr.context ||
      prev.selector !== curr.selector ||
      prev.tail !== curr.tail ||
      prev.initContainers !== curr.initContainers ||
      prev.ephemeralContainers !== curr.ephemeralContainers ||
      prev.noFollow !== curr.noFollow ||
      prev.maxLogRequests !== curr.maxLogRequests;

    if (essentialServerSideFiltersChanged) {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      disconnect();
      reconnectTimerRef.current = setTimeout(() => {
        // eslint-disable-next-line no-unused-vars
        const { wasConnected, ...cleanConfig } = config;
        connect(cleanConfig);
        reconnectTimerRef.current = null;
      }, 300);
    }

    prevConfigRef.current = config;

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [config, isConnected, disconnect, connect]);

  const handleResetFilters = useCallback(() => {
    setConfig(prev => ({
      ...prev,
      query: '.',
      container: '',
      namespace: ''
    }));
  }, []);

  const activeFilterChips = useMemo(() => {
    const chips = [];

    if (config.namespace) {
      chips.push({ key: 'namespace', label: `Namespace: ${config.namespace}`, onRemove: () => setConfig(prev => ({ ...prev, namespace: '' })) });
    }

    if (config.query && config.query !== '.') {
      chips.push({ key: 'query', label: `Pod: ${config.query}`, onRemove: () => setConfig(prev => ({ ...prev, query: '.' })) });
    }

    if (config.container) {
      chips.push({ key: 'container', label: `Container: ${config.container}`, onRemove: () => setConfig(prev => ({ ...prev, container: '' })) });
    }

    return chips;
  }, [config]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-4 items-center flex-wrap">
          <button
            onClick={() => displaySettings.setShowSettings(!displaySettings.showSettings)}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title={displaySettings.showSettings ? 'Hide settings' : 'Show settings'}
            aria-label={displaySettings.showSettings ? 'Hide stream settings' : 'Show stream settings'}
            aria-expanded={displaySettings.showSettings}
          >
            {displaySettings.showSettings ? '▲' : '▼'}
          </button>
          <span className="text-sm text-gray-400">
            Stream #{streamId}{config.context ? ` · ${config.context}` : ''}
          </span>
          <button
            onClick={handleResetFilters}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
            title="Reset filters"
            aria-label="Reset filters"
          >
            Reset Filters
          </button>
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            className="px-3 py-2 bg-red-700 hover:bg-red-600 text-white rounded text-sm transition-colors"
            title="Close stream"
            aria-label="Close stream"
          >
            Close
          </button>
        )}
      </div>

      {displaySettings.showSettings && (
        <div className="bg-gray-800 p-6 rounded-lg mb-6 border border-gray-700">
          <StreamConfig
            config={config}
            onChange={setConfig}
            autocomplete={autocomplete}
            streamId={streamId}
          />

          <StreamActions
            isConnected={isConnected}
            isConnecting={isConnecting}
            isPaused={isPaused}
            onConnect={handleConnect}
            onDisconnect={disconnect}
            onTogglePause={togglePause}
            onClear={clearLogs}
          />
        </div>
      )}

      {activeFilterChips.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {activeFilterChips.map(chip => (
            <button
              key={chip.key}
              onClick={chip.onRemove}
              className="inline-flex items-center gap-2 rounded-full border border-gray-700 bg-gray-800 px-3 py-1 text-sm text-gray-200 hover:border-gray-500 hover:bg-gray-700 transition-colors"
              title={`Remove ${chip.label}`}
              aria-label={`Remove ${chip.label}`}
            >
              <span>{chip.label}</span>
              <span className="text-gray-400">x</span>
            </button>
          ))}
        </div>
      )}

      <div className={displaySettings.showSettings ? 'bg-black border border-gray-800 rounded-lg flex flex-col h-[calc(100vh-650px)] min-h-[400px]' : 'bg-black border border-gray-800 rounded-lg flex flex-col h-[calc(100vh-350px)] min-h-[600px]'}>
        <LogStatusBar
          isConnected={isConnected}
          isConnecting={isConnecting}
          isPaused={isPaused}
          connectionError={connectionError}
          filteredCount={filteredLogs.length}
          totalCount={logs.length}
          podCount={Object.keys(podColorMap).length}
          levelCounts={levelCounts}
        />

        <LogViewer
          logs={filteredLogs}
          podColorMap={podColorMap}
          autoScroll={true}
        />
      </div>
    </div>
  );
}

StreamPanel.propTypes = {
  streamId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  initialConfig: PropTypes.object,
  onStreamStateChange: PropTypes.func,
  isActive: PropTypes.bool,
  context: PropTypes.string,
  onRemove: PropTypes.func
};
