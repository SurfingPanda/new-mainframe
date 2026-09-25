// Backend origin for split deployments — the frontend is served from a static
// host (Hostinger) while the API + uploads live on a separate origin (Railway).
// Empty string in local dev, where Vite proxies /api (and /uploads) to :8000.
// Set VITE_API_URL at build time, e.g. VITE_API_URL=https://api.eljincorp.com.
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

// Prefix an app-relative path (/api/..., /uploads/...) with the backend origin.
// Absolute URLs and blob:/data: URIs pass through unchanged. No-op when
// API_BASE is empty (same-origin dev via the Vite proxy).
export function apiUrl(path) {
  if (!path || typeof path !== 'string') return path;
  if (/^(https?:|blob:|data:)/i.test(path)) return path;
  return API_BASE ? API_BASE + path : path;
}

// Rewrite server-stored upload paths (/uploads/...) found anywhere in a parsed
// API response so images, avatars, signatures, and attachments load from the
// backend origin rather than the static frontend host. Walks the value in place
// (the response is freshly parsed, so mutation is safe). No-op when API_BASE is
// empty, keeping same-origin dev behaviour identical.
export function rewriteUploadUrls(value) {
  if (!API_BASE) return value;
  if (typeof value === 'string') {
    return value.startsWith('/uploads/') ? API_BASE + value : value;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = rewriteUploadUrls(value[i]);
    return value;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) value[key] = rewriteUploadUrls(value[key]);
    return value;
  }
  return value;
}
