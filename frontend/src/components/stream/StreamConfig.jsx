import { memo, useMemo } from 'react';
import PropTypes from 'prop-types';
import { AutocompleteField, PodContainerSelect } from '../common';

/**
 * Configuration form for a log stream
 */
const StreamConfigComponent = ({
  config,
  onChange,
  autocomplete,
  streamId
}) => {
  const updateConfig = (key, value) => {
    onChange({ ...config, [key]: value });
  };

  const idPrefix = `stream-${streamId}`;

  // config.container holds a comma-separated list of "pod/container" tokens,
  // allowing multiple containers (across the same or different pods) to be
  // tailed at once without reconnecting per selection. A single legacy
  // whole-pod value (no "/") is read from config.query for older saved configs.
  const selected = useMemo(() => {
    if (config.container) {
      return config.container.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (config.query && config.query !== '.') return [config.query];
    return [];
  }, [config.query, config.container]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      <AutocompleteField
        label="Namespace"
        value={config.namespace}
        onChange={(v) => updateConfig('namespace', v)}
        placeholder="default"
        suggestions={autocomplete.namespaces}
        idPrefix={idPrefix}
      />
      <PodContainerSelect
        options={autocomplete.options}
        selected={selected}
        onChange={(newSelected) => {
          if (newSelected.length === 0) {
            updateConfig('container', '');
            updateConfig('query', '.');
            return;
          }
          // A single whole-pod selection keeps using the plain "query" field
          // for backward compatibility with saved configs and manual regex entry.
          if (newSelected.length === 1 && !newSelected[0].includes('/')) {
            updateConfig('container', '');
            updateConfig('query', newSelected[0]);
            return;
          }
          onChange({ ...config, container: newSelected.join(','), query: '.' });
        }}
        idPrefix={idPrefix}
      />
    </div>
  );
};

StreamConfigComponent.propTypes = {
  config: PropTypes.shape({
    namespace: PropTypes.string,
    query: PropTypes.string,
    container: PropTypes.string,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  autocomplete: PropTypes.shape({
    namespaces: PropTypes.arrayOf(PropTypes.string),
    options: PropTypes.arrayOf(PropTypes.shape({
      pod: PropTypes.string.isRequired,
      containers: PropTypes.arrayOf(PropTypes.string).isRequired,
    })).isRequired,
  }).isRequired,
  streamId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};

export const StreamConfig = memo(StreamConfigComponent);
