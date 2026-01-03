import { describe, it, expect } from 'vitest';
import { detectLogLevel, filterLogs, buildPodColorMap } from '../logUtils';

describe('detectLogLevel', () => {
  it('detects error level', () => {
    expect(detectLogLevel('An error occurred')).toBe('error');
    expect(detectLogLevel('FATAL: system crash')).toBe('error');
    expect(detectLogLevel('panic: runtime error')).toBe('error');
    expect(detectLogLevel('Exception thrown')).toBe('error');
  });

  it('detects warn level', () => {
    expect(detectLogLevel('Warning: deprecated')).toBe('warn');
    expect(detectLogLevel('WARN - low memory')).toBe('warn');
  });

  it('detects info level', () => {
    expect(detectLogLevel('INFO: server started')).toBe('info');
    expect(detectLogLevel('[info] connected')).toBe('info');
  });

  it('detects debug level', () => {
    expect(detectLogLevel('DEBUG: variable value')).toBe('debug');
    expect(detectLogLevel('TRACE: entering function')).toBe('debug');
  });

  it('returns unknown for unrecognized patterns', () => {
    expect(detectLogLevel('Just a regular message')).toBe('unknown');
    expect(detectLogLevel('')).toBe('unknown');
    expect(detectLogLevel(null)).toBe('unknown');
  });
});

describe('filterLogs', () => {
  const sampleLogs = [
    { message: 'Error occurred', pod: 'api-pod', container: 'api', level: 'error' },
    { message: 'Warning issued', pod: 'web-pod', container: 'nginx', level: 'warn' },
    { message: 'Info message', pod: 'api-pod', container: 'api', level: 'info' },
    { message: 'Debug output', pod: 'db-pod', container: 'postgres', level: 'debug' },
  ];

  it('returns all logs when no filters applied', () => {
    const result = filterLogs(sampleLogs, { levelFilter: 'all', searchFilter: '' });
    expect(result).toHaveLength(4);
  });

  it('filters by level', () => {
    const result = filterLogs(sampleLogs, { levelFilter: 'error', searchFilter: '' });
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe('error');
  });

  it('filters by search term in message', () => {
    const result = filterLogs(sampleLogs, { levelFilter: 'all', searchFilter: 'warning' });
    expect(result).toHaveLength(1);
    expect(result[0].message).toContain('Warning');
  });

  it('filters by search term in pod name', () => {
    const result = filterLogs(sampleLogs, { levelFilter: 'all', searchFilter: 'api-pod' });
    expect(result).toHaveLength(2);
  });

  it('filters by search term in container name', () => {
    const result = filterLogs(sampleLogs, { levelFilter: 'all', searchFilter: 'nginx' });
    expect(result).toHaveLength(1);
  });

  it('combines level and search filters', () => {
    const result = filterLogs(sampleLogs, { levelFilter: 'error', searchFilter: 'api' });
    expect(result).toHaveLength(1);
  });

  it('is case insensitive', () => {
    const result = filterLogs(sampleLogs, { levelFilter: 'all', searchFilter: 'ERROR' });
    expect(result).toHaveLength(1);
  });

  it('handles empty logs array', () => {
    const result = filterLogs([], { levelFilter: 'all', searchFilter: 'test' });
    expect(result).toHaveLength(0);
  });
});

describe('buildPodColorMap', () => {
  it('assigns colors to unique pods', () => {
    const logs = [
      { pod: 'pod-a' },
      { pod: 'pod-b' },
      { pod: 'pod-a' },
    ];
    const colorMap = buildPodColorMap(logs);

    expect(Object.keys(colorMap)).toHaveLength(2);
    expect(colorMap['pod-a']).toBeDefined();
    expect(colorMap['pod-b']).toBeDefined();
  });

  it('returns consistent colors for same pod', () => {
    const logs1 = [{ pod: 'my-pod' }];
    const logs2 = [{ pod: 'my-pod' }];

    const colorMap1 = buildPodColorMap(logs1);
    const colorMap2 = buildPodColorMap(logs2);

    expect(colorMap1['my-pod']).toBe(colorMap2['my-pod']);
  });

  it('handles empty logs', () => {
    const colorMap = buildPodColorMap([]);
    expect(Object.keys(colorMap)).toHaveLength(0);
  });

  it('handles logs without pod field', () => {
    const logs = [{ message: 'test' }, { pod: 'valid-pod' }];
    const colorMap = buildPodColorMap(logs);
    expect(Object.keys(colorMap)).toHaveLength(1);
  });
});
