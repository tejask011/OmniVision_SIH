import React from 'react';
import { LayoutDashboard, Video, ShieldCheck, BarChart3, Shield, ChevronLeft, ChevronRight } from 'lucide-react';

const MENU_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'live-cameras', label: 'Live Cameras', icon: Video },
  { id: 'blockchain', label: 'Blockchain Ledger', icon: ShieldCheck },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export default function GlobalSidebar({ activeView, onViewChange, collapsed, onToggle }) {
  return (
    <aside className={`global-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="gs-header">
        <div className="gs-logo-icon" style={{ color: '#06b6d4', display: 'flex', alignItems: 'center' }}>
          <Shield size={22} />
        </div>
        {!collapsed && <span className="gs-logo-text" style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '0.08em' }}>OMNIVISION</span>}
      </div>

      <nav className="gs-nav">
        {MENU_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              className={`gs-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onViewChange(item.id)}
              title={collapsed ? item.label : undefined}
            >
              <span className="gs-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} color={isActive ? '#38bdf8' : '#94a3b8'} />
              </span>
              {!collapsed && <span className="gs-label" style={{ fontSize: '13px', fontWeight: isActive ? 700 : 500 }}>{item.label}</span>}
              {!collapsed && item.badge && <span className="gs-badge">{item.badge}</span>}
            </button>
          );
        })}
      </nav>

      <div className="gs-footer">
        <button className="gs-toggle-btn" onClick={onToggle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /> <span>Collapse</span></>}
        </button>
      </div>
    </aside>
  );
}
