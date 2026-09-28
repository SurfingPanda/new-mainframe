// Work-order request types + the cascading Category → Subcategory →
// Sub-subcategory tree. Admin-editable (Users → Manage → Categories & Request
// Types), served by GET /api/taxonomy — this module fetches it once per page
// load and shares it between the create forms, the detail view, and reports.
import { useEffect, useState } from 'react';
import { api } from './auth.js';

let cache = null;     // { requestTypes, tree } once loaded
let inflight = null;  // shared promise while loading
const listeners = new Set();

// API nodes ({ name, children }) → the { Category: { Sub: [leaf] } } shape
// the pages were written against.
function toTree(nodes) {
  const tree = {};
  for (const cat of nodes || []) {
    const subs = {};
    for (const sub of cat.children || []) subs[sub.name] = (sub.children || []).map((l) => l.name);
    tree[cat.name] = subs;
  }
  return tree;
}

function load() {
  if (!inflight) {
    inflight = api('/api/taxonomy')
      .then((data) => {
        cache = { requestTypes: data?.requestTypes || [], tree: toTree(data?.categories) };
        listeners.forEach((fn) => fn(cache));
        return cache;
      })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

// Call after the admin page changes something so open forms pick it up.
export function invalidateTaxonomy() {
  cache = null;
  return load().catch(() => {});
}

// { requestTypes: [{ key, label, description }], tree, categories: [names],
//   loading, error }
export function useTaxonomy() {
  const [state, setState] = useState(cache);
  const [error, setError] = useState('');

  useEffect(() => {
    const onChange = (next) => setState(next);
    listeners.add(onChange);
    if (!cache) load().catch((e) => setError(e.message || 'Could not load categories'));
    return () => listeners.delete(onChange);
  }, []);

  const tree = state?.tree || {};
  return {
    requestTypes: state?.requestTypes || [],
    tree,
    categories: Object.keys(tree),
    loading: !state && !error,
    error
  };
}

// Label for a stored request_type key (falls back to a prettified key for
// types that were since deleted or hidden).
export function requestTypeLabel(requestTypes, key) {
  const hit = (requestTypes || []).find((t) => t.key === key);
  if (hit) return hit.label;
  return key ? String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';
}

// Subcategory keys for a main category.
export function subcategoriesOf(tree, category) {
  return category ? Object.keys(tree?.[category] || {}) : [];
}

// Sub-subcategory options for a category + subcategory pair.
export function subSubcategoriesOf(tree, category, subcategory) {
  return category && subcategory ? (tree?.[category]?.[subcategory] || []) : [];
}
