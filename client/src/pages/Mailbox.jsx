import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import Avatar from '../components/Avatar.jsx';
import Modal from '../components/Modal.jsx';
import MarkdownEditor, { MarkdownPreview } from '../components/MarkdownEditor.jsx';
import { api, getUser } from '../lib/auth.js';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

const BOXES = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'sent', label: 'Sent' }
];

export default function Mailbox() {
  const me = getUser();
  const [params, setParams] = useSearchParams();
  const box = params.get('box') === 'sent' ? 'sent' : 'inbox';

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const load = async (which = box) => {
    setLoading(true);
    setError('');
    try {
      const data = await api(`/api/messages?box=${which}`);
      setMessages(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(box);
    setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box]);

  const setBox = (key) => setParams(key === 'inbox' ? {} : { box: key });

  const selected = useMemo(
    () => messages.find((m) => m.id === selectedId) || null,
    [messages, selectedId]
  );

  const openMessage = async (m) => {
    setSelectedId(m.id);
    // Mark unread inbox mail read on open, then refresh the header badge.
    if (box === 'inbox' && !m.is_read) {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_read: true } : x)));
      try {
        await api(`/api/messages/${m.id}/read`, { method: 'POST' });
        window.dispatchEvent(new Event('mailbox-read'));
      } catch {
        // best-effort; the next poll reconciles
      }
    }
  };

  const markAllRead = async () => {
    setMessages((prev) => prev.map((m) => ({ ...m, is_read: true })));
    try {
      await api('/api/messages/read-all', { method: 'POST' });
      window.dispatchEvent(new Event('mailbox-read'));
    } catch {
      // ignore
    }
  };

  const deleteMessage = async (id) => {
    try {
      await api(`/api/messages/${id}`, { method: 'DELETE' });
      setMessages((prev) => prev.filter((m) => m.id !== id));
      if (selectedId === id) setSelectedId(null);
      window.dispatchEvent(new Event('mailbox-read'));
    } catch (e) {
      setError(e.message);
    }
  };

  const onSent = (msg) => {
    setComposeOpen(false);
    // Surface the just-sent message immediately if the Sent box is open.
    if (box === 'sent') {
      setMessages((prev) => [msg, ...prev]);
      setSelectedId(msg.id);
    }
  };

  const unreadCount = messages.filter((m) => box === 'inbox' && !m.is_read).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Mailbox</span>
        </nav>

        <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="eyebrow">Messages</span>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-brand-900">Mailbox</h1>
            <p className="mt-1 text-slate-600">Send and read internal messages with your team.</p>
          </div>
          <button type="button" onClick={() => setComposeOpen(true)} className="btn-primary !px-3.5 !py-2 text-xs self-start sm:self-auto">
            <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Compose
          </button>
        </section>

        <div className="flex items-center gap-1 border-b border-slate-200">
          {BOXES.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setBox(b.key)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                box === b.key
                  ? 'border-accent-600 text-accent-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {b.label}
            </button>
          ))}
          {box === 'inbox' && (
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="ml-auto text-xs font-semibold text-accent-700 hover:underline disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed"
            >
              Mark all as read
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}

        <div className="grid gap-5 lg:grid-cols-5">
          {/* List */}
          <div className={`lg:col-span-2 rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden ${selected ? 'hidden lg:block' : ''}`}>
            {loading ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">Loading…</div>
            ) : messages.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm font-semibold text-slate-700">
                  {box === 'inbox' ? 'Your inbox is empty' : 'No sent messages'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {box === 'inbox' ? "Messages from your team will show up here." : 'Messages you send will appear here.'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[32rem] overflow-y-auto">
                {messages.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => openMessage(m)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 ${
                        selectedId === m.id ? 'bg-accent-50/60' : ''
                      }`}
                    >
                      <Avatar name={m.counterparty?.name} size="h-9 w-9" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={`truncate text-sm ${box === 'inbox' && !m.is_read ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                            {m.counterparty?.name || 'Unknown'}
                          </span>
                          {box === 'inbox' && !m.is_read && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-accent-500" />
                          )}
                          <span className="ml-auto shrink-0 text-[11px] text-slate-400">{timeAgo(m.created_at)}</span>
                        </span>
                        <span className="block truncate text-sm text-slate-800">{m.subject || '(no subject)'}</span>
                        <span className="block truncate text-xs text-slate-500">{m.body}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Reading pane */}
          <div className={`lg:col-span-3 rounded-lg border border-slate-200 bg-white shadow-card ${selected ? '' : 'hidden lg:block'}`}>
            {selected ? (
              <MessageView
                message={selected}
                box={box}
                me={me}
                onBack={() => setSelectedId(null)}
                onDelete={() => deleteMessage(selected.id)}
                onReply={() => setComposeOpen(true)}
              />
            ) : (
              <div className="flex h-full min-h-[20rem] flex-col items-center justify-center px-5 py-12 text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <MailIcon className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm text-slate-500">Select a message to read it.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {composeOpen && (
        <ComposeModal
          me={me}
          replyTo={selected && box === 'inbox' ? selected : null}
          onClose={() => setComposeOpen(false)}
          onSent={onSent}
        />
      )}
    </div>
  );
}

function MessageView({ message, box, me, onBack, onDelete, onReply }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
        <button type="button" onClick={onBack} className="lg:hidden inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{message.subject || '(no subject)'}</h2>
        {box === 'inbox' && (
          <button type="button" onClick={onReply} className="btn-secondary !px-3 !py-1.5 text-xs">Reply</button>
        )}
        <button type="button" onClick={onDelete} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete message" title="Delete">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <Avatar name={message.counterparty?.name} size="h-10 w-10" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">
            {box === 'sent' ? `To: ${message.recipient?.name}` : message.sender?.name}
          </div>
          <div className="text-xs text-slate-500">
            {box === 'sent' ? `From you · ${me?.name || ''}` : `To: ${message.recipient?.name || 'you'}`}
            {' · '}
            {formatDateTime(message.created_at)}
          </div>
        </div>
      </div>

      <div className="px-5 py-5 text-sm text-slate-800 break-words dark:text-slate-200">
        <MarkdownPreview body={message.body} />
      </div>

      {message.attachment && (
        <div className="px-5 pb-5">
          <a
            href={message.attachment.url}
            download={message.attachment.filename}
            className="inline-flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm transition hover:border-accent-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-300">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-slate-800 dark:text-slate-100">{message.attachment.filename}</span>
              <span className="block text-xs text-slate-400">{formatBytes(message.attachment.size)} · Download</span>
            </span>
            <svg className="ml-1 h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
          </a>
        </div>
      )}

      {message.link_url && (
        <div className="px-5 pb-5">
          <Link to={message.link_url} className="btn-primary !px-3.5 !py-2 text-xs">
            {message.link_label || 'Open'}
            <svg className="h-4 w-4 ml-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      )}
    </div>
  );
}

function ComposeModal({ me, replyTo, onClose, onSent }) {
  const [people, setPeople] = useState([]);
  const [recipientId, setRecipientId] = useState(replyTo?.sender?.id ? String(replyTo.sender.id) : '');
  const [recipientQuery, setRecipientQuery] = useState(replyTo?.sender?.name || '');
  const [recipOpen, setRecipOpen] = useState(false);
  const [recipHighlight, setRecipHighlight] = useState(0);
  const [subject, setSubject] = useState(replyTo?.subject ? `Re: ${replyTo.subject}`.slice(0, 200) : '');
  const [body, setBody] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const recipRef = useRef(null);

  useEffect(() => {
    api('/api/users/directory')
      .then((rows) => setPeople(Array.isArray(rows) ? rows.filter((u) => u.email !== me?.email) : []))
      .catch(() => setPeople([]));
  }, [me?.email]);

  // Type-ahead recipient: typing clears any prior selection; picking sets the id.
  const recipMatches = useMemo(() => {
    const q = recipientQuery.trim().toLowerCase();
    const list = q
      ? people.filter((u) => `${u.name} ${u.email || ''} ${u.department || ''}`.toLowerCase().includes(q))
      : people;
    return list.slice(0, 8);
  }, [people, recipientQuery]);

  useEffect(() => { setRecipHighlight(0); }, [recipientQuery, recipOpen]);

  useEffect(() => {
    if (!recipOpen) return;
    const onDown = (e) => { if (recipRef.current && !recipRef.current.contains(e.target)) setRecipOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [recipOpen]);

  const pickRecipient = (u) => {
    setRecipientId(String(u.id));
    setRecipientQuery(u.name);
    setRecipOpen(false);
  };

  const onRecipKeyDown = (e) => {
    if (!recipOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) { setRecipOpen(true); return; }
    if (!recipOpen) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setRecipHighlight((h) => Math.min(h + 1, recipMatches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setRecipHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { if (recipMatches[recipHighlight]) { e.preventDefault(); pickRecipient(recipMatches[recipHighlight]); } }
    else if (e.key === 'Escape') { setRecipOpen(false); }
  };

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { setError('Attachment is larger than 15 MB.'); return; }
    setError('');
    setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    // Resolve the typed recipient to a user id (exact name/email match).
    let id = recipientId;
    const q = recipientQuery.trim().toLowerCase();
    if (!id && q) {
      const match = people.find((u) => u.name.toLowerCase() === q || (u.email || '').toLowerCase() === q);
      if (match) id = String(match.id);
    }
    if (!id) { setError('Pick a recipient from the list.'); return; }
    if (!body.trim() && !file) { setError('Write a message or attach a file.'); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('recipient_id', String(Number(id)));
      fd.append('subject', subject.trim());
      fd.append('body', body.trim());
      if (file) fd.append('file', file);
      const msg = await api('/api/messages', { method: 'POST', body: fd });
      onSent(msg);
    } catch (err) {
      setError(err.message || 'Could not send the message.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New message" size="xl">
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            placeholder="(optional)"
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">To</span>
          <div ref={recipRef} className="relative">
            <input
              value={recipientQuery}
              onChange={(e) => { setRecipientQuery(e.target.value); setRecipientId(''); setRecipOpen(true); }}
              onFocus={() => setRecipOpen(true)}
              onKeyDown={onRecipKeyDown}
              placeholder="Type a name or email…"
              autoComplete="off"
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            {recipOpen && recipMatches.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                {recipMatches.map((u, idx) => (
                  <button
                    key={u.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setRecipHighlight(idx)}
                    onClick={() => pickRecipient(u)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${idx === recipHighlight ? 'bg-accent-50 text-accent-800 dark:bg-accent-500/15 dark:text-accent-200' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/60'}`}
                  >
                    <Avatar name={u.name} src={u.avatar_url} size="h-7 w-7" textClass="text-[10px]" className="flex-none" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{u.name}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{u.email ? `${u.email}` : ''}{u.department ? ` · ${u.department}` : ''}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </label>

        <div className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Message</span>
          <MarkdownEditor value={body} onChange={setBody} minRows={9} />
        </div>

        <input ref={fileRef} type="file" className="hidden" onChange={pickFile} />
        {file ? (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/50">
            <svg className="h-5 w-5 shrink-0 text-accent-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
            <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{file.name}</span>
            <span className="shrink-0 text-xs text-slate-400">{formatBytes(file.size)}</span>
            <button type="button" onClick={() => setFile(null)} className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" aria-label="Remove attachment">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
            Attach file
          </button>
        )}

        {error && <p className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:ring-rose-500/30 dark:text-rose-300">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={submitting} className="btn-ghost !px-3.5 !py-2 text-xs disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={submitting} className="btn-primary !px-3.5 !py-2 text-xs disabled:opacity-50">
            {submitting ? 'Sending…' : 'Send message'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function MailIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function timeAgo(value) {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(value).toLocaleDateString();
}

function formatDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}
