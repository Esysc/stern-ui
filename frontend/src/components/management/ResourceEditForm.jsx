import { useState, useCallback, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import { apiFetch } from '../../utils/api';
import { diffJsonPatch, jsonPointer } from '../../utils/jsonPatch';

/**
 * Dynamic resource edit form.
 *
 * Renders a Kubernetes resource object as an editable form: scalars become
 * inputs (text / number / checkbox), string arrays become editable lists and
 * nested objects become collapsible sections. Read-only, controller-managed
 * paths are hidden. Saving computes an RFC 6902 JSON Patch diff against the
 * original object so only user-modified fields are sent to the API.
 */

// Top-level / metadata paths that must not be edited through the form
const READ_ONLY_TOP = new Set(['apiVersion', 'kind', 'status']);
const READ_ONLY_META = new Set([
  'managedFields',
  'resourceVersion',
  'uid',
  'creationTimestamp',
  'deletionTimestamp',
  'deletionGracePeriodSeconds',
  'generation',
  'selfLink',
]);

// Annotation keys managed by kubectl/tooling - never expose them for editing
const ANNOTATION_PREFIX_SKIP = 'kubectl.kubernetes.io/';

function isSkippedPath(parts) {
  const [top, second, third] = parts;
  if (READ_ONLY_TOP.has(top)) return true;
  if (top === 'metadata') {
    if (second === undefined) return false;
    if (READ_ONLY_META.has(second)) return true;
    if (second === 'annotations' && typeof third === 'string' && third.startsWith(ANNOTATION_PREFIX_SKIP)) return true;
  }
  return false;
}

/** Structural update at a JSON path without mutating siblings */
function updateAt(obj, parts, updater) {
  if (parts.length === 0) return updater(obj);
  const [head, ...rest] = parts;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  clone[head] = updateAt(clone[head], rest, updater);
  return clone;
}

function scalarEditor(value) {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return 'string';
}

function ScalarInput({ value, onChange }) {
  if (value === null) {
    return (
      <input
        type="text"
        value=""
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:border-cyan-500 outline-none"
        aria-label="Null value"
      />
    );
  }
  const kind = scalarEditor(value);
  if (kind === 'boolean') {
    return (
      <label className="inline-flex items-center gap-2 text-sm text-gray-300">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="accent-cyan-500" />
        <span>{value ? 'true' : 'false'}</span>
      </label>
    );
  }
  if (kind === 'number') {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className="w-40 bg-black border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:border-cyan-500 outline-none"
      />
    );
  }
  const multiline = typeof value === 'string' && (value.includes('\n') || value.length > 80);
  return multiline ? (
    <textarea
      value={value}
      rows={Math.min(10, value.split('\n').length + 1)}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-200 focus:border-cyan-500 outline-none"
    />
  ) : (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:border-cyan-500 outline-none"
    />
  );
}

ScalarInput.propTypes = {
  value: PropTypes.any.isRequired,
  onChange: PropTypes.func.isRequired,
};

