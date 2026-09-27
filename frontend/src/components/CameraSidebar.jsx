// CameraSidebar.jsx — Multi-camera channel sidebar
import { useState } from 'react';

const CAM_TYPES = {
  webcam: { icon: '📷', label: 'Webcam' },
  rtsp:   { icon: '📡', label: 'RTSP' },
  video:  { icon: '🎞️', label: 'Video File' },
  idle:   { icon: '⬜', label: 'Idle' },
};

export default function CameraSidebar({ cameras, activeCamId, onSelectCam, onAddCamera, onRemoveCamera, collapsed, onToggle }) {
  const [hoveredId, setHoveredId] = useState(null);

  return (
    <aside className={`cam-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <button className="sidebar-toggle-tab" onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'}>
        {collapsed ? '▶' : '◀'}
      </button>

      {!collapsed && (
        <>
          <div className="sidebar-header">
            <span className="sidebar-header-icon">📹</span>
            <span className="sidebar-header-title">CAMERA CHANNELS</span>
            <span className="sidebar-cam-count">{cameras.length}</span>
          </div>

          <div className="sidebar-cam-list">
            {cameras.map((cam) => {
              const isActive = cam.id === activeCamId;
              const typeInfo = CAM_TYPES[cam.type] || CAM_TYPES.idle;
              const statusColor =
                cam.status === 'live'       ? '#22c55e' :
                cam.status === 'processing' ? '#f59e0b' :
                cam.status === 'error'      ? '#ef4444' : '#64748b';

              return (
                <div
                  key={cam.id}
                  className={`cam-slot ${isActive ? 'active' : ''} ${cam.status === 'error' ? 'error' : ''}`}
                  onClick={() => onSelectCam(cam.id)}
                  onMouseEnter={() => setHoveredId(cam.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  title={cam.source || cam.label}
                >
                  <div className="cam-slot-thumb">
                    {cam.thumbnail ? (
                      <img src={cam.thumbnail} alt={cam.label} className="cam-thumb-img" />
                    ) : (
                      <div className="cam-thumb-placeholder">
                        <span style={{ fontSize: 24 }}>{typeInfo.icon}</span>
                      </div>
                    )}
                    <div className="cam-slot-status-badge">
                      <span className="status-dot-led" style={{ color: statusColor }} />
                      <span className="cam-status-text">{(cam.status || 'idle').toUpperCase()}</span>
                    </div>
                    {isActive && <div className="cam-active-ring" />}
                  </div>

                  <div className="cam-slot-info">
                    <div className="cam-slot-label">
                      <span className="cam-type-icon">{typeInfo.icon}</span>
                      <span className="cam-slot-name">{cam.label}</span>
                    </div>
                    <div className="cam-slot-source">
                      {cam.source ? (cam.source.length > 24 ? cam.source.slice(0,22)+'…' : cam.source) : 'No source'}
                    </div>
                    {cam.status === 'processing' && cam.progress !== undefined && (
                      <div className="cam-progress-bar-wrap">
                        <div className="cam-progress-bar" style={{ width: `${cam.progress}%` }} />
                        <span className="cam-progress-text">{Math.round(cam.progress)}%</span>
                      </div>
                    )}
                    {cam.detectionCount !== undefined && cam.detectionCount > 0 && (
                      <div className="cam-detect-badge">
                        🚨 {cam.detectionCount} alert{cam.detectionCount > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>

                  {hoveredId === cam.id && !isActive && cameras.length > 1 && (
                    <button
                      className="cam-remove-btn"
                      onClick={(e) => { e.stopPropagation(); onRemoveCamera(cam.id); }}
                      title="Remove channel"
                    >✕</button>
                  )}
                </div>
              );
            })}
          </div>

          <button className="sidebar-add-cam-btn" onClick={onAddCamera}>
            <span>＋</span>
            <span>Add Camera Channel</span>
          </button>

          <div className="sidebar-legend">
            <div className="legend-row"><span>📷</span><span>Webcam</span></div>
            <div className="legend-row"><span>📡</span><span>RTSP/IP Cam</span></div>
            <div className="legend-row"><span>🎞️</span><span>Video File</span></div>
          </div>
        </>
      )}
    </aside>
  );
}
