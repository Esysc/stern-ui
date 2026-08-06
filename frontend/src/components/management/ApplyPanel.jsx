import { useState } from 'react';
import PropTypes from 'prop-types';
import { apiFetch } from '../../utils/api';

/**
 * Apply view - apply or delete a YAML manifest against the selected cluster
 */
export function ApplyPanel({ context }) {
  const [yaml, setYaml] = useState('');
  const [verb, setVerb] = useState('apply');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!context || !yaml.trim()) return;
    setBusy(true);
    setError('');
    setOutput('');
    try {
      const res = await apiFetch(`/api/clusters/apply?context=${encodeURIComponent(context)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verb, yaml })
      });
      setOutput(res.output || 'OK');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-bold mb-4">Apply Manifest</h2>

      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm text-gray-400">Action</span>
        <button
          onClick={() => setVerb('apply')}
          className={`px-3 py-1 rounded text-sm transition-colors ${
            verb === 'apply' ? 'bg-green-700 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
          aria-label="Apply manifest"
        >
          Apply
        </button>
        <button
          onClick={() => setVerb('delete')}
          className={`px-3 py-1 rounded text-sm transition-colors ${
            verb === 'delete' ? 'bg-red-700 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
          aria-label="Delete manifest"
        >
          Delete
        </button>
      </div>

      <textarea
        value={yaml}
        onChange={(e) => setYaml(e.target.value)}
        placeholder={'apiVersion: v1\nkind: Pod\nmetadata:\n  name: example\nspec:\n  containers:\n    - name: app\n      image: nginx'}
        spellCheck={false}
        className="w-full h-72 bg-black border border-gray-800 rounded-lg p-4 font-mono text-sm text-green-300 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
        aria-label="Manifest YAML"
      />

      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={submit}
          disabled={busy || !context || !yaml.trim()}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-sm transition-colors"
        >
          {busy ? 'Running…' : verb === 'apply' ? 'Apply' : 'Delete'}
        </button>
        {!context && <span className="text-gray-500 text-sm">Select a cluster first.</span>}
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm whitespace-pre-wrap">{error}</div>}
      {output && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-sm text-gray-300 whitespace-pre-wrap max-h-72 overflow-auto">
          {output}
        </div>
      )}
    </div>
  );
}

ApplyPanel.propTypes = {
  context: PropTypes.string.isRequired
};
