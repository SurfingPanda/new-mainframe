import { PASSWORD_RULES } from '../lib/passwordPolicy.js';

// Live password-requirements checklist. Each rule turns green with a check once
// satisfied. `password` is the current value; pass an empty string before the
// user has typed to render every rule as pending.
export default function PasswordChecklist({ password = '', className = '' }) {
  const value = String(password ?? '');
  return (
    <ul className={`space-y-1 ${className}`} aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(value);
        return (
          <li key={rule.id} className="flex items-center gap-2 text-xs">
            <span
              className={`flex h-4 w-4 flex-none items-center justify-center rounded-full ${
                met ? 'bg-accent-100 text-accent-700' : 'bg-slate-100 text-slate-400'
              }`}
              aria-hidden="true"
            >
              {met ? (
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5 9-11" />
                </svg>
              ) : (
                <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="6" />
                </svg>
              )}
            </span>
            <span className={met ? 'text-slate-600' : 'text-slate-500'}>{rule.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
