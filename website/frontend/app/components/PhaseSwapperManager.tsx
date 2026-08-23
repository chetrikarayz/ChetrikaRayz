"use client";

import { useState, useEffect, useCallback } from "react";
import { Shuffle, Plus, Trash2, AlertTriangle, CheckCircle, XCircle, Activity, Zap, Wifi, WifiOff, Bolt } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface PhaseSwapper {
  _id: string;
  name: string;
  currentPhase: "R" | "Y" | "B" | "NONE";
  loadType: string;
  status: "active" | "inactive" | "fault";
  lastSwappedAt: string | null;
  switchDelay?: number;
}

interface PhaseData {
  voltage: number; current: number; power: number; energy: number; frequency: number; pf: number;
}

interface LiveData {
  timestamp: string;
  device_id: string;
  phases: Record<string, PhaseData>;
  neutralCurrent: number;
  current_phase?: "R" | "Y" | "B" | "NONE";
}

const phaseColors: Record<string, string> = {
  R: "#dc2626", Y: "#d97706", B: "#2563eb", NONE: "#94a3b8"
};

function SwapperCard({ swapper, live, onSwap, onDelete, onClearFault, onSetDelay }: {
  swapper: PhaseSwapper;
  live?: LiveData;
  onSwap: (id: string, phase: "R" | "Y" | "B" | "NONE") => void;
  onDelete: (id: string) => void;
  onClearFault: (id: string) => void;
  onSetDelay: (id: string, delay_ms: number) => void;
}) {
  const [swapOpen, setSwapOpen] = useState(false);
  const [targetPhase, setTargetPhase] = useState<"R" | "Y" | "B" | "NONE">(swapper.currentPhase);
  const [delayOpen, setDelayOpen] = useState(false);
  const [newDelay, setNewDelay] = useState(swapper.switchDelay ?? 3000);

  const activePhase = live?.current_phase ?? swapper.currentPhase;
  const isOnline = !!live && (Date.now() - new Date(live.timestamp).getTime() < 60000);
  const phaseData = live?.phases?.[activePhase];

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isOnline ? 'bg-green-50' : 'bg-slate-50'}`}>
            {isOnline ? <Activity size={16} className="text-green-600" /> : <WifiOff size={16} className="text-slate-400" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900">{swapper.name}</span>
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isOnline ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>{swapper.loadType}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                {swapper.status === "active" ? <CheckCircle size={12} className="text-green-500" /> :
                 swapper.status === "fault" ? <AlertTriangle size={12} className="text-red-500" /> :
                 <XCircle size={12} className="text-slate-400" />}
                <span className="capitalize">{swapper.status}</span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {swapper.status === "fault" ? (
            <button
              onClick={() => onClearFault(swapper._id)}
              className="flex items-center gap-1.5 text-xs font-bold bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 transition-colors cursor-pointer"
            >
              <AlertTriangle size={12} /> Clear Fault
            </button>
          ) : swapOpen ? (
            <div className="flex items-center gap-1.5">
              <select
                value={targetPhase}
                onChange={e => setTargetPhase(e.target.value as "R" | "Y" | "B" | "NONE")}
                className="text-xs border border-border rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-amber-200"
                autoFocus
              >
                <option value="R">R</option>
                <option value="Y">Y</option>
                <option value="B">B</option>
                <option value="NONE">NONE (All OFF)</option>
              </select>
              <button
                onClick={() => { onSwap(swapper._id, targetPhase); setSwapOpen(false); }}
                className="text-xs font-bold bg-amber-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-amber-600 transition-colors cursor-pointer"
              >
                Confirm
              </button>
              <button
                onClick={() => setSwapOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-700 px-1.5 py-1 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => { setSwapOpen(true); setTargetPhase(swapper.currentPhase); }}
                className="flex items-center gap-1.5 text-xs font-bold text-amber-600 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <Shuffle size={12} /> Swap Phase
              </button>
              <button
                onClick={() => onDelete(swapper._id)}
                className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors cursor-pointer"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Fault Banner */}
      {swapper.status === "fault" && (
        <div className="bg-red-50 border-b border-red-200 px-5 py-2 flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-500 shrink-0" />
          <span className="text-xs font-semibold text-red-700">
            Fault detected — interlock failure or contactor error. Clear the fault to resume normal operation.
          </span>
        </div>
      )}

      {/* Body */}
      <div className="p-4">
        {/* Phase Indicator */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs font-medium text-slate-500">Active Phase:</span>
          <div className="flex gap-2">
            {(["R", "Y", "B", "NONE"] as const).map(p => (
              <div
                key={p}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${
                  p === activePhase
                    ? "shadow-sm border-2"
                    : "border border-slate-200 text-slate-400 opacity-50"
                }`}
                style={{
                  borderColor: p === activePhase ? phaseColors[p] : undefined,
                  backgroundColor: p === activePhase ? `${phaseColors[p]}12` : undefined,
                  color: p === activePhase ? phaseColors[p] : undefined,
                }}
              >
                <Bolt size={14} fill={p === activePhase ? phaseColors[p] : "none"} />
                {p}
              </div>
            ))}
          </div>
        </div>

        {/* Live Data — single PZEM readout */}
        <div className="bg-slate-50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-primary" />
            <span className="text-xs font-bold text-slate-700">Live Load Readings</span>
            {isOnline && (
              <span className="text-[10px] text-slate-400 ml-auto">
                Updated {new Date(live!.timestamp).toLocaleTimeString()}
              </span>
            )}
          </div>
          {phaseData ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <Metric label="Voltage" value={`${phaseData.voltage.toFixed(1)}V`} />
              <Metric label="Current" value={`${phaseData.current.toFixed(2)}A`} />
              <Metric label="Power" value={`${phaseData.power.toFixed(1)}W`} />
              <Metric label="Energy" value={`${phaseData.energy.toFixed(1)}kWh`} />
              <Metric label="Frequency" value={`${phaseData.frequency.toFixed(1)}Hz`} />
              <Metric label="Power Factor" value={phaseData.pf.toFixed(3)} />
            </div>
          ) : (
            <div className="text-xs text-slate-400 py-2 text-center">
              {isOnline ? "Waiting for data..." : "Device offline — no data"}
            </div>
          )}
        </div>

        {/* Footer */}
        {isOnline && (
          <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-400 border-t border-border pt-3">
            {swapper.lastSwappedAt && (
              <span className="flex items-center gap-1">
                <Shuffle size={11} /> Last swap: {new Date(swapper.lastSwappedAt).toLocaleString()}
              </span>
            )}
            {delayOpen ? (
              <span className="flex items-center gap-1.5 ml-auto">
                <span className="text-slate-400">Delay:</span>
                <input
                  type="number"
                  min={500}
                  max={30000}
                  step={100}
                  value={newDelay}
                  onChange={e => setNewDelay(Number(e.target.value))}
                  className="w-20 text-xs border border-border rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-amber-200"
                />
                <span className="text-slate-400">ms</span>
                <button
                  onClick={() => { onSetDelay(swapper._id, newDelay); setDelayOpen(false); }}
                  className="text-xs font-bold bg-amber-500 text-white px-2 py-0.5 rounded hover:bg-amber-600 transition-colors cursor-pointer"
                >
                  Save
                </button>
                <button
                  onClick={() => setDelayOpen(false)}
                  className="text-xs text-slate-500 hover:text-slate-700 px-1 cursor-pointer"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-1 ml-auto cursor-pointer hover:text-slate-600" onClick={() => { setNewDelay(swapper.switchDelay ?? 3000); setDelayOpen(true); }}>
                <Activity size={11} /> Switch delay: {swapper.switchDelay ?? 3000}ms
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg px-3 py-2 border border-border">
      <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{label}</div>
      <div className="text-sm font-bold text-slate-800 mt-0.5">{value}</div>
    </div>
  );
}

export default function PhaseSwapperManager() {
  const [swappers, setSwappers] = useState<PhaseSwapper[]>([]);
  const [liveData, setLiveData] = useState<Record<string, LiveData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [swapMsg, setSwapMsg] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhase, setNewPhase] = useState<"R" | "Y" | "B" | "NONE">("R");
  const [newLoadType, setNewLoadType] = useState("");
  const [registering, setRegistering] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;

  const fetchSwappers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/iot/phase-swappers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        setSwappers(d.swappers || []);
      }
    } catch {
      setError("Failed to load phase swappers");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchLiveData = useCallback(async (swapperName: string) => {
    if (!token) return;
    const hwId = swapperName.startsWith("SW") ? swapperName.slice(2) : swapperName;
    try {
      const res = await fetch(`${API_URL}/api/iot/latest?device_id=${encodeURIComponent(hwId)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        if (d && d.phases) {
          setLiveData(prev => ({ ...prev, [swapperName]: d }));
        }
      }
    } catch {}
  }, [token]);

  useEffect(() => {
    fetchSwappers();
    const interval = setInterval(() => { fetchSwappers(); }, 5000);
    return () => clearInterval(interval);
  }, [fetchSwappers]);

  useEffect(() => {
    if (swappers.length === 0) return;
    const ids = swappers.map(s => s.name);
    ids.forEach(id => fetchLiveData(id));
    const interval = setInterval(() => { ids.forEach(id => fetchLiveData(id)); }, 100);
    return () => clearInterval(interval);
  }, [swappers, fetchLiveData]);

  const handleSwap = async (id: string, phase: "R" | "Y" | "B" | "NONE") => {
    if (!token) return;
    setError("");
    setSwapMsg("");
    try {
      const res = await fetch(`${API_URL}/api/iot/phase-swappers/${id}/swap`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ phase })
      });
      if (res.ok) {
        const d = await res.json();
        setSwapMsg(d.message || "Phase swapped");
        fetchSwappers();
        setTimeout(() => setSwapMsg(""), 4000);
      } else {
        const d = await res.json();
        setError(d.error || "Swap failed");
      }
    } catch {
      setError("Network error during swap");
    }
  };

  const handleClearFault = async (id: string) => {
    if (!token) return;
    setError("");
    setSwapMsg("");
    try {
      const res = await fetch(`${API_URL}/api/iot/phase-swappers/${id}/clear-fault`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        setSwapMsg(d.message || "Clear-fault command sent — hardware will verify");
        setTimeout(() => setSwapMsg(""), 4000);
      } else {
        const d = await res.json();
        setError(d.error || "Clear fault failed");
      }
    } catch {
      setError("Network error clearing fault");
    }
  };

  const handleRegister = async () => {
    if (!token || !newName.trim()) return;
    setRegistering(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/iot/phase-swappers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), phase: newPhase, loadType: newLoadType || "Residential" })
      });
      if (res.ok) {
        setShowRegister(false);
        setNewName(""); setNewPhase("R"); setNewLoadType("");
        fetchSwappers();
      } else {
        const d = await res.json();
        setError(d.error || "Registration failed");
      }
    } catch {
      setError("Network error during registration");
    } finally {
      setRegistering(false);
    }
  };

  const handleSetDelay = async (id: string, delay_ms: number) => {
    if (!token) return;
    setError("");
    setSwapMsg("");
    try {
      const res = await fetch(`${API_URL}/api/iot/phase-swappers/${id}/switch-delay`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ delay_ms })
      });
      if (res.ok) {
        const d = await res.json();
        setSwapMsg(d.message || "Switch delay updated");
        fetchSwappers();
        setTimeout(() => setSwapMsg(""), 4000);
      } else {
        const d = await res.json();
        setError(d.error || "Failed to update switch delay");
      }
    } catch {
      setError("Network error updating switch delay");
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/iot/phase-swappers/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchSwappers();
        setLiveData(prev => {
          const next = { ...prev };
          const swapper = swappers.find(s => s._id === id);
          if (swapper) delete next[swapper.name];
          return next;
        });
      } else {
        const d = await res.json();
        setError(d.error || "Delete failed");
      }
    } catch {
      setError("Delete failed");
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-border rounded-xl shadow-sm p-8 text-center">
        <p className="text-xs text-slate-400">Loading phase swappers...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {swappers.map(s => (
        <SwapperCard
          key={s._id}
          swapper={s}
          live={liveData[s.name]}
          onSwap={handleSwap}
          onDelete={handleDelete}
          onClearFault={handleClearFault}
          onSetDelay={handleSetDelay}
        />
      ))}

      {swappers.length === 0 && (
        <div className="bg-white border border-border rounded-xl shadow-sm p-8 text-center text-xs text-slate-400">
          No phase swappers registered.
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {swapMsg && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 flex items-center gap-2">
          <CheckCircle size={14} /> {swapMsg}
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={() => setShowRegister(!showRegister)}
          className="flex items-center gap-1.5 text-xs font-bold bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
        >
          <Plus size={14} /> Register New Phase Swapper
        </button>
      </div>

      {showRegister && (
        <div className="bg-white border border-border rounded-xl shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Device Name / ID</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. SWA1B2C3D4E5"
                className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="text-[10px] text-slate-400 mt-1">Must match the device ID from hardware</p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Initial Phase</label>
              <select
                value={newPhase}
                onChange={e => setNewPhase(e.target.value as "R" | "Y" | "B" | "NONE")}
                className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="R">R-Phase</option>
                <option value="Y">Y-Phase</option>
                <option value="B">B-Phase</option>
                <option value="NONE">NONE (All OFF)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Load Type</label>
              <input
                value={newLoadType}
                onChange={e => setNewLoadType(e.target.value)}
                placeholder="e.g. Residential"
                className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowRegister(false)} className="text-xs font-bold text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer">Cancel</button>
            <button onClick={handleRegister} disabled={registering || !newName.trim()} className="text-xs font-bold bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer">
              {registering ? "Registering..." : "Register"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
