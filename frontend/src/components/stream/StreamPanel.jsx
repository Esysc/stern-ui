import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { StreamConfig } from './StreamConfig';
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
export function StreamPanel({ streamId, persistSettings }) {
  // Load config from storage or use default
  const [config, setConfig] = useState(() => {
    if (persistSettings) {
      return loadConfig(streamId);
    }
    return { ...DEFAULT_CONFIG };
  });

  const [searchFilter, setSearchFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontSize, setFontSize] = useState(14);

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
    config.namespace,
    config.allNamespaces
  );

  // Save config when persistSettings is enabled
  useEffect(() => {
    if (persistSettings) {
      saveConfig(streamId, config);
    }
  }, [config, persistSettings, streamId]);

  // Track if we should auto-reconnect (don't reconnect on first render)
  const isFirstRender = useRef(true);

  // Auto-reconnect when config changes while connected
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (isConnected) {
      disconnect();
      setTimeout(() => connect(config), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]); // Only watch config changes, not connect/disconnect/isConnected

  // Computed values
  const podColorMap = useMemo(() => buildPodColorMap(logs), [logs]);
  const levelCounts = useMemo(() => countLogLevels(logs), [logs]);
  const highlightPatterns = useMemo(
    () => parseHighlightPatterns(config.highlight),
    [config.highlight]
  );

  const filteredLogs = useMemo(
    () => filterLogs(logs, { levelFilter, searchFilter }),
    [logs, levelFilter, searchFilter]
  );

  // Fullscreen mode - handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isFullscreen]);

  // Handlers
  const handleConnect = useCallback(() => {
    connect(config);
  }, [connect, config]);

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

      {!isFullscreen && (
        <div className="bg-gray-800 p-6 rounded-lg mb-6 border border-gray-700">
        <StreamConfig
          config={config}
          onChange={setConfig}
          autocomplete={autocomplete}
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
        <LogFilters
        searchFilter={searchFilter}
        onSearchChange={setSearchFilter}
        levelFilter={levelFilter}
        onLevelChange={setLevelFilter}
        levelCounts={levelCounts}
        />
      )}

      <div className={`bg-black border border-gray-800 rounded-lg flex flex-col ${
        isFullscreen ? 'fixed inset-4 z-50 h-auto' : 'h-[calc(100vh-650px)] min-h-[400px]'
      }`}>
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
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          onFontSizeChange={setFontSize}
        />
      </div>
    </div>
  );
}


StreamPanel.propTypes = {
  streamId: PropTypes.string.isRequired,
  persistSettings: PropTypes.bool
};

StreamPanel.defaultProps = {
  persistSettings: false
};
