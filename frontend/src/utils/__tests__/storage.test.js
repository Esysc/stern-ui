import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadConfig, saveConfig, loadGlobalSettings, saveGlobalSettings, clearConfig } from '../storage';
import { DEFAULT_CONFIG, STORAGE_KEY } from '../../constants';

describe('storage utilities', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('loadConfig', () => {
    it('returns default config when no saved config exists', () => {
      const result = loadConfig(1);
      expect(result).toEqual(DEFAULT_CONFIG);
    });

    it('returns saved config merged with defaults', () => {
      const savedConfig = { namespace: 'production', query: 'nginx' };
      localStorage.setItem(`${STORAGE_KEY}-1`, JSON.stringify(savedConfig));

      const result = loadConfig(1);

      expect(result.namespace).toBe('production');
      expect(result.query).toBe('nginx');
      expect(result.selector).toBe(DEFAULT_CONFIG.selector); // default value
    });

    it('returns default config for invalid JSON', () => {
      localStorage.setItem(`${STORAGE_KEY}-1`, 'invalid json');
      const result = loadConfig(1);
      expect(result).toEqual(DEFAULT_CONFIG);
    });
  });

  describe('saveConfig', () => {
    it('saves config to localStorage', () => {
      const config = { namespace: 'test', query: '.' };
      saveConfig(1, config);

      const saved = JSON.parse(localStorage.getItem(`${STORAGE_KEY}-1`));
      expect(saved).toEqual(config);
    });
  });

  describe('clearConfig', () => {
    it('removes config from localStorage', () => {
      localStorage.setItem(`${STORAGE_KEY}-1`, JSON.stringify({ old: 'config' }));
      clearConfig(1);

      expect(localStorage.getItem(`${STORAGE_KEY}-1`)).toBeNull();
    });
  });

  describe('loadGlobalSettings', () => {
    it('returns default settings when none saved', () => {
      const result = loadGlobalSettings();
      expect(result).toEqual({ persistSettings: false });
    });

    it('returns saved global settings', () => {
      localStorage.setItem(`${STORAGE_KEY}-global`, JSON.stringify({ persistSettings: true }));

      const result = loadGlobalSettings();

      expect(result).toEqual({ persistSettings: true });
    });

    it('returns defaults for invalid JSON', () => {
      localStorage.setItem(`${STORAGE_KEY}-global`, 'invalid');
      const result = loadGlobalSettings();
      expect(result).toEqual({ persistSettings: false });
    });
  });

  describe('saveGlobalSettings', () => {
    it('saves global settings to localStorage', () => {
      saveGlobalSettings({ persistSettings: true });

      const saved = JSON.parse(localStorage.getItem(`${STORAGE_KEY}-global`));
      expect(saved).toEqual({ persistSettings: true });
    });
  });
});
