// Pure, DB-free work-order visibility helpers, extracted from routes/tickets.js
// so the need-to-know rules can be unit-tested without a database. The async
// wrappers that also consult the departments table (canReadTicket / canApprove /
// canManageTicket) stay in the route file and compose these.

// Category that triggers the manager-approval workflow.
export const HR_CONCERNS = 'HR Concerns';

// Admins and agents work the whole queue; a plain `user` is limited to tickets
// they requested or are assigned to. Identities are matched by display name,
// with email as a fallback for legacy rows.
export function isStaff(user) {
  return user?.role === 'admin' || user?.role === 'agent';
}

export function userIdentities(user) {
  return [user?.name, user?.email].filter(Boolean);
}

export function ownsTicket(ticket, identities) {
  return identities.includes(ticket.requester) || identities.includes(ticket.assignee);
}

// A work order is routed to a department; everyone in that department can see it
// (and claim it) even if they didn't open it.
export function sameDepartment(user, ticket) {
  return !!(user?.department && ticket?.department && user.department === ticket.department);
}

// View policy for an ordinary work order: staff, the requester/assignee, or
// anyone in the department it's routed to. (HR Concerns add the async manager
// checks in canReadTicket.)
export function canViewTicket(user, ticket) {
  return isStaff(user) || ownsTicket(ticket, userIdentities(user)) || sameDepartment(user, ticket);
}

// Sync need-to-know test for an 'HR Concerns' row in a LIST result (the async
// per-record rules are precomputed into `ctx`: the caller's identities, home
// department, and the Set of departments they manage). Non-HR rows always pass.
export function hrConcernVisibleToList(row, ctx) {
  if (row.category !== HR_CONCERNS) return true;
  if (ctx.identities.includes(row.requester) || ctx.identities.includes(row.assignee)) return true;
  if (ctx.managedDepts.has(row.approval_dept)) return true;   // requester's dept manager
  if (row.department) {
    if (ctx.myDept && row.department === ctx.myDept) return true;   // HR staff (after routing)
    if (ctx.managedDepts.has(row.department)) return true;          // manager of where it sits
  }
  return false;
}
