import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getUser } from '../lib/auth.js';
import Avatar from './Avatar.jsx';
import Modal from './Modal.jsx';
import { useChatUnread } from '../lib/useChatUnread.js';
import {
  useChatNotifier,
  primeAlertSound,
  requestChatNotifyPermission,
  getAlertsEnabled,
  setAlertsEnabled
} from '../lib/useChatNotifier.js';

// A compact, self-contained chat launcher: a hovering circle bottom-right that
// opens a small panel for reading and sending messages without leaving the page.
// It reuses the same /api/chat endpoints as the full Chat Room page; richer
// features (groups, typing, mute/archive) stay on /chat.
const MESSAGE_POLL_MS = 5000;
const ROOMS_POLL_MS = 30000;
const MAX_LEN = 2000;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // matches the server's 10 MB cap
const ACCEPTED = 'image/*,video/*,application/pdf,.txt,.doc,.docx,.xls,.xlsx,.zip';

function roomTitle(room) {
  if (!room) return '';
  if (room.kind === 'channel') return room.label || 'Team Chat';
  if (room.kind === 'group') return room.name || 'Group';
  return room.other?.name || 'Direct message';
}

function compactTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FloatingChat() {
  const me = getUser();
  const myId = me?.id;
  const unread = useChatUnread(!!me);
  useChatNotifier(!!me); // sound + desktop alerts on new messages

  const [open, setOpen] = useState(false);
  const [alertsOn, setAlertsOn] = useState(getAlertsEnabled());
  const [rooms, setRooms] = useState([]);
  const [activeKey, setActiveKey] = useState(null); // null → conversation list
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [unreadByRoom, setUnreadByRoom] = useState({});
  const [confirmId, setConfirmId] = useState(null); // message pending unsend
  const [removing, setRemoving] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [attachError, setAttachError] = useState('');
  const [lightbox, setLightbox] = useState(null); // { url, name } — image preview overlay

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastSeenIdRef = useRef(0);

  // Load conversations whenever the panel is open, then poll for new ones.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [r, u] = await Promise.all([api('/api/chat/rooms'), api('/api/chat/unread')]);
        if (cancelled) return;
        if (Array.isArray(r)) setRooms(r);
        setUnreadByRoom(u?.rooms || {});
      } catch {
        // ignore — keep what we have
      }
    };
    load();
    const id = setInterval(load, ROOMS_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [open]);

  // Clear a room's badge locally + advance the server read cursor.
  const markRead = async (room, lastId) => {
    if (!room || !lastId) return;
    setUnreadByRoom((prev) => {
      if (!prev[room]) return prev;
      const next = { ...prev };
      delete next[room];
      return next;
    });
    try {
      await api('/api/chat/read', { method: 'POST', body: JSON.stringify({ room, last_id: lastId }) });
    } catch {
      // ignore — reconciled on next view
    }
    window.dispatchEvent(new Event('chat-read'));
  };

  // Load + poll messages for the open conversation.
  useEffect(() => {
    if (!open || !activeKey) return;
    let cancelled = false;
    setMessages([]);
    setLoading(true);
    lastSeenIdRef.current = 0;

    api(`/api/chat/messages?room=${encodeURIComponent(activeKey)}`)
      .then((list) => {
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setMessages(arr);
        if (arr.length) {
          const lastId = arr[arr.length - 1].id;
          lastSeenIdRef.current = lastId;
          markRead(activeKey, lastId);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    const id = setInterval(async () => {
      try {
        const since = lastSeenIdRef.current;
        const fresh = await api(`/api/chat/messages?room=${encodeURIComponent(activeKey)}&since=${since}`);
        if (Array.isArray(fresh) && fresh.length) {
          setMessages((prev) => {
            const byId = new Map(prev.map((m) => [m.id, m]));
            for (const m of fresh) byId.set(m.id, m);
            return Array.from(byId.values()).sort((a, b) => a.id - b.id);
          });
          const maxId = fresh.reduce((mx, m) => (m.id > mx ? m.id : mx), lastSeenIdRef.current);
          lastSeenIdRef.current = maxId;
          markRead(activeKey, maxId);
        }
      } catch {
        // ignore
      }
    }, MESSAGE_POLL_MS);

    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeKey]);

  // Keep the thread pinned to the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  // Drop a staged attachment / error when switching conversations.
  useEffect(() => {
    setPendingFile(null);
    setAttachError('');
  }, [activeKey]);

  // Close the image lightbox on Escape.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const sortedRooms = useMemo(() => {
    const copy = [...rooms];
    copy.sort((a, b) => {
      const ta = a.last?.created_at ? new Date(a.last.created_at).getTime() : 0;
      const tb = b.last?.created_at ? new Date(b.last.created_at).getTime() : 0;
      return tb - ta;
    });
    return copy;
  }, [rooms]);

  const send = async (e) => {
    e?.preventDefault();
    const body = draft.trim();
    if ((!body && !pendingFile) || sending || !activeKey) return;
    setSending(true);
    setAttachError('');
    try {
      let created;
      if (pendingFile) {
        const fd = new FormData();
        fd.append('body', body);
        fd.append('room', activeKey);
        fd.append('file', pendingFile);
        created = await api('/api/chat/messages', { method: 'POST', body: fd });
      } else {
        created = await api('/api/chat/messages', {
          method: 'POST',
          body: JSON.stringify({ body, room: activeKey })
        });
      }
      setMessages((prev) => (prev.some((m) => m.id === created.id) ? prev : [...prev, created]));
      lastSeenIdRef.current = Math.max(lastSeenIdRef.current, created.id);
      setDraft('');
      setPendingFile(null);
    } catch (err) {
      setAttachError(err.message || 'Could not send the message.');
    } finally {
      setSending(false);
    }
  };

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setAttachError('File is larger than 10 MB.');
      return;
    }
    setAttachError('');
    setPendingFile(f);
  };

  // Toggling the launcher is also our chance to satisfy the browser's
  // user-gesture requirements: prime audio + ask for notification permission.
  const toggleOpen = () => {
    setOpen((o) => {
      const next = !o;
      if (next) {
        primeAlertSound();
        requestChatNotifyPermission();
      }
      return next;
    });
  };

  const toggleAlerts = () => {
    const next = !alertsOn;
    setAlertsEnabled(next);
    setAlertsOn(next);
    if (next) {
      primeAlertSound();
      requestChatNotifyPermission();
    }
  };

  // Unsend the message awaiting confirmation: soft-deletes server-side
  // (author-only) and leaves a "Message removed" placeholder in the thread.
  const removeMessage = async () => {
    const id = confirmId;
    if (!id) return;
    setRemoving(true);
    try {
      await api(`/api/chat/messages/${id}`, { method: 'DELETE' });
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, is_unsent: true, body: '', attachment_url: null } : m))
      );
      setConfirmId(null);
    } catch {
      // ignore — the poll will reconcile the unsent state
    } finally {
      setRemoving(false);
    }
  };

  if (!me) return null;

  const activeRoom = rooms.find((r) => r.key === activeKey) || null;
  const totalUnread = unread;

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-5 z-40 flex h-[30rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 print:hidden">
          {!activeKey ? (
            <>
              {/* Conversation list */}
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-brand-900 dark:text-slate-100">Messages</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleAlerts}
                    className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    title={alertsOn ? 'Mute message alerts' : 'Enable message alerts'}
                    aria-label={alertsOn ? 'Mute message alerts' : 'Enable message alerts'}
                  >
                    {alertsOn ? (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0M18.63 13A17.89 17.89 0 0 1 18 8M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14M18 8a6 6 0 0 0-9.33-5M1 1l22 22" /></svg>
                    )}
                  </button>
                  <Link to="/chat" onClick={() => setOpen(false)} className="text-xs font-semibold text-accent-700 hover:underline dark:text-accent-400">
                    Open full chat →
                  </Link>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {sortedRooms.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">No conversations yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {sortedRooms.map((room) => {
                      const n = unreadByRoom[room.key] || 0;
                      const preview = room.last?.is_unsent ? 'Message removed' : room.last?.body || 'No messages yet';
                      return (
                        <li key={room.key}>
                          <button
                            type="button"
                            onClick={() => setActiveKey(room.key)}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                          >
                            <Avatar name={roomTitle(room)} src={room.kind === 'dm' ? room.other?.avatar_url : null} size="h-9 w-9" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{roomTitle(room)}</span>
                              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                                {room.last?.user_name ? `${room.last.user_name}: ` : ''}{preview}
                              </span>
                            </span>
                            {n > 0 && (
                              <span className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
                                {n > 99 ? '99+' : n}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Thread */}
              <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveKey(null)}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  aria-label="Back to conversations"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
                <Avatar name={roomTitle(activeRoom)} src={activeRoom?.kind === 'dm' ? activeRoom?.other?.avatar_url : null} size="h-7 w-7" textClass="text-[11px]" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-brand-900 dark:text-slate-100">{roomTitle(activeRoom)}</span>
              </div>

              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
                {loading ? (
                  <p className="py-8 text-center text-xs text-slate-400">Loading…</p>
                ) : messages.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">No messages yet. Say hi 👋</p>
                ) : (
                  messages.map((m) => {
                    const mine = m.user_id === myId;
                    const mime = m.attachment_mime || '';
                    const hasAttachment = !m.is_unsent && !!m.attachment_url;
                    const isImage = hasAttachment && mime.startsWith('image/');
                    const isVideo = hasAttachment && mime.startsWith('video/');
                    const isFile = hasAttachment && !isImage && !isVideo;
                    const mediaOnly = (isImage || isVideo) && !m.body;
                    const bubbleCls = m.is_unsent
                      ? 'rounded-2xl px-3 py-1.5 text-sm bg-slate-100 italic text-slate-400 dark:bg-slate-800'
                      : mediaOnly
                        ? 'overflow-hidden rounded-2xl'
                        : `rounded-2xl px-3 py-1.5 text-sm ${mine ? 'bg-accent-600 text-white' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'}`;
                    return (
                      <div key={m.id} className={`group flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                        {!mine && (
                          <span className="mb-0.5 px-1 text-[10px] font-semibold text-slate-400">{m.user_name}</span>
                        )}
                        <div className={`flex max-w-[85%] items-center gap-1 ${mine ? 'flex-row' : 'flex-row-reverse'}`}>
                          {mine && !m.is_unsent && (
                            <button
                              type="button"
                              onClick={() => setConfirmId(m.id)}
                              className="shrink-0 rounded-full p-1 text-slate-400 opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-rose-500/10"
                              title="Unsend message"
                              aria-label="Unsend message"
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                            </button>
                          )}
                          <div className={bubbleCls}>
                            {m.is_unsent ? (
                              'Message removed'
                            ) : (
                              <>
                                {isImage && (
                                  <button
                                    type="button"
                                    onClick={() => setLightbox({ url: m.attachment_url, name: m.attachment_filename })}
                                    className="block cursor-zoom-in"
                                  >
                                    <img src={m.attachment_url} alt={m.attachment_filename || 'image'} className="block max-h-52 max-w-full rounded-lg object-cover" />
                                  </button>
                                )}
                                {isVideo && (
                                  <video src={m.attachment_url} controls className="block max-h-52 max-w-full rounded-lg" />
                                )}
                                {isFile && (
                                  <a href={m.attachment_url} target="_blank" rel="noreferrer" download={m.attachment_filename} className={`block text-xs font-semibold underline ${mine ? 'text-white' : 'text-accent-700 dark:text-accent-400'}`}>
                                    📎 {m.attachment_filename || 'Attachment'}
                                  </a>
                                )}
                                {m.body && (
                                  <span className={`whitespace-pre-wrap break-words${isImage || isVideo ? ' mt-1 block' : ''}`}>{m.body}</span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        <span className="mt-0.5 px-1 text-[10px] text-slate-400">{compactTime(m.created_at)}</span>
                      </div>
                    );
                  })
                )}
              </div>

              <form onSubmit={send} className="border-t border-slate-100 px-3 py-2.5 dark:border-slate-800">
                {attachError && (
                  <p className="mb-1.5 px-1 text-[11px] text-rose-600 dark:text-rose-400">{attachError}</p>
                )}
                {pendingFile && (
                  <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs dark:bg-slate-800">
                    <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                    <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{pendingFile.name}</span>
                    <span className="shrink-0 text-[10px] text-slate-400">{formatSize(pendingFile.size)}</span>
                    <button type="button" onClick={() => setPendingFile(null)} aria-label="Remove attachment" className="shrink-0 rounded p-0.5 text-slate-400 hover:text-rose-600">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input ref={fileInputRef} type="file" accept={ACCEPTED} onChange={onPickFile} className="hidden" />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                    aria-label="Attach a file"
                    title="Attach a file"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                  </button>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={MAX_LEN}
                    placeholder="Type a message…"
                    className="flex-1 rounded-full border border-slate-300 bg-white px-3.5 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    disabled={(!draft.trim() && !pendingFile) || sending}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50"
                    aria-label="Send message"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}

      {/* Hovering circle launcher */}
      <button
        type="button"
        onClick={toggleOpen}
        className="fixed bottom-5 right-5 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent-600 text-white shadow-lg ring-1 ring-black/5 transition-transform hover:bg-accent-700 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 print:hidden"
        aria-label={open ? 'Close chat' : 'Open chat'}
      >
        {open ? (
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        ) : (
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
        )}
        {!open && totalUnread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center">
            {/* Pulsing halo so a new message is hard to miss */}
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          </span>
        )}
      </button>

      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Close image"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
          <img
            src={lightbox.url}
            alt={lightbox.name || 'image'}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}

      {confirmId && (
        <Modal open onClose={() => !removing && setConfirmId(null)} title="Unsend message" size="sm">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-brand-900 dark:text-white">Unsend this message?</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">It will be replaced with a “Message removed” placeholder for everyone. This can't be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost !px-3.5 !py-2 text-xs" onClick={() => setConfirmId(null)} disabled={removing}>Cancel</button>
              <button
                type="button"
                onClick={removeMessage}
                disabled={removing}
                className="inline-flex items-center rounded-md bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {removing ? 'Removing…' : 'Unsend'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
