// Display format for ticket / work-order IDs. Single source of truth so the
// format can be changed in one place. Example: id 22 -> "WO00000022".
export function formatTicketId(id) {
  return `WO${String(id ?? 0).padStart(8, '0')}`;
}
