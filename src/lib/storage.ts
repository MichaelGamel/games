/**
 * Tiny typed localStorage helpers. Everything persisted by the app (lobby
 * profile, stats, language) goes through these so failures (private mode,
 * quota, SSR) degrade silently to the fallback instead of crashing.
 */

export function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveLocal<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable (private mode, quota) — persisting is best-effort.
  }
}
