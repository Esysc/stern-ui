/**
 * Generate a hash from a string (for consistent color assignment)
 */
export function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.codePointAt(i);
    hash = Math.trunc(hash);
  }
  return Math.abs(hash);
}

/**
 * Get the API base URL (handles dev vs prod)
 */
export function getApiBase() {
  const host = globalThis.location.host;
  return host.includes('localhost:5173') ? 'http://localhost:8080' : '';
}

/**
 * Get WebSocket host (handles dev vs prod)
 */
export function getWsHost() {
  const host = globalThis.location.host;
  return host.includes('localhost:5173') ? 'localhost:8080' : host;
}

/**
 * Get WebSocket protocol based on page protocol
 */
export function getWsProtocol() {
  return globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
}

/**
 * Format a timestamp for display
 */
export function formatTimestamp(timestamp) {
  if (!timestamp) return new Date().toLocaleTimeString();
  try {
    return new Date(timestamp).toLocaleTimeString();
  } catch {
    return new Date().toLocaleTimeString();
  }
}

/**
 * Download content as a file
 */
export function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Generate a filename with timestamp
 */
export function generateLogFilename(extension = 'txt') {
  const timestamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
  return `stern-logs-${timestamp}.${extension}`;
}
