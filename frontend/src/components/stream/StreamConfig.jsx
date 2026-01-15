import { useState, memo, useEffect } from 'react';
import PropTypes from 'prop-types';
import { InputField, SelectField, CheckboxField, AutocompleteField } from '../common';
import { CONTAINER_STATE_OPTIONS, TIMESTAMP_OPTIONS, SINCE_OPTIONS } from '../../constants';
import { getApiBase } from '../../utils/helpers';

/**
 * Configuration form for a log stream
 */
const StreamConfigComponent = ({
  config,
  onChange,
  onConfigBlur,
  autocomplete,
  streamId
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [minDateTime, setMinDateTime] = useState('');

  // Fetch the oldest pod creation time when namespace and query change
  useEffect(() => {
    const fetchOldestPodTime = async () => {
      if (!config.namespace || !autocomplete.namespaces.includes(config.namespace)) {
        setMinDateTime('');
        return;
      }

      // Get the first pod from the query
      const query = config.query || '.';
      const pods = autocomplete.pods;

      if (!pods || pods.length === 0) {
        setMinDateTime('');
        return;
      }

      // Try to get creation time for the first matching pod
      let podName = pods[0];

      // If query is a specific pod name (not a regex), use it
      if (query && query !== '.' && !query.includes('*') && !query.includes('|') && !query.includes('[')) {
        // Check if it's a resource reference like "deployment/nginx"
        if (!query.includes('/')) {
          podName = query;
        }
      }

      try {
        const base = getApiBase();
        const params = new URLSearchParams({
          namespace: config.namespace,
          pod: podName
        });
        if (config.context) {
          params.set('context', config.context);
        }

        const res = await fetch(`${base}/api/pod-metadata?${params}`);
        if (res.ok) {
          const data = await res.json();
          if (data.creationTime) {
            // Backend returns time in YYYY-MM-DDTHH:MM format
            // Ensure it's in the correct format for datetime-local input
            const creationTime = data.creationTime;
            console.log('[StreamConfig] Pod creation time:', creationTime);
            setMinDateTime(creationTime);
          } else {
            console.warn('[StreamConfig] No creationTime in response:', data);
            setMinDateTime('');
          }
        } else {
          console.warn('[StreamConfig] Failed to fetch pod metadata:', res.status);
          setMinDateTime('');
        }
      } catch (e) {
        console.error('Failed to fetch pod metadata:', e);
        setMinDateTime('');
      }
    };

    fetchOldestPodTime();
  }, [config.namespace, config.query, config.context, autocomplete.namespaces, autocomplete.pods]);

  // Compute max datetime directly - current time for absolute mode
  const maxDateTime = config.timeRangeMode === 'absolute' ? new Date().toISOString().slice(0, 16) : '';

  // End date min should be the selected start date (or pod creation time if start not set)
  const endDateMin = config.sinceTime || minDateTime;

  const updateConfig = (key, value) => {
    onChange({ ...config, [key]: value });
  };

  // Use streamId as prefix for all field IDs to ensure uniqueness
  const idPrefix = `stream-${streamId}`;

  return (
    <>
      {/* Basic Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <AutocompleteField
          label="Namespace"
          value={config.namespace}
          onChange={(v) => updateConfig('namespace', v)}
          onBlur={onConfigBlur}
          placeholder="default"
          suggestions={autocomplete.namespaces}
          idPrefix={idPrefix}
        />
        <InputField
          label="Selector (label)"
          value={config.selector}
          onChange={(e) => updateConfig('selector', e.target.value)}
          onBlur={onConfigBlur}
          placeholder="app=myapp or app=web,tier=frontend"
          idPrefix={idPrefix}
        />
        <AutocompleteField
          label="Query (pod name/regex)"
          value={config.query}
          onChange={(v) => updateConfig('query', v)}
          onBlur={onConfigBlur}
          placeholder=".*nginx.* or deployment/nginx or ."
          suggestions={autocomplete.pods}
          idPrefix={idPrefix}
        />
        <SelectField
          label="Since"
          value={config.since}
          onChange={(e) => {
            const newValue = e.target.value;
            // Update both since and timeRangeMode together
            onChange({
              ...config,
              since: newValue,
              timeRangeMode: newValue === 'custom' ? 'absolute' : 'relative'
            });
          }}
          onBlur={onConfigBlur}
          options={SINCE_OPTIONS}
          idPrefix={idPrefix}
        />
        {/* Show date pickers when "Custom date range" is selected */}
        {config.since === 'custom' && (
          <>
            {console.log('[StreamConfig] Rendering date pickers - minDateTime:', minDateTime, 'maxDateTime:', maxDateTime)}
            <InputField
              label="Start Date & Time"
              type="datetime-local"
              value={config.sinceTime}
              onChange={(e) => updateConfig('sinceTime', e.target.value)}
              onBlur={onConfigBlur}
              placeholder="Select start datetime"
              min={minDateTime}
              max={maxDateTime}
              idPrefix={idPrefix}
              compact={true}
              helperText={minDateTime ? `Earliest: ${minDateTime.replace('T', ' ')}` : 'Select namespace to see pod start time'}
            />
            <InputField
              label="End Date & Time"
              type="datetime-local"
              value={config.untilTime}
              onChange={(e) => updateConfig('untilTime', e.target.value)}
              onBlur={onConfigBlur}
              placeholder="Select end datetime"
              min={endDateMin}
              max={maxDateTime}
              idPrefix={idPrefix}
              compact={true}
              helperText={config.sinceTime ? `Must be after start time` : (maxDateTime ? `Latest: ${maxDateTime.replace('T', ' ')}` : 'Loading...')}
            />
          </>
        )}
      </div>

      {/* Container Filtering */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <AutocompleteField
          label="Container name"
          value={config.container}
          onChange={(v) => updateConfig('container', v)}
          onBlur={onConfigBlur}
          placeholder="nginx, app, worker, etc."
          suggestions={autocomplete.containers}
          idPrefix={idPrefix}
        />
        <AutocompleteField
          label="Exclude Containers"
          value={config.excludeContainer}
          onChange={(v) => updateConfig('excludeContainer', v)}
          onBlur={onConfigBlur}
          placeholder="istio-proxy,envoy"
          suggestions={autocomplete.containers}
          multiple={true}
          idPrefix={idPrefix}
        />
        <AutocompleteField
          label="Exclude Pods"
          value={config.excludePod}
          onChange={(v) => updateConfig('excludePod', v)}
          onBlur={onConfigBlur}
          placeholder="kube-proxy.*"
          suggestions={autocomplete.pods}
          multiple={true}
          idPrefix={idPrefix}
        />
        <SelectField
          label="Container State"
          value={config.containerState}
          onChange={(e) => updateConfig('containerState', e.target.value)}
          onBlur={onConfigBlur}
          options={CONTAINER_STATE_OPTIONS}
          idPrefix={idPrefix}
        />
      </div>

      {/* Log Filtering */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <InputField
          label="Include (regex, highlighted)"
          value={config.include}
          onChange={(e) => updateConfig('include', e.target.value)}
          onBlur={onConfigBlur}
          placeholder="error,warn"
          idPrefix={idPrefix}
        />
        <InputField
          label="Exclude (regex)"
          value={config.exclude}
          onChange={(e) => updateConfig('exclude', e.target.value)}
          onBlur={onConfigBlur}
          placeholder="health,ping"
          idPrefix={idPrefix}
        />
        <InputField
          label="Highlight (regex)"
          value={config.highlight}
          onChange={(e) => updateConfig('highlight', e.target.value)}
          onBlur={onConfigBlur}
          placeholder="ERROR,WARN"
          idPrefix={idPrefix}
        />
      </div>

      {/* Advanced Options Toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-sm text-gray-400 hover:text-white mb-4 flex items-center gap-1"
      >
        {showAdvanced ? '▼' : '▶'} Advanced Options
      </button>

      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4 p-4 bg-gray-700/50 rounded">
          <InputField
            label="Tail Lines"
            value={config.tail}
            onChange={(e) => updateConfig('tail', e.target.value)}
            onBlur={onConfigBlur}
            placeholder="-1 (all), 100"
            idPrefix={idPrefix}
          />
          <AutocompleteField
            label="Node"
            value={config.node}
            onChange={(v) => updateConfig('node', v)}
            onBlur={onConfigBlur}
            placeholder="node-name"
            suggestions={autocomplete.nodes}
            idPrefix={idPrefix}
          />
          <AutocompleteField
            label="Context"
            value={config.context}
            onChange={(v) => updateConfig('context', v)}
            onBlur={onConfigBlur}
            placeholder="minikube"
            suggestions={autocomplete.contexts}
            idPrefix={idPrefix}
          />
          <InputField
            label="Max Log Requests"
            value={config.maxLogRequests}
            onChange={(e) => updateConfig('maxLogRequests', e.target.value)}
            onBlur={onConfigBlur}
            placeholder="50"
            idPrefix={idPrefix}
          />
          <SelectField
            label="Timestamps"
            value={config.timestamps}
            onChange={(e) => updateConfig('timestamps', e.target.value)}
            onBlur={onConfigBlur}
            options={TIMESTAMP_OPTIONS}
            idPrefix={idPrefix}
          />
          <CheckboxField
            label="Init Containers"
            checked={config.initContainers}
            onChange={(e) => updateConfig('initContainers', e.target.checked)}
            idPrefix={idPrefix}
          />
          <CheckboxField
            label="Ephemeral Containers"
            checked={config.ephemeralContainers}
            onChange={(e) => updateConfig('ephemeralContainers', e.target.checked)}
            idPrefix={idPrefix}
          />
          <CheckboxField
            label="No Follow (exit after logs)"
            checked={config.noFollow}
            onChange={(e) => updateConfig('noFollow', e.target.checked)}
            idPrefix={idPrefix}
          />
        </div>
      )}
    </>
  );
};

StreamConfigComponent.propTypes = {
  config: PropTypes.shape({
    namespace: PropTypes.string,
    selector: PropTypes.string,
    query: PropTypes.string,
    since: PropTypes.string,
    container: PropTypes.string,
    excludeContainer: PropTypes.string,
    excludePod: PropTypes.string,
    containerState: PropTypes.string,
    include: PropTypes.string,
    exclude: PropTypes.string,
    highlight: PropTypes.string,
    tail: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    node: PropTypes.string,
    context: PropTypes.string,
    maxLogRequests: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    timestamps: PropTypes.string,
    allNamespaces: PropTypes.bool,
    initContainers: PropTypes.bool,
    ephemeralContainers: PropTypes.bool,
    noFollow: PropTypes.bool,
    timeRangeMode: PropTypes.string,
    sinceTime: PropTypes.string,
    untilTime: PropTypes.string,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  onConfigBlur: PropTypes.func,
  autocomplete: PropTypes.shape({
    namespaces: PropTypes.arrayOf(PropTypes.string),
    pods: PropTypes.arrayOf(PropTypes.string),
    containers: PropTypes.arrayOf(PropTypes.string),
    nodes: PropTypes.arrayOf(PropTypes.string),
    contexts: PropTypes.arrayOf(PropTypes.string),
  }).isRequired,
  streamId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};

// Memoize to prevent re-renders when logs update
export const StreamConfig = memo(StreamConfigComponent);
