import { useState, useEffect, useMemo } from 'react';
import { Header, StreamTabs, StreamPanel } from './components';
import { STORAGE_KEY } from './constants';
import { clearAllSettings } from './utils/storage';

function App() {
  // Check if we're in detached mode
  const isDetached = useMemo(() => {
    const params = new URLSearchParams(globalThis.location.search);
    return params.has('detached');
  }, []);

  const [streams, setStreams] = useState(() => {
    if (isDetached) {
      // Load config from URL params
      const params = new URLSearchParams(globalThis.location.search);
      const configStr = params.get('config');
      const name = params.get('name') || 'Detached Stream';
      const config = configStr ? JSON.parse(decodeURIComponent(configStr)) : {};

      // Set window title
      document.title = name;

      return [{ id: 1, name, config }];
    }
    return [{ id: 1, name: 'Stream 1' }];
  });
  const [activeStreamId, setActiveStreamId] = useState(1);

  // Listen for reattach messages from detached windows
  useEffect(() => {
    if (isDetached) return;

    const handleMessage = (event) => {
      if (event.data?.type === 'REATTACH_STREAM') {
        const { name, config } = event.data;
        const newId = Math.max(...streams.map(s => s.id), 0) + 1;
        setStreams([...streams, { id: newId, name, config }]);
        setActiveStreamId(newId);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isDetached, streams]);

  const handleReattach = (currentConfig) => {
    if (!isDetached || !window.opener) return;

    const stream = streams[0];

    // Send message to main window with current config
    window.opener.postMessage({
      type: 'REATTACH_STREAM',
      name: stream.name,
      config: currentConfig
    }, globalThis.location.origin);

    // Close this window
    window.close();
  };

  const handleClearSettings = () => {
    if (globalThis.confirm('Are you sure you want to clear all saved settings? This will reset all stream configurations and disconnect all streams.')) {
      clearAllSettings();
      // Reload the page to reset all streams
      globalThis.location.reload();
    }
  };

  const addStream = () => {
    const newId = Math.max(...streams.map(s => s.id)) + 1;
    setStreams([...streams, { id: newId, name: `Stream ${newId}` }]);
    setActiveStreamId(newId);
  };

  const removeStream = (id, allowRemoveLast = false) => {
    if (streams.length === 1 && !allowRemoveLast) return;
    const newStreams = streams.filter(s => s.id !== id);
    setStreams(newStreams);
    if (activeStreamId === id && newStreams.length > 0) {
      setActiveStreamId(newStreams[0].id);
    }
  };

  const detachStream = (id) => {
    const stream = streams.find(s => s.id === id);
    if (!stream) return;

    // Get current config from localStorage using the same key format as storage.js
    const configKey = `${STORAGE_KEY}-${id}`;
    const configStr = localStorage.getItem(configKey);
    const config = configStr ? JSON.parse(configStr) : {};

    // Build URL with config
    const params = new URLSearchParams();
    params.set('detached', 'true');
    params.set('name', stream.name);
    params.set('config', encodeURIComponent(JSON.stringify(config)));

    // Open in new window with title
    const url = `${globalThis.location.origin}${globalThis.location.pathname}?${params.toString()}`;
    const newWindow = globalThis.open(url, '_blank', 'width=1200,height=800');

    // Set window title (will be overridden by the detached window)
    if (newWindow) {
      newWindow.document.title = stream.name;
    }

    // If this is the last stream, create a new one before removing
    if (streams.length === 1) {
      const newId = Math.max(...streams.map(s => s.id)) + 1;
      setStreams([{ id: newId, name: `Stream ${newId}` }]);
      setActiveStreamId(newId);
    } else {
      // Remove stream from main window after successful detach
      removeStream(id, false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white font-mono">
      <Header isDetached={isDetached} onClearSettings={handleClearSettings} />

      {streams.map(stream => (
        <div key={stream.id} style={{ display: stream.id === activeStreamId ? 'block' : 'none' }}>
          <StreamPanel
            streamId={stream.id}
            initialConfig={stream.config}
            isDetached={isDetached}
            onReattach={handleReattach}
            isActive={stream.id === activeStreamId}
            streamTabs={!isDetached && (
              <StreamTabs
                streams={streams}
                activeStreamId={activeStreamId}
                onSelectStream={setActiveStreamId}
                onAddStream={addStream}
                onRemoveStream={removeStream}
                onDetachStream={detachStream}
              />
            )}
          />
        </div>
      ))
      }
    </div>
  );
}

export default App;
