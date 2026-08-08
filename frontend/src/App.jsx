import { useEffect, useState, useCallback } from 'react';
import { Header, StreamPanel } from './components';
import { EventsPanel, HealthPanel, ApplyPanel, ResourcesPanel } from './components/management';
import { clearAllSettings, deleteConfig, loadAllConfigs } from './utils/storage';
import { cachedFetch } from './utils/cache';

const CLUSTER_KEY = 'stern-ui-cluster';

function nextStreamId(streams) {
  const maxId = streams.reduce((max, s) => Math.max(max, Number(s.id) || 0), 0);
  return String(maxId + 1);
}

function App() {
  const [view, setView] = useState('logs');
  const [contexts, setContexts] = useState([]);
  const [context, setContext] = useState(() => globalThis.localStorage.getItem(CLUSTER_KEY) || '');
  const [streams, setStreams] = useState(() => {
    const saved = loadAllConfigs();
    if (saved.length > 0) return saved;
    return [{ id: '1', config: {} }];
  });

  useEffect(() => {
    cachedFetch('/api/contexts', { ttl: 60_000 })
      .catch(() => [])
      .then((list) => {
        setContexts(list);
        setContext((prev) => prev || (list[0] || ''));
      });
  }, []);

  useEffect(() => {
    if (context) globalThis.localStorage.setItem(CLUSTER_KEY, context);
  }, [context]);

  const handleAddStream = useCallback(() => {
    setStreams(prev => {
      const id = nextStreamId(prev);
      return [...prev, { id, config: { context } }];
    });
    setView('logs');
  }, [context]);

  const handleRemoveStream = useCallback((id) => {
    setStreams(prev => prev.filter(s => s.id !== id));
    deleteConfig(id);
  }, []);

  const handleStreamStateChange = useCallback(({ streamId, config }) => {
    setStreams(prev => prev.map(s => (s.id === String(streamId) ? { ...s, config } : s)));
  }, []);

  const handleClearSettings = () => {
    if (globalThis.confirm('Are you sure you want to clear all saved settings? This will reset the stream configuration and disconnect.')) {
      clearAllSettings();
      globalThis.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white font-mono">
      <Header
        onClearSettings={handleClearSettings}
        contexts={contexts}
        context={context}
        onContextChange={setContext}
        view={view}
        onViewChange={setView}
        onAddStream={handleAddStream}
        streamCount={streams.length}
      />

      {view === 'logs' && streams.map((s) => (
        <StreamPanel
          key={s.id}
          streamId={s.id}
          initialConfig={s.config}
          context={context}
          isActive={true}
          onRemove={() => handleRemoveStream(s.id)}
          onStreamStateChange={handleStreamStateChange}
        />
      ))}
      {view === 'events' && <EventsPanel context={context} />}
      {view === 'health' && <HealthPanel context={context} />}
      {view === 'resources' && <ResourcesPanel context={context} />}
      {view === 'apply' && <ApplyPanel context={context} />}
    </div>
  );
}

export default App;
