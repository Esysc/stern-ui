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

  const selected = useMemo(() => {
    if (!config.query) return [];
    if (!config.container) return [config.query];
    return [`${config.query}/${config.container}`];
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
          const pc = newSelected[0] || '';
          const [pod, container] = pc.split('/');
          updateConfig('query', pod || '');
          updateConfig('container', container || '');
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
