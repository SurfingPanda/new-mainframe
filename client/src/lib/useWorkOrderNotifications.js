import { useEffect, useState } from 'react';
import { api } from './auth.js';
import { useSocketEvent } from './useSocket.jsx';

const POLL_MS = 120_000; // Relaxed from 45s — socket pushes handle the fast path.
const ZERO = { total: 0, byView: { myQueue: 0, submitted: 0, all: 0 } };

// Unread work-order notifications, as a `total` plus a `byView` breakdown
// (My Queue / Submitted / All) so the nav can badge both the Work Orders button
// and each dropdown item. Real-time via Socket.IO ('notification' — the same
// signal the bell uses, pushed to assignee/requester/department on any change),
// with polling, tab focus, and the bell's "seen" event as fallbacks.
export function useWorkOrderNotifications(enabled = true) {
  const [state, setState] = useState(ZERO);

  // Refetch trigger — bumped by socket events as well as the polling interval.
  const [tick, setTick] = useState(0);
  useSocketEvent('notification', () => setTick((t) => t + 1));

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
  }, [enabled, tick]);

  return state;
}
