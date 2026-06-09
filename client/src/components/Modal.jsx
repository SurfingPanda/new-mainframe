import { useEffect } from 'react';

const SIZE = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl'
};

export default function Modal({ open, onClose, title, size = 'md', children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-950/50 backdrop-blur-sm dark:bg-black/70"
    >
      <div className={`relative flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden ${SIZE[size] || SIZE.md} rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80 animate-[modalIn_0.16s_ease-out] dark:bg-slate-900 dark:ring-slate-700`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 bg-white rounded-t-2xl z-10 dark:bg-slate-900 dark:border-slate-800">
          <h2 className="text-base font-semibold text-brand-900 dark:text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="scrollbar-pretty flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
