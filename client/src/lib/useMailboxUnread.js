import { useEffect, useState } from 'react';
import { api } from './auth.js';

const POLL_MS = 30_000;

// Unread inbox messages for the current user — drives the badge on the header
// mailbox button. Polls in the background, on tab focus, and whenever a
// `mailbox-read` event fires (the Mailbox view marks mail read).
export function useMailboxUnread(enabled = true) {
  const [count, setCount] = useState(0);

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
  }, [enabled]);

  return count;
}
