import { getApiBase } from './helpers';

/**
 * Fetch helper against the backend API. Throws with the server error message.
 */
export async function apiFetch(path, options = {}) {
  const res = await fetch(`${getApiBase()}${path}`, options);
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      message = body.error || message;
    } catch { /* non-JSON error body, keep default message */ }
    throw new Error(message);
  }
  return res.json();
}
