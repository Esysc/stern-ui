/**
 * JSON diff → RFC 6902 patch helpers, shared by the resource edit form.
 */

function escapePointerSegment(seg) {
  return String(seg).replaceAll('~', '~0').replaceAll('/', '~1');
}

/** Compare two arrays: whole-array replace keeps patches robust with kubectl */
function diffArrays(orig, edited, prefix) {
  if (JSON.stringify(orig) === JSON.stringify(edited)) return [];
  return [{ op: 'replace', path: '/' + prefix.map(escapePointerSegment).join('/'), value: edited }];
}

/** Compare two objects and emit remove/replace/add operations per key */
function diffObjects(orig, edited, prefix) {
  const ops = [];
  for (const key of Object.keys(orig)) {
    if (!(key in edited)) {
      ops.push({ op: 'remove', path: '/' + [...prefix, key].map(escapePointerSegment).join('/') });
    } else {
      ops.push(...diffJsonPatch(orig[key], edited[key], [...prefix, key]));
    }
  }
  for (const key of Object.keys(edited)) {
    if (!(key in orig)) {
      ops.push({ op: 'add', path: '/' + [...prefix, key].map(escapePointerSegment).join('/'), value: edited[key] });
    }
  }
  return ops;
}

/** Compare two scalars (or null/undefined vs object mismatches) */
function diffScalars(orig, edited, prefix) {
  if (orig === edited) return [];
  return [{ op: 'replace', path: '/' + prefix.map(escapePointerSegment).join('/'), value: edited }];
}

/** Deep-compare two JSON values and produce an RFC 6902 patch (add/replace/remove) */
export function diffJsonPatch(orig, edited, prefix = []) {
  if (Array.isArray(orig) && Array.isArray(edited)) return diffArrays(orig, edited, prefix);
  if (orig !== null && edited !== null && typeof orig === 'object' && typeof edited === 'object') {
    return diffObjects(orig, edited, prefix);
  }
  return diffScalars(orig, edited, prefix);
}

/** Build a JSON pointer from path segments with RFC 6901 escaping */
export function jsonPointer(parts) {
  return '/' + parts.map(escapePointerSegment).join('/');
}
