import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, ShieldAlert, Lock, RefreshCw, Cpu, Wrench, 
  Trash2, Plus, Search, AlertTriangle, CheckCircle2, X, Copy, 
  Check, ChevronDown, ChevronUp, Database, Activity, FileCheck
} from 'lucide-react';
import { API } from '../config';

export default function BlockchainLedgerPanel({ onClose, liveBlockchainData }) {
  const [chain, setChain] = useState([]);
  const [isValid, setIsValid] = useState(true);
  const [statusMessage, setStatusMessage] = useState('Verifying ledger hashes...');
  const [modelSecState, setModelSecState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [expandedBlock, setExpandedBlock] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [copiedHashBlock, setCopiedHashBlock] = useState(null);
  const [selectedPreviewImg, setSelectedPreviewImg] = useState(null);
  const [filterType, setFilterType] = useState('ALL');

  useEffect(() => {
    if (liveBlockchainData && liveBlockchainData.chain) {
      setChain(liveBlockchainData.chain);
      setIsValid(liveBlockchainData.valid);
      if (liveBlockchainData.message) setStatusMessage(liveBlockchainData.message);
      if (liveBlockchainData.model_security) setModelSecState(liveBlockchainData.model_security);
      setLoading(false);
    }
  }, [liveBlockchainData]);

  const fetchChain = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/blockchain/chain`);
      if (res.ok) {
        const data = await res.json();
        setChain(data.chain || []);
        setIsValid(data.valid);
        setStatusMessage(data.message || 'Cryptographic chain validated.');
        if (data.model_security) setModelSecState(data.model_security);
      } else {
        setStatusMessage('Ledger service unavailable');
      }
    } catch (err) {
      console.error('Error fetching blockchain:', err);
      setStatusMessage('Network timeout connecting to chain ledger');
    } finally {
      setLoading(false);
    }
  };

  const handleAuditIntegrity = async () => {
    try {
      setVerifying(true);
      const res = await fetch(`${API}/api/blockchain/verify`);
      if (res.ok) {
        const data = await res.json();
        setIsValid(data.valid);
        setStatusMessage(data.message);
        if (data.model_security) setModelSecState(data.model_security);
      }
    } catch (err) {
      setStatusMessage('Error verifying SHA-256 chain proof');
    } finally {
      setVerifying(false);
    }
  };

  const handleCorruptAIModel = async () => {
    setActionError(null); setActionSuccess(null);
    try {
      setActionLoading(true);
      const res = await fetch(`${API}/api/blockchain/corrupt-ai`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setIsValid(false);
        if (data.status) setModelSecState(data.status);
        setStatusMessage(data.message || 'MODEL INTEGRITY DENIAL: Weight Hash Mismatch Detected!');
        setActionError('Simulated weight corruption injected! Integrity check failed.');
        await fetchChain();
      }
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestoreAIModel = async () => {
    setActionError(null); setActionSuccess(null);
    try {
      setActionLoading(true);
      const res = await fetch(`${API}/api/blockchain/restore-ai`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setIsValid(true);
        if (data.status) setModelSecState(data.status);
        setStatusMessage(data.message || 'AI Model restored & cryptographically re-anchored.');
        setActionSuccess('Model weight SHA-256 restored and verified!');
        setTimeout(() => setActionSuccess(null), 4000);
        await fetchChain();
      }
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMineTestBlock = async () => {
    setActionError(null); setActionSuccess(null);
    try {
      setActionLoading(true);
      const res = await fetch(`${API}/api/blockchain/mine-test-block`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.ok) {
        setActionSuccess(`Block #${data.block?.index} mined & anchored to chain.`);
        setTimeout(() => setActionSuccess(null), 4000);
        await fetchChain();
      } else {
        setActionError(`Mine failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setActionError(`Network error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCorruptChain = async () => {
    setActionError(null); setActionSuccess(null);
    try {
      setActionLoading(true);
      const res = await fetch(`${API}/api/blockchain/corrupt`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.ok) {
        setIsValid(false);
        setStatusMessage(data.message || 'Block payload modified! Hash verification broke.');
        setActionSuccess('Tamper injected into block! Click Verify Hashes to inspect.');
        setTimeout(() => setActionSuccess(null), 4000);
        await fetchChain();
      } else {
        setActionError(data.message || data.error || 'Need at least 1 security event before tampering.');
      }
    } catch (err) {
      setActionError(`Network error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRepairChain = async () => {
    setActionError(null); setActionSuccess(null);
    try {
      setActionLoading(true);
      const res = await fetch(`${API}/api/blockchain/repair`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.ok) {
        setIsValid(true);
        setStatusMessage(data.message || 'Proof-of-work re-calculated. Chain repaired.');
        setActionSuccess('Chain repaired! Cryptographic block proofs re-anchored.');
        setTimeout(() => setActionSuccess(null), 4000);
        await fetchChain();
      } else {
        setActionError(data.error || 'Repair failed');
      }
    } catch (err) {
      setActionError(`Network error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetChain = async () => {
    if (!window.confirm('Reset Blockchain Ledger back to Genesis Block #0?')) return;
    setActionError(null); setActionSuccess(null);
    try {
      setActionLoading(true);
      const res = await fetch(`${API}/api/blockchain/reset`, { method: 'DELETE' });
      if (res.ok) {
        setActionSuccess('Ledger reset to Genesis Block #0.');
        setTimeout(() => setActionSuccess(null), 4000);
        await fetchChain();
      }
    } catch (err) {
      setActionError(`Network error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const copyToClipboard = (text, blockIndex) => {
    navigator.clipboard.writeText(text);
    setCopiedHashBlock(blockIndex);
    setTimeout(() => setCopiedHashBlock(null), 2000);
  };

  useEffect(() => {
    fetchChain();
  }, []);

  const formatHash = (hashStr) => {
    if (!hashStr) return '0x0000000000000000';
    if (hashStr.length <= 16) return hashStr;
    return `${hashStr.substring(0, 10)}...${hashStr.substring(hashStr.length - 8)}`;
  };

  const filteredChain = chain.filter(b => {
    if (!b) return false;
    if (filterType === 'ALL') return true;
    if (filterType === 'INTRUSION') return b.event_type === 'HUMAN_INTRUSION';
    if (filterType === 'ANPR') return b.event_type === 'VEHICLE_ANPR';
    if (filterType === 'GENESIS') return b.index === 0;
    return true;
  });

  return (
    <div style={{
      width: '100%',
      boxSizing: 'border-box',
      background: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(192, 132, 252, 0.15)',
      borderRadius: '20px',
      padding: '28px',
      color: '#f8fafc',
      fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      boxShadow: '0 30px 80px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
    }}>
      
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px', height: '46px', borderRadius: '12px',
            background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(192, 132, 252, 0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#c084fc', boxShadow: '0 4px 16px rgba(168, 85, 247, 0.2)'
          }}>
            <Lock size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                Forensic Evidence Ledger
              </h3>
              <span style={{
                background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(192, 132, 252, 0.25)',
                color: '#e9d5ff', fontSize: '11px', fontWeight: 700,
                padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase'
              }}>
                SHA-256 Proof-of-Work
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '13.5px', color: '#94a3b8' }}>
              Immutable event history &amp; real-time neural model integrity verification
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleAuditIntegrity}
            disabled={verifying || actionLoading}
            style={{
              background: 'rgba(147, 51, 234, 0.25)',
              border: '1px solid rgba(192, 132, 252, 0.45)',
              color: '#f3e8ff',
              padding: '9px 18px', borderRadius: '10px',
              fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
              boxShadow: '0 4px 16px rgba(147, 51, 234, 0.25)',
              transition: 'all 0.15s ease'
            }}
          >
            <RefreshCw size={14} className={verifying ? 'spinning' : ''} color="#c084fc" />
            {verifying ? 'Auditing Hashes...' : 'Verify Cryptographic Hashes'}
          </button>

          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#cbd5e1', borderRadius: '10px', width: '38px', height: '38px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* ── Status Banner (Royal Violet Glassmorphic Card) ── */}
      <div style={{
        background: isValid ? 'rgba(126, 34, 206, 0.12)' : 'rgba(225, 29, 72, 0.14)',
        border: `1px solid ${isValid ? 'rgba(192, 132, 252, 0.35)' : 'rgba(244, 63, 94, 0.4)'}`,
        borderRadius: '14px',
        padding: '14px 18px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '14px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isValid ? <ShieldCheck size={24} color="#c084fc" /> : <ShieldAlert size={24} color="#fb7185" />}
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: isValid ? '#e9d5ff' : '#fb7185' }}>
              {isValid ? 'Ledger Status: Verified & Immutable' : 'Security Alert: Cryptographic Hash Mismatch Detected!'}
            </div>
            <div style={{ fontSize: '13px', color: '#cbd5e1', marginTop: '2px' }}>{statusMessage}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', color: '#94a3b8' }}>
          <span>Total Blocks: <strong style={{ color: '#f8fafc' }}>{chain.length}</strong></span>
          <span>•</span>
          <span>PoW Difficulty: <strong style={{ color: '#e9d5ff' }}>0000</strong></span>
        </div>
      </div>

      {/* ── AI Model Security Proof Bar (Amethyst Glassmorphic) ── */}
      {modelSecState && (
        <div style={{
          background: modelSecState.is_tampered ? 'rgba(225, 29, 72, 0.15)' : 'rgba(30, 27, 75, 0.4)',
          border: `1px solid ${modelSecState.is_tampered ? 'rgba(244, 63, 94, 0.4)' : 'rgba(192, 132, 252, 0.2)'}`,
          borderRadius: '14px',
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Cpu size={22} color={modelSecState.is_tampered ? '#fb7185' : '#c084fc'} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                AI Model Weights SHA-256 Integrity Anchor
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                Expected: <code style={{ color: '#cbd5e1', fontFamily: 'var(--font-mono)' }}>{formatHash(modelSecState.expected_hash)}</code> &bull; 
                Current: <code style={{ color: modelSecState.is_tampered ? '#fb7185' : '#c084fc', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{formatHash(modelSecState.current_hash)}</code>
              </div>
            </div>
          </div>

          <div>
            {modelSecState.is_tampered ? (
              <button
                onClick={handleRestoreAIModel}
                disabled={actionLoading}
                style={{
                  background: 'rgba(147, 51, 234, 0.25)', border: '1px solid rgba(192, 132, 252, 0.5)',
                  color: '#e9d5ff', padding: '7px 16px',
                  borderRadius: '10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 3px 8px rgba(147, 51, 234, 0.25)'
                }}
              >
                Restore Model Weights
              </button>
            ) : (
              <span style={{ fontSize: '11px', color: '#e9d5ff', background: 'rgba(168, 85, 247, 0.18)', padding: '4px 12px', borderRadius: '20px', border: '1px solid rgba(192, 132, 252, 0.3)', fontWeight: 700 }}>
                ✓ Model Integrity Secure
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Dark Glassmorphic Simulation Control Toolbar ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(30, 41, 59, 0.55)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px',
        padding: '14px 18px', marginBottom: '24px', flexWrap: 'wrap', gap: '12px',
        boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: '6px' }}>
            Simulation Tools:
          </span>
          
          <button
            onClick={handleMineTestBlock}
            disabled={actionLoading}
            style={{
              background: 'rgba(37, 99, 235, 0.25)', border: '1px solid rgba(59, 130, 246, 0.5)', color: '#ffffff',
              padding: '8px 16px', borderRadius: '10px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.2)', transition: 'transform 0.1s ease'
            }}
          >
            + Mine Block
          </button>

          <button
            onClick={handleCorruptChain}
            disabled={actionLoading}
            style={{
              background: 'rgba(225, 29, 72, 0.2)', border: '1px solid rgba(244, 63, 94, 0.45)', color: '#fda4af',
              padding: '8px 16px', borderRadius: '10px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(225, 29, 72, 0.15)'
            }}
          >
            Inject Chain Tamper
          </button>

          <button
            onClick={handleCorruptAIModel}
            disabled={actionLoading}
            style={{
              background: 'rgba(225, 29, 72, 0.2)', border: '1px solid rgba(244, 63, 94, 0.45)', color: '#fda4af',
              padding: '8px 16px', borderRadius: '10px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(225, 29, 72, 0.15)'
            }}
          >
            Inject Model Tamper
          </button>

          <button
            onClick={handleRepairChain}
            disabled={actionLoading}
            style={{
              background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(52, 211, 153, 0.45)', color: '#6ee7b7',
              padding: '8px 16px', borderRadius: '10px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.15)'
            }}
          >
            Recalculate POW
          </button>

          <button
            onClick={handleResetChain}
            disabled={actionLoading}
            style={{
              background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.12)', color: '#94a3b8',
              padding: '8px 14px', borderRadius: '10px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer'
            }}
          >
            Reset Ledger
          </button>
        </div>

        {/* Translucent Pill Filter Options */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {['ALL', 'INTRUSION', 'ANPR', 'GENESIS'].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              style={{
                background: filterType === type ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.04)',
                color: filterType === type ? '#ffffff' : '#94a3b8',
                border: filterType === type ? '1px solid rgba(96, 165, 250, 0.6)' : '1px solid rgba(255, 255, 255, 0.08)',
                padding: '5px 14px', borderRadius: '20px',
                fontSize: '11.5px', fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Action Notifications */}
      {actionSuccess && (
        <div style={{ background: 'rgba(25, 135, 84, 0.18)', border: '1px solid rgba(25, 135, 84, 0.4)', borderRadius: '10px', padding: '10px 16px', color: '#75b798', fontSize: '13px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={16} color="#75b798" /> {actionSuccess}
        </div>
      )}
      {actionError && (
        <div style={{ background: 'rgba(220, 53, 69, 0.18)', border: '1px solid rgba(220, 53, 69, 0.45)', borderRadius: '10px', padding: '10px 16px', color: '#ea868f', fontSize: '13px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} color="#ea868f" /> {actionError}
        </div>
      )}

      {/* ── Intuitive Card Timeline Feed (Humanized Bootstrap Layout) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', position: 'relative', width: '100%', boxSizing: 'border-box' }}>
        
        {/* Vertical Timeline Guide Line */}
        <div style={{
          position: 'absolute',
          top: '20px',
          bottom: '20px',
          left: '21px',
          width: '2px',
          background: 'rgba(255, 255, 255, 0.12)',
          zIndex: 0
        }} />

        {loading && chain.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
            Loading ledger blocks...
          </div>
        ) : (
          filteredChain.slice().reverse().map((block, idx) => {
            const isGenesis = block.index === 0;
            const isExpanded = expandedBlock === block.index;
            const evidenceUrl = block.evidence_filename
              ? `${API}/api/evidence/${block.evidence_filename}`
              : block.snapshot_base64;

            return (
              <div 
                key={block.index || idx} 
                style={{
                  display: 'flex',
                  gap: '18px',
                  alignItems: 'flex-start',
                  position: 'relative',
                  zIndex: 1,
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              >
                {/* Node Badge Circle */}
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: isGenesis ? 'rgba(51, 65, 85, 0.9)' : 'rgba(147, 51, 234, 0.85)',
                  border: '2px solid rgba(192, 132, 252, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  flexShrink: 0,
                  boxShadow: '0 4px 14px rgba(147, 51, 234, 0.35)'
                }}>
                  #{block.index}
                </div>

                {/* Block Card (Amethyst Dark Glass Chassis) */}
                <div style={{
                  flex: 1,
                  minWidth: 0,
                  boxSizing: 'border-box',
                  background: 'rgba(15, 23, 42, 0.65)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '14px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'
                }}>
                  {/* Block Header Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        background: isGenesis ? 'rgba(148, 163, 184, 0.15)' : 'rgba(168, 85, 247, 0.18)',
                        color: isGenesis ? '#cbd5e1' : '#e9d5ff',
                        border: `1px solid ${isGenesis ? 'rgba(148, 163, 184, 0.3)' : 'rgba(192, 132, 252, 0.3)'}`,
                        borderRadius: '20px',
                        padding: '3px 12px',
                        fontSize: '11.5px',
                        fontWeight: 700
                      }}>
                        {isGenesis ? 'Genesis Block' : block.event_type || 'Security Event'}
                      </span>
                      <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                        Source: <strong style={{ color: '#ffffff' }}>{block.camera_id}</strong>
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '12.5px', color: '#94a3b8' }}>
                        {new Date(block.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <button
                        onClick={() => copyToClipboard(block.hash, block.index)}
                        title="Copy Hash"
                        style={{
                          background: 'rgba(168, 85, 247, 0.1)',
                          border: '1px solid rgba(192, 132, 252, 0.25)',
                          color: copiedHashBlock === block.index ? '#e9d5ff' : '#c084fc',
                          padding: '4px 12px',
                          borderRadius: '20px',
                          fontSize: '11.5px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontFamily: 'var(--font-mono)'
                        }}
                      >
                        {copiedHashBlock === block.index ? <><Check size={12} /> Copied</> : <><Copy size={12} /> {formatHash(block.hash)}</>}
                      </button>
                    </div>
                  </div>

                  {/* Telemetry Target Details Row */}
                  {!isGenesis && (
                    <div style={{
                      display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center',
                      background: 'rgba(0, 0, 0, 0.35)', border: '1px solid rgba(255, 255, 255, 0.05)',
                      padding: '10px 14px', borderRadius: '10px', fontSize: '13px'
                    }}>
                      <span>Target: <strong style={{ color: '#ffffff' }}>{(block.label || 'Unknown').toUpperCase()}</strong></span>
                      <span>Category: <strong style={{ color: '#c084fc' }}>{block.category}</strong></span>
                      {block.confidence && (
                        <span>Confidence: <strong style={{ color: '#e9d5ff' }}>{(block.confidence * 100).toFixed(1)}%</strong></span>
                      )}
                      {block.dwell_sec !== undefined && (
                        <span>Dwell Time: <strong style={{ color: '#cbd5e1' }}>{block.dwell_sec}s</strong></span>
                      )}
                    </div>
                  )}

                  {/* Off-Chain Photo Evidence Frame */}
                  {evidenceUrl && (
                    <div style={{ marginTop: '4px', background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '12px 16px', width: '100%', boxSizing: 'border-box' }}>
                      <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#ffffff' }}>
                          <FileCheck size={15} color="#c084fc" /> Off-Chain Evidence Snapshot
                        </span>
                        <span style={{ fontSize: '11px', color: '#c084fc', cursor: 'pointer' }}>
                          Click photo to inspect
                        </span>
                      </div>
                      <div 
                        style={{ overflow: 'hidden', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.12)', background: '#000', textAlign: 'center', cursor: 'pointer', width: '100%' }} 
                        onClick={() => setSelectedPreviewImg(evidenceUrl)}
                      >
                        <img
                          src={evidenceUrl}
                          alt="Security Event Evidence"
                          style={{ width: '100%', maxHeight: '280px', objectFit: 'contain', display: 'block', transition: 'transform 0.2s ease' }}
                          onMouseOver={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                          onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1.0)'; }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Proof Accordion Drawer */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                    <button
                      onClick={() => setExpandedBlock(isExpanded ? null : block.index)}
                      style={{
                        background: 'none', border: 'none', color: '#c084fc',
                        fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                      }}
                    >
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      {isExpanded ? 'Hide Cryptographic Proof' : 'Inspect Full SHA-256 Hashes & Nonce'}
                    </button>
                  </div>

                  {/* Expanded Proof Details */}
                  {isExpanded && (
                    <div style={{
                      marginTop: '4px',
                      background: 'rgba(15, 23, 42, 0.9)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '10px',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      fontSize: '12px',
                      width: '100%',
                      boxSizing: 'border-box'
                    }}>
                      <div>
                        <span style={{ color: '#94a3b8' }}>Block SHA-256 Hash:</span>
                        <div style={{ color: '#ffffff', fontFamily: 'var(--font-mono)', wordBreak: 'break-all', marginTop: '2px', background: 'rgba(0,0,0,0.4)', padding: '6px 10px', borderRadius: '6px' }}>{block.hash}</div>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8' }}>Previous Block Hash:</span>
                        <div style={{ color: '#cbd5e1', fontFamily: 'var(--font-mono)', wordBreak: 'break-all', marginTop: '2px', background: 'rgba(0,0,0,0.4)', padding: '6px 10px', borderRadius: '6px' }}>{block.previous_hash}</div>
                      </div>
                      {block.evidence_hash && (
                        <div>
                          <span style={{ color: '#94a3b8' }}>Evidence Photo SHA-256:</span>
                          <div style={{ color: '#6ea8fe', fontFamily: 'var(--font-mono)', wordBreak: 'break-all', marginTop: '2px', background: 'rgba(0,0,0,0.4)', padding: '6px 10px', borderRadius: '6px' }}>{block.evidence_hash}</div>
                        </div>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px', marginTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '8px' }}>
                        <div><span style={{ color: '#94a3b8' }}>POW Nonce:</span> <strong style={{ color: '#ffffff', fontFamily: 'var(--font-mono)' }}>{block.nonce}</strong></div>
                        <div><span style={{ color: '#94a3b8' }}>State:</span> <strong style={{ color: '#20c997' }}>{block.state || 'ANCHORED'}</strong></div>
                        <div><span style={{ color: '#94a3b8' }}>Timestamp:</span> <span style={{ color: '#cbd5e1' }}>{block.timestamp}</span></div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Enlarged Image Modal */}
      {selectedPreviewImg && (
        <div 
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px'
          }}
          onClick={() => setSelectedPreviewImg(null)}
        >
          <div 
            style={{
              position: 'relative', maxWidth: '85vw', maxHeight: '85vh',
              background: '#0f172a', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '16px',
              padding: '20px', boxShadow: '0 25px 60px rgba(0,0,0,0.9)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '10px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileCheck size={18} color="#0d6efd" /> High-Resolution Evidence Inspection
              </span>
              <button 
                onClick={() => setSelectedPreviewImg(null)} 
                style={{ background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#fff', borderRadius: '8px', cursor: 'pointer', padding: '6px 12px', display: 'flex', alignItems: 'center' }}
              >
                <X size={18} />
              </button>
            </div>
            <img 
              src={selectedPreviewImg} 
              alt="Enlarged Security Evidence" 
              style={{ maxWidth: '100%', maxHeight: '72vh', borderRadius: '10px', objectFit: 'contain', display: 'block' }} 
            />
          </div>
        </div>
      )}

    </div>
  );
}

