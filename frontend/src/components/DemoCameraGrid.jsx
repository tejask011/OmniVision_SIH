// DemoCameraGrid.jsx
import { useState, useRef } from "react";
import { API } from "../config";

function RawVideoCell({ id, label }) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef(null);

  const isCam1 = id === "cam-01";

  const togglePlay = (e) => {
    e.stopPropagation();
    if (isCam1) {
      setPlaying(!playing);
    } else {
      if (videoRef.current) {
        if (playing) {
          videoRef.current.pause();
          setPlaying(false);
        } else {
          videoRef.current.play();
          setPlaying(true);
        }
      }
    }
  };

  return (
    <div
      className="multicam-cell"
      style={{ position: "relative", cursor: "pointer", overflow: "hidden", background: "#050b14", borderRadius: "8px", border: "1px solid #1e293b" }}
    >
      {isCam1 ? (
        <img
          src={playing ? `${API}/api/cam1-yolo-stream` : ""}
          className="multicam-feed"
          style={{ objectFit: "cover", width: "100%", height: "100%", display: playing ? "block" : "none" }}
          alt="cam1 yolo"
        />
      ) : (
        <video
          ref={videoRef}
          src={`${API}/api/cam2-video`}
          className="multicam-feed"
          style={{ objectFit: "cover", width: "100%", height: "100%", display: "block" }}
          loop
          muted
          playsInline
        />
      )}

      {!playing && (
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(5, 11, 20, 0.4)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 10,
        }}>
          <span style={{ fontSize: 34, opacity: 0.65 }}>⏸</span>
        </div>
      )}

      <div className="multicam-hud" style={{ position: "absolute", top: 6, left: 6, display: "flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.5)", padding: "4px 8px", borderRadius: "4px" }}>
        <span className="multicam-cam-label" style={{ color: "#fff", fontSize: 11, fontWeight: "bold", fontFamily: "var(--font-mono)" }}>
          {label} {isCam1 && playing && <span style={{color: "#22c55e"}}>+ YOLO AI</span>}
        </span>
        <span className={`multicam-status-dot ${playing ? "live" : ""}`} style={{ width: 6, height: 6, borderRadius: "50%", background: playing ? "#22c55e" : "#64748b" }} />
      </div>

      <button
        onClick={togglePlay}
        style={{
          position: "absolute", bottom: 12, right: 12,
          background: playing ? "rgba(239,68,68,0.82)" : "rgba(34,197,94,0.82)",
          border: `1px solid ${playing ? "#ef4444" : "#22c55e"}`,
          borderRadius: 6, color: "#fff",
          fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 700,
          padding: "6px 12px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 5,
          backdropFilter: "blur(4px)", zIndex: 10,
          boxShadow: playing ? "0 0 10px rgba(239,68,68,0.35)" : "0 0 10px rgba(34,197,94,0.35)",
        }}
      >
        {playing ? "⏸ PAUSE" : "▶ PLAY"}
      </button>
    </div>
  );
}

export default function DemoCameraGrid({ cam1Summary }) {
  return (
    <div className="multicam-tab" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="multicam-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <span style={{ fontSize: 14, fontWeight: "bold", fontFamily: "var(--font-mono)", color: "#94a3b8" }}>📹 LIVE CCTV FEEDS — HYBRID MODE</span>
        <span className="multicam-count" style={{ background: "rgba(16, 185, 129, 0.2)", color: "#10b981", padding: "4px 8px", borderRadius: "12px", fontSize: 11, fontWeight: "bold" }}>2 CAMS</span>
      </div>

      <div className="multicam-grid-2x" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", minHeight: 0 }}>
        <RawVideoCell id="cam-01" label="CAM-01" />
        <RawVideoCell id="cam-02" label="CAM-02 RAW" />
      </div>

      {cam1Summary && (
        <div style={{ 
          marginTop: "24px", 
          padding: "20px", 
          background: "var(--surface-container)", 
          borderRadius: "12px", 
          border: "1px solid var(--outline)" 
        }}>
          <h4 style={{ margin: "0 0 16px 0", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--secondary)", display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--secondary)", boxShadow: "0 0 8px var(--secondary)" }}></span>
            CAM-01 LIVE AI ANALYTICS
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
            {Object.entries(cam1Summary).map(([key, val]) => (
              <div key={key} style={{ 
                background: "var(--surface-container-low)", 
                border: "1px solid var(--outline)", 
                borderRadius: "8px", 
                padding: "16px", 
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                gap: 8
              }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{key}</div>
                <div style={{ fontSize: 32, color: "var(--text-primary)", fontWeight: 900, fontFamily: "var(--font-display)" }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
