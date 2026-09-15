// MySQL timestamps returned through the query builder have no timezone suffix.
// Laravel writes these values in UTC, so make that explicit before JavaScript
// parses them; otherwise browsers treat them as local time (eight hours early
// in Asia/Singapore).
export function parseApiDate(value) {
  if (typeof value !== 'string') return new Date(value);
  const trimmed = value.trim();
  const mysqlTimestamp = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
  if (mysqlTimestamp.test(trimmed)) {
    return new Date(`${trimmed.replace(' ', 'T')}Z`);
  }
  return new Date(trimmed);
}

// Normalize bare UTC date-times once as API data enters the client. This makes
// every existing `new Date(value)` call device-timezone aware without touching
// date-only fields such as due_at/start_date (which must remain calendar dates).
export function normalizeApiTimestamps(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const bareDateTime = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
    return bareDateTime.test(trimmed) ? `${trimmed.replace(' ', 'T')}Z` : value;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      value[index] = normalizeApiTimestamps(value[index]);
    }
    return value;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      value[key] = normalizeApiTimestamps(value[key]);
    }
  }
  return value;
}

export function relativeTime(value) {
  const date = parseApiDate(value);
  const diff = Date.now() - date.getTime();
  if (!Number.isFinite(diff)) return '';
  if (diff < 60000) return 'just now';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
