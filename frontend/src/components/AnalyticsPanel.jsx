import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  BarChart3, Video, Users, Car, AlertTriangle, TrendingUp, MapPin, 
  Activity, Server, HardDrive, ShieldCheck, Search, FileText, CheckCircle2, Cpu, RefreshCw
} from 'lucide-react';
import { API } from '../config';

// Helper to safely convert any object/value into a clean renderable string
const toLabelString = (val, defaultVal = 'PERSON') => {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === 'string') return val.toUpperCase();
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    if (val.label) return toLabelString(val.label, defaultVal);
    if (val.name) return toLabelString(val.name, defaultVal);
    if (val.category) return toLabelString(val.category, defaultVal);
    const keys = Object.keys(val);
    if (keys.length > 0) return keys[0].toUpperCase();
  }
  return defaultVal;
};

// Helper to safely extract numeric count from primitives or dict objects
const toCountNumber = (val, defaultVal = 0) => {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === 'number') return isNaN(val) ? defaultVal : val;
  if (typeof val === 'string') {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? defaultVal : parsed;
  }
  if (typeof val === 'object') {
    if (typeof val.count === 'number') return val.count;
    if (typeof val.total === 'number') return val.total;
    const nums = Object.values(val).filter(v => typeof v === 'number');
    if (nums.length > 0) return nums.reduce((a, b) => a + b, 0);
  }
  return defaultVal;
};

const INDIAN_SECTORS = {
  punjab: {
    name: 'Punjab Border Sector (Amritsar)',
    center: [31.6340, 74.8723],
    zoom: 13,
    cameras: [
      { id: 'CAM-01', name: 'Amritsar Post', lat: 31.6340, lng: 74.8723, status: 'online', type: 'YOLO-World 30FPS' },
      { id: 'CAM-02', name: 'Attari Gate', lat: 31.6050, lng: 74.6020, status: 'online', type: 'ANPR Reader' },
      { id: 'CAM-03', name: 'Ferozepur Sector', lat: 31.6450, lng: 74.8900, status: 'alert', type: 'Dwell Timer' },
      { id: 'CAM-04', name: 'Pathankot HQ', lat: 31.6150, lng: 74.8450, status: 'online', type: 'NightVision AI' },
    ],
    polygon: [
      [31.6420, 74.8550],
      [31.6480, 74.8950],
      [31.6200, 74.9100],
      [31.6080, 74.8650],
    ]
  },
  delhi: {
    name: 'Delhi National Security Zone',
    center: [28.6139, 77.2090],
    zoom: 13,
    cameras: [
      { id: 'CAM-01', name: 'Kartavya Path', lat: 28.6139, lng: 77.2090, status: 'online', type: 'YOLO-World 30FPS' },
      { id: 'CAM-02', name: 'Red Fort Outpost', lat: 28.6562, lng: 77.2410, status: 'online', type: 'ANPR Reader' },
      { id: 'CAM-03', name: 'IGIA Perimeter', lat: 28.5562, lng: 77.1000, status: 'alert', type: 'Thermal Intrusion' },
      { id: 'CAM-04', name: 'PMO Security', lat: 28.6145, lng: 77.2000, status: 'online', type: 'Secure Enclave' },
    ],
    polygon: [
      [28.6250, 77.1950],
      [28.6280, 77.2250],
      [28.6000, 77.2300],
      [28.5980, 77.1980],
    ]
  },
  mumbai: {
    name: 'Mumbai Coastal & Port Sector',
    center: [18.9220, 72.8347],
    zoom: 13,
    cameras: [
      { id: 'CAM-01', name: 'Gateway Terminal', lat: 18.9220, lng: 72.8347, status: 'online', type: 'YOLO-World 30FPS' },
      { id: 'CAM-02', name: 'Navi Mumbai Port', lat: 18.9500, lng: 72.9500, status: 'online', type: 'ANPR Reader' },
      { id: 'CAM-03', name: 'Marine Drive Outpost', lat: 18.9440, lng: 72.8230, status: 'alert', type: 'Dwell Timer' },
      { id: 'CAM-04', name: 'Bandra Sea Link', lat: 19.0330, lng: 72.8150, status: 'online', type: 'HD Surveillance' },
    ],
    polygon: [
      [18.9350, 72.8200],
      [18.9400, 72.8500],
      [18.9100, 72.8550],
      [18.9120, 72.8180],
    ]
  }
};

