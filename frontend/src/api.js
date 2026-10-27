const BASE = '/api';

async function req(path, options) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `request failed: ${res.status}`);
  return body;
}

export const api = {
  accounts: () => req('/accounts'),
  transactions: () => req('/transactions'),
  meshState: () => req('/mesh/state'),
  send: (payload) => req('/demo/send', { method: 'POST', body: JSON.stringify(payload) }),
  gossip: () => req('/mesh/gossip', { method: 'POST' }),
  flush: () => req('/mesh/flush', { method: 'POST' }),
  reset: () => req('/mesh/reset', { method: 'POST' })
};

export function formatMinor(minor) {
  return `₹${(minor / 100).toFixed(2)}`;
}

export function shortHash(hash) {
  if (!hash) return '—';
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}
