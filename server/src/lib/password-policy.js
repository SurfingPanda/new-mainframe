// Shared password strength policy. Enforced server-side on every route that
// sets a password (reset + change). The client mirrors these rules in
// client/src/lib/passwordPolicy.js for a live checklist — but this module is the
// security boundary: the client checklist is UX only.

export const MIN_LENGTH = 8;

export const PASSWORD_RULES = [
  { id: 'length', label: `At least ${MIN_LENGTH} characters`, test: (pw) => pw.length >= MIN_LENGTH },
  { id: 'upper', label: 'An uppercase letter (A–Z)', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'lower', label: 'A lowercase letter (a–z)', test: (pw) => /[a-z]/.test(pw) },
  { id: 'number', label: 'A number (0–9)', test: (pw) => /[0-9]/.test(pw) },
  { id: 'special', label: 'A special character (!@#$…)', test: (pw) => /[^A-Za-z0-9]/.test(pw) }
];

// Returns { ok, failed: [ruleId] }.
export function validatePassword(pw) {
  const value = String(pw ?? '');
  const failed = PASSWORD_RULES.filter((r) => !r.test(value)).map((r) => r.id);
  return { ok: failed.length === 0, failed };
}

// A single human-readable error listing the unmet requirements, or null if the
// password satisfies the policy.
export function passwordPolicyError(pw) {
  const { ok, failed } = validatePassword(pw);
  if (ok) return null;
  const unmet = PASSWORD_RULES.filter((r) => failed.includes(r.id)).map((r) => r.label.toLowerCase());
  return `Password must have: ${unmet.join(', ')}.`;
}
