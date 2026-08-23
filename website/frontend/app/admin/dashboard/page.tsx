"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { LogOut, LayoutDashboard, FileText, RefreshCw, Radio, Menu, X, Zap, ChevronLeft, ChevronRight, ShieldAlert, Shuffle, Cpu, Monitor } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface PhaseData {
  voltage: number;
  current: number;
  power: number;
  energy: number;
  frequency: number;
  pf: number;
}

interface LatestData {
  timestamp: string;
  phases: { R: PhaseData; Y: PhaseData; B: PhaseData };
  neutralCurrent: number;
}

interface HistoryEntry {
  time: string;
  R_current: number; Y_current: number; B_current: number;
  R_voltage: number; Y_voltage: number; B_voltage: number;
  R_power: number; Y_power: number; B_power: number;
  R_energy: number; Y_energy: number; B_energy: number;
  R_freq: number; Y_freq: number; B_freq: number;
  R_pf: number; Y_pf: number; B_pf: number;
  neutral: number;
}

interface DeviceInfo {
  deviceId: string;
  hasData: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const WINDOW_MS = 3 * 60 * 60 * 1000;
const STEP_MS = 60 * 60 * 1000;

function PhaseCard({ label, data, color, icon }: { label: string; data: PhaseData; color: string; icon: string }) {
  const params = [
    { key: "Voltage", value: `${data.voltage.toFixed(1)} V` },
    { key: "Current", value: `${data.current.toFixed(3)} A` },
    { key: "Power", value: `${(data.power / 1000).toFixed(2)} kW` },
    { key: "Energy", value: `${data.energy.toFixed(4)} kWh` },
    { key: "Freq", value: `${data.frequency.toFixed(2)} Hz` },
    { key: "PF", value: data.pf.toFixed(3) },
  ];

  return (
    <div className="bg-white border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow animate-fade-in">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border">
        <div className="w-8 h-8 flex items-center justify-center text-xs font-bold rounded-md" style={{ backgroundColor: color, color: '#fff' }}>{icon}</div>
        <span className="font-bold text-sm text-slate-900">{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {params.map((p) => (
          <div key={p.key} className="flex justify-between items-center bg-slate-50 px-2 py-1.5 rounded-md">
            <span className="text-xs text-slate-500 font-medium">{p.key}</span>
            <span className="text-xs font-bold text-slate-900 font-mono">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NeutralCard({ current }: { current: number }) {
  return (
    <div className="bg-white border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow animate-fade-in flex flex-col">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border">
        <div className="w-8 h-8 flex items-center justify-center text-xs font-bold bg-slate-700 text-white rounded-md">N</div>
        <span className="font-bold text-sm text-slate-900">Neutral Current</span>
      </div>
      <div className="flex items-baseline justify-center gap-2 py-4 flex-1">
        <span className="text-5xl font-bold font-mono tracking-tight text-slate-900">{current.toFixed(3)}</span>
        <span className="text-sm font-medium text-slate-500">A</span>
      </div>
      <div className="text-center text-xs font-medium px-3 py-1.5 rounded-md bg-slate-50 text-slate-600">
        {(current < 0.5) ? "Loads are well balanced" :
         (current < 1.5) ? "Moderate imbalance detected" :
         "Significant imbalance — check distribution"}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const [latest, setLatest] = useState<LatestData | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [role, setRole] = useState<string>("");
  const [connected, setConnected] = useState(false);
  const [hasTried, setHasTried] = useState(false);
  const [ago, setAgo] = useState("--");
  const [deviceList, setDeviceList] = useState<DeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [mockMode, setMockMode] = useState(false);
  const [espConnected, setEspConnected] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [dangerDialog, setDangerDialog] = useState<{ action: "mock" | "reset"; visible: boolean }>({ action: "mock", visible: false });
  const [dangerPassword, setDangerPassword] = useState("");
  const [dangerError, setDangerError] = useState("");
  const [dangerVerifying, setDangerVerifying] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const [windowEnd, setWindowEnd] = useState(() => new Date());
  const [windowStart, setWindowStart] = useState(() => new Date(Date.now() - WINDOW_MS));
  const lastFetchRef = useRef(0);
  const latestAbortRef = useRef<AbortController | null>(null);
  const espAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("adminToken");
    const r = localStorage.getItem("adminRole") || "admin";
    if (!token) { router.push("/admin/login"); return; }
    setRole(r);
  }, [router]);

  const fetchDeviceList = useCallback(async () => {
    const token = localStorage.getItem("adminToken");
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/iot/active-devices`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        const raw = d.devices || d.activeDevices || [];
        const devices = raw.map((item: any) => typeof item === 'string' ? { deviceId: item, hasData: true } : item);
        setDeviceList(devices);
        if (devices.length > 0 && !selectedDevice) setSelectedDevice(devices[0].deviceId);
      }
    } catch {}
  }, [selectedDevice]);

  const fetchESPStatus = useCallback(async (subId: string) => {
    const token = localStorage.getItem("adminToken");
    if (!token) return;
    if (espAbortRef.current) espAbortRef.current.abort();
    const controller = new AbortController();
    espAbortRef.current = controller;
    try {
      const res = await fetch(`${API_URL}/api/iot/esp-status?device_id=${subId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal
      });
      if (res.ok) {
        const d = await res.json();
        setEspConnected(d.connected);
        setMockMode(d.mockMode);
      }
    } catch {}
  }, []);

  const fetchLatest = useCallback(async () => {
    const token = localStorage.getItem("adminToken");
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const deviceId = selectedDevice;

    if (latestAbortRef.current) latestAbortRef.current.abort();
    const controller = new AbortController();
    latestAbortRef.current = controller;
    try {
      const res = await fetch(`${API_URL}/api/iot/latest?device_id=${deviceId}`, { headers, signal: controller.signal });
      if (res.status === 401) {
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminRole");
        router.push("/admin/login");
        return;
      }
      setHasTried(true);
      if (res.ok) {
        const d = await res.json();
        if (d.phases) {
          setLatest(d as LatestData);
          setConnected(true);
        } else {
          setLatest(null);
          setConnected(true);
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setConnected(false);
      setHasTried(true);
    }
  }, [router, selectedDevice]);

  const fetchHistory = useCallback(async (start: Date, end: Date) => {
    const token = localStorage.getItem("adminToken");
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const deviceId = selectedDevice;

    try {
      const res = await fetch(
        `${API_URL}/api/iot/history?device_id=${deviceId}&from=${start.toISOString()}&to=${end.toISOString()}`,
        { headers }
      );
      if (res.ok) {
        const h = await res.json();
        if (h.data && h.data.length > 0) setHistory(h.data);
        else setHistory([]);
      }
    } catch {}
  }, [selectedDevice]);

  const goBack = useCallback(() => {
    const newEnd = new Date(windowEnd.getTime() - STEP_MS);
    const newStart = new Date(windowStart.getTime() - STEP_MS);
    setWindowEnd(newEnd);
    setWindowStart(newStart);
    setIsLive(false);
    fetchHistory(newStart, newEnd);
  }, [windowEnd, windowStart, fetchHistory]);

  const goForward = useCallback(() => {
    const newEnd = new Date(windowEnd.getTime() + STEP_MS);
    const newStart = new Date(windowStart.getTime() + STEP_MS);
    const now = new Date();
    if (newEnd >= now) {
      setWindowEnd(now);
      setWindowStart(new Date(now.getTime() - WINDOW_MS));
      setIsLive(true);
    } else {
      setWindowEnd(newEnd);
      setWindowStart(newStart);
      setIsLive(false);
    }
    fetchHistory(newStart, newEnd >= now ? now : newEnd);
  }, [windowEnd, windowStart, fetchHistory]);

  const goLive = useCallback(() => {
    const now = new Date();
    setWindowEnd(now);
    setWindowStart(new Date(now.getTime() - WINDOW_MS));
    setIsLive(true);
    fetchHistory(new Date(now.getTime() - WINDOW_MS), now);
  }, [fetchHistory]);

  useEffect(() => {
    fetchDeviceList();
    if (selectedDevice) fetchESPStatus(selectedDevice);
  }, [fetchDeviceList, fetchESPStatus, selectedDevice]);

  useEffect(() => {
    setLatest(null);
    setHistory([]);
    fetchLatest();
    const latestInterval = setInterval(fetchLatest, 1500);
    return () => clearInterval(latestInterval);
  }, [fetchLatest]);

  useEffect(() => {
    const now = new Date();
    if (isLive) {
      setWindowEnd(now);
      setWindowStart(new Date(now.getTime() - WINDOW_MS));
      fetchHistory(new Date(now.getTime() - WINDOW_MS), now);
      const interval = setInterval(() => {
        const n = new Date();
        setWindowEnd(n);
        setWindowStart(new Date(n.getTime() - WINDOW_MS));
        fetchHistory(new Date(n.getTime() - WINDOW_MS), n);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isLive, fetchHistory]);

  useEffect(() => {
    if (selectedDevice) {
      const espInterval = setInterval(() => fetchESPStatus(selectedDevice), 10000);
      return () => clearInterval(espInterval);
    }
  }, [fetchESPStatus, selectedDevice]);

  useEffect(() => {
    const tick = setInterval(() => {
      const t = lastFetchRef.current;
      if (!t) { setAgo("--"); return; }
      const secs = Math.floor((Date.now() - t) / 1000);
      setAgo(secs < 5 ? "just now" : secs < 60 ? `${secs}s ago` : `${Math.floor(secs / 60)}m ago`);
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const handleExportCSV = async () => {
    const token = localStorage.getItem("adminToken");
    try {
      const res = await fetch(`${API_URL}/api/iot/export-csv?device_id=${selectedDevice}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `device_${selectedDevice}_data.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("CSV export error:", err);
    }
  };

  const verifyDangerPassword = async (password: string): Promise<boolean> => {
    const token = localStorage.getItem("adminToken");
    setDangerVerifying(true);
    setDangerError("");
    try {
      const res = await fetch(`${API_URL}/api/auth/verify-danger`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (res.ok && data.verified) return true;
      setDangerError(data.error || "Verification failed");
      return false;
    } catch {
      setDangerError("Network error");
      return false;
    } finally {
      setDangerVerifying(false);
    }
  };

  const executeMockToggle = async () => {
    const token = localStorage.getItem("adminToken");
    try {
      const res = await fetch(`${API_URL}/api/iot/mock-toggle`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: selectedDevice, enable: !mockMode })
      });
      if (res.ok) {
        const d = await res.json();
        setMockMode(d.mockMode);
      }
    } catch (err) {
      console.error("Mock toggle error:", err);
    }
  };

  const executeResetEnergy = async () => {
    const token = localStorage.getItem("adminToken");
    setResetting(true);
    try {
      await fetch(`${API_URL}/api/iot/reset-energy`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: selectedDevice })
      });
      setTimeout(() => setResetting(false), 2000);
    } catch {
      setResetting(false);
    }
  };

  const openDangerDialog = (action: "mock" | "reset") => {
    setDangerPassword("");
    setDangerError("");
    setDangerDialog({ action, visible: true });
  };

  const handleDangerConfirm = async () => {
    const ok = await verifyDangerPassword(dangerPassword);
    if (!ok) return;
    setDangerDialog({ ...dangerDialog, visible: false });
    if (dangerDialog.action === "mock") executeMockToggle();
    else executeResetEnergy();
  };

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminRole");
    router.push("/");
  };

  const currentHistory = history.map((h) => ({
    time: h.time,
    "R-Phase": h.R_current,
    "Y-Phase": h.Y_current,
    "B-Phase": h.B_current,
  }));

  const voltageHistory = history.map((h) => ({
    time: h.time,
    "R-Phase": h.R_voltage,
    "Y-Phase": h.Y_voltage,
    "B-Phase": h.B_voltage,
  }));

  const powerHistory = history.map((h) => ({
    time: h.time,
    "R-Phase": h.R_power / 1000,
    "Y-Phase": h.Y_power / 1000,
    "B-Phase": h.B_power / 1000,
  }));

  const freqHistory = history.map((h) => ({
    time: h.time,
    "R-Phase": h.R_freq,
    "Y-Phase": h.Y_freq,
    "B-Phase": h.B_freq,
  }));

  const pfHistory = history.map((h) => ({
    time: h.time,
    "R-Phase": h.R_pf,
    "Y-Phase": h.Y_pf,
    "B-Phase": h.B_pf,
  }));

  const energyHistory = history.map((h) => ({
    time: h.time,
    "R-Phase": h.R_energy,
    "Y-Phase": h.Y_energy,
    "B-Phase": h.B_energy,
  }));

  function fmt(d: Date): string {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function formatChartTime(time: string): string {
    if (time.includes("T") || time.includes("-")) {
      const d = new Date(time);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    return time.substring(0, 5);
  }

  if (!hasTried) {
    return (
          <div className="min-h-screen bg-[#f8fafc] flex justify-center items-center flex-col gap-4">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary animate-pulse-soft">
          <path d="M12 2L4 7V17L12 22L20 17V7L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M12 6L8 9V15L12 18L16 15V9L12 6Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" opacity="0.6"/>
          <path d="M12 10L10.5 12L12 14L13.5 12L12 10Z" fill="currentColor" opacity="0.8"/>
        </svg>
        <div className="text-sm text-slate-500 font-medium">Establishing telemetry connection...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex text-sm selection:bg-primary/20">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-border flex flex-col transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:z-auto lg:h-screen lg:sticky lg:top-0 shrink-0 shadow-lg shadow-slate-200/50 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="h-20 flex items-center gap-2.5 px-6 border-b border-border">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary">
              <path d="M12 2L4 7V17L12 22L20 17V7L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M12 6L8 9V15L12 18L16 15V9L12 6Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" opacity="0.6"/>
              <path d="M12 10L10.5 12L12 14L13.5 12L12 10Z" fill="currentColor" opacity="0.8"/>
            </svg>
          <span className="font-bold tracking-tight text-lg text-slate-900">CHETRIKA<span className="font-extrabold text-primary ml-0.5">RAYZ</span></span>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden ml-auto p-1 text-slate-400 hover:text-slate-900 transition-colors cursor-pointer">
            <X size={20} strokeWidth={2} />
          </button>
        </div>
        <div className="flex-1 px-4 py-6 space-y-2">
          <button className="w-full flex items-center gap-3 bg-primary text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-md shadow-primary/20 transition-all hover:bg-primary/90 active:scale-95 cursor-pointer">
              <LayoutDashboard size={18} strokeWidth={2} /> System Dashboard
          </button>
          <button onClick={() => { router.push("/admin/logs"); setSidebarOpen(false); }} className="w-full flex items-center gap-3 text-slate-500 hover:text-slate-900 hover:bg-slate-50 px-4 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer">
            <FileText size={18} strokeWidth={2} /> Telemetry Logs
          </button>
          <button onClick={() => { router.push("/admin/phase-swappers"); setSidebarOpen(false); }} className="w-full flex items-center gap-3 text-slate-500 hover:text-slate-900 hover:bg-slate-50 px-4 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer">
            <Shuffle size={18} strokeWidth={2} /> Phase Swappers
          </button>
          <button onClick={() => { router.push("/admin/devices"); setSidebarOpen(false); }} className="w-full flex items-center gap-3 text-slate-500 hover:text-slate-900 hover:bg-slate-50 px-4 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer">
            <Monitor size={18} strokeWidth={2} /> Devices
          </button>
          <button onClick={() => { router.push("/admin/firmware"); setSidebarOpen(false); }} className="w-full flex items-center gap-3 text-slate-500 hover:text-slate-900 hover:bg-slate-50 px-4 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer">
            <Cpu size={18} strokeWidth={2} /> Firmware
          </button>
        </div>
        {role === "superadmin" && (
          <div className="px-4 py-4 border-t border-border space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">Admin Actions</p>
            <button onClick={() => openDangerDialog("mock")} className={`w-full flex items-center gap-3 text-xs font-bold px-4 py-2.5 rounded-lg transition-all cursor-pointer ${mockMode ? 'bg-amber-500 text-white' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}>
              <RefreshCw size={14} strokeWidth={2} className={mockMode ? 'animate-spin-slow' : ''} />
              {mockMode ? 'Mock ON' : 'Mock OFF'}
            </button>
            <button onClick={handleExportCSV} className="w-full flex items-center gap-3 text-xs font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-50 px-4 py-2.5 rounded-lg transition-all cursor-pointer">
              <FileText size={14} strokeWidth={2} /> Export CSV
            </button>
            <button onClick={() => openDangerDialog("reset")} disabled={resetting} className={`w-full flex items-center gap-3 text-xs font-bold px-4 py-2.5 rounded-lg transition-all cursor-pointer disabled:opacity-50 ${resetting ? 'bg-green-500 text-white' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}>
              <Zap size={14} strokeWidth={2} />
              {resetting ? "Reset Sent" : "Reset Energy"}
            </button>
          </div>
        )}
        <div className="p-4 border-t border-border bg-slate-50/50">
          <button onClick={handleLogout} className="flex items-center gap-3 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg px-4 py-2.5 w-full text-left text-sm font-bold transition-colors cursor-pointer">
            <LogOut size={18} strokeWidth={2} /> Terminate Session
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-slate-50">
        <header className="min-h-16 bg-white border-b border-border flex items-center justify-between px-4 md:px-8 shrink-0 z-10 sticky top-0 shadow-sm shadow-slate-200/50 gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-shrink">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all cursor-pointer">
              <Menu size={20} strokeWidth={2} />
            </button>
            <span className="text-sm md:text-base font-bold text-slate-900 tracking-tight truncate">Energy Monitoring System</span>
          </div>
          <div className="flex items-center gap-1.5 md:gap-3 text-xs md:text-sm flex-shrink-0">
            <span className="px-2 md:px-3 py-1.5 border border-primary/20 bg-primary/5 text-primary rounded-lg font-bold text-xs md:text-sm whitespace-nowrap">
              {role === "superadmin" ? "SAdmin" : "Admin"}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6">
          {/* Device Selector Bar */}
          <div className="bg-white border border-border rounded-xl px-4 md:px-5 py-3 shadow-sm flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Device</span>
              <select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                className="text-xs md:text-sm font-bold bg-slate-50 border border-border px-2 md:px-3 py-1.5 rounded-lg text-slate-900 cursor-pointer outline-none hover:bg-slate-100 transition-colors focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
              >
                {deviceList.map((s) => (
                  <option key={s.deviceId} value={s.deviceId}>{s.deviceId}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3 text-xs flex-wrap">
              <span className={`inline-flex items-center gap-1.5 font-medium ${espConnected ? 'text-green-600' : 'text-red-500'}`}>
                <Radio size={12} strokeWidth={2} />
                {espConnected ? 'Connected' : 'Disconnected'}
              </span>
              <span className={`inline-flex items-center gap-1.5 font-medium ${connected ? 'text-green-600' : 'text-red-500'}`}>
                <span className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                {connected ? 'Live' : 'Error'}
              </span>
              {connected && <span className="text-slate-400 font-medium">{ago}</span>}
            </div>
          </div>

          {!latest ? (
            <div className="bg-white border border-border p-6 md:p-10 text-center rounded-xl">
              <p className="text-slate-500 text-sm">Waiting for sensor data from device {selectedDevice}...</p>
              <p className="text-xs text-slate-500 mt-2">Ensure the device or mock data generator is running.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <PhaseCard label="R-Phase" data={latest.phases.R} color="#dc2626" icon="R" />
                <PhaseCard label="Y-Phase" data={latest.phases.Y} color="#d97706" icon="Y" />
                <PhaseCard label="B-Phase" data={latest.phases.B} color="#2563eb" icon="B" />
                <NeutralCard current={latest.neutralCurrent} />
              </div>

              {history.length > 1 && (
                <>
                  <div className="flex items-center justify-between bg-white border border-border rounded-xl px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <button onClick={goBack} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer">
                        <ChevronLeft size={18} strokeWidth={2} />
                      </button>
                      <span className="text-sm font-bold text-slate-900 min-w-[140px] text-center">
                        {fmt(windowStart)} — {fmt(windowEnd)}
                      </span>
                      <button onClick={goForward} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer">
                        <ChevronRight size={18} strokeWidth={2} />
                      </button>
                    </div>
                    {!isLive && (
                      <button onClick={goLive} className="text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer">
                        Back to Live
                      </button>
                    )}
                    {isLive && (
                      <span className="text-xs font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                        Live
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                    <ChartCard title="Phase Currents" subtitle="Amperage (A)">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={currentHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis dataKey="time" stroke="#64748b" tickLine={false} axisLine={false} tickFormatter={formatChartTime} />
                          <YAxis stroke="#64748b" tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 0, fontSize: 12 }} labelFormatter={(l) => formatChartTime(l)} />
                          <Area type="monotone" dataKey="R-Phase" stroke="#dc2626" fill="#dc2626" fillOpacity={0.06} strokeWidth={1.5} dot={false} />
                          <Area type="monotone" dataKey="Y-Phase" stroke="#d97706" fill="#d97706" fillOpacity={0.06} strokeWidth={1.5} dot={false} />
                          <Area type="monotone" dataKey="B-Phase" stroke="#2563eb" fill="#2563eb" fillOpacity={0.06} strokeWidth={1.5} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="Phase Voltages" subtitle="Voltage (V)">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={voltageHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis dataKey="time" stroke="#64748b" tickLine={false} axisLine={false} tickFormatter={formatChartTime} />
                          <YAxis stroke="#64748b" tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 0, fontSize: 12 }} labelFormatter={(l) => formatChartTime(l)} />
                          <Area type="monotone" dataKey="R-Phase" stroke="#dc2626" fill="#dc2626" fillOpacity={0.06} strokeWidth={1.5} dot={false} />
                          <Area type="monotone" dataKey="Y-Phase" stroke="#d97706" fill="#d97706" fillOpacity={0.06} strokeWidth={1.5} dot={false} />
                          <Area type="monotone" dataKey="B-Phase" stroke="#2563eb" fill="#2563eb" fillOpacity={0.06} strokeWidth={1.5} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="Phase Power" subtitle="Real power (kW)">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={powerHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis dataKey="time" stroke="#64748b" tickLine={false} axisLine={false} tickFormatter={formatChartTime} />
                          <YAxis stroke="#64748b" tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 0, fontSize: 12 }} labelFormatter={(l) => formatChartTime(l)} />
                          <Area type="monotone" dataKey="R-Phase" stroke="#dc2626" fill="#dc2626" fillOpacity={0.06} strokeWidth={1.5} dot={false} />
                          <Area type="monotone" dataKey="Y-Phase" stroke="#d97706" fill="#d97706" fillOpacity={0.06} strokeWidth={1.5} dot={false} />
                          <Area type="monotone" dataKey="B-Phase" stroke="#2563eb" fill="#2563eb" fillOpacity={0.06} strokeWidth={1.5} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="Frequency" subtitle="Line frequency (Hz)">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={freqHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis dataKey="time" stroke="#64748b" tickLine={false} axisLine={false} tickFormatter={formatChartTime} />
                          <YAxis domain={[49, 51]} stroke="#64748b" tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 0, fontSize: 12 }} labelFormatter={(l) => formatChartTime(l)} />
                          <Area type="monotone" dataKey="R-Phase" stroke="#dc2626" fill="#dc2626" fillOpacity={0.06} strokeWidth={1.5} dot={false} />
                          <Area type="monotone" dataKey="Y-Phase" stroke="#d97706" fill="#d97706" fillOpacity={0.06} strokeWidth={1.5} dot={false} />
                          <Area type="monotone" dataKey="B-Phase" stroke="#2563eb" fill="#2563eb" fillOpacity={0.06} strokeWidth={1.5} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="Power Factor" subtitle="PF trend">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={pfHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis dataKey="time" stroke="#64748b" tickLine={false} axisLine={false} tickFormatter={formatChartTime} />
                          <YAxis domain={[0.5, 1]} stroke="#64748b" tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 0, fontSize: 12 }} labelFormatter={(l) => formatChartTime(l)} />
                          <Area type="monotone" dataKey="R-Phase" stroke="#dc2626" fill="#dc2626" fillOpacity={0.06} strokeWidth={1.5} dot={false} />
                          <Area type="monotone" dataKey="Y-Phase" stroke="#d97706" fill="#d97706" fillOpacity={0.06} strokeWidth={1.5} dot={false} />
                          <Area type="monotone" dataKey="B-Phase" stroke="#2563eb" fill="#2563eb" fillOpacity={0.06} strokeWidth={1.5} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="Energy" subtitle="Cumulative energy (kWh)">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={energyHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis dataKey="time" stroke="#64748b" tickLine={false} axisLine={false} tickFormatter={formatChartTime} />
                          <YAxis stroke="#64748b" tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 0, fontSize: 12 }} labelFormatter={(l) => formatChartTime(l)} />
                          <Area type="monotone" dataKey="R-Phase" stroke="#dc2626" fill="#dc2626" fillOpacity={0.06} strokeWidth={1.5} dot={false} />
                          <Area type="monotone" dataKey="Y-Phase" stroke="#d97706" fill="#d97706" fillOpacity={0.06} strokeWidth={1.5} dot={false} />
                          <Area type="monotone" dataKey="B-Phase" stroke="#2563eb" fill="#2563eb" fillOpacity={0.06} strokeWidth={1.5} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>

      {dangerDialog.visible && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => setDangerDialog({ ...dangerDialog, visible: false })}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-red-200">
              <div className="w-9 h-9 flex items-center justify-center rounded-full bg-red-100">
                <ShieldAlert size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Danger Zone</h3>
                <p className="text-xs text-slate-500">
                  {dangerDialog.action === "mock" ? "Toggle mock data generator" : "Reset energy counters"}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-4">Enter danger zone password to proceed.</p>
            <input
              type="password"
              autoFocus
              placeholder="Danger zone password"
              value={dangerPassword}
              onChange={(e) => { setDangerPassword(e.target.value); setDangerError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleDangerConfirm(); }}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 mb-3"
            />
            {dangerError && <p className="text-xs text-red-600 mb-3">{dangerError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setDangerDialog({ ...dangerDialog, visible: false })} className="text-xs font-bold text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                Cancel
              </button>
              <button onClick={handleDangerConfirm} disabled={dangerVerifying || !dangerPassword} className="text-xs font-bold bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer">
                {dangerVerifying ? "Verifying..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
      <div className="pb-3 mb-4 border-b border-border">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      <div className="h-48 md:h-64 text-xs font-mono">
        {children}
      </div>
    </div>
  );
}
