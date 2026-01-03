// Color palette for pods (similar to stern's coloring)
// Using hex values that match Tailwind's 400 shade colors
export const POD_COLORS = [
  '#4ade80', // green-400
  '#22d3ee', // cyan-400
  '#60a5fa', // blue-400
  '#c084fc', // purple-400
  '#f472b6', // pink-400
  '#facc15', // yellow-400
  '#fb923c', // orange-400
  '#f87171', // red-400
  '#34d399', // emerald-400
  '#2dd4bf', // teal-400
  '#818cf8', // indigo-400
  '#fb7185'  // rose-400
];

// Log level patterns and their styles
export const LOG_LEVEL_PATTERNS = {
  error: { pattern: /\b(error|err|fatal|panic|exception)\b/i, class: 'text-red-400' },
  warn: { pattern: /\b(warn|warning)\b/i, class: 'text-yellow-400' },
  debug: { pattern: /\b(debug|trace)\b/i, class: 'text-gray-400' }
};

// LocalStorage key for persisting settings
export const STORAGE_KEY = 'stern-ui-config';

// Maximum logs to keep in memory
export const MAX_LOGS = 5000;

// Maximum logs to buffer when paused
export const MAX_BUFFER = 1000;

// Default configuration
export const DEFAULT_CONFIG = {
  namespace: '',
  selector: '',
  query: '.',
  since: '',
  container: '',
  excludeContainer: '',
  excludePod: '',
  containerState: 'all',
  include: '',
  exclude: '',
  highlight: '',
  tail: '-1',
  node: '',
  allNamespaces: false,
  initContainers: true,
  ephemeralContainers: true,
  timestamps: '',
  noFollow: false,
  context: '',
  maxLogRequests: '50'
};

// Container state options
export const CONTAINER_STATE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'terminated', label: 'Terminated' }
];

// Timestamp format options
export const TIMESTAMP_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'default', label: 'Default (RFC3339)' },
  { value: 'short', label: 'Short (MM-DD HH:MM:SS)' }
];
