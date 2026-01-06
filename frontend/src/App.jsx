import { useState, useEffect } from 'react';
import { Header, StreamTabs, StreamPanel } from './components';
import { loadGlobalSettings, saveGlobalSettings } from './utils/storage';

function App() {
  const [streams, setStreams] = useState([{ id: 1, name: 'Stream 1' }]);
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

  return (
    <div className="min-h-screen bg-gray-900 text-white font-mono">
      <Header
        persistSettings={persistSettings}
        onPersistSettingsChange={setPersistSettings}
      />

      <StreamTabs
        streams={streams}
        activeStreamId={activeStreamId}
        onSelectStream={setActiveStreamId}
        onAddStream={addStream}
        onRemoveStream={removeStream}
      />

      {streams
        .filter(stream => stream.id === activeStreamId)
        .map(stream => (
          <StreamPanel
            key={stream.id}
            streamId={stream.id}
            persistSettings={persistSettings}
          />
        ))
      }
    </div>
  );
}

export default App;
