import React, { useEffect, useState, useCallback } from 'react';
import { api, formatMinor, shortHash } from './api.js';
import MeshGraph from './components/MeshGraph.jsx';
import './App.css';

const OUTCOME_LABEL = {
  SETTLED: 'settled',
  DUPLICATE_DROPPED: 'duplicate dropped',
  INVALID: 'invalid'
};

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [mesh, setMesh] = useState([]);
  const [flushResults, setFlushResults] = useState([]);
  const [flushToken, setFlushToken] = useState(0);
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({ senderVpa: '', receiverVpa: '', amount: '5.00', pin: '1234' });

  const pushLog = useCallback((type, message) => {
    setLog((prev) => [{ id: Date.now() + Math.random(), type, message, at: new Date() }, ...prev].slice(0, 40));
  }, []);

  const refresh = useCallback(async () => {
    const [acc, tx, meshState] = await Promise.all([api.accounts(), api.transactions(), api.meshState()]);
    setAccounts(acc);
    setTransactions(tx);
    setMesh(meshState);
    if (!form.senderVpa && acc[0]) {
      setForm((f) => ({ ...f, senderVpa: acc[0].vpa, receiverVpa: acc[1] ? acc[1].vpa : acc[0].vpa }));
    }
  }, [form.senderVpa]);

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(action, fn) {
    setBusy(action);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e.message);
      pushLog('error', e.message);
    } finally {
      setBusy(null);
    }
  }

  function handleInject() {
    run('inject', async () => {
      const amountMinor = Math.round(parseFloat(form.amount) * 100);
      const { packet } = await api.send({
        senderVpa: form.senderVpa,
        receiverVpa: form.receiverVpa,
        amountMinor,
        pin: form.pin
      });
      pushLog('signal', `packet ${shortHash(packet.packetId)} injected into phone-alice · ttl ${packet.ttl}`);
    });
  }

  function handleGossip() {
    run('gossip', async () => {
      await api.gossip();
      pushLog('signal', 'gossip round complete — packets rebroadcast, ttl decremented');
    });
  }

  function handleFlush() {
    run('flush', async () => {
      const { results } = await api.flush();
      setFlushResults(results);
      setFlushToken((t) => t + 1);
      if (results.length === 0) {
        pushLog('muted', 'no bridge devices are currently holding a packet');
      } else {
        for (const r of results) {
          pushLog(
            r.outcome === 'SETTLED' ? 'settled' : r.outcome === 'INVALID' ? 'alert' : 'muted',
            `${r.bridgeId} → backend: ${shortHash(r.packetId)} — ${OUTCOME_LABEL[r.outcome] || r.outcome}`
          );
        }
      }
    });
  }

  function handleReset() {
    run('reset', async () => {
      await api.reset();
      setFlushResults([]);
      pushLog('muted', 'mesh and idempotency cache reset');
    });
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          <h1>UPI Offline Mesh</h1>
        </div>
        <span className="brand-sub mono">mesh-routed deferred settlement — demo</span>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <main className="layout">
        <section className="panel graph-panel">
          <div className="panel-head">
            <h2>Mesh topology</h2>
            <span className="mono panel-hint">5 devices · 1 bridge · full range</span>
          </div>
          <MeshGraph devices={mesh} flushResults={flushResults} flushToken={flushToken} />
          <div className="legend">
            <span><i className="dot" style={{ background: 'var(--signal)' }} /> holding packet</span>
            <span><i className="dot" style={{ background: 'var(--settled)' }} /> settled</span>
            <span><i className="dot" style={{ background: 'var(--alert)' }} /> invalid</span>
          </div>
        </section>

        <section className="panel control-panel">
          <div className="panel-head">
            <h2>Compose payment</h2>
          </div>
          <div className="form-grid">
            <label>
              Sender
              <select value={form.senderVpa} onChange={(e) => setForm({ ...form, senderVpa: e.target.value })}>
                {accounts.map((a) => <option key={a.vpa} value={a.vpa}>{a.name} · {a.vpa}</option>)}
              </select>
            </label>
            <label>
              Receiver
              <select value={form.receiverVpa} onChange={(e) => setForm({ ...form, receiverVpa: e.target.value })}>
                {accounts.map((a) => <option key={a.vpa} value={a.vpa}>{a.name} · {a.vpa}</option>)}
              </select>
            </label>
            <label>
              Amount (₹)
              <input type="number" min="0.01" step="0.01" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
            <label>
              PIN
              <input type="password" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} />
            </label>
          </div>

          <div className="action-row">
            <button className="btn btn-signal" disabled={!!busy} onClick={handleInject}>
              {busy === 'inject' ? 'injecting…' : '📤 Inject into mesh'}
            </button>
            <button className="btn" disabled={!!busy} onClick={handleGossip}>
              {busy === 'gossip' ? 'running…' : '🔄 Run gossip round'}
            </button>
            <button className="btn btn-settled" disabled={!!busy} onClick={handleFlush}>
              {busy === 'flush' ? 'uploading…' : '📡 Bridges upload to backend'}
            </button>
            <button className="btn btn-ghost" disabled={!!busy} onClick={handleReset}>
              ↺ Reset mesh
            </button>
          </div>

          <div className="log-feed scrollbar-thin">
            {log.length === 0 && <p className="mono log-empty">no events yet — inject a packet to begin</p>}
            {log.map((entry) => (
              <div key={entry.id} className={`log-entry log-${entry.type}`}>
                <span className="mono log-time">{entry.at.toLocaleTimeString()}</span>
                <span>{entry.message}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel ledger-panel">
          <div className="panel-head">
            <h2>Account balances</h2>
          </div>
          <table className="ledger mono">
            <thead>
              <tr><th>Name</th><th>VPA</th><th className="num">Balance</th></tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.vpa}>
                  <td>{a.name}</td>
                  <td className="text-muted">{a.vpa}</td>
                  <td className="num">{formatMinor(a.balanceMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel ledger-panel">
          <div className="panel-head">
            <h2>Transaction ledger</h2>
            <span className="mono panel-hint">last 20</span>
          </div>
          <table className="ledger mono">
            <thead>
              <tr><th>From → To</th><th className="num">Amount</th><th>Packet hash</th><th>When</th></tr>
            </thead>
            <tbody>
              {transactions.length === 0 && (
                <tr><td colSpan="4" className="text-muted">no settlements yet</td></tr>
              )}
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{t.senderVpa} → {t.receiverVpa}</td>
                  <td className="num text-settled">{formatMinor(t.amountMinor)}</td>
                  <td className="text-muted">{shortHash(t.packetHash)}</td>
                  <td className="text-muted">{new Date(t.createdAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
