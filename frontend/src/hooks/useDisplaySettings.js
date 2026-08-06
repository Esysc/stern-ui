import { useState } from 'react';

/**
 * Custom hook for managing display settings
 * Extracted from StreamPanel to reduce complexity
 */
export function useDisplaySettings() {
  const [showSettings, setShowSettings] = useState(true);

  return {
    showSettings,
    setShowSettings
  };
}
