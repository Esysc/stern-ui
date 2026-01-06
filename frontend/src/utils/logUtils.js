import { LOG_LEVEL_PATTERNS, POD_COLORS } from '../constants';
import { hashString } from './helpers';

/**
 * Detect log level from message content
 */
export function detectLogLevel(message) {
  if (!message) return 'info';
  for (const [level, { pattern }] of Object.entries(LOG_LEVEL_PATTERNS)) {
    if (pattern.test(message)) return level;
  }
  return 'info';
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
 * Filter logs by level and search term
 */
export function filterLogs(logs, { levelFilter, searchFilter }) {
  let result = logs;

  // Level filter
  if (levelFilter && levelFilter !== 'all') {
    result = result.filter(log => log.level === levelFilter);
  }

  // Search filter
  if (searchFilter) {
    const lower = searchFilter.toLowerCase();
    result = result.filter(log =>
      log.message?.toLowerCase().includes(lower) ||
      log.pod?.toLowerCase().includes(lower) ||
      log.container?.toLowerCase().includes(lower)
    );
  }

  return result;
}

/**
 * Parse highlight patterns from comma-separated string
 */
export function parseHighlightPatterns(highlightString) {
  if (!highlightString) return [];
  return highlightString.split(',').map(p => p.trim()).filter(Boolean);
}

/**
 * Format logs for text export
 */
export function formatLogsAsText(logs) {
  return logs.map(log =>
    `[${log.timestamp}] ${log.pod}/${log.container}: ${log.message}`
  ).join('\n');
}

/**
 * Format logs for JSON export
 */
export function formatLogsAsJson(logs) {
  return JSON.stringify(logs, null, 2);
}
