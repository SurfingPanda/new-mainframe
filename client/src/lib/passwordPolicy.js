// Client mirror of the server password policy (server/src/lib/password-policy.js).
// Drives the live requirements checklist on the reset + change-password forms.
// UX only — the server re-validates on every password set.

export const MIN_LENGTH = 8;

export const PASSWORD_RULES = [
  { id: 'length', label: `At least ${MIN_LENGTH} characters`, test: (pw) => pw.length >= MIN_LENGTH },
  { id: 'upper', label: 'An uppercase letter (A–Z)', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'lower', label: 'A lowercase letter (a–z)', test: (pw) => /[a-z]/.test(pw) },
  { id: 'number', label: 'A number (0–9)', test: (pw) => /[0-9]/.test(pw) },
  { id: 'special', label: 'A special character (!@#$…)', test: (pw) => /[^A-Za-z0-9]/.test(pw) }
];

// True when the password satisfies every rule.
export function isPasswordValid(pw) {
  const value = String(pw ?? '');
  return PASSWORD_RULES.every((r) => r.test(value));
}
