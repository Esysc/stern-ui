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
 * Helper: Match text against pattern (regex or string)
 */
function matchesPattern(text, pattern) {
  try {
    const regex = new RegExp(pattern, 'i');
    return regex.test(text);
  } catch {
    return text.toLowerCase().includes(pattern.toLowerCase());
  }
}

/**
 * Helper: Filter by pod query
 */
function filterByQuery(logs, query) {
  if (!query || query === '.') return logs;
  return logs.filter(log => matchesPattern(log.pod || '', query));
}

/**
 * Helper: Filter by container
 */
function filterByContainer(logs, container) {
  if (!container) return logs;
  const containerName = container.includes('/') ? container.split('/').pop() : container;
  return logs.filter(log => matchesPattern(log.container || '', containerName));
}

/**
 * Filter logs by query and container
 * Applies CLIENT-SIDE filters that work on already-fetched logs without reconnection.
 * Server-side filters (namespace) require reconnection.
 */
export function filterLogs(logs, { query, container }) {
  let result = logs;

  // Client-side filters (apply to already-fetched logs)
  result = filterByQuery(result, query);
  result = filterByContainer(result, container);

  return result;
}
