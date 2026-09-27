// App.jsx
// Root component — wires together all features.

import { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, Mail, Clock, Radio, Layers, Eye, Activity } from 'lucide-react';
import VideoSourceSelector  from './components/VideoSourceSelector';
import VideoDisplay         from './components/VideoDisplay';
import BoundaryControls     from './components/BoundaryControls';
import DetectionSummary     from './components/DetectionSummary';
import TelemetryTerminal    from './components/TelemetryTerminal';
import AlertPanel           from './components/AlertPanel';
import DetectionLogPanel    from './components/DetectionLogPanel';
import EmailAlertModal      from './components/EmailAlertModal';
import BlockchainLedgerPanel from './components/BlockchainLedgerPanel';
import AnalyticsPanel        from './components/AnalyticsPanel';
import CameraSidebar        from './components/CameraSidebar';
import DemoCameraGrid       from './components/DemoCameraGrid';
import GlobalSidebar        from './components/GlobalSidebar';

import { API, WS_URL } from './config';

export default function App() {
  // ── Stream state ──────────────────────────────────────────────
  const [isConnected, setConnected]   = useState(false);
  const [sourceLabel, setSourceLabel] = useState('');
  const [streamError, setStreamError] = useState(null);

  // ── Detection / alert state (from WebSocket) ──────────────────
  const [summary, setSummary]                 = useState({ HUMAN: 0, ANIMAL: 0, VEHICLE: 0, OBJECT: 0 });
  const [cam1Summary, setCam1Summary]         = useState(null);
  const [alerts, setAlerts]                   = useState([]);
  const [detectionLog, setDetectionLog]       = useState([]);
  const [detectionMode, setDetectionMode]     = useState('all'); // 'all' or 'person_wearables'
  const [activeIntrusion, setActiveIntrusion] = useState(false);
  const [cameraBlocked, setCameraBlocked]     = useState(false);
  const [dwellTimes, setDwellTimes]           = useState({});  // idx→seconds
  const [ocrData, setOcrData]                 = useState(null);
  const [emailStatus, setEmailStatus]         = useState({});
  const [isEmailModalOpen, setEmailModalOpen] = useState(false);
  const [isBlockchainOpen, setBlockchainOpen] = useState(false);
  const [blockchainData, setBlockchainData]   = useState(null);  // live from WS

  // ── Global Layout & App State ─────────────────────────────────
  const [globalView, setGlobalView] = useState('dashboard');
  const [globalSidebarCollapsed, setGlobalSidebarCollapsed] = useState(false);

  // ── Sidebar & multi-camera state ──────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightTab, setRightTab]                 = useState('telemetry'); // 'telemetry'
  const [cameras, setCameras]                   = useState([
    { id: 'cam-1', label: 'CAM-01', type: 'idle', source: '', status: 'idle', detectionCount: 0 },
    { id: 'cam-2', label: 'CAM-02', type: 'idle', source: '', status: 'idle', detectionCount: 0 },
    { id: 'cam-3', label: 'CAM-03', type: 'idle', source: '', status: 'idle', detectionCount: 0 },
    { id: 'cam-4', label: 'CAM-04', type: 'idle', source: '', status: 'idle', detectionCount: 0 },
  ]);
  const [activeCamId, setActiveCamId]           = useState('cam-1');
  const [addingSourceForCam, setAddingSourceForCam] = useState(null);

  // ── Timestamps to ignore stale in-flight messages after user clears logs ──
  const alertsClearedAtRef = useRef(0);
  const detectLogClearedAtRef = useRef(0);

  // ── Boundary drawing state ────────────────────────────────────
  const [isDrawing, setDrawing]           = useState(false);
  const [boundaryPoints, setBoundaryPoints] = useState([]);   // [[normX, normY], ...]

  // ── WebSocket ─────────────────────────────────────────────────
  const wsRef = useRef(null);

  // ── Live Clock for Top Navbar ──────────────────────────────────
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString());
  useEffect(() => {
    const timer = setInterval(() => {
      setClock(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const connectWS = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState < 2) return;

    const ws = new WebSocket(WS_URL);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.summary)                       setSummary(data.summary);
        if (data.cam1_summary)                  setCam1Summary(data.cam1_summary);
        if (data.alerts) {
          const freshAlerts = data.alerts.filter(a => (a.id || 0) > alertsClearedAtRef.current);
          setAlerts(freshAlerts);
        }
        if (data.detection_log) {
          const freshLogs = data.detection_log.filter(l => (l.id || 0) > detectLogClearedAtRef.current);
          setDetectionLog(freshLogs);
        }
        if (data.detection_mode)                 setDetectionMode(data.detection_mode);
        if (data.active_intrusion !== undefined) setActiveIntrusion(data.active_intrusion);
        if (data.camera_blocked !== undefined)   setCameraBlocked(data.camera_blocked);
        if (data.dwell_times)                    setDwellTimes(data.dwell_times);
        if (data.ocr)                            setOcrData(data.ocr);
        if (data.email_status)                   setEmailStatus(data.email_status);
        if (data.blockchain)                     setBlockchainData(data.blockchain);
        if (data.error)                          setStreamError(data.error);
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      // Reconnect after 2 s if still connected
      setTimeout(() => { if (isConnected) connectWS(); }, 2000);
    };

    wsRef.current = ws;
  }, [isConnected]);

  useEffect(() => {
    connectWS();
    return () => wsRef.current?.close();
  }, [connectWS]);

  // Keep WS alive when connected
  useEffect(() => {
    if (isConnected) connectWS();
  }, [isConnected, connectWS]);

  // ── Source events ──────────────────────────────────────────────
  function handleConnected(label) {
    setConnected(true);
    setSourceLabel(label);
    setStreamError(null);
    setBoundaryPoints([]);
    setDrawing(false);
    setAlerts([]);
    setDetectionLog([]);
    setActiveIntrusion(false);
    setCameraBlocked(false);
    setDwellTimes({});
    const now = Date.now();
    alertsClearedAtRef.current = now;
    detectLogClearedAtRef.current = now;
    // Short delay then trigger WS reconnect to start receiving data
    setTimeout(connectWS, 500);
  }

  function handleStopped() {
    setConnected(false);
    setSourceLabel('');
    setDrawing(false);
    setBoundaryPoints([]);
    setActiveIntrusion(false);
    setCameraBlocked(false);
    setDwellTimes({});
    setOcrData(null);
    // Keep detectionLog and alerts intact so Analytics graph forms from camera session data
  }

  // ── Boundary actions ───────────────────────────────────────────
  function handleAddPoint(normPt) {
    setBoundaryPoints(prev => [...prev, normPt]);
  }

  // Undo last boundary point
  function handleUndo() {
    setBoundaryPoints(prev => prev.slice(0, -1));
  }

  async function handleFinishBoundary() {
    if (boundaryPoints.length < 3) return;
    setDrawing(false);

    const res  = await fetch(`${API}/api/boundary`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ points: boundaryPoints }),
    });
    const data = await res.json();
    if (!data.ok) console.error('Boundary error:', data.error);
  }

  async function handleClearBoundary() {
    setBoundaryPoints([]);
    setDrawing(false);
    await fetch(`${API}/api/boundary`, { method: 'DELETE' }).catch(() => {});
  }

  // ── Log Clearing Actions (Both WS Instant Push & HTTP REST) ──
  async function handleClearAll() {
    const now = Date.now();
    alertsClearedAtRef.current = now;
    detectLogClearedAtRef.current = now;
    setAlerts([]);
    setDetectionLog([]);
    setActiveIntrusion(false);

    // Send instant clear command through WebSocket connection
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ action: 'clear_all' }));
      } catch { /* ignore */ }
    }
    // Also call HTTP backend endpoint to guarantee memory purge
    await fetch(`${API}/api/logs`, { method: 'DELETE' }).catch(() => {});
  }

  async function handleClearAlerts() {
    alertsClearedAtRef.current = Date.now();
    setAlerts([]);
    setActiveIntrusion(false);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ action: 'clear_alerts' }));
      } catch { /* ignore */ }
    }
    await fetch(`${API}/api/alerts`, { method: 'DELETE' }).catch(() => {});
  }

  async function handleClearDetectionLog() {
    detectLogClearedAtRef.current = Date.now();
    setDetectionLog([]);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ action: 'clear_detection_log' }));
      } catch { /* ignore */ }
    }
    await fetch(`${API}/api/detection-log`, { method: 'DELETE' }).catch(() => {});
  }

  async function handleSetMode(mode) {
    setDetectionMode(mode);
    try {
      await fetch(`${API}/api/detection-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
    } catch (err) {
      console.error('Mode toggle failed:', err);
    }
  }

  // ── Camera sidebar helpers ────────────────────────────────────
  function handleAddCamSlot(camId) {
    setAddingSourceForCam(camId);
  }

  async function connectCamSlot(camId, type, source) {
    setAddingSourceForCam(null);
    // Switch the backend to this source
    try {
      const body = type === 'webcam'
        ? { type: 'webcam', url: '' }
        : { type: 'url', url: source };
      const res  = await fetch(`${API}/api/source`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        setCameras(prev => prev.map(c =>
          c.id === camId
            ? { ...c, status: 'live', type, source: source || 'Webcam' }
            : c.id === activeCamId ? { ...c, status: 'idle' } : c
        ));
        setActiveCamId(camId);
        setConnected(true);
      }
    } catch (err) {
      console.error('connectCamSlot error:', err);
    }
  }

  function handleAddCamera() {
    const nextNum = cameras.length + 1;
    const newId   = `cam-${nextNum}`;
    setCameras(prev => [...prev, {
      id: newId,
      label: `CAM-0${nextNum}`,
      type: 'idle',
      source: '',
      status: 'idle',
      detectionCount: 0,
    }]);
  }

  function handleRemoveCamera(id) {
    setCameras(prev => prev.filter(c => c.id !== id));
    if (activeCamId === id) setActiveCamId(cameras[0]?.id);
  }

  function handleSelectCam(id) {
    setActiveCamId(id);
  }

  // Update active cam status when stream connects
  function handleConnectedWithCam(label) {
    handleConnected(label);
    setCameras(prev => prev.map(c =>
      c.id === activeCamId ? { ...c, status: 'live', source: label, type: label === '0' ? 'webcam' : 'rtsp' } : c
    ));
  }

  function handleStoppedWithCam() {
    handleStopped();
    setCameras(prev => prev.map(c =>
      c.id === activeCamId ? { ...c, status: 'idle' } : c
    ));
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="app-layout-wrapper">
      <GlobalSidebar 
        activeView={globalView} 
        onViewChange={setGlobalView} 
        collapsed={globalSidebarCollapsed} 
        onToggle={() => setGlobalSidebarCollapsed(p => !p)} 
      />

      <div className="app" style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        {/* ── Top Navigation Bar ── */}
        <header className="header-nav">
        <div className="header-brand">
          <div className="header-shield-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={24} color="#06b6d4" />
          </div>
          <div className="header-title-group">
            <div className="title-row">
              <span className="brand-title" style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '0.06em' }}>
                AI CCTV // VIDEO ANALYTICS
              </span>
              <span className="badge-amber">SIH SOC EDITION</span>
            </div>
            <div className="subtitle-row">
              <span>Smart India Hackathon</span>
              <span className="dot-sep">·</span>
              <span>Intelligent Edge Security Surveillance</span>
              <span className="dot-sep">·</span>
              <span className="node-id">NODE_01_SOUTH</span>
            </div>
          </div>
        </div>

        <div className="header-telemetry-right">
          {/* Email Dispatch Alert Setup Pill */}
          <button
            id="btn-email-dispatch"
            type="button"
            onClick={() => setEmailModalOpen(true)}
            className="telemetry-pill"
            style={{
              cursor: 'pointer',
              background: emailStatus?.enabled ? 'rgba(16, 185, 129, 0.15)' : 'var(--surface-container-low)',
              border: `1px solid ${emailStatus?.enabled ? 'var(--secondary)' : 'var(--outline)'}`,
              color: emailStatus?.enabled ? 'var(--secondary)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.2s',
            }}
            title="Configure automatic perimeter breach email dispatch with photo snapshot"
          >
            <Mail size={14} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700 }}>
              {emailStatus?.enabled ? 'EMAIL ALERTS: ON' : 'EMAIL ALERTS: OFF'}
            </span>
            {emailStatus?.enabled && emailStatus?.recipient_email && (
              <span style={{ fontSize: 11, opacity: 0.85, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                ({emailStatus.recipient_email})
              </span>
            )}
          </button>

          {/* Zone status pill */}
          <div className="telemetry-pill">
            <span
              className="status-dot-led"
              style={{ color: boundaryPoints.length >= 3 ? 'var(--secondary)' : 'var(--text-muted)' }}
            />
            <span>ZONE: {boundaryPoints.length >= 3 ? 'ARMED' : 'NOT SET'}</span>
          </div>

          {/* Real-time digital clock */}
          <div className="telemetry-pill" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={14} color="#38bdf8" />
            <span>{clock}</span>
          </div>

          {/* Live/Standby Pill */}
          <div className={`telemetry-pill-standby ${isConnected ? 'live' : ''}`}>
            <span className="status-dot-led pulsing" />
            <span>{isConnected ? 'LIVE' : 'STANDBY'}</span>
          </div>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main className="main-container">
        {globalView === 'live-cameras' && <DemoCameraGrid cam1Summary={cam1Summary} />}

        {globalView === 'blockchain' && (
          <div style={{ padding: '24px', height: '100%', overflowY: 'auto', background: 'var(--background)' }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto', background: 'var(--surface-container)', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
              <BlockchainLedgerPanel liveBlockchainData={blockchainData} />
            </div>
          </div>
        )}

        {globalView === 'analytics' && (
          <div style={{ flex: 1, minHeight: '100%', overflowY: 'auto', background: 'var(--background)' }}>
            <AnalyticsPanel
              summary={summary}
              alerts={alerts}
              detectionLog={detectionLog}
              activeIntrusion={activeIntrusion}
              isConnected={isConnected}
            />
          </div>
        )}

        
        {globalView === 'dashboard' && (
          <>
            {/* Unified Source Control Bar */}
            <VideoSourceSelector
              isConnected={isConnected}
              onConnected={handleConnectedWithCam}
              onError={setStreamError}
              onStopped={handleStoppedWithCam}
            />

            {streamError && (
              <div style={{
                marginBottom: 12, padding: '10px 14px',
                background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--error)',
                borderRadius: 'var(--radius-xs)', color: '#fca5a5',
                fontFamily: 'var(--font-mono)', fontSize: 13,
              }}>
                ⚠ {streamError}
              </div>
            )}

            {/* ── Main Matrix Grid ── */}
            <div className="main-matrix-grid">
              {/* Left: Live Video + Boundary */}
              <div className="video-surveillance-container">
                <div className="video-bar-header">
                  <div className="panel-header-title">
                    <span className="status-dot-led" style={{ color: 'var(--secondary)' }} />
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5, letterSpacing: '0.04em' }}>
                      LIVE VIDEO STREAM
                    </span>
                    <span className="badge-tag-sm">Viewport 01 · CH_A</span>
                  </div>
                  <div className="video-mode-toggle">
                    <button id="btn-mode-all" type="button"
                      className={`mode-pill-btn ${detectionMode === 'all' ? 'active' : ''}`}
                      onClick={() => handleSetMode('all')}>
                      <span>⚖</span> All Objects
                    </button>
                    <button id="btn-mode-wearables" type="button"
                      className={`mode-pill-btn ${detectionMode === 'person_wearables' ? 'active' : ''}`}
                      onClick={() => handleSetMode('person_wearables')}>
                      <span>👤</span> Person &amp; Wearables Only
                    </button>
                  </div>
                </div>
                <VideoDisplay
                  isConnected={isConnected}
                  isDrawing={isDrawing}
                  boundaryPoints={boundaryPoints}
                  onAddPoint={handleAddPoint}
                  streamError={streamError}
                  ocrData={ocrData}
                />
                <BoundaryControls
                  isDrawing={isDrawing}
                  isConnected={isConnected}
                  pointCount={boundaryPoints.length}
                  onStartDraw={() => setDrawing(true)}
                  onUndo={handleUndo}
                  onFinishDraw={handleFinishBoundary}
                  onClear={handleClearBoundary}
                />
                <DetectionSummary summary={summary} activeIntrusion={activeIntrusion} showCategoriesOnly={true} />
              </div>

              {/* Right: Telemetry Sidebar */}
              <aside className="telemetry-stack">
                <div className="right-tab-bar">
                  <button className="right-tab-btn active">📡 Live Telemetry &amp; Detection Logs</button>
                </div>
                <DetectionSummary summary={summary} activeIntrusion={activeIntrusion} showRadarOnly={true} />
                <TelemetryTerminal
                  alerts={alerts} detectionLog={detectionLog}
                  activeIntrusion={activeIntrusion} cameraBlocked={cameraBlocked}
                  dwellTimes={dwellTimes} onClearAlerts={handleClearAlerts}
                  onClearDetectionLog={handleClearDetectionLog} onClearAll={handleClearAll}
                />
              </aside>
            </div>
          </>
        )}
      </main>

      <EmailAlertModal
        isOpen={isEmailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        emailStatus={emailStatus}
      />

      </div>
    </div>
  );
}

