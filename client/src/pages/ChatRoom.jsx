import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { api, getUser } from '../lib/auth.js';

const MESSAGE_POLL_MS = 5000;
const ROOMS_POLL_MS = 30000;
const TYPING_POLL_MS = 2500;
const GROUP_GAP_MS = 5 * 60 * 1000;
const MAX_LEN = 2000;
const GENERAL_KEY = 'general';
const LS_ARCHIVE = 'mf_chat_archived';
const LS_MUTE = 'mf_chat_muted';
// A user is considered online if we've seen them within this window. The
// presence ping in middleware/auth.js bumps last_seen_at every 30s, so 90s
// gives a couple of tolerant misses before we mark someone offline.
const ONLINE_WINDOW_MS = 90_000;

function isOnline(lastSeenAt, now) {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (Number.isNaN(t)) return false;
  return now - t < ONLINE_WINDOW_MS;
}

function loadKeySet(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

function saveKeySet(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // ignore quota errors
  }
}

function dmKey(a, b) {
  const x = Number(a);
  const y = Number(b);
  const [lo, hi] = x < y ? [x, y] : [y, x];
  return `dm:${lo}:${hi}`;
}

export default function ChatRoom() {
  const me = getUser();
  const myId = me?.id;

  const [rooms, setRooms] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [activeKey, setActiveKey] = useState(GENERAL_KEY);
  // pendingRoom holds a "draft" DM not yet in `rooms` (no messages yet).
  const [pendingRoom, setPendingRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [unreadByRoom, setUnreadByRoom] = useState({});
  const [typingUsers, setTypingUsers] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [mobileView, setMobileView] = useState('list'); // 'list' | 'thread'
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [archived, setArchived] = useState(() => loadKeySet(LS_ARCHIVE));
  const [muted, setMuted] = useState(() => loadKeySet(LS_MUTE));
  const [showArchived, setShowArchived] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const fileInputRef = useRef(null);

  const scrollRef = useRef(null);
  const stickyToBottom = useRef(true);
  // Highest message id we've loaded — the poll cursor. Held in a ref so the
  // poll interval can read it without re-subscribing on every new message.
  const lastSeenIdRef = useRef(0);
  // Highest message id we've reported as read per room, to avoid redundant POSTs.
  const markedReadRef = useRef({});
  // Throttle the "I'm typing" heartbeat to at most one POST every few seconds.
  const lastTypingRef = useRef(0);

  // Tell the server we're typing in the active room (throttled).
  const notifyTyping = () => {
    const now = Date.now();
    if (now - lastTypingRef.current < 2500) return;
    lastTypingRef.current = now;
    api('/api/chat/typing', { method: 'POST', body: JSON.stringify({ room: activeKey }) }).catch(() => {});
  };

  // Pull per-room unread counts (drives the conversation badges + nav badge).
  const refreshUnread = async () => {
    try {
      const data = await api('/api/chat/unread');
      setUnreadByRoom(data?.rooms || {});
    } catch {
      // ignore — keep the previous counts
    }
  };

  // Mark a room read up to lastId: clears its badge, advances the server cursor,
  // and notifies the header so the Chat nav badge refreshes.
  const markRoomRead = async (room, lastId) => {
    if (!room || !lastId || (markedReadRef.current[room] || 0) >= lastId) return;
    markedReadRef.current[room] = lastId;
    setUnreadByRoom((prev) => {
      if (!prev[room]) return prev;
      const next = { ...prev };
      delete next[room];
      return next;
    });
    try {
      await api('/api/chat/read', { method: 'POST', body: JSON.stringify({ room, last_id: lastId }) });
    } catch {
      // ignore — a later view will reconcile
    }
    window.dispatchEvent(new Event('chat-read'));
  };

  // Refresh "online" calculation on a clock independent of the rooms poll so
  // people drop offline ~ONLINE_WINDOW_MS after they stop pinging the API.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Keep an object URL alive for image previews; revoke when it changes.
  useEffect(() => {
    if (!pendingFile || !pendingFile.type?.startsWith('image/')) {
      setFilePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const pickFile = (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Attachment must be 10 MB or smaller.');
      return;
    }
    setError('');
    setPendingFile(file);
  };

  const clearPendingFile = () => {
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Initial: rooms + directory
  useEffect(() => {
    let cancelled = false;
    Promise.all([api('/api/chat/rooms'), api('/api/users/directory')])
      .then(([r, dir]) => {
        if (cancelled) return;
        setRooms(Array.isArray(r) ? r : []);
        setDirectory(Array.isArray(dir) ? dir.filter((u) => u.id !== myId) : []);
      })
      .catch((e) => !cancelled && setError(e.message));
    refreshUnread();
    return () => { cancelled = true; };
  }, [myId]);

  // Background poll for rooms (to surface new DMs from other people)
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await api('/api/chat/rooms');
        if (Array.isArray(r)) setRooms(r);
        refreshUnread();
      } catch {
        // ignore
      }
    }, ROOMS_POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Load messages whenever active room changes
  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setLoadingMessages(true);
    api(`/api/chat/messages?room=${encodeURIComponent(activeKey)}`)
      .then((list) => {
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setMessages(arr);
        setError('');
        stickyToBottom.current = true;
        // Opening a room marks everything in it read.
        if (arr.length) markRoomRead(activeKey, arr[arr.length - 1].id);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoadingMessages(false));
    return () => { cancelled = true; };
  }, [activeKey]);

  // Keep the poll cursor in sync with the loaded messages. This lets the poll
  // effect below depend only on `activeKey` — one stable interval per room —
  // instead of tearing down and recreating the timer on every new message.
  useEffect(() => {
    lastSeenIdRef.current = messages.length ? messages[messages.length - 1].id : 0;
  }, [messages]);

  // Poll for new messages in the active room. When the thread is empty the
  // cursor is 0, so we poll with since=0 and still pick up the first message
  // that arrives into a previously-empty room (e.g. a fresh DM). The response
  // may also include older messages that were just unsent — merge them in by
  // upsert so the local copy flips to the "unsent" placeholder.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const since = lastSeenIdRef.current;
        const fresh = await api(`/api/chat/messages?room=${encodeURIComponent(activeKey)}&since=${since}`);
        if (Array.isArray(fresh) && fresh.length) {
          setMessages((prev) => {
            const byId = new Map(prev.map((m) => [m.id, m]));
            let changed = false;
            for (const m of fresh) {
              const cur = byId.get(m.id);
              if (!cur) { byId.set(m.id, m); changed = true; }
              else if (cur.is_unsent !== m.is_unsent) { byId.set(m.id, m); changed = true; }
            }
            return changed ? Array.from(byId.values()).sort((a, b) => a.id - b.id) : prev;
          });
          // We're looking at this room, so new arrivals are read immediately.
          const maxFresh = fresh.reduce((mx, m) => (m.id > mx ? m.id : mx), 0);
          markRoomRead(activeKey, maxFresh);
        }
      } catch {
        // ignore
      }
    }, MESSAGE_POLL_MS);
    return () => clearInterval(id);
  }, [activeKey]);

  // Poll who else is typing in the active room. Reset on room change so a
  // stale indicator from the previous room never bleeds across.
  useEffect(() => {
    setTypingUsers([]);
    const id = setInterval(async () => {
      try {
        const data = await api(`/api/chat/typing?room=${encodeURIComponent(activeKey)}`);
        setTypingUsers(Array.isArray(data?.users) ? data.users : []);
      } catch {
        // ignore
      }
    }, TYPING_POLL_MS);
    return () => clearInterval(id);
  }, [activeKey]);

  // Pin to bottom only when the user is already there
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickyToBottom.current = dist < 80;
  };

  useEffect(() => {
    if (!stickyToBottom.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loadingMessages]);

  const send = async (e) => {
    e?.preventDefault();
    const body = draft.trim();
    if ((!body && !pendingFile) || sending) return;
    setSending(true);
    setError('');
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
      setDraft('');
      clearPendingFile();
      stickyToBottom.current = true;

      // If we just sent into a draft DM, promote it into the rooms list now
      // that it has at least one message.
      if (pendingRoom && pendingRoom.key === activeKey) {
        setRooms((prev) => {
          if (prev.some((r) => r.key === activeKey)) return prev;
          return [
            prev[0],
            { ...pendingRoom, last: { body: created.body, user_name: created.user_name, created_at: created.created_at } },
            ...prev.slice(1)
          ];
        });
        setPendingRoom(null);
      } else {
        // Optimistic last-message preview on the existing row
        setRooms((prev) =>
          prev.map((r) =>
            r.key === activeKey
              ? { ...r, last: { body: created.body, user_name: created.user_name, created_at: created.created_at } }
              : r
          )
        );
      }
    } catch (err) {
      setError(err.message || 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api(`/api/chat/messages/${deleteTarget.id}`, { method: 'DELETE' });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === deleteTarget.id
            ? {
                ...m,
                is_unsent: 1,
                body: '',
                attachment_url: null,
                attachment_filename: null,
                attachment_mime: null,
                attachment_size: null,
                unsent_at: new Date().toISOString()
              }
            : m
        )
      );
      setDeleteTarget(null);
    } catch (e) {
      setError(e.message || 'Could not unsend message.');
      setDeleteTarget(null);
    }
  };

  const openConversation = (key) => {
    setActiveKey(key);
    setMobileView('thread');
  };

  const toggleArchived = (key) => {
    setArchived((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      saveKeySet(LS_ARCHIVE, next);
      return next;
    });
  };

  const toggleMuted = (key) => {
    setMuted((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      saveKeySet(LS_MUTE, next);
      return next;
    });
  };

  const handleLeaveGroup = async () => {
    if (!leaveTarget) return;
    try {
      await api(`/api/chat/groups/${leaveTarget.id}/leave`, { method: 'POST' });
      setRooms((prev) => prev.filter((r) => r.key !== leaveTarget.key));
      if (activeKey === leaveTarget.key) {
        setActiveKey(GENERAL_KEY);
        setMobileView('list');
      }
      setLeaveTarget(null);
    } catch (e) {
      setError(e.message || 'Could not leave group.');
      setLeaveTarget(null);
    }
  };

  const handleCreateGroup = async ({ name, memberIds }) => {
    const group = await api('/api/chat/groups', {
      method: 'POST',
      body: JSON.stringify({ name: name || null, member_ids: memberIds })
    });
    setRooms((prev) => {
      const general = prev[0] && prev[0].kind === 'channel' ? prev[0] : null;
      const rest = general ? prev.slice(1) : prev;
      return general ? [general, group, ...rest] : [group, ...rest];
    });
    setShowCreateGroup(false);
    setActiveKey(group.key);
    setMobileView('thread');
  };

  const startDmWith = (user) => {
    const key = dmKey(myId, user.id);
    const existing = rooms.find((r) => r.key === key);
    if (!existing) {
      setPendingRoom({
        key,
        kind: 'dm',
        other: {
          id: user.id,
          name: user.name,
          role: user.role,
          department: user.department,
          last_seen_at: user.last_seen_at
        },
        last: null
      });
    }
    setActiveKey(key);
    setQuery('');
    setMobileView('thread');
  };

  // Build the visible left-side list — split into active + archived buckets.
  const { activeList, archivedList } = useMemo(() => {
    const general = rooms.find((r) => r.key === GENERAL_KEY) || {
      key: GENERAL_KEY,
      kind: 'channel',
      label: 'Team Chat',
      sub: 'Everyone in the org',
      last: null
    };
    const conversations = rooms.filter((r) => r.kind === 'dm' || r.kind === 'group');
    let combined = [general, ...conversations];
    if (pendingRoom && !combined.some((r) => r.key === pendingRoom.key)) {
      combined = [general, pendingRoom, ...conversations];
    }

    const q = query.trim().toLowerCase();
    const matches = (r) => {
      if (!q) return true;
      if (r.kind === 'channel') return r.label.toLowerCase().includes(q);
      if (r.kind === 'group') {
        return (
          r.name?.toLowerCase().includes(q) ||
          (r.members || []).some((m) => m.name?.toLowerCase().includes(q))
        );
      }
      return (
        r.other?.name?.toLowerCase().includes(q) ||
        r.other?.email?.toLowerCase().includes(q) ||
        r.other?.department?.toLowerCase().includes(q)
      );
    };

    const active = [];
    const archivedRooms = [];
    for (const r of combined.filter(matches)) {
      if (archived.has(r.key)) archivedRooms.push(r);
      else active.push(r);
    }
    return { activeList: active, archivedList: archivedRooms };
  }, [rooms, pendingRoom, query, archived]);

  // When searching, surface directory users who aren't already in the list
  const startNewMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const existingDmIds = new Set(
      [...rooms.filter((r) => r.kind === 'dm'), ...(pendingRoom ? [pendingRoom] : [])].map((r) => r.other?.id)
    );
    return directory
      .filter((u) => !existingDmIds.has(u.id))
      .filter(
        (u) =>
          u.name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.department?.toLowerCase().includes(q)
      )
      .slice(0, 25);
  }, [query, directory, rooms, pendingRoom]);

  const activeRoom = useMemo(() => {
    if (activeKey === GENERAL_KEY) {
      return (
        rooms.find((r) => r.key === GENERAL_KEY) || {
          key: GENERAL_KEY,
          kind: 'channel',
          label: 'Team Chat',
          sub: 'Everyone in the org'
        }
      );
    }
    return rooms.find((r) => r.key === activeKey) || pendingRoom || null;
  }, [activeKey, rooms, pendingRoom]);

  const isAdmin = me?.role === 'admin';

  // Group consecutive messages by sender
  const groups = useMemo(() => {
    const out = [];
    for (const m of messages) {
      const last = out[out.length - 1];
      const lastMsg = last && last.messages[last.messages.length - 1];
      const sameSender = last && last.user_id === m.user_id;
      const sameWindow =
        lastMsg && new Date(m.created_at) - new Date(lastMsg.created_at) < GROUP_GAP_MS;
      if (sameSender && sameWindow) {
        last.messages.push(m);
      } else {
        out.push({
          user_id: m.user_id,
          user_name: m.user_name,
          user_role: m.user_role,
          user_department: m.user_department,
          avatar_url: m.avatar_url,
          messages: [m]
        });
      }
    }
    return out;
  }, [messages]);

  const draftCount = draft.length;
  const tooLong = draftCount > MAX_LEN;

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      <DashboardHeader />

      <div className="flex-1 flex min-h-0">
        {/* Conversations sidebar */}
        <aside
          className={`w-full lg:w-80 xl:w-96 flex-none flex-col border-r border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 ${
            mobileView === 'thread' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-brand-900 dark:text-slate-100">Chats</h2>
              <button
                type="button"
                onClick={() => setShowCreateGroup(true)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-accent-700 hover:bg-accent-50 transition-colors dark:text-accent-300 dark:hover:bg-accent-500/10"
                title="Create a group chat"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New group
              </button>
            </div>
            <div className="relative mt-2">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
                placeholder="Search or start a new chat…"
                className="block w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeList.length === 0 && archivedList.length === 0 && startNewMatches.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No matches.
              </p>
            ) : (
              <>
                {activeList.length > 0 && (
                  <ul className="py-1">
                    {activeList.map((r) => (
                      <li key={r.key}>
                        <ConversationRow
                          room={r}
                          active={r.key === activeKey}
                          unread={r.key === activeKey ? 0 : (unreadByRoom[r.key] || 0)}
                          muted={muted.has(r.key)}
                          archived={false}
                          isAdmin={isAdmin}
                          now={now}
                          onClick={() => openConversation(r.key)}
                          onToggleMute={() => toggleMuted(r.key)}
                          onToggleArchive={() => toggleArchived(r.key)}
                          onLeave={() => setLeaveTarget(r)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {archivedList.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowArchived((v) => !v)}
                      className="w-full px-4 py-2 text-left flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/60"
                    >
                      <span className="flex items-center gap-2">
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 5h18v4H3zM5 9v10h14V9M10 13h4" />
                        </svg>
                        Archived ({archivedList.length})
                      </span>
                      <svg className={`h-3.5 w-3.5 transition-transform ${showArchived ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    {showArchived && (
                      <ul className="py-1">
                        {archivedList.map((r) => (
                          <li key={r.key}>
                            <ConversationRow
                              room={r}
                              active={r.key === activeKey}
                              unread={r.key === activeKey ? 0 : (unreadByRoom[r.key] || 0)}
                              muted={muted.has(r.key)}
                              archived={true}
                              isAdmin={isAdmin}
                              now={now}
                              onClick={() => openConversation(r.key)}
                              onToggleMute={() => toggleMuted(r.key)}
                              onToggleArchive={() => toggleArchived(r.key)}
                              onLeave={() => setLeaveTarget(r)}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {startNewMatches.length > 0 && (
                  <>
                    <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Start new chat
                    </div>
                    <ul className="py-1">
                      {startNewMatches.map((u) => (
                        <li key={u.id}>
                          <button
                            type="button"
                            onClick={() => startDmWith(u)}
                            className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                          >
                            <span className="relative flex-none">
                              {u.avatar_url ? (
                                <img src={u.avatar_url} alt={u.name} className="h-9 w-9 rounded-full object-cover bg-slate-100 ring-1 ring-inset ring-slate-200 dark:ring-slate-700" />
                              ) : (
                                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-xs font-bold ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                                  {initials(u.name)}
                                </span>
                              )}
                              {isOnline(u.last_seen_at, now) && <OnlineDot title="Online" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-slate-800 truncate dark:text-slate-200">{u.name}</span>
                              <span className="block text-xs text-slate-500 truncate dark:text-slate-400">
                                {u.department || u.role || u.email}
                              </span>
                            </span>
                            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 12h14M13 5l7 7-7 7" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Active conversation */}
        <main
          className={`flex-1 flex-col min-h-0 ${
            mobileView === 'list' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {!activeRoom ? (
            <EmptyPane onPickList={() => setMobileView('list')} />
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:bg-slate-900 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setMobileView('list')}
                  className="lg:hidden inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label="Back to conversations"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 5l-7 7 7 7" />
                  </svg>
                </button>
                <span className="relative flex-none">
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${
                      activeRoom.kind === 'channel' ? 'bg-accent-600' : activeRoom.kind === 'group' ? 'bg-brand-700 dark:bg-brand-500' : 'bg-brand-900 dark:bg-brand-600'
                    }`}
                  >
                    {activeRoom.kind === 'channel' ? (
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a4 4 0 0 1-4 4H8l-5 4V6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v9z" />
                      </svg>
                    ) : activeRoom.kind === 'group' ? (
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    ) : (
                      initials(activeRoom.other?.name)
                    )}
                  </span>
                  {activeRoom.kind === 'dm' && isOnline(activeRoom.other?.last_seen_at, now) && (
                    <OnlineDot title="Online" />
                  )}
                  {activeRoom.kind === 'group' && (activeRoom.members || []).some((m) => m.id !== myId && isOnline(m.last_seen_at, now)) && (
                    <OnlineDot title="Members online" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 className="text-sm font-bold text-brand-900 truncate dark:text-slate-100">
                      {activeRoom.kind === 'channel'
                        ? activeRoom.label
                        : activeRoom.kind === 'group'
                          ? activeRoom.name
                          : activeRoom.other?.name}
                    </h2>
                    {activeRoom.kind === 'dm' && activeRoom.other?.role && activeRoom.other.role !== 'user' && (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                        {activeRoom.other.role}
                      </span>
                    )}
                    {activeRoom.kind === 'group' && (
                      <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-700 ring-1 ring-inset ring-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-500/30">
                        Group
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate dark:text-slate-400">
                    {activeRoom.kind === 'channel'
                      ? activeRoom.sub
                      : activeRoom.kind === 'group'
                        ? (activeRoom.members || []).map((m) => m.id === myId ? 'You' : m.name).join(', ')
                        : activeRoom.other?.department || activeRoom.other?.email || 'Direct message'}
                  </p>
                </div>
                <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent-700 dark:text-accent-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-500 animate-pulse" />
                  Live
                </span>
              </header>

              <div
                ref={scrollRef}
                onScroll={onScroll}
                className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-4 min-h-0"
              >
                {loadingMessages ? (
                  <div className="text-center text-sm text-slate-500 py-10 dark:text-slate-400">Loading messages…</div>
                ) : error && messages.length === 0 ? (
                  <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
                ) : messages.length === 0 ? (
                  <EmptyThread room={activeRoom} />
                ) : (
                  renderGroupsWithDividers(groups, myId, setDeleteTarget)
                )}
              </div>

              <TypingIndicator users={typingUsers} />

              <form onSubmit={send} className="border-t border-slate-200 bg-white p-3 dark:bg-slate-900 dark:border-slate-800">
                {pendingFile && (
                  <AttachmentPreview
                    file={pendingFile}
                    previewUrl={filePreviewUrl}
                    onRemove={clearPendingFile}
                  />
                )}
                <div className="flex gap-2 items-end">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={(e) => pickFile(e.target.files?.[0])}
                    accept="image/*,application/pdf,.txt,.doc,.docx,.xls,.xlsx,.zip"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach a file or image"
                    aria-label="Attach a file or image"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:text-brand-900 hover:bg-slate-100 transition-colors self-stretch shrink-0 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.48-8.48l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                  </button>
                  <textarea
                    value={draft}
                    onChange={(e) => { setDraft(e.target.value); if (e.target.value.trim()) notifyTyping(); }}
                    onKeyDown={onKey}
                    rows={1}
                    placeholder={
                      activeRoom.kind === 'channel'
                        ? `Message #${activeRoom.label.toLowerCase().replace(/\s+/g, '-')}…`
                        : activeRoom.kind === 'group'
                          ? `Message ${activeRoom.name}…`
                          : `Message ${activeRoom.other?.name || ''}…`
                    }
                    className={`flex-1 resize-none rounded-md border px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-1 max-h-32 ${
                      tooLong
                        ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                        : 'border-slate-300 focus:border-accent-500 focus:ring-accent-500'
                    } dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500`}
                  />
                  <button
                    type="submit"
                    disabled={sending || (!draft.trim() && !pendingFile) || tooLong}
                    className="btn-primary !px-4 !py-2 text-xs disabled:opacity-60 self-stretch shrink-0"
                  >
                    {sending ? '…' : 'Send'}
                  </button>
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] text-slate-400 dark:text-slate-500">
                  <span>Enter to send · Shift+Enter for a new line</span>
                  <span className={tooLong ? 'text-rose-500 font-semibold' : ''}>
                    {draftCount}/{MAX_LEN}
                  </span>
                </div>
                {error && messages.length > 0 && (
                  <div className="mt-2 rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-1.5 text-xs text-rose-700">{error}</div>
                )}
              </form>
            </>
          )}
        </main>
      </div>

      {deleteTarget && (
        <DeleteConfirm
          message={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}

      {showCreateGroup && (
        <CreateGroupModal
          directory={directory}
          onCancel={() => setShowCreateGroup(false)}
          onSubmit={handleCreateGroup}
        />
      )}

      {leaveTarget && (
        <LeaveGroupConfirm
          group={leaveTarget}
          onCancel={() => setLeaveTarget(null)}
          onConfirm={handleLeaveGroup}
        />
      )}
    </div>
  );
}

function ConversationRow({
  room,
  active,
  unread = 0,
  muted,
  archived,
  isAdmin,
  now,
  onClick,
  onToggleMute,
  onToggleArchive,
  onLeave
}) {
  const hasUnread = unread > 0;
  const isChannel = room.kind === 'channel';
  const isGroup = room.kind === 'group';
  const title = isChannel ? room.label : isGroup ? room.name : room.other?.name || 'Unknown';
  const dmOnline = !isChannel && !isGroup && isOnline(room.other?.last_seen_at, now);
  const groupOnlineCount = isGroup
    ? (room.members || []).filter((m) => isOnline(m.last_seen_at, now)).length
    : 0;
  const lastPreview = room.last?.is_unsent
    ? 'Message unsent'
    : room.last?.body;
  const sub = room.last
    ? `${room.last.user_name ? `${room.last.user_name}: ` : ''}${lastPreview || ''}`
    : isChannel
      ? room.sub
      : isGroup
        ? `${room.member_count || (room.members?.length ?? 0)} members`
        : room.other?.department || room.other?.email || 'No messages yet';
  return (
    <div
      className={`group relative flex items-stretch transition-colors ${
        active
          ? 'bg-accent-50 dark:bg-accent-500/10'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex-1 min-w-0 text-left flex items-start gap-3 px-4 py-2.5"
      >
        <span className="relative flex-none">
          <span
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white ${
              isChannel ? 'bg-accent-600' : isGroup ? 'bg-brand-700 dark:bg-brand-500' : 'bg-brand-900 dark:bg-brand-600'
            }`}
          >
            {isChannel ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a4 4 0 0 1-4 4H8l-5 4V6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v9z" />
              </svg>
            ) : isGroup ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            ) : (
              initials(room.other?.name)
            )}
          </span>
          {dmOnline && <OnlineDot title="Online" />}
          {isGroup && groupOnlineCount > 0 && (
            <OnlineDot title={`${groupOnlineCount} online`} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={`text-sm font-semibold truncate flex items-center gap-1 ${active ? 'text-accent-900 dark:text-accent-200' : 'text-slate-800 dark:text-slate-200'}`}>
              {title}
              {isGroup && (
                <span className="text-[10px] font-semibold text-slate-400">· {room.member_count || (room.members?.length ?? 0)}</span>
              )}
              {muted && (
                <svg className="h-3 w-3 text-slate-400 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Muted">
                  <path d="M3 3l18 18" />
                  <path d="M9 7v0a3 3 0 0 1 6 0v5" />
                  <path d="M5 19h12M19 12v0" />
                </svg>
              )}
            </span>
            <span className="flex items-center gap-1.5 flex-none">
              {room.last?.created_at && (
                <span className={`text-[10px] flex-none ${hasUnread ? 'text-rose-500 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}>
                  {compactTime(room.last.created_at)}
                </span>
              )}
              {hasUnread && (
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </span>
          </span>
          <span className={`block text-xs truncate ${hasUnread ? 'text-slate-700 font-medium dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
            {sub}
          </span>
        </span>
      </button>
      <RoomMenu
        room={room}
        muted={muted}
        archived={archived}
        isAdmin={isAdmin}
        onToggleMute={onToggleMute}
        onToggleArchive={onToggleArchive}
        onLeave={onLeave}
      />
    </div>
  );
}

function RoomMenu({ room, muted, archived, isAdmin, onToggleMute, onToggleArchive, onLeave }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isGroup = room.kind === 'group';
  const isChannel = room.kind === 'channel';

  const wrap = (fn) => (e) => {
    e.stopPropagation();
    setOpen(false);
    fn();
  };

  return (
    <div ref={wrapRef} className="relative flex items-center pr-2">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-opacity dark:hover:text-slate-200 dark:hover:bg-slate-700/60 ${
          open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
        }`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-2 top-full z-50 mt-1 w-52 origin-top-right rounded-lg border border-slate-200 bg-white shadow-elevated ring-1 ring-black/5 overflow-hidden dark:bg-slate-900 dark:border-slate-700 dark:ring-white/5"
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem
            icon={muted ? 'bell' : 'bell-off'}
            label={muted ? 'Unmute notifications' : 'Mute notifications'}
            onClick={wrap(onToggleMute)}
          />
          <MenuItem
            icon={archived ? 'inbox' : 'archive'}
            label={archived ? 'Unarchive' : 'Archive chat'}
            onClick={wrap(onToggleArchive)}
          />
          {isGroup && (
            <>
              <div className="my-1 mx-2 border-t border-slate-100 dark:border-slate-800" />
              <MenuItem
                icon="leave"
                label="Leave group"
                tone="rose"
                onClick={wrap(onLeave)}
              />
            </>
          )}
          {isChannel && (
            <div className="px-3 py-1.5 text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">
              Team Chat can't be left.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, tone = 'slate', onClick }) {
  const colors = tone === 'rose'
    ? 'text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/10'
    : 'text-slate-700 hover:bg-slate-50 hover:text-brand-900 dark:text-slate-200 dark:hover:bg-slate-800';
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-medium ${colors}`}
    >
      <MenuIcon name={icon} />
      <span>{label}</span>
    </button>
  );
}

function MenuIcon({ name }) {
  const common = {
    className: 'h-4 w-4 flex-none',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  };
  switch (name) {
    case 'bell':
      return (
        <svg {...common}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case 'bell-off':
      return (
        <svg {...common}>
          <path d="M3 3l18 18" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          <path d="M18 8A6 6 0 0 0 6 8c0 4-1.5 6.5-2.5 7.5h15" />
        </svg>
      );
    case 'archive':
      return (
        <svg {...common}>
          <path d="M3 5h18v4H3z" />
          <path d="M5 9v10h14V9" />
          <path d="M10 13h4" />
        </svg>
      );
    case 'inbox':
      return (
        <svg {...common}>
          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
          <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
      );
    case 'leave':
      return (
        <svg {...common}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      );
    default:
      return <svg {...common}><circle cx="12" cy="12" r="3" /></svg>;
  }
}

function LeaveGroupConfirm({ group, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setBusy(true); setError('');
    try { await onConfirm(); } catch (e) { setError(e.message || 'Could not leave.'); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-xl bg-white shadow-elevated border border-slate-200 p-5 dark:bg-slate-900 dark:border-slate-700"
      >
        <h3 className="text-base font-semibold text-brand-900 dark:text-slate-100">Leave group?</h3>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
          You'll no longer see messages in <span className="font-semibold">{group.name}</span>.
          The other members will keep chatting; you can be re-added later.
        </p>
        {error && <div className="mt-3 rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost !px-3.5 !py-2 text-xs">Cancel</button>
          <button
            onClick={run}
            disabled={busy}
            className="!px-3.5 !py-2 text-xs inline-flex items-center justify-center rounded-md font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-sm disabled:opacity-60 transition-colors"
          >
            {busy ? 'Leaving…' : 'Leave group'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyPane({ onPickList }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 text-center">
      <div>
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3 dark:bg-slate-800 dark:text-slate-500">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 4V6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v9z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Pick a conversation</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose one from the list to start chatting.</p>
        <button
          type="button"
          onClick={onPickList}
          className="mt-4 lg:hidden inline-flex text-xs font-semibold text-accent-700 hover:text-accent-800"
        >
          Open conversations →
        </button>
      </div>
    </div>
  );
}

function EmptyThread({ room }) {
  return (
    <div className="text-center py-16">
      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3 dark:bg-slate-800 dark:text-slate-500">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 4V6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v9z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No messages yet</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {room.kind === 'channel' ? 'Be the first to say hi.' : `Send a message to start chatting with ${room.other?.name}.`}
      </p>
    </div>
  );
}

function TypingIndicator({ users }) {
  if (!users?.length) return null;
  const names = users.map((u) => (u.name || 'Someone').trim().split(/\s+/)[0]);
  const label =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing`
        : `${names[0]} and ${names.length - 1} others are typing`;
  return (
    <div className="flex items-center gap-2 px-3 sm:px-6 pb-1.5 text-[11px] text-slate-500 dark:text-slate-400" aria-live="polite">
      <span className="inline-flex gap-0.5" aria-hidden="true">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" />
      </span>
      <span className="italic">{label}…</span>
    </div>
  );
}

function renderGroupsWithDividers(groups, myId, onDelete) {
  const out = [];
  let lastDateKey = null;
  for (const g of groups) {
    const dateKey = dayKey(g.messages[0].created_at);
    if (dateKey !== lastDateKey) {
      out.push(<DateDivider key={`d-${dateKey}-${g.messages[0].id}`} value={g.messages[0].created_at} />);
      lastDateKey = dateKey;
    }
    out.push(
      <MessageGroup
        key={`g-${g.messages[0].id}`}
        group={g}
        isMe={myId === g.user_id}
        canDelete={() => myId === g.user_id}
        onDelete={onDelete}
      />
    );
  }
  return out;
}

function MessageGroup({ group, isMe, canDelete, onDelete }) {
  return (
    <div className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
      {group.avatar_url ? (
        <img
          src={group.avatar_url}
          alt={group.user_name}
          title={group.user_name}
          className="h-8 w-8 flex-none rounded-full object-cover bg-slate-100 ring-1 ring-inset ring-black/5"
        />
      ) : (
        <span
          className={`inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-bold text-white ${
            isMe ? 'bg-accent-600' : 'bg-brand-900 dark:bg-brand-600'
          }`}
          title={group.user_name}
        >
          {initials(group.user_name)}
        </span>
      )}
      <div className={`min-w-0 max-w-[78%] sm:max-w-[70%] ${isMe ? 'text-right' : ''}`}>
        <div className={`flex items-baseline gap-2 ${isMe ? 'justify-end' : ''}`}>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
            {isMe ? 'You' : group.user_name}
          </span>
          {group.user_role && group.user_role !== 'user' && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
              {group.user_role}
            </span>
          )}
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            {timeLabel(group.messages[0].created_at)}
          </span>
        </div>
        <div className={`mt-1 flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
          {group.messages.map((m) => (
            <div
              key={m.id}
              className={`group relative max-w-full flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}
            >
              {m.is_unsent ? (
                <div
                  className={`max-w-full w-fit inline-flex items-center gap-1.5 text-xs italic rounded-2xl px-3 py-2 ring-1 ring-inset ${
                    isMe
                      ? 'bg-accent-50 text-accent-700 ring-accent-200 rounded-tr-sm dark:bg-accent-500/10 dark:text-accent-300 dark:ring-accent-500/30'
                      : 'bg-slate-50 text-slate-500 ring-slate-200 rounded-tl-sm dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700'
                  }`}
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M4.93 4.93l14.14 14.14" />
                  </svg>
                  {isMe ? 'You unsent a message' : `${group.user_name || 'Someone'} unsent a message`}
                </div>
              ) : (
                <>
                  {m.attachment_url && (
                    <AttachmentBubble message={m} isMe={isMe} />
                  )}
                  {m.body && (
                    <div
                      className={`max-w-full w-fit whitespace-pre-wrap break-words text-sm rounded-2xl px-3 py-2 ${
                        isMe
                          ? 'bg-accent-600 text-white rounded-tr-sm'
                          : 'bg-slate-100 text-slate-800 rounded-tl-sm dark:bg-slate-800 dark:text-slate-100'
                      }`}
                    >
                      {m.body}
                    </div>
                  )}
                </>
              )}
              {!m.is_unsent && canDelete(m) && (
                <button
                  type="button"
                  onClick={() => onDelete(m)}
                  aria-label="Unsend message"
                  title="Unsend"
                  className={`absolute top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 opacity-0 group-hover:opacity-100 hover:text-rose-700 transition-opacity dark:bg-slate-900 dark:ring-slate-700 dark:text-slate-400 ${
                    isMe ? '-left-7' : '-right-7'
                  }`}
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DateDivider({ value }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {dayLabel(value)}
      </span>
      <span className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
    </div>
  );
}

function DeleteConfirm({ message, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-xl bg-white shadow-elevated border border-slate-200 p-5 dark:bg-slate-900 dark:border-slate-700"
      >
        <h3 className="text-base font-semibold text-brand-900 dark:text-slate-100">Unsend message?</h3>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
          Everyone in this chat will see "You unsent a message" in its place. This can't be undone.
        </p>
        {(message.body || message.attachment_filename) && (
          <div className="mt-3 max-h-32 overflow-y-auto rounded-md bg-slate-50 ring-1 ring-slate-200 px-3 py-2 text-xs text-slate-700 whitespace-pre-wrap break-words dark:bg-slate-800 dark:ring-slate-700 dark:text-slate-300">
            {message.body || message.attachment_filename}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost !px-3.5 !py-2 text-xs">Cancel</button>
          <button
            onClick={onConfirm}
            className="!px-3.5 !py-2 text-xs inline-flex items-center justify-center rounded-md font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition-colors"
          >
            Unsend
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateGroupModal({ directory, onCancel, onSubmit }) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return directory;
    return directory.filter(
      (u) =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
    );
  }, [directory, query]);

  const selected = useMemo(
    () => directory.filter((u) => selectedIds.has(u.id)),
    [directory, selectedIds]
  );

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (selectedIds.size < 2) {
      setError('Select at least 2 people to create a group.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), memberIds: [...selectedIds] });
    } catch (err) {
      setError(err.message || 'Could not create the group.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-xl bg-white shadow-elevated border border-slate-200 dark:bg-slate-900 dark:border-slate-700 flex flex-col max-h-[80vh]"
      >
        <header className="border-b border-slate-100 dark:border-slate-800 px-5 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-brand-900 dark:text-slate-100">New group chat</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pick at least 2 people. You're added automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </header>

        <div className="px-5 pt-4 pb-2 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Group name <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Project Phoenix"
              maxLength={120}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-2 py-0.5 text-xs font-semibold text-accent-700 ring-1 ring-inset ring-accent-200 dark:bg-accent-500/15 dark:text-accent-200 dark:ring-accent-500/30"
                >
                  {u.name}
                  <button
                    type="button"
                    onClick={() => toggle(u.id)}
                    className="text-accent-700 hover:text-accent-900 dark:text-accent-200"
                    aria-label={`Remove ${u.name}`}
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 6l12 12M6 18L18 6" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              placeholder="Search people…"
              className="block w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border-t border-slate-100 dark:border-slate-800">
          {filtered.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400">No people match.</p>
          ) : (
            <ul>
              {filtered.map((u) => {
                const checked = selectedIds.has(u.id);
                return (
                  <li key={u.id}>
                    <label
                      className={`flex items-center gap-3 px-5 py-2 cursor-pointer transition-colors ${
                        checked
                          ? 'bg-accent-50 dark:bg-accent-500/10'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(u.id)}
                        className="h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
                      />
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt={u.name} className="h-8 w-8 rounded-full object-cover bg-slate-100 ring-1 ring-inset ring-black/5" />
                      ) : (
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-900 text-white text-[10px] font-bold dark:bg-brand-600">
                          {initials(u.name)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-800 truncate dark:text-slate-200">{u.name}</span>
                        <span className="block text-xs text-slate-500 truncate dark:text-slate-400">
                          {u.department || u.role || u.email}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && (
          <div className="px-5 py-2 border-t border-slate-100 dark:border-slate-800">
            <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-xs text-rose-700">{error}</div>
          </div>
        )}

        <footer className="border-t border-slate-100 dark:border-slate-800 px-5 py-3 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {selectedIds.size === 0
              ? 'No one selected'
              : `${selectedIds.size} ${selectedIds.size === 1 ? 'person' : 'people'} selected`}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="btn-ghost !px-3.5 !py-2 text-xs">Cancel</button>
            <button
              type="submit"
              disabled={submitting || selectedIds.size < 2}
              className="btn-primary !px-3.5 !py-2 text-xs disabled:opacity-60"
            >
              {submitting ? 'Creating…' : 'Create group'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function AttachmentPreview({ file, previewUrl, onRemove }) {
  const isImage = file.type?.startsWith('image/');
  return (
    <div className="mb-2 flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 dark:bg-slate-800 dark:border-slate-700">
      {isImage && previewUrl ? (
        <img src={previewUrl} alt="" className="h-12 w-12 rounded object-cover ring-1 ring-slate-200 dark:ring-slate-700" />
      ) : (
        <span className="inline-flex h-12 w-12 items-center justify-center rounded bg-white text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
          <FileIcon />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-slate-800 truncate dark:text-slate-200">{file.name}</div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400">{formatBytes(file.size)}</div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove attachment"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition-colors dark:hover:bg-rose-500/10"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 6l12 12M6 18L18 6" />
        </svg>
      </button>
    </div>
  );
}

function AttachmentBubble({ message, isMe }) {
  const isImage = message.attachment_mime?.startsWith('image/');
  if (isImage) {
    return (
      <a
        href={message.attachment_url}
        target="_blank"
        rel="noopener noreferrer"
        className={`block overflow-hidden rounded-2xl ${isMe ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
      >
        <img
          src={message.attachment_url}
          alt={message.attachment_filename || 'attachment'}
          className="block max-h-72 max-w-[260px] sm:max-w-[320px] object-cover"
        />
      </a>
    );
  }
  return (
    <a
      href={message.attachment_url}
      target="_blank"
      rel="noopener noreferrer"
      download={message.attachment_filename}
      className={`flex items-center gap-3 rounded-2xl px-3 py-2 max-w-[280px] ring-1 ring-inset ${
        isMe
          ? 'bg-accent-600 text-white ring-accent-500 rounded-tr-sm hover:bg-accent-700'
          : 'bg-white text-slate-800 ring-slate-200 rounded-tl-sm hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-700'
      }`}
    >
      <span className={`inline-flex h-9 w-9 flex-none items-center justify-center rounded-md ${
        isMe ? 'bg-accent-500/40 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
      }`}>
        <FileIcon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold truncate">{message.attachment_filename || 'attachment'}</span>
        <span className={`block text-[11px] ${isMe ? 'text-accent-100' : 'text-slate-500 dark:text-slate-400'}`}>
          {formatBytes(message.attachment_size || 0)}
        </span>
      </span>
      <svg className={`h-4 w-4 flex-none ${isMe ? 'text-accent-100' : 'text-slate-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12" />
        <path d="M7 10l5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
    </a>
  );
}

function FileIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function initials(name) {
  return (name || 'U').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function OnlineDot({ title = 'Online' }) {
  return (
    <span
      title={title}
      aria-label={title}
      className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-accent-500 ring-2 ring-white dark:ring-slate-900"
    />
  );
}

function timeLabel(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function compactTime(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return 'Today';
  if (dayKey(d) === dayKey(yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
