import { useEffect, useState } from 'react';
import { api } from './auth.js';

const POLL_MS = 45_000;
const ZERO = { total: 0, byView: { myQueue: 0, submitted: 0, all: 0 } };

// Unread work-order notifications, as a `total` plus a `byView` breakdown
// (My Queue / Submitted / All) so the nav can badge both the Work Orders button
// and each dropdown item. Polls in the background, on tab focus, and whenever
// the notification bell is marked seen.
export function useWorkOrderNotifications(enabled = true) {
  const [state, setState] = useState(ZERO);

  useEffect(() => {
    if (!enabled) {
      setState(ZERO);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api('/api/notifications');
        if (cancelled) return;
        const v = data.workOrdersByView || {};
        setState({
          total: Number(data.workOrders) || 0,
          byView: {
            myQueue: Number(v.myQueue) || 0,
            submitted: Number(v.submitted) || 0,
            all: Number(v.all) || 0
          }
        });
      } catch {
        // ignore — keep the previous counts rather than flashing 0
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    const onFocus = () => load();
    const onSeen = () => setState(ZERO);
    window.addEventListener('focus', onFocus);
    window.addEventListener('notifications-seen', onSeen);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('notifications-seen', onSeen);
    };
  }, [enabled]);

  return state;
}
