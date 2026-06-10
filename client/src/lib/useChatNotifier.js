import { useEffect, useRef } from 'react';
import { api, getUser } from './auth.js';

// Active chat alerts: a sound + desktop (Web Notifications) ping when a new
// message arrives. Built on the same /api/chat/unread signal as the badge — an
// increase in a room's unread count means someone messaged you (your own
// messages never count, and the room you're actively viewing is continuously
// marked read by the widget, so it won't false-fire).
const POLL_MS = 15000;
const LS_MUTE = 'mf_chat_muted';     // muted conversations (shared with the chat UI)
const LS_ALERTS = 'mf_chat_alerts';  // 'off' disables alerts
const NOTIFY_ICON = '/images/logo.png';

export function getAlertsEnabled() {
  return localStorage.getItem(LS_ALERTS) !== 'off';
}
export function setAlertsEnabled(on) {
  localStorage.setItem(LS_ALERTS, on ? 'on' : 'off');
}

function mutedSet() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_MUTE) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

// --- Sound -------------------------------------------------------------------
let audioCtx = null;

// Create/resume the AudioContext. Must run from a user gesture the first time or
// the browser blocks playback — call this on a click (e.g. opening the widget).
export function primeAlertSound() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    /* no Web Audio support — desktop notifications still work */
  }
}

// A gentle two-note chime synthesized in-browser (no audio asset needed).
function playChime() {
  if (!getAlertsEnabled()) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    [880, 1174.7].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.12;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  } catch {
    /* ignore */
  }
}

// --- Desktop notifications ---------------------------------------------------
export function requestChatNotifyPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

function showDesktop(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, icon: NOTIFY_ICON, tag: 'hubly-chat', renotify: true });
    n.onclick = () => { window.focus(); n.close(); };
  } catch {
    /* ignore */
  }
}

// Build a friendly notification (sender/room + preview) for the changed rooms.
async function enrichAndNotify(changedKeys) {
  let title = 'New message';
  let body = 'You have a new message in Hubly.';
  try {
    const rooms = await api('/api/chat/rooms');
    if (Array.isArray(rooms)) {
      const set = new Set(changedKeys);
      const hit = rooms.find((r) => set.has(r.key));
      if (hit) {
        const roomName =
          hit.kind === 'channel' ? hit.label || 'Team Chat'
          : hit.kind === 'group' ? hit.name || 'Group'
          : hit.other?.name || 'Direct message';
        const sender = hit.last?.user_name;
        const preview = hit.last?.is_unsent ? 'Message removed' : hit.last?.body || 'Sent an attachment';
        if (hit.kind === 'dm') {
          title = sender || roomName;
          body = preview;
        } else {
          title = roomName;
          body = sender ? `${sender}: ${preview}` : preview;
        }
        if (changedKeys.length > 1) body = `${body}  (+${changedKeys.length - 1} more)`;
      }
    }
  } catch {
    /* fall back to the generic message */
  }
  showDesktop(title, body);
}

export function useChatNotifier(enabled = true) {
  const me = getUser();
  const myId = me?.id;
  const prevCounts = useRef(null); // null until the first poll sets a baseline

  // Prime the audio on the first interaction anywhere, so chimes work even if
  // the user never opens the widget.
  useEffect(() => {
    if (!enabled) return;
    const prime = () => primeAlertSound();
    window.addEventListener('pointerdown', prime, { once: true });
    return () => window.removeEventListener('pointerdown', prime);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !myId) return;
    let cancelled = false;

    const poll = async () => {
      if (!getAlertsEnabled()) return;
      try {
        const data = await api('/api/chat/unread');
        if (cancelled) return;
        const rooms = data?.rooms || {};
        const muted = mutedSet();

        if (prevCounts.current == null) {
          prevCounts.current = rooms; // baseline — don't alert for the backlog
          return;
        }

        const increased = [];
        for (const [key, n] of Object.entries(rooms)) {
          if (muted.has(key)) continue;
          if ((Number(n) || 0) > (prevCounts.current[key] || 0)) increased.push(key);
        }
        prevCounts.current = rooms;

        if (increased.length) {
          playChime();
          // Only pop a desktop notification when the user isn't already looking.
          if (!document.hasFocus()) enrichAndNotify(increased).catch(() => {});
        }
      } catch {
        /* ignore — try again next tick */
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    const onFocus = () => poll();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, myId]);
}
