import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadAllConfigs, saveConfig, loadGlobalSettings, saveGlobalSettings, deleteConfig } from '../storage';
import { DEFAULT_CONFIG, STORAGE_KEY } from '../../constants';

describe('storage utilities', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('loadAllConfigs', () => {
    it('returns empty array when no saved configs exist', () => {
      expect(loadAllConfigs()).toEqual([]);
    });

    it('returns saved configs merged with defaults', () => {
      const savedConfig = { namespace: 'production', query: 'nginx' };
      localStorage.setItem(`${STORAGE_KEY}-stream-1`, JSON.stringify(savedConfig));

      const result = loadAllConfigs();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
      expect(result[0].config.namespace).toBe('production');
      expect(result[0].config.query).toBe('nginx');
      expect(result[0].config.selector).toBe(DEFAULT_CONFIG.selector);
    });

    it('returns empty array for invalid JSON', () => {
      localStorage.setItem(`${STORAGE_KEY}-stream-1`, 'invalid json');
      expect(loadAllConfigs()).toEqual([]);
    });
  });

  describe('saveConfig', () => {
    it('saves config to localStorage', () => {
      const config = { namespace: 'test', query: '.' };
      saveConfig(1, config);

      const saved = JSON.parse(localStorage.getItem(`${STORAGE_KEY}-stream-1`));
      expect(saved).toEqual(config);
    });
  });

  describe('deleteConfig', () => {
    it('removes config from localStorage', () => {
      localStorage.setItem(`${STORAGE_KEY}-stream-1`, JSON.stringify({ old: 'config' }));
      deleteConfig(1);

      expect(localStorage.getItem(`${STORAGE_KEY}-stream-1`)).toBeNull();
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
