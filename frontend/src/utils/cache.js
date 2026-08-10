import { apiFetch } from './api';

const cache = new Map();

/**
 * Fetch with in-memory caching and in-flight deduplication.
 * Concurrent calls for the same URL share a single request.
 */
export function cachedFetch(url, { ttl = 30_000 } = {}) {
  const now = Date.now();
  const entry = cache.get(url);

  if (entry && entry.expiresAt > now) {
    return Promise.resolve(entry.value);
  }

  if (entry && entry.promise) {
    return entry.promise;
  }

  const promise = apiFetch(url)
    .then((value) => {
      cache.set(url, { value, expiresAt: Date.now() + ttl });
      return value;
    })
    .catch((err) => {
      cache.delete(url);
      throw err;
    });

  cache.set(url, { promise });
  return promise;
}

export function clearFetchCache() {
  cache.clear();
}
