import { useState, memo } from 'react';
import PropTypes from 'prop-types';
import { InputField, SelectField, CheckboxField, AutocompleteField } from '../common';
import { CONTAINER_STATE_OPTIONS, TIMESTAMP_OPTIONS, SINCE_OPTIONS } from '../../constants';

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
          onChange={(e) => updateConfig('since', e.target.value)}
          onBlur={onConfigBlur}
          options={SINCE_OPTIONS}
          idPrefix={idPrefix}
        />
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
