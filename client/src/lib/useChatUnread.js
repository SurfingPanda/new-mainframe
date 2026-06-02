import { useEffect, useState } from 'react';
import { api } from './auth.js';

const POLL_MS = 20_000;
const LS_MUTE = 'mf_chat_muted';

// Muted conversations (client-only, stored in localStorage by ChatRoom) should
// not contribute to the unread badge.
function mutedSet() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_MUTE) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

// Total unread chat messages across the user's rooms (DMs, groups, and the
// Team Chat channel), excluding muted conversations. Drives the badge on the
// Chat Room nav item. Polls in the background, on tab focus, and whenever a
// `chat-read` event fires (the chat view marks a room read).
export function useChatUnread(enabled = true) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api('/api/chat/unread');
        if (cancelled) return;
        const rooms = data?.rooms || {};
        const muted = mutedSet();
        let total = 0;
        for (const [key, n] of Object.entries(rooms)) {
          if (!muted.has(key)) total += Number(n) || 0;
        }
        setCount(total);
      } catch {
        // ignore — keep the previous count rather than flashing 0
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    const onFocus = () => load();
    const onRead = () => load();
    window.addEventListener('focus', onFocus);
    window.addEventListener('chat-read', onRead);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('chat-read', onRead);
    };
  }, [enabled]);

  return count;
}
