// DetectionSummary.jsx
// Real-Time Detection Summary with Precision Metric Tiles & Lucide Icons.

import { useState } from 'react';
import { Users, Car, Dog, Package, Search, ChevronDown, ChevronUp, Activity, AlertTriangle } from 'lucide-react';

const GROUP_META = {
  HUMAN:        { icon: Users, color: '#ef4444' },
  ANIMAL:       { icon: Dog, color: '#f59e0b' },
  VEHICLE:      { icon: Car, color: '#3b82f6' },
  OBJECT:       { icon: Package, color: '#a855f7' },
  'NO. PLATES': { icon: Car, color: '#06b6d4' },
};

const DEFAULT_META = { icon: Search, color: '#94a3b8' };

export default function DetectionSummary({ 
  summary = {}, 
  activeIntrusion = false,
  showRadarOnly = false,
  showCategoriesOnly = false,
}) {
  const [collapsed, setCollapsed] = useState({});

  const groups = Object.entries(summary || {});

  // Calculate metrics
  let personCount = 0;
  let wearableCount = 0;
  let totalCount = 0;

  groups.forEach(([cat, labels]) => {
    Object.entries(labels || {}).forEach(([lbl, cnt]) => {
      totalCount += cnt;
      if (cat === 'HUMAN') personCount += cnt;
      if (['backpack', 'handbag', 'tie', 'suitcase', 'umbrella', 'cell phone', 'watch'].includes(lbl.toLowerCase())) {
        wearableCount += cnt;
      }
    });
  });

  const threatCount = activeIntrusion ? 1 : 0;

  function toggleGroup(cat) {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));
  }

  // Render ONLY active object categories (For placement below Boundary Controls on Left Column)
  if (showCategoriesOnly) {
    if (groups.length === 0) return null;

    return (
      <div style={{ padding: '12px 14px', background: 'var(--surface-container-low)', borderTop: '1px solid var(--outline)' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', marginBottom: '8px', textTransform: 'uppercase' }}>
          ACTIVE DETECTED CATEGORIES
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {groups.map(([category, labels]) => {
            const meta = GROUP_META[category] ?? DEFAULT_META;
            const Icon = meta.icon;
            const subItems = Object.entries(labels);
            const groupSum = subItems.reduce((s, [, n]) => s + n, 0);
            const isOpen = !collapsed[category];

            return (
              <div
                key={category}
                style={{
                  background: 'var(--surface-container-lowest)',
                  border: '1px solid var(--outline)',
                  borderLeft: `3px solid ${meta.color}`,
                  borderRadius: 'var(--radius-xs)',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(category)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--on-surface)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon size={15} color={meta.color} />
                    <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.04em', color: meta.color }}>
                      {category}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      fontWeight: 700,
                      color: meta.color,
                      background: 'rgba(255, 255, 255, 0.05)',
                      padding: '2px 6px',
                      borderRadius: 3,
                    }}>
                      {groupSum}
                    </span>
                    {isOpen ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                  </div>
                </button>

                {isOpen && (
                  <div style={{
                    padding: '6px 12px 8px',
                    borderTop: '1px solid var(--outline)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}>
                    {subItems.map(([label, count]) => (
                      <div
                        key={label}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '12.5px',
                          fontFamily: 'var(--font-body)',
                          color: 'var(--on-surface-variant)',
                        }}
                      >
                        <span style={{ textTransform: 'capitalize' }}>└ {label}</span>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--on-surface)',
                        }}>
                          ×{count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="panel-chassis">
      {/* ── Card Header ── */}
      <div className="panel-chassis-header">
        <div className="panel-header-title">
          <Activity size={16} color="#06b6d4" />
          <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.04em' }}>
            REAL-TIME DETECTION SUMMARY
          </span>
        </div>
        <span className="badge-tag-sm">AI Tracker 1.0</span>
      </div>

      {/* ── Radar Visualizer & Metrics ── */}
      <div className="radar-display-box">
        {/* Animated Circular Radar Graphic */}
        <div className="radar-art-frame">
          <div className="radar-ring-inner" />
          <div className="radar-crosshair-h" />
          <div className="radar-crosshair-v" />
          <div className="radar-sweep-beam" />
          <div className="radar-center-target" />
        </div>

        <div className="radar-status-caption">
          {totalCount > 0 ? `Tracking ${totalCount} Active Entities` : 'Awaiting telemetry stream'}
        </div>
        <div className="radar-status-sub">
          {totalCount > 0
            ? 'Neural inference active on current optical viewport'
            : 'No detections yet — connect a source to populate metrics'}
        </div>

        {/* 3 Metric Tiles */}
        <div className="metric-tiles-matrix">
          <div className="metric-tile-card">
            <span className="metric-tile-label">PERSONS</span>
            <span className="metric-tile-value">{personCount}</span>
            <span className="metric-tile-sub">Normal flow</span>
          </div>

          <div className="metric-tile-card">
            <span className="metric-tile-label">WEARABLES</span>
            <span className="metric-tile-value">{wearableCount}</span>
            <span className="metric-tile-sub muted">PPE verified</span>
          </div>

          <div className="metric-tile-card">
            <span className="metric-tile-label">THREATS</span>
            <span className={`metric-tile-value ${threatCount > 0 ? 'threat' : ''}`}>
              {threatCount}
            </span>
            <span className={`metric-tile-sub ${threatCount > 0 ? 'danger' : 'muted'}`}>
              {threatCount > 0 ? 'Breach active' : 'No violations'}
            </span>
          </div>
        </div>

        {/* Dynamic Category Details when not in radar-only mode */}
        {!showRadarOnly && groups.length > 0 && (
          <div style={{ width: '100%', marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {groups.map(([category, labels]) => {
              const meta = GROUP_META[category] ?? DEFAULT_META;
              const Icon = meta.icon;
              const subItems = Object.entries(labels);
              const groupSum = subItems.reduce((s, [, n]) => s + n, 0);
              const isOpen = !collapsed[category];

              return (
                <div
                  key={category}
                  style={{
                    background: 'var(--surface-container-lowest)',
                    border: '1px solid var(--outline)',
                    borderLeft: `3px solid ${meta.color}`,
                    borderRadius: 'var(--radius-xs)',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(category)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--on-surface)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-display)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon size={16} color={meta.color} />
                      <span style={{ fontSize: '13.5px', fontWeight: 700, letterSpacing: '0.04em', color: meta.color }}>
                        {category}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 13,
                        fontWeight: 700,
                        color: meta.color,
                        background: 'rgba(255, 255, 255, 0.05)',
                        padding: '2px 8px',
                        borderRadius: 3,
                      }}>
                        {groupSum}
                      </span>
                      {isOpen ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div style={{
                      padding: '8px 14px 10px',
                      borderTop: '1px solid var(--outline)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}>
                      {subItems.map(([label, count]) => (
                        <div
                          key={label}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '13px',
                            fontFamily: 'var(--font-body)',
                            color: 'var(--on-surface-variant)',
                          }}
                        >
                          <span style={{ textTransform: 'capitalize' }}>└ {label}</span>
                          <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: 'var(--on-surface)',
                          }}>
                            ×{count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
