import { STORAGE_KEY, DEFAULT_CONFIG } from '../constants';

/**
 * Load all stream configs from localStorage
 */
export function loadAllConfigs() {
  try {
    const configs = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`${STORAGE_KEY}-stream-`)) continue;
      const id = key.replace(`${STORAGE_KEY}-stream-`, '');
      const saved = localStorage.getItem(key);
      configs.push({ id, config: { ...DEFAULT_CONFIG, ...JSON.parse(saved) } });
    }
    return configs;
  } catch (e) {
    console.error('Failed to load configs from storage:', e);
    return [];
  }
}

/**
 * Save config to localStorage for a specific stream
 */
export function saveConfig(streamId, config) {
  try {
    localStorage.setItem(`${STORAGE_KEY}-stream-${streamId}`, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save config to storage:', e);
  }
}

/**
 * Delete a stream config from localStorage
 */
export function deleteConfig(streamId) {
  try {
    localStorage.removeItem(`${STORAGE_KEY}-stream-${streamId}`);
  } catch (e) {
    console.error('Failed to delete config from storage:', e);
  }
}

/**
 * Load global settings (like persistSettings flag)
 */
export function loadGlobalSettings() {
  try {
    const saved = localStorage.getItem(`${STORAGE_KEY}-global`);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load global settings:', e);
  }
  return { persistSettings: false };
}

/**
 * Save global settings
 */
export function saveGlobalSettings(settings) {
  try {
    localStorage.setItem(`${STORAGE_KEY}-global`, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save global settings:', e);
  }
}

/**
 * Clear all stern-ui related data from localStorage
 */
export function clearAllSettings() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_KEY)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    return true;
  } catch (e) {
    console.error('Failed to clear all settings:', e);
    return false;
  }
}
