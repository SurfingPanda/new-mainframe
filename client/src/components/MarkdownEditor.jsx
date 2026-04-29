import { useCallback, useRef, useState } from 'react';

/* ─── Inline markdown renderer (shared with KbArticle) ─── */
function inlineFormat(text) {
  const parts = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let last = 0, m, key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2]) parts.push(<strong key={key++} className="font-semibold text-slate-900">{m[2]}</strong>);
    else if (m[3]) parts.push(<em key={key++} className="italic">{m[3]}</em>);
    else if (m[4]) parts.push(<del key={key++} className="line-through text-slate-400">{m[4]}</del>);
    else if (m[5]) parts.push(<code key={key++} className="rounded bg-slate-100 px-1 py-0.5 text-[11px] font-mono text-rose-600">{m[5]}</code>);
    else if (m[6]) parts.push(<a key={key++} href={m[7]} className="text-accent-700 underline underline-offset-2 hover:text-accent-900" target="_blank" rel="noreferrer">{m[6]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts;
}

function MarkdownPreview({ body }) {
  if (!body?.trim()) {
    return <p className="text-sm text-slate-400 italic">Nothing to preview yet…</p>;
  }
  const lines = body.split('\n');
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('#### ')) { elements.push(<h4 key={i} className="mt-5 mb-1.5 text-sm font-semibold text-brand-900">{inlineFormat(line.slice(5))}</h4>); i++; continue; }
    if (line.startsWith('### ')) { elements.push(<h3 key={i} className="mt-6 mb-2 text-base font-semibold text-brand-900">{inlineFormat(line.slice(4))}</h3>); i++; continue; }
    if (line.startsWith('## ')) { elements.push(<h2 key={i} className="mt-7 mb-2 text-lg font-bold text-brand-900">{inlineFormat(line.slice(3))}</h2>); i++; continue; }
    if (line.startsWith('# ')) { elements.push(<h1 key={i} className="mt-8 mb-3 text-xl font-bold text-brand-900">{inlineFormat(line.slice(2))}</h1>); i++; continue; }
    if (/^---+$/.test(line.trim())) { elements.push(<hr key={i} className="my-5 border-slate-200" />); i++; continue; }
    if (line.startsWith('> ')) { elements.push(<blockquote key={i} className="my-3 border-l-4 border-accent-300 pl-4 text-sm italic text-slate-600">{inlineFormat(line.slice(2))}</blockquote>); i++; continue; }
    if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith('- [ ] ') || lines[i].startsWith('- [x] '))) {
        const done = lines[i].startsWith('- [x] ');
        items.push(<li key={i} className="flex items-start gap-2 text-slate-700"><input type="checkbox" readOnly checked={done} className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300" /><span className={done ? 'line-through text-slate-400' : ''}>{inlineFormat(lines[i].slice(6))}</span></li>);
        i++;
      }
      elements.push(<ul key={`cl-${i}`} className="my-3 space-y-1.5 text-sm list-none">{items}</ul>);
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) { items.push(<li key={i} className="ml-4 list-disc text-slate-700">{inlineFormat(lines[i].slice(2))}</li>); i++; }
      elements.push(<ul key={`ul-${i}`} className="my-3 space-y-1 text-sm">{items}</ul>);
      continue;
    }
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(<li key={i} className="ml-4 list-decimal text-slate-700">{inlineFormat(lines[i].replace(/^\d+\. /, ''))}</li>); i++; }
      elements.push(<ol key={`ol-${i}`} className="my-3 space-y-1 text-sm">{items}</ol>);
      continue;
    }
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      elements.push(
        <div key={i} className="my-4 rounded-lg overflow-hidden border border-slate-700">
          {lang && <div className="bg-slate-800 px-3 py-1 text-[10px] font-mono text-slate-400 border-b border-slate-700">{lang}</div>}
          <pre className="bg-slate-900 text-slate-100 px-4 py-3 text-xs overflow-x-auto font-mono leading-relaxed">{codeLines.join('\n')}</pre>
        </div>
      );
      i++; continue;
    }
    if (line.trim() === '') { i++; continue; }
    elements.push(<p key={i} className="my-3 text-sm leading-relaxed text-slate-700">{inlineFormat(line)}</p>);
    i++;
  }
  return <div>{elements}</div>;
}

/* ─── Toolbar button ─── */
function TBtn({ title, onClick, active, children, divider }) {
  return (
    <>
      {divider && <span className="w-px h-5 bg-slate-200 mx-0.5 self-center" />}
      <button
        type="button"
        title={title}
        onMouseDown={(e) => { e.preventDefault(); onClick(); }}
        className={`inline-flex items-center justify-center h-7 w-7 rounded text-xs font-bold transition-colors
          ${active ? 'bg-brand-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-brand-900'}`}
      >
        {children}
      </button>
    </>
  );
}

