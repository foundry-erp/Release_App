import React, { useState, useEffect } from 'react';
import { initOfflineSystem } from '@shared/offline-core';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[Foundry] Render error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, background: '#fff0f0', border: '1px solid #ffcccc',
                      borderRadius: 8, margin: 16, color: '#c0392b',
                      fontFamily: '-apple-system, sans-serif' }}>
          <strong>Something went wrong.</strong>
          <p style={{ fontSize: 13, marginTop: 8 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 12, padding: '8px 16px', cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const styles = {
  header: {
    background: 'linear-gradient(135deg, #0f4c35 0%, #1a7a4a 100%)',
    color: '#fff',
    padding: '16px 20px',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  container: {
    padding: '20px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    maxWidth: 480,
    margin: '0 auto',
  },
  badge: {
    background: '#1a7a4a',
    color: '#fff',
    borderRadius: 20,
    padding: '4px 12px',
    fontSize: 12,
    display: 'inline-block',
    marginBottom: 20,
  },
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 13, color: '#555', marginBottom: 4 },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #ddd',
    fontSize: 15,
    boxSizing: 'border-box',
  },
  btn: {
    width: '100%',
    padding: '12px',
    borderRadius: 10,
    border: 'none',
    background: '#1a7a4a',
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
    cursor: 'pointer',
  },
  btnSecondary: {
    width: '100%',
    padding: '12px',
    borderRadius: 10,
    border: '1px solid #1a7a4a',
    background: '#fff',
    color: '#1a7a4a',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
    cursor: 'pointer',
  },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  result: {
    background: '#f8f8f8',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  pre: { fontSize: 11, overflowX: 'auto', margin: 0 },
  error: {
    background: '#fff0f0',
    border: '1px solid #ffcccc',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    color: '#c0392b',
    fontSize: 13,
  },
};

async function callBridge(method, args = {}) {
  if (!window.shellBridge) throw new Error('Bridge not available');
  return window.shellBridge._call(method, args);
}

function App() {
  const [sku,          setSku]          = useState('');
  const [location,     setLocation]     = useState('');
  const [quantity,     setQuantity]     = useState('');
  const [result,       setResult]       = useState(null);
  const [error,        setError]        = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount,  setFailedCount]  = useState(0);
  const [offlineReady, setOfflineReady] = useState(false);

  const queueRef = React.useRef(null);
  const syncRef  = React.useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const { queueManager, syncManager } = await initOfflineSystem('inventory-checker');
        if (cancelled) return;
        queueRef.current = queueManager;
        syncRef.current  = syncManager;
        const count = await queueManager.countPending();
        const failed = await queueManager.countFailed();
        if (!cancelled) {
          setPendingCount(count);
          setFailedCount(failed);
          setOfflineReady(true);
        }
      } catch (e) {
        console.error('[IC] Offline init failed:', e);
      }
    }
    init();
    const interval = setInterval(async () => {
      if (queueRef.current) {
        const count = await queueRef.current.countPending();
        const failed = await queueRef.current.countFailed();
        setPendingCount(count);
        setFailedCount(failed);
      }
    }, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  async function handleSubmit() {
    if (!queueRef.current) { setError('Offline system not ready'); return; }
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      // Defensive fallback for old Android WebViews without crypto.randomUUID()
      let id;
      try {
        id = crypto.randomUUID();
      } catch (_e) {
        id = Date.now().toString() + Math.random().toString(36).slice(2);
      }
      const entry = {
        id,
        type:     'stock_count',
        payload:  { sku, location, quantity: parseInt(quantity, 10) || 0 },
        filePath: null,  // inventory-checker never has photos
      };
      await queueRef.current.enqueue(entry);
      const count = await queueRef.current.countPending();
      setPendingCount(count);
      if (syncRef.current) {
        syncRef.current.sync().then(async () => {
          const updated = await queueRef.current.countPending();
          const updatedFailed = await queueRef.current.countFailed();
          setPendingCount(updated);
          setFailedCount(updatedFailed);
        }).catch(() => {});
      }
      setSku('');
      setLocation('');
      setQuantity('');
      setResult({ method: 'submit', response: { queued: true } });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePing() {
    setLoading(true);
    setError(null);
    try {
      const res = await callBridge('ping');
      setResult({ method: 'ping', response: res });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = !loading && sku.trim() && quantity.trim() && offlineReady;
  const btn  = (disabled) => ({ ...styles.btn,          ...(disabled ? styles.btnDisabled : {}) });
  const btnS = (disabled) => ({ ...styles.btnSecondary, ...(disabled ? styles.btnDisabled : {}) });

  return (
    <div>
      <div style={styles.header}>Inventory Checker</div>
      <div style={styles.container}>
        <span style={{ ...styles.badge, background: failedCount > 0 ? '#c0392b' : pendingCount > 0 ? '#1a7a4a' : '#0f8a5f' }}>
          {failedCount > 0
            ? `${failedCount} failed to sync`
            : pendingCount > 0
              ? `${pendingCount} pending`
              : 'All synced'}
        </span>

        <div style={styles.field}>
          <label style={styles.label}>SKU / Item Code</label>
          <input style={styles.input} value={sku} onChange={e => setSku(e.target.value)} placeholder="e.g. SKU-00123" />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Storage Location</label>
          <input style={styles.input} value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Aisle 3, Shelf B" />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Stock Count</label>
          <input style={styles.input} type="number" min="0" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" />
        </div>

        <button style={btn(!canSubmit)} onClick={handleSubmit} disabled={!canSubmit}>
          {loading ? 'Saving...' : 'Submit Count'}
        </button>
        <button style={btnS(loading)} onClick={handlePing} disabled={loading}>
          Ping Bridge
        </button>

        {result && (
          <div style={styles.result}>
            <strong style={{ fontSize: 13 }}>Response ({result.method}):</strong>
            <pre style={styles.pre}>{JSON.stringify(result.response, null, 2)}</pre>
          </div>
        )}
        {error && <div style={styles.error}><strong>Error:</strong> {error}</div>}
      </div>
    </div>
  );
}

export default function AppWithBoundary() {
  return <ErrorBoundary><App /></ErrorBoundary>;
}
