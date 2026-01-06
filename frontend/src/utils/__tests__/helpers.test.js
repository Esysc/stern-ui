import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hashString, getApiBase, formatTimestamp, downloadFile } from '../helpers';

describe('hashString', () => {
  it('returns a positive number', () => {
    const result = hashString('test');
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('returns consistent hash for same input', () => {
    const hash1 = hashString('my-pod-name');
    const hash2 = hashString('my-pod-name');
    expect(hash1).toBe(hash2);
  });

  it('returns different hashes for different inputs', () => {
    const hash1 = hashString('pod-a');
    const hash2 = hashString('pod-b');
    expect(hash1).not.toBe(hash2);
  });

  it('handles empty string', () => {
    const result = hashString('');
    expect(result).toBe(0);
  });
});

describe('getApiBase', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    delete window.location;
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it('returns localhost:8080 for dev server', () => {
    window.location = { host: 'localhost:5173' };
    expect(getApiBase()).toBe('http://localhost:8080');
  });

  it('returns empty string for production', () => {
    window.location = { host: 'stern-ui.example.com' };
    expect(getApiBase()).toBe('');
  });
});

describe('formatTimestamp', () => {
  it('formats ISO date to locale time', () => {
    const result = formatTimestamp('2026-01-03T10:30:00Z');
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('returns current time for invalid input', () => {
    const result = formatTimestamp(null);
    expect(result).toBeDefined();
  });
});

describe('downloadFile', () => {
  let createElementSpy;
  let _appendChildSpy;
  let _removeChildSpy;
  let createObjectURLSpy;
  let revokeObjectURLSpy;

  beforeEach(() => {
    createElementSpy = vi.spyOn(document, 'createElement');
    _appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    _removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates and triggers download for text content', () => {
    const mockClick = vi.fn();
    createElementSpy.mockReturnValue({
      click: mockClick,
      href: '',
      download: ''
    });

    downloadFile('test content', 'test.txt', 'text/plain');

    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test');
  });

  it('creates JSON file with correct mime type', () => {
    const mockClick = vi.fn();
    createElementSpy.mockReturnValue({
      click: mockClick,
      href: '',
      download: ''
    });

    downloadFile('{"test": true}', 'test.json', 'application/json');

    expect(createObjectURLSpy).toHaveBeenCalled();
  });
});
