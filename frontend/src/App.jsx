import { useState, useEffect, useMemo } from 'react';
import { Header, StreamTabs, StreamPanel } from './components';
import { loadGlobalSettings, saveGlobalSettings } from './utils/storage';

function App() {
  // Check if we're in detached mode
  const isDetached = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('detached');
  }, []);

  const [streams, setStreams] = useState(() => {
    if (isDetached) {
      // Load config from URL params
      const params = new URLSearchParams(window.location.search);
      const configStr = params.get('config');
      const name = params.get('name') || 'Detached Stream';
      const config = configStr ? JSON.parse(decodeURIComponent(configStr)) : {};
      return [{ id: 1, name, config }];
    }
    return [{ id: 1, name: 'Stream 1' }];
  });
  const [activeStreamId, setActiveStreamId] = useState(1);
  const [persistSettings, setPersistSettings] = useState(() => {
    return loadGlobalSettings().persistSettings;
  });

  // Save global settings when persistSettings changes
  useEffect(() => {
    saveGlobalSettings({ persistSettings });
  }, [persistSettings]);

  const addStream = () => {
    const newId = Math.max(...streams.map(s => s.id)) + 1;
    setStreams([...streams, { id: newId, name: `Stream ${newId}` }]);
    setActiveStreamId(newId);
  };

  const removeStream = (id) => {
    if (streams.length === 1) return;
    const newStreams = streams.filter(s => s.id !== id);
    setStreams(newStreams);
    if (activeStreamId === id) {
      setActiveStreamId(newStreams[0].id);
    }
  };

  const detachStream = (id) => {
    const stream = streams.find(s => s.id === id);
    if (!stream) return;

    // Get current config from localStorage
    const configKey = `stream-${id}-config`;
    const configStr = localStorage.getItem(configKey);
    const config = configStr ? JSON.parse(configStr) : {};

    // Build URL with config
    const params = new URLSearchParams();
    params.set('detached', 'true');
    params.set('name', stream.name);
    params.set('config', encodeURIComponent(JSON.stringify(config)));

    // Open in new window
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    window.open(url, '_blank', 'width=1200,height=800');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white font-mono">
      <Header
        persistSettings={persistSettings}
        onPersistSettingsChange={setPersistSettings}
      />

      {!isDetached && (
        <StreamTabs
          streams={streams}
          activeStreamId={activeStreamId}
          onSelectStream={setActiveStreamId}
          onAddStream={addStream}
          onRemoveStream={removeStream}
          onDetachStream={detachStream}
        />
      )}

      {streams
        .filter(stream => stream.id === activeStreamId)
        .map(stream => (
          <StreamPanel
            key={stream.id}
            streamId={stream.id}
            persistSettings={persistSettings}
            initialConfig={stream.config}
          />
        ))
      }
    </div>
  );
}

export default App;
