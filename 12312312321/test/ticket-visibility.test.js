import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HR_CONCERNS,
  isStaff,
  userIdentities,
  ownsTicket,
  sameDepartment,
  canViewTicket,
  hrConcernVisibleToList
} from '../src/lib/ticket-visibility.js';

describe('isStaff', () => {
  it('is true for admin and agent, false otherwise', () => {
    assert.equal(isStaff({ role: 'admin' }), true);
    assert.equal(isStaff({ role: 'agent' }), true);
    assert.equal(isStaff({ role: 'user' }), false);
    assert.equal(isStaff({}), false);
    assert.equal(isStaff(null), false);
    assert.equal(isStaff(undefined), false);
  });
});

describe('userIdentities', () => {
  it('returns name and email, dropping falsy values', () => {
    assert.deepEqual(userIdentities({ name: 'Ada', email: 'ada@x.io' }), ['Ada', 'ada@x.io']);
    assert.deepEqual(userIdentities({ name: 'Ada' }), ['Ada']);
    assert.deepEqual(userIdentities({ email: 'ada@x.io' }), ['ada@x.io']);
    assert.deepEqual(userIdentities({}), []);
    assert.deepEqual(userIdentities(null), []);
  });
});

describe('ownsTicket', () => {
  it('matches the requester or assignee against the identity list', () => {
    assert.equal(ownsTicket({ requester: 'Ada', assignee: 'Bob' }, ['Ada']), true);
    assert.equal(ownsTicket({ requester: 'Ada', assignee: 'Bob' }, ['Bob']), true);
    assert.equal(ownsTicket({ requester: 'Ada', assignee: 'Bob' }, ['Cy']), false);
  });

  it('matches on the email fallback identity', () => {
    assert.equal(ownsTicket({ requester: 'ada@x.io', assignee: null }, ['Ada', 'ada@x.io']), true);
  });

  it('does not match when both ticket fields are null', () => {
    assert.equal(ownsTicket({ requester: null, assignee: null }, ['Ada']), false);
  });
});

describe('sameDepartment', () => {
  it('matches only when both sides have the same non-empty department', () => {
    assert.equal(sameDepartment({ department: 'IT' }, { department: 'IT' }), true);
    assert.equal(sameDepartment({ department: 'IT' }, { department: 'HR' }), false);
  });

  it('is false when either department is missing', () => {
    assert.equal(sameDepartment({ department: null }, { department: 'IT' }), false);
    assert.equal(sameDepartment({ department: 'IT' }, { department: null }), false);
    assert.equal(sameDepartment({}, {}), false);
    assert.equal(sameDepartment(null, { department: 'IT' }), false);
  });
});

describe('canViewTicket (ordinary work orders)', () => {
  const ticket = { requester: 'Ada', assignee: 'Bob', department: 'IT' };

  it('lets staff view any work order', () => {
    assert.equal(canViewTicket({ role: 'agent', name: 'Cy', department: 'Sales' }, ticket), true);
  });

  it('lets the requester and assignee view it', () => {
    assert.equal(canViewTicket({ role: 'user', name: 'Ada' }, ticket), true);
    assert.equal(canViewTicket({ role: 'user', name: 'Bob' }, ticket), true);
  });

  it('lets a same-department coworker view it', () => {
    assert.equal(canViewTicket({ role: 'user', name: 'Cy', department: 'IT' }, ticket), true);
  });

  it('denies an unrelated user in another department', () => {
    assert.equal(canViewTicket({ role: 'user', name: 'Cy', department: 'Sales' }, ticket), false);
  });
});

describe('hrConcernVisibleToList (need-to-know)', () => {
  const ctxFor = (user, managedDepts = []) => ({
    identities: userIdentities(user),
    myDept: user.department || null,
    managedDepts: new Set(managedDepts)
  });

  it('always shows ordinary (non-HR) rows', () => {
    const row = { category: 'Hardware', requester: 'Ada', assignee: 'Bob', department: 'IT' };
    const stranger = { name: 'Zed', department: 'Sales' };
    assert.equal(hrConcernVisibleToList(row, ctxFor(stranger)), true);
  });

  it('hides a pending HR concern from an uninvolved coworker', () => {
    // Pending HR concern is unrouted: department NULL, approval_dept = home dept.
    const row = { category: HR_CONCERNS, requester: 'Ada', assignee: null, department: null, approval_dept: 'Sales' };
    const coworker = { name: 'Zed', department: 'Sales' }; // same home dept, but not the manager
    assert.equal(hrConcernVisibleToList(row, ctxFor(coworker)), false);
  });

  it('shows it to the requester', () => {
    const row = { category: HR_CONCERNS, requester: 'Ada', assignee: null, department: null, approval_dept: 'Sales' };
    assert.equal(hrConcernVisibleToList(row, ctxFor({ name: 'Ada', department: 'Sales' })), true);
  });

  it('shows a pending concern to the manager of the requester department (approval_dept)', () => {
    const row = { category: HR_CONCERNS, requester: 'Ada', assignee: null, department: null, approval_dept: 'Sales' };
    const manager = { name: 'Mgr', department: 'Sales' };
    assert.equal(hrConcernVisibleToList(row, ctxFor(manager, ['Sales'])), true);
  });

  it('shows a routed concern to HR staff via same-department', () => {
    const row = { category: HR_CONCERNS, requester: 'Ada', assignee: null, department: 'HR', approval_dept: 'Sales' };
    const hrStaff = { name: 'Hank', department: 'HR' }; // not a manager, just in HR
    assert.equal(hrConcernVisibleToList(row, ctxFor(hrStaff)), true);
  });

  it('shows a routed concern to the manager of the department it now sits in', () => {
    const row = { category: HR_CONCERNS, requester: 'Ada', assignee: null, department: 'HR', approval_dept: 'Sales' };
    const hrManager = { name: 'Hmgr', department: 'Ops' };
    assert.equal(hrConcernVisibleToList(row, ctxFor(hrManager, ['HR'])), true);
  });

  it('still hides a routed concern from an unrelated department', () => {
    const row = { category: HR_CONCERNS, requester: 'Ada', assignee: null, department: 'HR', approval_dept: 'Sales' };
    const stranger = { name: 'Zed', department: 'Engineering' };
    assert.equal(hrConcernVisibleToList(row, ctxFor(stranger)), false);
  });
});
