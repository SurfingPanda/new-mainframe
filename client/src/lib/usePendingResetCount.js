import { useEffect, useState } from 'react';
import { api } from './auth.js';

const POLL_MS = 45_000;

// Pending password-reset request count. Polls quietly in the background and on
// tab focus; a failed poll keeps the last good count rather than flashing 0.
export function usePendingResetCount(enabled = true) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const list = await api('/api/password-resets?status=pending');
        if (cancelled) return;
        setCount(Array.isArray(list) ? list.length : 0);
      } catch {
        // ignore — keep the previous count
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled]);

  return count;
}
