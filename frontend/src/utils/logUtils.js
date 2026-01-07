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
 * Helper: Parse duration string to milliseconds
 */
function parseDuration(since) {
  const match = since.match(/^(\d+)([smhd])$/);
  if (!match) return 0;

  const value = Number.parseInt(match[1]);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * (multipliers[unit] || 0);
}

/**
 * Helper: Filter by level
 */
function filterByLevel(logs, levelFilter) {
  if (!levelFilter || levelFilter === 'all') return logs;
  return logs.filter(log => log.level === levelFilter);
}

/**
 * Helper: Filter by search term
 */
function filterBySearch(logs, searchFilter) {
  if (!searchFilter) return logs;
  const lower = searchFilter.toLowerCase();
  return logs.filter(log =>
    log.message?.toLowerCase().includes(lower) ||
    log.pod?.toLowerCase().includes(lower) ||
    log.container?.toLowerCase().includes(lower)
  );
}

/**
 * Helper: Filter by pod query
 */
function filterByQuery(logs, query) {
  if (!query || query === '.') return logs;
  return logs.filter(log => matchesPattern(log.pod || '', query));
}

/**
 * Helper: Filter excluded pods
 */
function filterExcludedPods(logs, excludePod) {
  if (!excludePod) return logs;
  const patterns = excludePod.split(',').map(p => p.trim()).filter(Boolean);
  if (patterns.length === 0) return logs;

  return logs.filter(log => {
    const podName = log.pod || '';
    return !patterns.some(pattern => matchesPattern(podName, pattern));
  });
}

/**
 * Helper: Filter by timestamp
 */
function filterBySince(logs, since) {
  if (!since || logs.length === 0) return logs;

  const sinceMs = parseDuration(since);
  if (sinceMs === 0) return logs;

  const cutoffTime = Date.now() - sinceMs;
  const debug = localStorage.getItem('stern-ui-debug') === 'true' || import.meta.env.VITE_DEBUG === 'true';

  if (debug && logs.length > 0) {
    console.log('[filterBySince] Sample log:', logs[0]);
    console.log('[filterBySince] Since:', since, 'Cutoff time:', new Date(cutoffTime).toISOString());
  }

  return logs.filter(log => {
    // Try to extract timestamp from log
    let logTime;

    // Check if log has a timestamp field
    if (log.timestamp) {
      try {
        logTime = new Date(log.timestamp).getTime();
        if (debug) console.log('[filterBySince] Parsed timestamp field:', new Date(logTime).toISOString(), 'Keep:', logTime >= cutoffTime);
      } catch {
        // Invalid timestamp, keep the log
        return true;
      }
    } else if (log.time) {
      try {
        logTime = new Date(log.time).getTime();
        if (debug) console.log('[filterBySince] Parsed time field:', new Date(logTime).toISOString(), 'Keep:', logTime >= cutoffTime);
      } catch {
        return true;
      }
    } else {
      // No timestamp field - for real-time logs without timestamps, keep them all
      if (debug) console.log('[filterBySince] No timestamp field, keeping log');
      return true;
    }

    return logTime >= cutoffTime;
  });
}

/**
 * Helper: Filter by include patterns
 */
function filterByInclude(logs, include) {
  if (!include) return logs;
  const patterns = include.split(',').map(p => p.trim()).filter(Boolean);
  if (patterns.length === 0) return logs;

  return logs.filter(log => {
    const message = log.message || '';
    return patterns.some(pattern => matchesPattern(message, pattern));
  });
}

/**
 * Helper: Filter by exclude patterns
 */
function filterByExclude(logs, exclude) {
  if (!exclude) return logs;
  const patterns = exclude.split(',').map(p => p.trim()).filter(Boolean);
  if (patterns.length === 0) return logs;

  return logs.filter(log => {
    const message = log.message || '';
    return !patterns.some(pattern => matchesPattern(message, pattern));
  });
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
 * Helper: Filter excluded containers
 */
function filterExcludedContainers(logs, excludeContainer) {
  if (!excludeContainer) return logs;
  const patterns = excludeContainer.split(',').map(p => p.trim()).filter(Boolean);
  if (patterns.length === 0) return logs;

  return logs.filter(log => {
    const logContainer = log.container || '';
    return !patterns.some(pattern => {
      const containerName = pattern.includes('/') ? pattern.split('/').pop() : pattern;
      return matchesPattern(logContainer, containerName);
    });
  });
}

/**
 * Filter logs by level, search term, include/exclude patterns
 * Applies CLIENT-SIDE filters that work on already-fetched logs without reconnection.
 * Server-side filters (namespace, containerState, context) require reconnection.
 */
export function filterLogs(logs, { levelFilter, searchFilter, include, exclude, container, excludeContainer, excludePod, query, since }) {
  let result = logs;

  // UI-only filters
  result = filterByLevel(result, levelFilter);
  result = filterBySearch(result, searchFilter);

  // Client-side filters (apply to already-fetched logs)
  result = filterByQuery(result, query);
  result = filterBySince(result, since);
  result = filterByInclude(result, include);
  result = filterByExclude(result, exclude);
  result = filterByContainer(result, container);
  result = filterExcludedContainers(result, excludeContainer);
  result = filterExcludedPods(result, excludePod);

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