/** Editable list of scalar values (add / edit / remove entries) */
function ScalarList({ pathParts, items, onChange }) {
  const update = (i, v) => onChange(pathParts, (list) => list.map((it, j) => (j === i ? v : it)));
  return (
    <div className="flex flex-col gap-1">
      {items.map((it, i) => (
        <div key={`scalar-${JSON.stringify(it)}-${i}`} className="flex items-center gap-2">
          <div className="flex-1"><ScalarInput value={it} onChange={(v) => update(i, v)} /></div>
          <button
            type="button"
            onClick={() => onChange(pathParts, (list) => list.filter((_, j) => j !== i))}
            className="px-2 py-0.5 bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-300 rounded text-xs"
            aria-label={`Remove item ${i + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange(pathParts, (list) => [...list, ''])}
        className="self-start px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs"
        aria-label="Add item"
      >
        + Add
      </button>
    </div>
  );
}

ScalarList.propTypes = {
  pathParts: PropTypes.array.isRequired,
  items: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
};

/**
 * Recursive editor. `pathParts` is the JSON path within the resource object.
 * Objects become collapsible sections, string arrays become editable lists,
 * everything else (including arrays of objects) renders recursively per item.
 */
function EditNode({ pathParts, value, onChange, openSet, toggleOpen }) {
  if (isSkippedPath(pathParts)) return null;

  const pointer = jsonPointer(pathParts);
  const isRoot = pathParts.length <= 1;

  if (Array.isArray(value)) {
    if (value.every((it) => it === null || typeof it !== 'object')) {
      return (
        <div className="py-1">
          <div className="text-xs text-gray-500 font-mono mb-1">{pointer}</div>
          <ScalarList pathParts={pathParts} items={value} onChange={onChange} />
        </div>
      );
    }
    return (
      <div className="py-1 border-l border-gray-800 pl-3">
        <div className="text-sm text-cyan-300 font-mono">{pointer}</div>
        {value.map((it, i) => (
          <div key={`obj-${JSON.stringify(it)}-${i}`} className="relative">
            <EditNode
              pathParts={[...pathParts, i]}
              value={it}
              onChange={onChange}
              openSet={openSet}
              toggleOpen={toggleOpen}
            />
            <button
              type="button"
              onClick={() => onChange(pathParts, (list) => list.filter((_, j) => j !== i))}
              className="absolute top-0 right-0 px-2 py-0.5 bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-300 rounded text-xs"
              aria-label={`Remove item ${i + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange(pathParts, (list) => [...list, list.length ? structuredClone(list[list.length - 1]) : {}])}
          className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs"
          aria-label="Add item"
        >
          + Add
        </button>
      </div>
    );
  }

  if (value !== null && typeof value === 'object') {
    const open = openSet.has(pointer) || isRoot;
    const keys = Object.keys(value).filter((k) => !isSkippedPath([...pathParts, k]));
    return (
      <div className="py-1">
        <button
          type="button"
          onClick={() => toggleOpen(pointer)}
          className="text-sm font-mono text-cyan-300 hover:text-cyan-200"
          aria-expanded={open}
        >
          {open ? '▾' : '▸'} {pointer}
        </button>
        {open && (
          <div className="border-l border-gray-800 pl-3 ml-1">
            {keys.length === 0 && <div className="text-xs text-gray-600 py-1">empty</div>}
            {keys.map((k) => (
              <EditNode
                key={k}
                pathParts={[...pathParts, k]}
                value={value[k]}
                onChange={onChange}
                openSet={openSet}
                toggleOpen={toggleOpen}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="py-1.5">
      <div className="text-xs text-gray-500 font-mono mb-1">{pointer}</div>
      <ScalarInput value={value} onChange={(v) => onChange(pathParts, () => v)} />
    </div>
  );
}

EditNode.propTypes = {
  pathParts: PropTypes.array.isRequired,
  value: PropTypes.any.isRequired,
  onChange: PropTypes.func.isRequired,
  openSet: PropTypes.object.isRequired,
  toggleOpen: PropTypes.func.isRequired,
};

// Workload kinds that expose spec.replicas
const SCALABLE_KINDS = new Set(['deployment', 'statefulset', 'replicaset']);
// Workload kinds that support rollout restarts via a template annotation
const ROLLABLE_KINDS = new Set(['deployment', 'statefulset', 'daemonset']);
const RESTART_ANNOTATION = 'kubectl.kubernetes.io/restartedAt';

// Cluster-wide infrastructure kinds that must not be deleted from the UI.
// Everything else (including CRDs) gets the danger zone.
const NON_DELETABLE_KINDS = new Set([
  'nodes',
  'namespaces',
  'customresourcedefinitions',
  'persistentvolumes',
  'storageclasses',
  'priorityclasses',
  'runtimeclasses',
  'ingressclasses',
  'podsecuritypolicies',
  'clusterroles',
  'clusterrolebindings',
  'apiservices',
  'mutatingwebhookconfigurations',
  'validatingwebhookconfigurations',
]);

/** HPA summary / replicas stepper shown in the quick actions bar */
function ScaleControl({ hpa, replicas, readyReplicas, scaleTo, applyScaleInput, scaleInput, setScaleInput, saving }) {
  if (hpa) {
    return (
      <div className="text-xs text-gray-400">
        Managed by HPA <span className="text-cyan-300 font-mono">{hpa.name}</span>
        {hpa.minReplicas != null && ` · min ${hpa.minReplicas}`} · max {hpa.maxReplicas} · current {hpa.currentReplicas}
        {hpa.targetLabel ? ` · target ${hpa.targetLabel}` : ''}
      </div>
    );
  }
  if (replicas === null) {
    return <span className="text-xs text-gray-500">spec.replicas not set (possibly managed by an autoscaler)</span>;
  }
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">Replicas</span>
        <button
          onClick={() => scaleTo(replicas - 1)}
          disabled={saving || replicas <= 0}
          className="w-7 h-7 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 rounded text-sm font-bold"
          aria-label="Remove one replica"
        >
          −
        </button>
        <span className="w-8 text-center text-cyan-300 font-mono text-sm">{replicas}</span>
        <button
          onClick={() => scaleTo(replicas + 1)}
          disabled={saving}
          className="w-7 h-7 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 rounded text-sm font-bold"
          aria-label="Add one replica"
        >
          +
        </button>
        <input
          type="number"
          min="0"
          value={scaleInput}
          onChange={(e) => setScaleInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') applyScaleInput(); }}
          placeholder="set…"
          className="w-20 bg-black border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:border-cyan-500 outline-none"
          aria-label="Set replica count"
        />
        <button
          onClick={applyScaleInput}
          disabled={saving || scaleInput === ''}
          className="px-2 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 rounded text-xs"
          aria-label="Apply replica count"
        >
          Set
        </button>
      </div>
      {readyReplicas != null && <span className="text-xs text-green-400">{readyReplicas}/{replicas} ready</span>}
    </>
  );
}

ScaleControl.propTypes = {
  hpa: PropTypes.object,
  replicas: PropTypes.number,
  readyReplicas: PropTypes.number,
  scaleTo: PropTypes.func.isRequired,
  applyScaleInput: PropTypes.func.isRequired,
  scaleInput: PropTypes.string.isRequired,
  setScaleInput: PropTypes.func.isRequired,
  saving: PropTypes.bool.isRequired,
};

/** Cordon / uncordon / drain buttons for Nodes */
function NodeActions({ unschedulable, setCordon, handleDrain, saving, draining }) {
  return (
    <>
      <button
        onClick={() => setCordon(!unschedulable)}
        disabled={saving || draining}
        className="px-3 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 rounded text-sm"
        aria-label={unschedulable ? 'Uncordon node' : 'Cordon node'}
      >
        {unschedulable ? 'Uncordon' : 'Cordon'}
      </button>
      <button
        onClick={handleDrain}
        disabled={saving || draining}
        className="px-3 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 rounded text-sm"
        aria-label="Drain node"
      >
        {draining ? 'Draining…' : 'Drain'}
      </button>
      <span className={`text-xs ${unschedulable ? 'text-yellow-400' : 'text-green-400'}`}>
        {unschedulable ? 'not schedulable' : 'schedulable'}
      </span>
    </>
  );
}

NodeActions.propTypes = {
  unschedulable: PropTypes.bool.isRequired,
  setCordon: PropTypes.func.isRequired,
  handleDrain: PropTypes.func.isRequired,
  saving: PropTypes.bool.isRequired,
  draining: PropTypes.bool.isRequired,
};

/** Two-step delete confirmation with grace period selection */
function DangerZone({ deleteGrace, setDeleteGrace, confirmDelete, setConfirmDelete, handleDelete, saving, kind, name }) {
  return (
    <div className="border border-red-900/60 rounded-lg p-3">
      {!confirmDelete ? (
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wide text-red-400">Danger zone</span>
          <select
            value={deleteGrace}
            onChange={(e) => setDeleteGrace(e.target.value)}
            className="bg-black border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
            aria-label="Delete grace period"
          >
            <option value="default">Graceful (default)</option>
            <option value="0">Force (0s)</option>
          </select>
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={saving}
            className="px-3 py-1 bg-red-900 hover:bg-red-800 disabled:opacity-40 text-red-100 rounded text-sm"
            aria-label="Delete resource"
          >
            Delete
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-xs text-red-300">
            Delete {kind}/{name}{deleteGrace === '0' ? ' (force, no grace period)' : ''}?
          </span>
          <button
            onClick={handleDelete}
            disabled={saving}
            className="px-3 py-1 bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white rounded text-sm font-bold"
            aria-label="Confirm delete"
          >
            {saving ? 'Deleting…' : 'Yes, delete'}
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            disabled={saving}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 rounded text-sm"
            aria-label="Cancel delete"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

DangerZone.propTypes = {
  deleteGrace: PropTypes.string.isRequired,
  setDeleteGrace: PropTypes.func.isRequired,
  confirmDelete: PropTypes.bool.isRequired,
  setConfirmDelete: PropTypes.func.isRequired,
  handleDelete: PropTypes.func.isRequired,
  saving: PropTypes.bool.isRequired,
  kind: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
};

/**
 * Resource edit form with diff-based saving.
 * `object` is the live resource; changes stay local until Save.
 */
export function ResourceEditForm({ context, kind, name, namespace, object, onUpdated, onDeleted }) {
  const original = useMemo(() => structuredClone(object), [object]);
  const [draft, setDraft] = useState(() => structuredClone(object));
  const [openSet, setOpenSet] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveOutput, setSaveOutput] = useState('');

  // Reset local state when a different resource is opened or the object is
  // refetched (e.g. after a successful save)
  const [lastKey, setLastKey] = useState(() => JSON.stringify({ object, kind, name, namespace }));
  const currentKey = JSON.stringify({ object, kind, name, namespace });
  if (lastKey !== currentKey) {
    setLastKey(currentKey);
    setDraft(structuredClone(object));
    setSaveError('');
    setSaveOutput('');
    setOpenSet(new Set());
  }

  const handleChange = useCallback((pathParts, updater) => {
    setDraft((prev) => updateAt(prev, pathParts, updater));
    setSaveOutput('');
    setSaveError('');
  }, []);

  const toggleOpen = useCallback((pointer) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(pointer)) next.delete(pointer); else next.add(pointer);
      return next;
    });
  }, []);

  const isDirty = useMemo(() => diffJsonPatch(original, draft).length > 0, [original, draft]);

  const runPatch = useCallback(async (patch, okMessage) => {
    if (patch.length === 0) {
      setSaveError('No changes to apply');
      return;
    }
    setSaving(true);
    setSaveError('');
    setSaveOutput('');
    try {
      const params = new URLSearchParams({ context, kind, name });
      if (namespace) params.set('namespace', namespace);
      const data = await apiFetch(`/api/clusters/resource-patch?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch }),
      });
      setSaveOutput(data.output || okMessage);
      onUpdated?.();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }, [context, kind, name, namespace, onUpdated]);

  const handleSave = useCallback(() => {
    runPatch(diffJsonPatch(original, draft), 'patched');
  }, [runPatch, original, draft]);

  const baseKind = kind.split('.')[0];
  const scalable = SCALABLE_KINDS.has(baseKind);
  const rollable = ROLLABLE_KINDS.has(baseKind);
  const deletable = !NON_DELETABLE_KINDS.has(baseKind);
  const replicas = scalable && typeof draft?.spec?.replicas === 'number' ? draft.spec.replicas : null;

  const scaleTo = useCallback((n) => {
    const target = Math.max(0, Math.trunc(n));
    const op = replicas === null
      ? { op: 'add', path: '/spec/replicas', value: target }
      : { op: 'replace', path: '/spec/replicas', value: target };
    runPatch([op], `scaled to ${target} replicas`);
  }, [replicas, runPatch]);

  const restartRollout = useCallback(() => {
    const existing = draft?.spec?.template?.metadata?.annotations;
    const annotations = { ...existing, [RESTART_ANNOTATION]: new Date().toISOString() };
    const op = existing != null
      ? { op: 'replace', path: '/spec/template/metadata/annotations', value: annotations }
      : { op: 'add', path: '/spec/template/metadata/annotations', value: annotations };
    runPatch([op], 'rollout restart requested');
  }, [draft, runPatch]);

  const [scaleInput, setScaleInput] = useState('');
  if (lastKey !== currentKey) setScaleInput(''); // keep the manual scale field fresh across resources

  const applyScaleInput = useCallback(() => {
    if (scaleInput === '') return;
    const n = Number(scaleInput);
    if (!Number.isFinite(n)) return;
    scaleTo(n);
    setScaleInput('');
  }, [scaleInput, scaleTo]);

  const isNode = baseKind === 'nodes';

  // Live replica/HPA status for scalable workloads
  const [scaleInfo, setScaleInfo] = useState(null);
  useEffect(() => {
    if (!scalable || !namespace) {
      setScaleInfo(null);
      return undefined;
    }
    let cancelled = false;
    const params = new URLSearchParams({ context, kind, name, namespace });
    apiFetch(`/api/clusters/scale-info?${params}`)
      .then((d) => { if (!cancelled) setScaleInfo(d); })
      .catch(() => { if (!cancelled) setScaleInfo(null); });
    return () => { cancelled = true; };
  }, [scalable, context, kind, name, namespace]);

  const hpa = scaleInfo?.hpas?.[0] || null;

  // Node cordoning state
  const unschedulable = isNode && draft?.spec?.unschedulable === true;
  const setCordon = useCallback((value) => {
    const op = draft?.spec?.unschedulable !== undefined
      ? { op: 'replace', path: '/spec/unschedulable', value }
      : { op: 'add', path: '/spec/unschedulable', value };
    runPatch([op], value ? 'node cordoned' : 'node uncordoned');
  }, [draft, runPatch]);

  const [draining, setDraining] = useState(false);
  const handleDrain = useCallback(async () => {
    if (!window.confirm(`Drain node "${name}"? It will be cordoned and its pods evicted.`)) return;
    setDraining(true);
    setSaveError('');
    try {
      const params = new URLSearchParams({ context, name });
      const data = await apiFetch(`/api/clusters/node-drain?${params}`, { method: 'POST' });
      setSaveOutput(data.output || 'node drained');
      onUpdated?.();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setDraining(false);
    }
  }, [context, name, onUpdated]);

  // Delete with grace period (two-step confirm)
  const [deleteGrace, setDeleteGrace] = useState('default');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const handleDelete = useCallback(async () => {
    setSaving(true);
    setSaveError('');
    try {
      const params = new URLSearchParams({ context, kind, name });
      if (namespace) params.set('namespace', namespace);
      if (deleteGrace === '0') params.set('gracePeriod', '0');
      const data = await apiFetch(`/api/clusters/resource-delete?${params}`, { method: 'POST' });
      setConfirmDelete(false);
      onDeleted?.(data.output || 'deleted');
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }, [context, kind, name, namespace, deleteGrace, onDeleted]);

  let saveLabel = 'No changes';
  if (saving) saveLabel = 'Saving…';
  else if (isDirty) saveLabel = 'Save changes';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="px-3 py-1 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded text-sm transition-colors"
          aria-label="Save resource changes"
        >
          {saveLabel}
        </button>
        {isDirty && !saving && (
          <button
            onClick={() => { setDraft(structuredClone(original)); setSaveError(''); setSaveOutput(''); }}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
            aria-label="Reset form changes"
          >
            Reset
          </button>
        )}
        {isDirty && <span className="text-xs text-yellow-400">Unsaved changes</span>}
      </div>

      {saveError && <div className="p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">{saveError}</div>}
      {saveOutput && <pre className="p-3 bg-black border border-green-800 rounded text-green-300 text-xs whitespace-pre-wrap">{saveOutput}</pre>}

      {(scalable || rollable || isNode) && (
        <div className="flex flex-wrap items-center gap-4 bg-gray-900 border border-gray-800 rounded-lg p-3">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Quick actions</span>
          {scalable && (
            <ScaleControl
              hpa={hpa}
              replicas={replicas}
              readyReplicas={replicas !== null && scaleInfo ? scaleInfo.readyReplicas : null}
              scaleTo={scaleTo}
              applyScaleInput={applyScaleInput}
              scaleInput={scaleInput}
              setScaleInput={setScaleInput}
              saving={saving}
            />
          )}
          {rollable && (
            <button
              onClick={restartRollout}
              disabled={saving}
              className="px-3 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 rounded text-sm"
              aria-label="Restart rollout"
            >
              ⟳ Restart rollout
            </button>
          )}
          {isNode && (
            <NodeActions
              unschedulable={unschedulable}
              setCordon={setCordon}
              handleDrain={handleDrain}
              saving={saving}
              draining={draining}
            />
          )}
        </div>
      )}

      <div className="bg-black border border-gray-800 rounded-lg p-3 overflow-auto max-h-[50vh]">
        <EditNode
          pathParts={[]}
          value={draft}
          onChange={handleChange}
          openSet={openSet}
          toggleOpen={toggleOpen}
        />
      </div>

      {deletable && (
        <DangerZone
          deleteGrace={deleteGrace}
          setDeleteGrace={setDeleteGrace}
          confirmDelete={confirmDelete}
          setConfirmDelete={setConfirmDelete}
          handleDelete={handleDelete}
          saving={saving}
          kind={kind}
          name={name}
        />
      )}
    </div>
  );
}

ResourceEditForm.propTypes = {
  context: PropTypes.string.isRequired,
  kind: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  namespace: PropTypes.string,
  object: PropTypes.object.isRequired,
  onUpdated: PropTypes.func,
  onDeleted: PropTypes.func
};
