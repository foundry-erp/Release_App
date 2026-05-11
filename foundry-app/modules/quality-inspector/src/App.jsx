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
        <div style={{ padding: 24, background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: 8, margin: 16, color: '#c0392b', fontFamily: '-apple-system, sans-serif' }}>
          <strong>Something went wrong.</strong>
          <p style={{ fontSize: 13, marginTop: 8 }}>{this.state.error?.message || 'An unexpected error occurred.'}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })} style={{ marginTop: 12, padding: '8px 16px', cursor: 'pointer' }}>Try Again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const styles = {
  header: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
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
    background: '#6C63FF',
    color: '#fff',
    borderRadius: 20,
    padding: '4px 12px',
    fontSize: 12,
    display: 'inline-block',
    marginBottom: 20,
  },
  networkOnline: {
    background: '#1a7a4a',
    color: '#fff',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 13,
    marginBottom: 12,
  },
  networkOffline: {
    background: '#c0392b',
    color: '#fff',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 13,
    marginBottom: 12,
  },
  barcodeStrip: {
    background: '#f0f0f0',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 13,
    marginBottom: 12,
    color: '#333',
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
    background: '#6C63FF',
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
    border: '1px solid #6C63FF',
    background: '#fff',
    color: '#6C63FF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
    cursor: 'pointer',
  },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  photo: { width: '100%', borderRadius: 10, marginBottom: 14 },
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
  const [itemCode,         setItemCode]         = useState('');
  const [notes,            setNotes]            = useState('');
  const [photoDataUrl,     setPhotoDataUrl]     = useState(null);
  const [photoFilePath,    setPhotoFilePath]    = useState(null);
  const [barcode,          setBarcode]          = useState(null);
  const [networkState,     setNetworkState]     = useState(null);
  const [result,           setResult]           = useState(null);
  const [error,            setError]            = useState(null);
  const [loading,          setLoading]          = useState(false);
  const [pendingCount,     setPendingCount]     = useState(0);
  const [failedCount,      setFailedCount]      = useState(0);
  const [offlineReady,     setOfflineReady]     = useState(false);
  const [products,         setProducts]         = useState([]);
  const [selectedProduct,  setSelectedProduct]  = useState(null);
  const [editDescription,  setEditDescription]  = useState('');
  const [refreshing,       setRefreshing]       = useState(false);

  // Refs to hold manager instances across renders
  const queueRef = React.useRef(null);
  const syncRef  = React.useRef(null);
  const refRef   = React.useRef(null);

  async function fetchProducts() {
    const auth = window.__foundry_auth__ || {};
    if (!auth.token || !auth.apiBaseUrl) return;
    try {
      const res = await fetch(`${auth.apiBaseUrl}/api/products`, {
        headers: { 'Authorization': `Bearer ${auth.token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const list = data.products || [];
      setProducts(list);
      if (refRef.current) {
        await refRef.current.set('products', list, 5 * 60 * 1000); // 5-minute TTL
      }
    } catch (_e) { /* offline — use cache */ }
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const { queueManager, syncManager, refDataManager } = await initOfflineSystem('quality-inspector');
        if (cancelled) return;
        queueRef.current = queueManager;
        syncRef.current  = syncManager;
        refRef.current   = refDataManager;

        const count  = await queueManager.countPending();
        const failed = await queueManager.countFailed();
        if (!cancelled) {
          setPendingCount(count);
          setFailedCount(failed);
          setOfflineReady(true);
        }

        // Load cached products immediately
        const cached = await refDataManager.get('products');
        if (cached && !cancelled) setProducts(cached);

        // Fire-and-forget live fetch — updates cache if online
        fetchProducts();
      } catch (e) {
        console.error('[QI] Offline init failed:', e);
      }
    }
    init();

    const interval = setInterval(async () => {
      if (queueRef.current) {
        const count  = await queueRef.current.countPending();
        const failed = await queueRef.current.countFailed();
        setPendingCount(count);
        setFailedCount(failed);
      }
    }, 3000);

    const refreshInterval = setInterval(fetchProducts, 5 * 60 * 1000);

    return () => { cancelled = true; clearInterval(interval); clearInterval(refreshInterval); };
  }, []);

  async function withBridge(label, fn) {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(`[${label}] ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleCapturePhoto() {
    await withBridge('capturePhoto', async () => {
      const res = await callBridge('capturePhoto');
      if (!res.success) { setError(res.error); return; }
      if (res.data?.cancelled) return;
      setPhotoDataUrl(res.data?.dataUrl);
      setPhotoFilePath(res.data?.filePath ?? null);
      setResult({ method: 'capturePhoto', response: { success: res.success } });
    });
  }

  async function handleScanBarcode() {
    await withBridge('scanBarcode', async () => {
      const res = await callBridge('scanBarcode');
      if (!res.success) { setError(res.error); return; }
      if (res.data?.cancelled) return;
      setBarcode(res.data);
      if (res.data?.value) {
        setItemCode(res.data.value);
        // Auto-select matching product from the products list
        const match = products.find(p => p.barcode === res.data.value);
        if (match) {
          setSelectedProduct(match);
          setEditDescription(match.description || '');
        }
      }
      setResult({ method: 'scanBarcode', response: res });
    });
  }

  async function handleGetNetwork() {
    await withBridge('getNetworkState', async () => {
      const res = await callBridge('getNetworkState');
      if (!res.success) { setError(res.error); return; }
      setNetworkState(res.data);
      setResult({ method: 'getNetworkState', response: res });
    });
  }

  async function handleRefresh() {
    setRefreshing(true);
    const auth = window.__foundry_auth__ || {};
    if (!auth.token || !auth.apiBaseUrl) {
      setRefreshing(false);
      setError('Offline — using cached data');
      setTimeout(() => setError(null), 2000);
      return;
    }
    try {
      await fetchProducts();
    } catch (_e) {
      setError('Offline — using cached data');
      setTimeout(() => setError(null), 2000);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSubmit() {
    if (!queueRef.current) { setError('Offline system not ready'); return; }
    await withBridge('submit', async () => {
      // Defensive fallback for old Android WebViews without crypto.randomUUID()
      function makeId() {
        try { return crypto.randomUUID(); }
        catch (_e) { return Date.now().toString() + Math.random().toString(36).slice(2); }
      }

      const reportId = makeId();
      const entry = {
        id:      reportId,
        type:    'submit_report',
        payload: { itemCode, notes, barcode },
        filePath: photoFilePath ?? null,
      };
      await queueRef.current.enqueue(entry);

      // If a product is selected and description was edited, also queue the update
      if (selectedProduct && editDescription !== selectedProduct.description) {
        const descId = makeId();
        const descEntry = {
          id:      descId,
          type:    'update_product_description',
          payload: { productId: selectedProduct.id, description: editDescription },
          filePath: null,
        };
        await queueRef.current.enqueue(descEntry);

        // Optimistically update local cache
        if (refRef.current) {
          const currentProducts = products.map(p =>
            p.id === selectedProduct.id ? { ...p, description: editDescription } : p
          );
          setProducts(currentProducts);
          await refRef.current.set('products', currentProducts, 5 * 60 * 1000);
        }

        // Update selectedProduct state to reflect new description
        setSelectedProduct({ ...selectedProduct, description: editDescription });
      }

      // Optimistically update badge
      const count = await queueRef.current.countPending();
      setPendingCount(count);

      // Try immediate sync if online
      if (syncRef.current) {
        syncRef.current.sync().then(async () => {
          const updated       = await queueRef.current.countPending();
          const updatedFailed = await queueRef.current.countFailed();
          setPendingCount(updated);
          setFailedCount(updatedFailed);
        }).catch(() => {/* offline — ignore */});
      }

      // Clear form
      setItemCode('');
      setNotes('');
      setPhotoDataUrl(null);
      setPhotoFilePath(null);
      setBarcode(null);
      setSelectedProduct(null);
      setEditDescription('');
      setResult({ method: 'submit', response: { queued: true } });
    });
  }

  async function handlePing() {
    await withBridge('ping', async () => {
      const res = await callBridge('ping');
      setResult({ method: 'ping', response: res });
    });
  }

  const btn    = (disabled) => ({ ...styles.btn,          ...(disabled ? styles.btnDisabled : {}) });
  const btnSec = (disabled) => ({ ...styles.btnSecondary, ...(disabled ? styles.btnDisabled : {}) });

  const canSubmit = !loading && (itemCode.trim() || selectedProduct) && offlineReady;

  return (
    <div>
      <div style={styles.header}>Quality Inspector</div>
      <div style={styles.container}>
        <span style={{ ...styles.badge, background: failedCount > 0 ? '#c0392b' : pendingCount > 0 ? '#6C63FF' : '#1a7a4a' }}>
          {failedCount > 0
            ? `${failedCount} failed to sync`
            : pendingCount > 0
              ? `${pendingCount} pending`
              : 'All synced'}
        </span>

        {networkState && (
          <div style={networkState.isOnline ? styles.networkOnline : styles.networkOffline}>
            {networkState.isOnline ? `Online (${networkState.type})` : 'Offline'}
          </div>
        )}

        <div style={styles.field}>
          <label style={styles.label}>Product</label>
          {products.length > 0 ? (
            <select
              style={styles.input}
              value={selectedProduct?.id || ''}
              onChange={e => {
                const p = products.find(p => p.id === e.target.value);
                setSelectedProduct(p || null);
                setItemCode(p?.barcode || '');
                setEditDescription(p?.description || '');
              }}
            >
              <option value="">— Select product —</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.barcode})</option>
              ))}
            </select>
          ) : (
            <input
              style={styles.input}
              value={itemCode}
              onChange={e => setItemCode(e.target.value)}
              placeholder="Scan barcode or type item code"
            />
          )}
        </div>

        {selectedProduct && (
          <div style={styles.field}>
            <label style={styles.label}>Description {editDescription !== selectedProduct.description ? '(edited)' : ''}</label>
            <input
              style={styles.input}
              value={editDescription}
              onChange={e => setEditDescription(e.target.value)}
              placeholder="Product description..."
            />
          </div>
        )}

        {barcode && (
          <div style={styles.barcodeStrip}>
            Barcode: {barcode.value} ({barcode.format})
          </div>
        )}

        <div style={styles.field}>
          <label style={styles.label}>Inspection Notes</label>
          <input
            style={styles.input}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional notes..."
          />
        </div>

        {photoDataUrl && (
          <img src={photoDataUrl} style={styles.photo} alt="Captured" />
        )}

        <button style={btn(loading)} onClick={handleScanBarcode} disabled={loading}>
          Scan Barcode
        </button>
        <button style={btn(loading)} onClick={handleCapturePhoto} disabled={loading}>
          Capture Photo
        </button>
        <button style={btnSec(loading)} onClick={handleGetNetwork} disabled={loading}>
          Check Network
        </button>
        <button style={btnSec(refreshing || loading)} onClick={handleRefresh} disabled={refreshing || loading}>
          {refreshing ? 'Refreshing...' : `Refresh Products (${products.length})`}
        </button>
        <button
          style={btn(!canSubmit)}
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {loading ? 'Saving...' : 'Submit Report'}
        </button>
        <button style={btnSec(loading)} onClick={handlePing} disabled={loading}>
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
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
