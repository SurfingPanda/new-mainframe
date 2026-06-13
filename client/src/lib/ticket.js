// Display format for ticket / work-order IDs. Single source of truth so the
// format can be changed in one place. Example: id 22 -> "WO00000022".
export function formatTicketId(id) {
  return `WO${String(id ?? 0).padStart(8, '0')}`;
}

// Trim a string to at most `maxWords` whitespace-separated words, appending an
// ellipsis when truncated. Used to keep list descriptions short.
export function truncateWords(text, maxWords = 7) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}…`;
}

// Does a search query match this work order's ID?
//
// Plain text is a substring match against the formatted id, so "22", "0022",
// and "wo00000022" all work. A "%" acts as a shorthand for the zero padding:
// "WO%22" (or "%22") matches the work order whose number is EXACTLY 22 — handy
// because the full WO00000022 is long to type. A "%" elsewhere is a general
// wildcard matched against the whole formatted id.
export function matchesTicketId(id, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return false;
  const idStr = formatTicketId(id).toLowerCase(); // e.g. "wo00000022"

  if (q.includes('%')) {
    const exact = q.match(/^(?:wo)?%0*(\d+)$/);
    if (exact) return Number(exact[1]) === Number(id);
    // General wildcard: escape regex specials, turn "%" into ".*", anchor it.
    const pattern = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
    try {
      return new RegExp(`^${pattern}$`).test(idStr);
    } catch {
      return false;
    }
  }
  return idStr.includes(q);
}