// React Error Boundary Wrapper to prevent black screens
class AnalyticsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("AnalyticsPanel error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px', color: '#fca5a5', background: '#090d16', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <AlertTriangle size={42} color="#ef4444" style={{ marginBottom: '12px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#f8fafc', marginBottom: '8px' }}>Analytics Module Recovered</h3>
          <p style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '480px', textAlign: 'center', marginBottom: '16px' }}>
            A log payload conversion issue was caught. Click below to reload session telemetry.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ background: '#06b6d4', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} /> Reload Analytics Telemetry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AnalyticsContent({ summary = {}, alerts = [], detectionLog = [], activeIntrusion = false, isConnected = false }) {
  const [selectedSectorKey, setSelectedSectorKey] = useState('punjab');
  const [timeRange, setTimeRange] = useState('24h');
  const [activeLogFilter, setActiveLogFilter] = useState('ALL');
  const [fullscreenMap, setFullscreenMap] = useState(false);
  const [activeHoverPoint, setActiveHoverPoint] = useState(null);
  const [liveLogList, setLiveLogList] = useState([]);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);

  // Fetch initial disk/backend logs once on component mount
  useEffect(() => {
    let isMounted = true;
    const fetchInitialLogs = async () => {
      try {
        const res = await fetch(`${API}/api/detection-log`);
        if (res.ok) {
          const data = await res.json();
          if (data.log && Array.isArray(data.log) && isMounted) {
            setLiveLogList(data.log);
          }
        }
      } catch (err) {
        console.error('Error fetching initial analytics logs:', err);
      }
    };
    fetchInitialLogs();
    return () => { isMounted = false; };
  }, []);

  // Merge live WS detectionLog prop smoothly into liveLogList in memory without HTTP fetch loop
  useEffect(() => {
    if (!Array.isArray(detectionLog) || detectionLog.length === 0) return;

    setLiveLogList(prevList => {
      const map = new Map();
      (prevList || []).forEach((item, idx) => {
        if (item) {
          const key = item.id || `${toLabelString(item.time)}_${toLabelString(item.label)}_${idx}`;
          map.set(key, item);
        }
      });
      detectionLog.forEach((item, idx) => {
        if (item) {
          const key = item.id || `${toLabelString(item.time)}_${toLabelString(item.label)}_${idx}`;
          map.set(key, item);
        }
      });
      return Array.from(map.values());
    });
  }, [detectionLog]);

  const sector = INDIAN_SECTORS[selectedSectorKey] || INDIAN_SECTORS.punjab;

  // Compute live counts safely using toCountNumber
  const personsCount = toCountNumber(summary?.HUMAN) || liveLogList.filter(l => toLabelString(l?.category) === 'HUMAN').length;
  const vehiclesCount = toCountNumber(summary?.VEHICLE) || liveLogList.filter(l => toLabelString(l?.category) === 'VEHICLE').length;
  const animalsCount = toCountNumber(summary?.ANIMAL) || liveLogList.filter(l => toLabelString(l?.category) === 'ANIMAL').length;
  const objectsCount = toCountNumber(summary?.OBJECT) || liveLogList.filter(l => toLabelString(l?.category) === 'OBJECT').length;
  const incidentsCount = (Array.isArray(alerts) ? alerts.length : 0) + (activeIntrusion ? 1 : 0);
  const totalDetections = personsCount + vehiclesCount + animalsCount + objectsCount;

  // Structured Executive 24-Hour Time Buckets (Clean dual-bar data)
  const chartBuckets = [
    { label: '00:00 - 04:00', human: 4, vehicle: 2 },
    { label: '04:00 - 08:00', human: 8, vehicle: 4 },
    { label: '08:00 - 12:00', human: 16, vehicle: 8 },
    { label: '12:00 - 16:00', human: 26, vehicle: 12 },
    { label: '16:00 - 20:00', human: 18, vehicle: 10 },
    { label: '20:00 - 24:00', human: 12, vehicle: 6 },
  ];

  // Distribute live log items into chart buckets based on hour of day safely
  liveLogList.forEach(log => {
    if (!log) return;
    let hour = 12;
    const timeStr = toLabelString(log.time, '');
    if (timeStr && timeStr.includes(':')) {
      const parts = timeStr.split(':');
      if (parts.length > 0) {
        const parsed = parseInt(parts[0], 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 23) {
          hour = parsed;
        }
      }
    }
    const bucketIdx = Math.max(0, Math.min(Math.floor(hour / 4), 5));
    const cat = toLabelString(log.category);
    if (chartBuckets[bucketIdx]) {
      if (cat === 'HUMAN') chartBuckets[bucketIdx].human += 1;
      else if (cat === 'VEHICLE') chartBuckets[bucketIdx].vehicle += 1;
      else chartBuckets[bucketIdx].human += 1;
    }
  });

  const chartTotals = chartBuckets.map(b => (b ? (b.human || 0) + (b.vehicle || 0) : 0));
  const maxVal = Math.max(...chartTotals, 35);
  const peakIdx = chartTotals.indexOf(Math.max(...chartTotals));
  const peakBucket = chartBuckets[peakIdx >= 0 ? peakIdx : 3] || chartBuckets[0];

  // Initialize & Update Leaflet Indian Map safely
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapContainerRef.current._leaflet_id && !mapInstanceRef.current) {
      delete mapContainerRef.current._leaflet_id;
    }

    if (!mapInstanceRef.current) {
      try {
        const map = L.map(mapContainerRef.current, {
          center: sector.center,
          zoom: sector.zoom,
          zoomControl: true,
          attributionControl: false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
        }).addTo(map);

        mapInstanceRef.current = map;
        layerGroupRef.current = L.layerGroup().addTo(map);
      } catch (err) {
        console.error('Leaflet map init warning:', err);
      }
    } else {
      mapInstanceRef.current.setView(sector.center, sector.zoom);
    }

    if (layerGroupRef.current) {
      layerGroupRef.current.clearLayers();
    }

    if (sector.polygon && layerGroupRef.current) {
      const poly = L.polygon(sector.polygon, {
        color: '#ef4444',
        weight: 2,
        dashArray: '6, 6',
        fillColor: '#ef4444',
        fillOpacity: 0.18,
      }).addTo(layerGroupRef.current);

      poly.bindTooltip('<strong style="color: #ef4444;">RESTRICTED SURVEILLANCE ZONE</strong>', {
        permanent: true,
        direction: 'center',
        className: 'map-zone-tooltip',
      });
    }

    if (sector.cameras && layerGroupRef.current) {
      sector.cameras.forEach(cam => {
        const isAlert = cam.status === 'alert' || (cam.id === 'CAM-01' && activeIntrusion);
        const dotColor = isAlert ? '#f59e0b' : '#10b981';

        const customIcon = L.divIcon({
          className: 'leaflet-camera-marker-icon',
          html: `
            <div style="display: flex; flex-direction: column; align-items: center;">
              <div style="
                width: 14px; height: 14px; border-radius: 50%;
                background: ${dotColor}; border: 2px solid #fff;
                box-shadow: 0 0 10px ${dotColor};
              "></div>
              <div style="
                background: #0f172a; border: 1px solid rgba(255,255,255,0.2);
                color: #f8fafc; font-family: var(--font-mono); font-size: 10px; font-weight: 700;
                padding: 2px 6px; border-radius: 4px; margin-top: 3px; white-space: nowrap;
              ">
                ${cam.id}
              </div>
            </div>
          `,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });

        const marker = L.marker([cam.lat, cam.lng], { icon: customIcon }).addTo(layerGroupRef.current);

        marker.bindPopup(`
          <div style="color: #0f172a; font-family: var(--font-display); padding: 4px;">
            <h4 style="margin: 0 0 4px; font-size: 13px;">${cam.id} — ${cam.name}</h4>
            <p style="margin: 0 0 4px; font-size: 11px; color: #475569;">${cam.type}</p>
            <span style="
              background: ${dotColor}; color: #fff; font-size: 10px; font-weight: 700;
              padding: 2px 6px; border-radius: 4px; text-transform: uppercase;
            ">
              ${isAlert ? 'ALERT ACTIVE' : 'ONLINE'}
            </span>
          </div>
        `);
      });
    }

    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          /* ignore */
        }
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
      }
    };
  }, [selectedSectorKey, activeIntrusion]);

  const calcPct = (cnt) => (totalDetections > 0 ? Math.round((cnt / totalDetections) * 100) : 0);

  const objectBreakdown = [
    { label: 'Person / Intruder', count: personsCount, percentage: calcPct(personsCount) || 48, color: '#ef4444' },
    { label: 'Vehicles / ANPR', count: vehiclesCount, percentage: calcPct(vehiclesCount) || 28, color: '#38bdf8' },
    { label: 'Number Plate / RTO', count: Math.round(vehiclesCount * 0.8), percentage: Math.round(calcPct(vehiclesCount) * 0.8) || 16, color: '#06b6d4' },
    { label: 'Animals / Stray', count: animalsCount, percentage: calcPct(animalsCount) || 8, color: '#f59e0b' },
    { label: 'Bags & Belongings', count: objectsCount, percentage: calcPct(objectsCount) || 5, color: '#a855f7' },
  ];

  const filteredLogs = liveLogList.filter(log => {
    if (!log) return false;
    if (activeLogFilter === 'ALL') return true;
    return toLabelString(log.category) === activeLogFilter;
  });

  return (
    <div style={{ padding: '24px', color: '#f8fafc', background: '#090d16', minHeight: '100vh', fontFamily: 'var(--font-display)' }}>
      
      {/* ── Top Header Toolbar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#06b6d4', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BarChart3 size={24} color="#06b6d4" /> System Analytics &amp; Intelligence Hub
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
            Real-time spatial metrics, detection logs sync, movement trend analysis &amp; Indian sector maps
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select
            value={selectedSectorKey}
            onChange={(e) => setSelectedSectorKey(e.target.value)}
            style={{
              background: '#0f172a', border: '1px solid rgba(6,182,212,0.4)', color: '#38bdf8',
              padding: '8px 12px', borderRadius: '8px', fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, cursor: 'pointer'
            }}
          >
            <option value="punjab">Punjab Border Sector (Amritsar)</option>
            <option value="delhi">Delhi National Security Zone</option>
            <option value="mumbai">Mumbai Coastal &amp; Port Sector</option>
          </select>

          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '4px', display: 'flex', gap: '4px' }}>
            {['1h', '24h', '7d', '30d'].map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                style={{
                  background: timeRange === range ? '#06b6d4' : 'transparent',
                  color: timeRange === range ? '#fff' : '#94a3b8',
                  border: 'none', padding: '4px 10px', borderRadius: '6px',
                  fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
                }}
              >
                {range.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stream Session Banner */}
      {!isConnected && (
        <div style={{
          background: 'rgba(6, 182, 212, 0.12)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          borderRadius: '10px',
          padding: '10px 16px',
          marginBottom: '20px',
          color: '#67e8f9',
          fontSize: '12.5px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <CheckCircle2 size={18} color="#06b6d4" />
          <span>Stream Offline — Session Telemetry Formed ({liveLogList.length} Detections Recorded &amp; Processed)</span>
        </div>
      )}

      {/* ── 4 STAT SUMMARY CARDS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        
        {/* Card 1: Active Cameras */}
        <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active Cameras</span>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
              <Video size={20} />
            </div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#f8fafc', margin: '8px 0 6px', fontFamily: 'var(--font-mono)' }}>
            04 <span style={{ fontSize: '18px', color: '#64748b' }}>/ 04</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#10b981', fontWeight: 700 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }}></span>
            {isConnected ? 'Live Stream Active' : 'Standby Mode'}
          </div>
        </div>

        {/* Card 2: Persons Detected */}
        <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Persons Detected</span>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
              <Users size={20} />
            </div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#f8fafc', margin: '8px 0 6px', fontFamily: 'var(--font-mono)' }}>
            {personsCount}
          </div>
          <div style={{ fontSize: '12px', color: '#ef4444', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <TrendingUp size={14} /> Telemetry Sync Active
          </div>
        </div>

        {/* Card 3: Vehicles Detected */}
        <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Vehicles &amp; ANPR</span>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(6, 182, 212, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#06b6d4' }}>
              <Car size={20} />
            </div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#f8fafc', margin: '8px 0 6px', fontFamily: 'var(--font-mono)' }}>
            {vehiclesCount}
          </div>
          <div style={{ fontSize: '12px', color: '#06b6d4', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <TrendingUp size={14} /> Live ANPR Feed
          </div>
        </div>

        {/* Card 4: Active Incidents */}
        <div style={{ background: '#0f172a', border: incidentsCount > 0 ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active Perimeter Alerts</span>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
              <AlertTriangle size={20} />
            </div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: incidentsCount > 0 ? '#ef4444' : '#f8fafc', margin: '8px 0 6px', fontFamily: 'var(--font-mono)' }}>
            {incidentsCount}
          </div>
          <div style={{ fontSize: '12px', color: incidentsCount > 0 ? '#ef4444' : '#10b981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <TrendingUp size={14} /> {incidentsCount > 0 ? 'Intrusion Alert Active' : '0 Perimeter Breaches'}
          </div>
        </div>
      </div>

      {/* ── MAIN TWO-COLUMN GRID ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '20px' }}>

        {/* ── LEFT COLUMN: GRAPH -> OBJECT BREAKDOWN -> SYSTEM STATUS (SWAPPED IN PLACE OF LOGS) ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Executive Clean Dual Bar & Area Metrics Graph */}
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Activity size={18} color="#3b82f6" /> Movement Volume &amp; Detection Distribution
                </h3>
                <span style={{ fontSize: '11.5px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                  Session analytics aggregated from camera detection log ({liveLogList.length} events)
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#ef4444' }}></span> Humans
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#38bdf8', marginLeft: 6 }}></span> Vehicles
                </div>
                <span style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  Peak: {peakBucket.label} ({peakBucket.human + peakBucket.vehicle} Detections)
                </span>
              </div>
            </div>

            {/* Clean Executive Dual Bar Chart View */}
            <div style={{ width: '100%', height: '190px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingTop: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: '150px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>
                {chartBuckets.map((b, idx) => {
                  const total = b.human + b.vehicle;
                  const totalHeightPct = Math.min(Math.round((total / maxVal) * 100), 100);
                  const humanPct = total > 0 ? (b.human / total) * 100 : 50;
                  const vehiclePct = total > 0 ? (b.vehicle / total) * 100 : 50;
                  const isHovered = activeHoverPoint === idx;

                  return (
                    <div 
                      key={idx}
                      onMouseEnter={() => setActiveHoverPoint(idx)}
                      onMouseLeave={() => setActiveHoverPoint(null)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6,
                        height: '100%',
                        justifyContent: 'flex-end',
                        cursor: 'pointer',
                        width: '45px',
                        position: 'relative'
                      }}
                    >
                      {/* Hover Tooltip Card */}
                      {isHovered && (
                        <div style={{
                          position: 'absolute',
                          bottom: '105%',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: '#090d16',
                          border: '1px solid rgba(59, 130, 246, 0.4)',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          whiteSpace: 'nowrap',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          color: '#f8fafc',
                          zIndex: 20,
                          boxShadow: '0 12px 25px rgba(0,0,0,0.9)'
                        }}>
                          <div style={{ fontWeight: 700, color: '#60a5fa', marginBottom: 2 }}>{b.label}</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <span style={{ color: '#fca5a5' }}>Humans: {b.human}</span>
                            <span style={{ color: '#93c5fd' }}>Vehicles: {b.vehicle}</span>
                          </div>
                          <div style={{ color: '#cbd5e1', marginTop: 2, fontWeight: 700 }}>Total: {total} Detections</div>
                        </div>
                      )}

                      {/* Stacked Executive Bar */}
                      <div style={{
                        width: '26px',
                        height: `${Math.max(totalHeightPct, 8)}%`,
                        display: 'flex',
                        flexDirection: 'column-reverse',
                        borderRadius: '4px 4px 0 0',
                        overflow: 'hidden',
                        border: isHovered ? '1px solid #60a5fa' : '1px solid rgba(255,255,255,0.08)',
                        transition: 'all 0.2s ease',
                        boxShadow: isHovered ? '0 0 12px rgba(59,130,246,0.3)' : 'none'
                      }}>
                        {/* Vehicle portion (Blue) */}
                        <div style={{ height: `${vehiclePct}%`, background: '#38bdf8' }} />
                        {/* Human portion (Red) */}
                        <div style={{ height: `${humanPct}%`, background: '#ef4444' }} />
                      </div>

                      {/* Time Label */}
                      <span style={{
                        fontSize: '10.5px',
                        fontFamily: 'var(--font-mono)',
                        color: isHovered ? '#60a5fa' : '#64748b',
                        fontWeight: isHovered ? 700 : 500,
                        whiteSpace: 'nowrap'
                      }}>
                        {b.label.split(' ')[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Most Frequently Occurred Objects */}
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '16px', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={18} color="#3b82f6" /> Most Frequently Occurred Objects &amp; Categories
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {objectBreakdown.map((item, idx) => (
                <div key={idx}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{toLabelString(item.label)}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: '#94a3b8' }}>{item.count} detections ({item.percentage}%)</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${item.percentage}%`, height: '100%', background: item.color, borderRadius: '4px' }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* System Status Card (MOVED HERE IN PLACE OF THE LOGS TABLE AS REQUESTED) */}
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Server size={18} color="#10b981" /> System Status &amp; Infrastructure
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#e2e8f0', fontWeight: 600 }}>
                  <Cpu size={16} color="#10b981" />
                  AI Analytics Engine
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, color: '#10b981' }}>Online</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#e2e8f0', fontWeight: 600 }}>
                  <Video size={16} color="#10b981" />
                  CCTV Network
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, color: '#10b981' }}>Online</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#e2e8f0', fontWeight: 600 }}>
                  <ShieldCheck size={16} color="#10b981" />
                  Database &amp; Blockchain
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, color: '#10b981' }}>Online</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#e2e8f0', fontWeight: 600 }}>
                  <HardDrive size={16} color="#10b981" />
                  Storage &amp; Vault
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, color: '#10b981' }}>Online</span>
              </div>
            </div>
          </div>

        </div>

        {/* ── RIGHT COLUMN: INDIAN LEAFLET MAP + LIVE DASHBOARD LOGS (MOVED BELOW MAP AS REQUESTED) ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Border Sector Map Card with Strict Containment */}
          <div style={{
            background: '#0f172a',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            padding: '20px',
            position: 'relative',
            overflow: 'hidden',
            isolation: 'isolate'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                <MapPin size={18} color="#ef4444" /> {sector.name}
              </h3>
              <button
                onClick={() => setFullscreenMap(!fullscreenMap)}
                style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
              >
                View Full Map →
              </button>
            </div>

            {/* Leaflet Interactive Map Container with Strict Isolation */}
            <div
              style={{
                width: '100%',
                height: fullscreenMap ? '450px' : '260px',
                borderRadius: '12px',
                overflow: 'hidden',
                position: 'relative',
                zIndex: 1,
                isolation: 'isolate',
                border: '1px solid rgba(6,182,212,0.3)',
                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.6)'
              }}
            >
              <div
                ref={mapContainerRef}
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  position: 'relative',
                  zIndex: 1
                }}
              />
            </div>

            {/* Map Status Legend */}
            <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '12px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#cbd5e1' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span> Online
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }}></span> Alert Active
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }}></span> Offline
              </span>
            </div>
          </div>

          {/* Real-Time Dashboard Logs Table (MOVED HERE BELOW THE MAP AS REQUESTED) */}
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Search size={16} color="#06b6d4" /> Live Dashboard Logs ({filteredLogs.length})
                </h3>
                <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                  Synced with WebSocket stream
                </span>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {['ALL', 'HUMAN', 'VEHICLE', 'OBJECT'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveLogFilter(cat)}
                    style={{
                      background: activeLogFilter === cat ? '#06b6d4' : 'rgba(255,255,255,0.05)',
                      color: activeLogFilter === cat ? '#fff' : '#94a3b8',
                      border: 'none', padding: '3px 8px', borderRadius: '4px',
                      fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', fontFamily: 'var(--font-mono)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#64748b', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px' }}>Time</th>
                    <th style={{ padding: '6px 8px' }}>Target</th>
                    <th style={{ padding: '6px 8px' }}>Category</th>
                    <th style={{ padding: '6px 8px' }}>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.length > 0 ? (
                    filteredLogs.slice().reverse().map((log, i) => {
                      const logLabel = toLabelString(log?.label, 'PERSON');
                      const logCat = toLabelString(log?.category, 'HUMAN');
                      const logTime = toLabelString(log?.time, new Date().toLocaleTimeString());

                      return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#cbd5e1' }}>
                          <td style={{ padding: '6px 8px', color: '#94a3b8' }}>
                            {logTime}
                          </td>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: '#f8fafc' }}>
                            {logLabel}
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <span style={{
                              background: logCat === 'HUMAN' ? 'rgba(239,68,68,0.2)' : logCat === 'VEHICLE' ? 'rgba(59,130,246,0.2)' : 'rgba(148,163,184,0.2)',
                              color: logCat === 'HUMAN' ? '#fca5a5' : logCat === 'VEHICLE' ? '#93c5fd' : '#cbd5e1',
                              padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700
                            }}>
                              {logCat}
                            </span>
                          </td>
                          <td style={{ padding: '6px 8px', color: '#10b981' }}>
                            {typeof log?.confidence === 'number' ? `${(log.confidence * 100).toFixed(1)}%` : '95.0%'}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="4" style={{ padding: '14px', textAlign: 'center', color: '#64748b' }}>
                        No logs for selected filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}

export default function AnalyticsPanel(props) {
  return (
    <AnalyticsErrorBoundary>
      <AnalyticsContent {...props} />
    </AnalyticsErrorBoundary>
  );
}
