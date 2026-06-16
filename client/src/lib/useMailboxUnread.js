import { useEffect, useState } from 'react';
import { api } from './auth.js';
import { useSocketEvent } from './useSocket.jsx';

const POLL_MS = 120_000; // Relaxed from 30s — socket pushes handle the fast path.

// Unread inbox messages for the current user — drives the badge on the header
// mailbox button. Real-time via Socket.IO ('mail' — pushed to the recipient on
// every user-to-user or system message), with polling, tab focus, and the
// `mailbox-read` event (the Mailbox view marks mail read) as fallbacks.
export function useMailboxUnread(enabled = true) {
  const [count, setCount] = useState(0);

  // Refetch trigger — bumped by socket events as well as the polling interval.
  const [tick, setTick] = useState(0);
  useSocketEvent('mail', () => setTick((t) => t + 1));

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api('/api/messages/unread-count');
        if (!cancelled) setCount(Number(data?.count) || 0);
      } catch {
        // ignore — keep the previous count rather than flashing 0
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    const onFocus = () => load();
    const onRead = () => load();
    window.addEventListener('focus', onFocus);
    window.addEventListener('mailbox-read', onRead);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('mailbox-read', onRead);
    };
  }, [enabled, tick]);

  return count;
}
