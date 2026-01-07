import { STORAGE_KEY, DEFAULT_CONFIG } from '../constants';

/**
 * Load config from localStorage for a specific stream
 */
export function loadConfig(streamId) {
  try {
    const saved = localStorage.getItem(`${STORAGE_KEY}-${streamId}`);
    if (saved) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to load config from storage:', e);
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Save config to localStorage for a specific stream
 */
export function saveConfig(streamId, config) {
  try {
    localStorage.setItem(`${STORAGE_KEY}-${streamId}`, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save config to storage:', e);
  }
}

/**
 * Clear config from localStorage for a specific stream
 */
export function clearConfig(streamId) {
  try {
    localStorage.removeItem(`${STORAGE_KEY}-${streamId}`);
  } catch (e) {
    console.error('Failed to clear config from storage:', e);
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
