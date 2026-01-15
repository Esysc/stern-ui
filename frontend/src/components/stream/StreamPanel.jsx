import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { StreamConfig } from './StreamConfig';

// Debug logging helper
const debug = (...args) => {
  if (import.meta.env.VITE_DEBUG === 'true' || localStorage.getItem('stern-ui-debug') === 'true') {
    console.log('[StreamPanel]', ...args);
  }
};
import { StreamActions } from './StreamActions';
import { StreamHelp } from './StreamHelp';
import { LogViewer, LogFilters, LogStatusBar } from '../logs';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useAutoComplete } from '../../hooks/useAutoComplete';
import { loadConfig, saveConfig } from '../../utils/storage';
import {
  buildPodColorMap,
  countLogLevels,
  filterLogs,
  parseHighlightPatterns,
  formatLogsAsText,
  formatLogsAsJson
} from '../../utils/logUtils';
import { downloadFile, generateLogFilename } from '../../utils/helpers';
import { DEFAULT_CONFIG } from '../../constants';

/**
 * Main stream panel containing config, controls, and log viewer
 */
export function StreamPanel({ streamId, initialConfig, streamTabs, isDetached, onReattach, isActive = true }) {
  // Load config from storage or use default
  // Use initialConfig as key dependency so component remounts when it changes
  const [config, setConfig] = useState(() => {
    // Priority: initialConfig (for detached windows) > storage > default
    if (initialConfig) {
      // For detached windows, mark as should auto-connect
      // Ensure all critical fields are present
      const detachedConfig = {
        ...DEFAULT_CONFIG,
        ...initialConfig,
        wasConnected: true,
        // Force query to be at least '.' if missing
        query: initialConfig.query || '.'
      };
      debug('Initializing detached window with config:', detachedConfig);
      return detachedConfig;
    }
    return loadConfig(streamId);
  });

  const [searchFilter, setSearchFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [wrapText, setWrapText] = useState(false);

  // WebSocket connection
  const {
    logs,
    isConnected,
    isPaused,
    connect,
    disconnect,
    togglePause,
    clearLogs,
    getBufferCount
  } = useWebSocket();

  // Autocomplete data
  const autocomplete = useAutoComplete(
    config.context,
    config.namespace
  );

  // Auto-populate context if missing and contexts are available (only on initial load)
  useEffect(() => {
    if (!config.context && autocomplete.contexts.length > 0 && !isConnected) {
      debug('Auto-populating missing context:', autocomplete.contexts[0]);
      setConfig(prev => ({ ...prev, context: autocomplete.contexts[0] }));
    }
  }, [config.context, autocomplete.contexts, isConnected]);

  // Save config when persistSettings is enabled
  // But also always save it for detach/reattach functionality
  useEffect(() => {
    saveConfig(streamId, { ...config, wasConnected: isConnected });
  }, [config, streamId, isConnected]);

  // Disable autoscroll when switching to custom time range (historical logs)
  useEffect(() => {
    if (config.since === 'custom' && autoScroll) {
      setAutoScroll(false);
    }
  }, [config.since, autoScroll]);

  // Auto-connect when initialConfig is provided (detached window or reattach)
  // OR when loading from storage and stream was previously connected
  useEffect(() => {
    // Auto-connect if: has initialConfig OR was previously connected, AND have a query
    const shouldAutoConnect = (initialConfig || config.wasConnected) && !isConnected && config.query;
    if (shouldAutoConnect) {
      debug('Auto-connecting...', { initialConfig: !!initialConfig, wasConnected: config.wasConnected });
      // Small delay to ensure component is fully mounted
      const timer = setTimeout(() => {
        // Remove wasConnected before connecting
        const { wasConnected: _wasConnected, ...cleanConfig } = config;
        connect(cleanConfig);
      }, 200);
      return () => clearTimeout(timer);
    } else {
      debug('Not auto-connecting', {
        hasInitialConfig: !!initialConfig,
        wasConnected: config.wasConnected,
        isConnected,
        hasQuery: !!config.query
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once when component mounts

  // Computed values - skip expensive computations when not active
  const podColorMap = useMemo(() => {
    if (!isActive) return {};
    return buildPodColorMap(logs);
  }, [logs, isActive]);

  const levelCounts = useMemo(() => {
    if (!isActive) return { error: 0, warn: 0, info: 0, debug: 0, total: 0 };
    return countLogLevels(logs);
  }, [logs, isActive]);

  const highlightPatterns = useMemo(
    () => parseHighlightPatterns(config.highlight),
    [config.highlight]
  );

  const filteredLogs = useMemo(() => {
    if (!isActive) return []; // Don't filter logs when not active
    return filterLogs(logs, {
      levelFilter,
      searchFilter,
      // Client-side filters that apply instantly without reconnection
      query: config.query,
      since: config.since,
      include: config.include,
      exclude: config.exclude,
      container: config.container,
      excludeContainer: config.excludeContainer,
      excludePod: config.excludePod
      // NOTE: namespace, containerState, context, allNamespaces require reconnection
    });
  }, [logs, levelFilter, searchFilter, config.query, config.since, config.include, config.exclude, config.container, config.excludeContainer, config.excludePod, isActive]);

  // Fullscreen mode - handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    globalThis.addEventListener('keydown', handleEscape);
    return () => globalThis.removeEventListener('keydown', handleEscape);
  }, [isFullscreen]);

  // Handlers
  const handleConnect = useCallback(() => {
    // eslint-disable-next-line no-unused-vars
    const { wasConnected, ...cleanConfig } = config;
    debug('Connecting with config:', cleanConfig);
    connect(cleanConfig);
  }, [connect, config]);

  const handleConfigBlur = useCallback(() => {
    // Save config when field loses focus
    saveConfig(streamId, config);
  }, [streamId, config]);

  // Auto-reconnect when essential server-side filters change (if already connected)
  const prevConfigRef = useRef(config);
  const reconnectTimerRef = useRef(null);

  useEffect(() => {
    if (!isConnected) {
      // Update ref even when disconnected to avoid reconnecting on initial connect
      prevConfigRef.current = config;
      return;
    }

    const prev = prevConfigRef.current;
    const curr = config;

    // Only reconnect for filters that CANNOT be applied client-side
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
      debug('Essential server-side filter changed, auto-reconnecting...');

      // Clear any pending reconnect
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }

      disconnect();

      // Debounce reconnection to avoid rapid reconnects
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

  const handleDownloadText = useCallback(() => {
    const content = formatLogsAsText(filteredLogs);
    downloadFile(content, generateLogFilename('txt'), 'text/plain');
  }, [filteredLogs]);

  const handleDownloadJson = useCallback(() => {
    const content = formatLogsAsJson(filteredLogs);
    downloadFile(content, generateLogFilename('json'), 'application/json');
  }, [filteredLogs]);

  const handleAutoScrollToggle = useCallback(() => {
    const newAutoScroll = !autoScroll;
    setAutoScroll(newAutoScroll);

    // When autoscroll is disabled, pause the stream
    // When autoscroll is enabled, resume the stream
    if (isConnected && ((newAutoScroll && isPaused) || (!newAutoScroll && !isPaused))) {
      togglePause();
    }
  }, [autoScroll, isPaused, isConnected, togglePause]);

  return (
    <div className="p-6">
      {/* Help toggle button */}
      <div className="mb-4">
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium transition-colors"
        >
          {showHelp ? '📚 Hide Help' : '📚 Show Help'}
        </button>
      </div>

      {/* Help panel */}
      <StreamHelp isVisible={showHelp} onClose={() => setShowHelp(false)} />

      {!isFullscreen && showSettings && (
        <div className="bg-gray-800 p-6 rounded-lg mb-6 border border-gray-700">
        <StreamConfig
          config={config}
          onChange={setConfig}
          onConfigBlur={handleConfigBlur}
          autocomplete={autocomplete}
          streamId={streamId}
        />

        <StreamActions
          isConnected={isConnected}
          isPaused={isPaused}
          autoScroll={autoScroll}
          bufferCount={getBufferCount()}
          onConnect={handleConnect}
          onDisconnect={disconnect}
          onTogglePause={togglePause}
          onClear={clearLogs}
          onAutoScrollToggle={handleAutoScrollToggle}
          onDownloadText={handleDownloadText}
          onDownloadJson={handleDownloadJson}
        />
        </div>
      )}

      {!isFullscreen && (
        <div className="flex gap-4 items-end mb-4">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            title={showSettings ? 'Hide settings' : 'Show settings'}
          >
            {showSettings ? '▲' : '▼'}
          </button>
          <LogFilters
            searchFilter={searchFilter}
            onSearchChange={setSearchFilter}
            levelFilter={levelFilter}
            onLevelChange={setLevelFilter}
            levelCounts={levelCounts}
          />

          {isDetached ? (
            <div className="flex-shrink-0 ml-auto">
              <button
                onClick={() => onReattach(config)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                ↴ Reattach to Main Window
              </button>
            </div>
          ) : streamTabs && (
            <div className="flex-shrink-0 ml-auto">
              {streamTabs}
            </div>
          )}
        </div>
      )}

      {(() => {
        let containerClasses = 'bg-black border border-gray-800 rounded-lg flex flex-col ';
        if (isFullscreen) {
          containerClasses += 'fixed inset-4 z-50 h-auto';
        } else if (showSettings) {
          containerClasses += 'h-[calc(100vh-650px)] min-h-[400px]';
        } else {
          containerClasses += 'h-[calc(100vh-350px)] min-h-[600px]';
        }
        return <div className={containerClasses}>
        <LogStatusBar
          isConnected={isConnected}
          isPaused={isPaused}
          filteredCount={filteredLogs.length}
          totalCount={logs.length}
          podCount={Object.keys(podColorMap).length}
          levelCounts={levelCounts}
        />

        <LogViewer
          logs={filteredLogs}
          podColorMap={podColorMap}
          highlightPatterns={highlightPatterns}
          autoScroll={autoScroll}
          fontSize={fontSize}
          isFullscreen={isFullscreen}
          showLineNumbers={showLineNumbers}
          wrapText={wrapText}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          onFontSizeChange={setFontSize}
          onToggleLineNumbers={() => setShowLineNumbers(!showLineNumbers)}
          onToggleWrap={() => setWrapText(!wrapText)}
        />
        </div>;
      })()}
    </div>
  );
}


StreamPanel.propTypes = {
  streamId: PropTypes.string.isRequired,
  initialConfig: PropTypes.object,
  streamTabs: PropTypes.node,
  isDetached: PropTypes.bool,
  onReattach: PropTypes.func,
  isActive: PropTypes.bool
};
