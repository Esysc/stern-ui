import { LOG_LEVEL_PATTERNS, POD_COLORS } from '../constants';
import { hashString } from './helpers';

/**
 * Detect log level from message content
 */
export function detectLogLevel(message) {
  if (!message) return 'unknown';
  for (const [level, { pattern }] of Object.entries(LOG_LEVEL_PATTERNS)) {
    if (pattern.test(message)) return level;
  }
  return 'unknown';
}

/**
 * Get color class for a pod based on its name
 */
export function getPodColor(podName) {
  if (!podName) return POD_COLORS[0];
  return POD_COLORS[hashString(podName) % POD_COLORS.length];
}

/**
 * Build a color map for a list of logs
 */
export function buildPodColorMap(logs) {
  const map = {};
  logs.forEach(log => {
    if (log.pod && !map[log.pod]) {
      map[log.pod] = getPodColor(log.pod);
    }
  });
  return map;
}

/**
 * Count log levels in a list of logs
 */
export function countLogLevels(logs) {
  const counts = { error: 0, warn: 0, info: 0, debug: 0, unknown: 0 };
  logs.forEach(log => {
    counts[log.level] = (counts[log.level] || 0) + 1;
  });
  return counts;
}

/**
 * Helper: Compile a pattern into a case-insensitive regex.
 * Returns null for empty patterns and the raw string when the regex
 * fails to compile (falling back to a substring match).
 */
function compilePattern(pattern) {
  if (pattern instanceof RegExp) return pattern;
  if (!pattern) return null;
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return pattern;
  }
}

/**
 * Precompile log filters so they aren't rebuilt for every log line.
 */
export function compileLogFilters({ query, container } = {}) {
  return {
    query: compilePattern(query && query !== '.' ? query : null),
    container: compilePattern(container
      ? (typeof container === 'string' && container.includes('/')
        ? container.split('/').pop()
        : container)
      : null)
  };
}

/**
 * Helper: Match text against a precompiled pattern (regex or fallback string)
 */
function matchesCompiled(text, pattern) {
  if (pattern instanceof RegExp) {
    return pattern.test(text);
  }
  return text.toLowerCase().includes(pattern.toLowerCase());
}

/**
 * Filter logs by query and container using precompiled filters.
 * Applies CLIENT-SIDE filters that work on already-fetched logs without reconnection.
 * Server-side filters (namespace) require reconnection.
 * Accepts either plain strings (compiled on each call) or the output of
 * compileLogFilters() to avoid rebuilding regexes per log line.
 */
export function filterLogs(logs, filters = {}) {
  const compiled = compileLogFilters(filters);
  return logs.filter(log =>
    (!compiled.query || matchesCompiled(log.pod || '', compiled.query)) &&
    (!compiled.container || matchesCompiled(log.container || '', compiled.container))
  );
}
