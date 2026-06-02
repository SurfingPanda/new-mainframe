import { useEffect, useState } from 'react';
import { api } from './auth.js';

const POLL_MS = 45_000;

// Count of unread work-order notifications (assigned to the user or routed to
// their department). Drives the badge on the Work Orders nav item. Polls in the
// background, on tab focus, and whenever the notification bell is marked seen.
export function useWorkOrderNotifications(enabled = true) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api('/api/notifications');
        if (cancelled) return;
        setCount(Number(data.workOrders) || 0);
      } catch {
        // ignore — keep the previous count rather than flashing 0
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    const onFocus = () => load();
    const onSeen = () => setCount(0);
    window.addEventListener('focus', onFocus);
    window.addEventListener('notifications-seen', onSeen);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('notifications-seen', onSeen);
    };
  }, [enabled]);

  return count;
}
