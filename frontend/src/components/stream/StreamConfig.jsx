import { useState, memo } from 'react';
import PropTypes from 'prop-types';
import { InputField, SelectField, CheckboxField, AutocompleteField } from '../common';
import { CONTAINER_STATE_OPTIONS, TIMESTAMP_OPTIONS } from '../../constants';

/**
 * Configuration form for a log stream
 */
const StreamConfigComponent = ({
  config,
  onChange,
  autocomplete
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateConfig = (key, value) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <>
      {/* Basic Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <AutocompleteField
          label="Namespace"
          value={config.namespace}
          onChange={(v) => updateConfig('namespace', v)}
          placeholder="default"
          suggestions={autocomplete.namespaces}
          disabled={config.allNamespaces}
        />
        <InputField
          label="Selector (label)"
          value={config.selector}
          onChange={(e) => updateConfig('selector', e.target.value)}
          placeholder="app=myapp or app=web,tier=frontend"
        />
        <AutocompleteField
          label="Query (pod name/regex)"
          value={config.query}
          onChange={(v) => updateConfig('query', v)}
          placeholder=".*nginx.* or deployment/nginx or ."
          suggestions={autocomplete.pods}
        />
        <InputField
          label="Since"
          value={config.since}
          onChange={(e) => updateConfig('since', e.target.value)}
          placeholder="5m, 1h, 24h"
        />
      </div>

      {/* Container Filtering */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <AutocompleteField
          label="Container name (regex)"
          value={config.container}
          onChange={(v) => updateConfig('container', v)}
          placeholder="nginx, app, worker, etc."
          suggestions={autocomplete.containers}
        />
        <AutocompleteField
          label="Exclude Containers"
          value={config.excludeContainer}
          onChange={(v) => updateConfig('excludeContainer', v)}
          placeholder="istio-proxy,envoy"
          suggestions={autocomplete.containers}
          multiple={true}
        />
        <AutocompleteField
          label="Exclude Pods"
          value={config.excludePod}
          onChange={(v) => updateConfig('excludePod', v)}
          placeholder="kube-proxy.*"
          suggestions={autocomplete.pods}
          multiple={true}
        />
        <SelectField
          label="Container State"
          value={config.containerState}
          onChange={(e) => updateConfig('containerState', e.target.value)}
          options={CONTAINER_STATE_OPTIONS}
        />
      </div>

      {/* Log Filtering */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <InputField
          label="Include (regex, highlighted)"
          value={config.include}
          onChange={(e) => updateConfig('include', e.target.value)}
          placeholder="error,warn"
        />
        <InputField
          label="Exclude (regex)"
          value={config.exclude}
          onChange={(e) => updateConfig('exclude', e.target.value)}
          placeholder="health,ping"
        />
        <InputField
          label="Highlight (regex)"
          value={config.highlight}
          onChange={(e) => updateConfig('highlight', e.target.value)}
          placeholder="ERROR,WARN"
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
            placeholder="-1 (all), 100"
          />
          <AutocompleteField
            label="Node"
            value={config.node}
            onChange={(v) => updateConfig('node', v)}
            placeholder="node-name"
            suggestions={autocomplete.nodes}
          />
          <AutocompleteField
            label="Context"
            value={config.context}
            onChange={(v) => updateConfig('context', v)}
            placeholder="minikube"
            suggestions={autocomplete.contexts}
          />
          <InputField
            label="Max Log Requests"
            value={config.maxLogRequests}
            onChange={(e) => updateConfig('maxLogRequests', e.target.value)}
            placeholder="50"
          />
          <SelectField
            label="Timestamps"
            value={config.timestamps}
            onChange={(e) => updateConfig('timestamps', e.target.value)}
            options={TIMESTAMP_OPTIONS}
          />
          <CheckboxField
            label="All Namespaces"
            checked={config.allNamespaces}
            onChange={(e) => updateConfig('allNamespaces', e.target.checked)}
          />
          <CheckboxField
            label="Init Containers"
            checked={config.initContainers}
            onChange={(e) => updateConfig('initContainers', e.target.checked)}
          />
          <CheckboxField
            label="Ephemeral Containers"
            checked={config.ephemeralContainers}
            onChange={(e) => updateConfig('ephemeralContainers', e.target.checked)}
          />
          <CheckboxField
            label="No Follow (exit after logs)"
            checked={config.noFollow}
            onChange={(e) => updateConfig('noFollow', e.target.checked)}
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
  autocomplete: PropTypes.shape({
    namespaces: PropTypes.arrayOf(PropTypes.string),
    pods: PropTypes.arrayOf(PropTypes.string),
    containers: PropTypes.arrayOf(PropTypes.string),
    nodes: PropTypes.arrayOf(PropTypes.string),
    contexts: PropTypes.arrayOf(PropTypes.string),
  }).isRequired,
};

// Memoize to prevent re-renders when logs update
export const StreamConfig = memo(StreamConfigComponent);
