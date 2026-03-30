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
export function StreamPanel({ streamId, initialConfig, streamTabs, isDetached, onReattach, onStreamStateChange, isActive = true }) {
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
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [wrapText, setWrapText] = useState(false);

  // WebSocket connection
  const {
    logs,
    isConnected,
    isConnecting,
    connectionError,
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

  // Share latest stream runtime state with parent so detach can preserve live state.
  useEffect(() => {
    onStreamStateChange?.({ streamId, config, isConnected });
  }, [streamId, config, isConnected, onStreamStateChange]);

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
        const cleanConfig = { ...config };
        delete cleanConfig.wasConnected;
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

  const handleResetFilters = useCallback(() => {
    setSearchFilter('');
    setLevelFilter('all');
  }, []);

  const activeFilterChips = useMemo(() => {
    const chips = [];

    if (searchFilter.trim()) {
      chips.push({ key: 'search', label: `Search: ${searchFilter.trim()}`, onRemove: () => setSearchFilter('') });
    }

    if (levelFilter !== 'all') {
      chips.push({ key: 'level', label: `Level: ${levelFilter}`, onRemove: () => setLevelFilter('all') });
    }

    if (config.namespace) {
      chips.push({ key: 'namespace', label: `Namespace: ${config.namespace}`, onRemove: () => setConfig(prev => ({ ...prev, namespace: '' })) });
    }

    if (config.query && config.query !== '.') {
      chips.push({ key: 'query', label: `Query: ${config.query}`, onRemove: () => setConfig(prev => ({ ...prev, query: '.' })) });
    }

    if (config.include) {
      chips.push({ key: 'include', label: `Include: ${config.include}`, onRemove: () => setConfig(prev => ({ ...prev, include: '' })) });
    }

    if (config.exclude) {
      chips.push({ key: 'exclude', label: `Exclude: ${config.exclude}`, onRemove: () => setConfig(prev => ({ ...prev, exclude: '' })) });
    }

    if (config.container) {
      chips.push({ key: 'container', label: `Container: ${config.container}`, onRemove: () => setConfig(prev => ({ ...prev, container: '' })) });
    }

    return chips;
  }, [searchFilter, levelFilter, config]);

  useEffect(() => {
    const isEditableTarget = (target) => {
      if (!(target instanceof HTMLElement)) return false;

      const tag = target.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
    };

    const handleKeyDown = (event) => {
      if (isEditableTarget(event.target)) return;
      if (!(event.altKey && event.shiftKey)) return;

      const key = event.key.toLowerCase();

      if (key === 'k') {
        event.preventDefault();
        setShowShortcuts(prev => !prev);
        return;
      }

      if (key === 'c') {
        event.preventDefault();
        if (isConnected) {
          disconnect();
        } else if (!isConnecting) {
          handleConnect();
        }
        return;
      }

      if (key === 'p' && isConnected) {
        event.preventDefault();
        togglePause();
        return;
      }

      if (key === 'l') {
        event.preventDefault();
        clearLogs();
        return;
      }

      if (key === 'r') {
        event.preventDefault();
        handleResetFilters();
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [clearLogs, disconnect, handleConnect, handleResetFilters, isConnected, isConnecting, togglePause]);

  return (
    <div className="p-6">
      {/* Help toggle button */}
      <div className="mb-4 flex flex-wrap gap-3">
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-expanded={showHelp}
          aria-controls={`stream-help-${streamId}`}
        >
          {showHelp ? '📚 Hide Help' : '📚 Show Help'}
        </button>
        <button
          onClick={() => setShowShortcuts(!showShortcuts)}
          className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-expanded={showShortcuts}
          aria-controls={`stream-shortcuts-${streamId}`}
        >
          {showShortcuts ? '⌨ Hide Shortcuts' : '⌨ Shortcuts'}
        </button>
      </div>

      {/* Help panel */}
      <StreamHelp isVisible={showHelp} onClose={() => setShowHelp(false)} panelId={`stream-help-${streamId}`} />

      {showShortcuts && (
        <div id={`stream-shortcuts-${streamId}`} className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6 text-sm">
          <div className="font-semibold text-gray-200 mb-3">Keyboard Shortcuts</div>
          <div className="grid gap-2 md:grid-cols-2 text-gray-300">
            <div><span className="text-blue-300">Alt+Shift+C</span> connect or disconnect</div>
            <div><span className="text-blue-300">Alt+Shift+P</span> pause or resume stream</div>
            <div><span className="text-blue-300">Alt+Shift+L</span> clear visible logs</div>
            <div><span className="text-blue-300">Alt+Shift+R</span> reset log filters</div>
            <div><span className="text-blue-300">Alt+Shift+K</span> toggle shortcuts panel</div>
            <div><span className="text-blue-300">Esc</span> exit fullscreen or close menus</div>
          </div>
        </div>
      )}

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
          isConnecting={isConnecting}
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
        <div className="flex gap-4 items-end mb-4 flex-wrap">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title={showSettings ? 'Hide settings' : 'Show settings'}
            aria-label={showSettings ? 'Hide stream settings' : 'Show stream settings'}
            aria-expanded={showSettings}
          >
            {showSettings ? '▲' : '▼'}
          </button>
          <div className="flex-1 min-w-[16rem]">
            <LogFilters
              searchFilter={searchFilter}
              onSearchChange={setSearchFilter}
              levelFilter={levelFilter}
              onLevelChange={setLevelFilter}
              onResetFilters={handleResetFilters}
              levelCounts={levelCounts}
            />
          </div>

          {isDetached ? (
            <div className="flex-shrink-0 ml-auto">
              <button
                onClick={() => onReattach(config)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                ↴ Reattach to Main Window
              </button>
            </div>
          ) : streamTabs && (
            <div className="flex-shrink-0 ml-auto max-w-full overflow-x-auto">
              {streamTabs}
            </div>
          )}
        </div>
      )}

      {!isFullscreen && activeFilterChips.length > 0 && (
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
  streamId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  initialConfig: PropTypes.object,
  streamTabs: PropTypes.node,
  isDetached: PropTypes.bool,
  onReattach: PropTypes.func,
  onStreamStateChange: PropTypes.func,
  isActive: PropTypes.bool
};