/* ─── Main editor ─── */
export default function MarkdownEditor({ value, onChange, minRows = 18 }) {
  const taRef = useRef(null);
  const [tab, setTab] = useState('write'); // 'write' | 'preview'

  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const chars = value.length;

  /* Insert / wrap text at cursor */
  const insert = useCallback((before, after = '', placeholder = '') => {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: ss, selectionEnd: se } = ta;
    const selected = value.slice(ss, se) || placeholder;
    const next = value.slice(0, ss) + before + selected + after + value.slice(se);
    onChange(next);
    // Restore cursor after React re-render
    requestAnimationFrame(() => {
      ta.focus();
      const pos = ss + before.length + selected.length + after.length;
      ta.setSelectionRange(
        ss + before.length,
        ss + before.length + selected.length
      );
    });
  }, [value, onChange]);

  /* Insert block at start of line */
  const insertLine = useCallback((prefix) => {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: ss } = ta;
    const lineStart = value.lastIndexOf('\n', ss - 1) + 1;
    const before = value.slice(0, lineStart);
    const after = value.slice(lineStart);
    onChange(before + prefix + after);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(lineStart + prefix.length, lineStart + prefix.length);
    });
  }, [value, onChange]);

  const insertBlock = useCallback((text) => {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: ss } = ta;
    const prefix = ss > 0 && value[ss - 1] !== '\n' ? '\n\n' : '';
    const next = value.slice(0, ss) + prefix + text + '\n\n' + value.slice(ss);
    onChange(next);
    requestAnimationFrame(() => { ta.focus(); });
  }, [value, onChange]);

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey)) {
      if (e.key === 'b') { e.preventDefault(); insert('**', '**', 'bold text'); }
      if (e.key === 'i') { e.preventDefault(); insert('*', '*', 'italic text'); }
      if (e.key === 'k') { e.preventDefault(); insert('[', '](url)', 'link text'); }
      if (e.key === '`') { e.preventDefault(); insert('`', '`', 'code'); }
    }
    // Tab → 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = taRef.current;
      const { selectionStart: ss, selectionEnd: se } = ta;
      const next = value.slice(0, ss) + '  ' + value.slice(se);
      onChange(next);
      requestAnimationFrame(() => { ta.setSelectionRange(ss + 2, ss + 2); });
    }
  };

  return (
    <div className="rounded-lg border border-slate-300 overflow-hidden focus-within:border-accent-500 focus-within:ring-1 focus-within:ring-accent-500 transition-colors">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 bg-slate-50 border-b border-slate-200 px-2 py-1.5">
        {/* Headings */}
        <TBtn title="Heading 1" onClick={() => insertLine('# ')}>H1</TBtn>
        <TBtn title="Heading 2" onClick={() => insertLine('## ')}>H2</TBtn>
        <TBtn title="Heading 3" onClick={() => insertLine('### ')}>H3</TBtn>

        {/* Inline */}
        <TBtn title="Bold (Ctrl+B)" onClick={() => insert('**', '**', 'bold text')} divider>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
        </TBtn>
        <TBtn title="Italic (Ctrl+I)" onClick={() => insert('*', '*', 'italic text')}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
        </TBtn>
        <TBtn title="Strikethrough" onClick={() => insert('~~', '~~', 'strikethrough')}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/></svg>
        </TBtn>
        <TBtn title="Inline code (Ctrl+`)" onClick={() => insert('`', '`', 'code')}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        </TBtn>

        {/* Link */}
        <TBtn title="Link (Ctrl+K)" onClick={() => insert('[', '](url)', 'link text')} divider>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </TBtn>

        {/* Lists */}
        <TBtn title="Bullet list" onClick={() => insertLine('- ')} divider>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>
        </TBtn>
        <TBtn title="Numbered list" onClick={() => insertLine('1. ')}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>
        </TBtn>
        <TBtn title="Checklist" onClick={() => insertLine('- [ ] ')}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        </TBtn>

        {/* Blocks */}
        <TBtn title="Blockquote" onClick={() => insertLine('> ')} divider>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zm12 0c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>
        </TBtn>
        <TBtn title="Code block" onClick={() => insertBlock('```\n\n```')}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 12 17 16 21"/></svg>
        </TBtn>

        {/* Divider */}
        <TBtn title="Horizontal rule" onClick={() => insertBlock('---')} divider>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </TBtn>

        {/* View tabs — pushed right */}
        <div className="ml-auto flex items-center bg-slate-200 rounded-md p-0.5 gap-0.5">
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setTab('write'); }}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${tab === 'write' ? 'bg-white text-brand-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Write
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setTab('preview'); }}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${tab === 'preview' ? 'bg-white text-brand-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Preview
          </button>
        </div>
      </div>

      {/* Editor / Preview area */}
      {tab === 'write' ? (
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={minRows}
          spellCheck
          placeholder={'# Article title\n\nStart writing your article here. Markdown is supported.\n\n## Section heading\n\nYour content goes here…'}
          className="block w-full resize-y px-4 py-3 text-sm font-mono text-slate-800 leading-relaxed bg-white placeholder:text-slate-300 focus:outline-none"
          style={{ minHeight: `${minRows * 1.6}rem` }}
        />
      ) : (
        <div
          className="px-6 py-4 bg-white overflow-y-auto"
          style={{ minHeight: `${minRows * 1.6}rem` }}
        >
          <MarkdownPreview body={value} />
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center justify-between bg-slate-50 border-t border-slate-200 px-3 py-1.5 text-[10px] text-slate-400 font-mono select-none">
        <span className="flex items-center gap-3">
          <span>{words} {words === 1 ? 'word' : 'words'}</span>
          <span>{chars} {chars === 1 ? 'char' : 'chars'}</span>
        </span>
        <span className="flex items-center gap-3">
          <span title="Bold"><kbd className="bg-slate-200 text-slate-500 rounded px-1">Ctrl+B</kbd></span>
          <span title="Italic"><kbd className="bg-slate-200 text-slate-500 rounded px-1">Ctrl+I</kbd></span>
          <span title="Link"><kbd className="bg-slate-200 text-slate-500 rounded px-1">Ctrl+K</kbd></span>
          <span title="Code"><kbd className="bg-slate-200 text-slate-500 rounded px-1">Ctrl+`</kbd></span>
          <span title="Tab inserts 2 spaces"><kbd className="bg-slate-200 text-slate-500 rounded px-1">Tab</kbd></span>
        </span>
      </div>
    </div>
  );
}
