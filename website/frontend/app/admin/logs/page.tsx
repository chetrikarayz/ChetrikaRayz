"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { LogOut, LayoutDashboard, FileText, Download, Trash2, RefreshCw, ChevronLeft, ChevronRight, Columns, Menu, X, Shuffle, Cpu, Monitor } from "lucide-react";

interface LogEntry {
  timestamp: string;
  timestamp_display: string;
  [key: string]: string | number;
}

interface DeviceInfo {
  deviceId: string;
  hasData: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const ALL_FIELDS = [
  { key: "timestamp_display", label: "Timestamp" },
  { key: "v1(V)", label: "V1 (V)" },
  { key: "i1(A)", label: "I1 (A)" },
  { key: "p1(W)", label: "P1 (W)" },
  { key: "e1(kWh)", label: "E1 (kWh)" },
  { key: "f1(Hz)", label: "F1 (Hz)" },
  { key: "pf1", label: "PF1" },
  { key: "v2(V)", label: "V2 (V)" },
  { key: "i2(A)", label: "I2 (A)" },
  { key: "p2(W)", label: "P2 (W)" },
  { key: "e2(kWh)", label: "E2 (kWh)" },
  { key: "f2(Hz)", label: "F2 (Hz)" },
  { key: "pf2", label: "PF2" },
  { key: "v3(V)", label: "V3 (V)" },
  { key: "i3(A)", label: "I3 (A)" },
  { key: "p3(W)", label: "P3 (W)" },
  { key: "e3(kWh)", label: "E3 (kWh)" },
  { key: "f3(Hz)", label: "F3 (Hz)" },
  { key: "pf3", label: "PF3" },
  { key: "i_n(A)", label: "IN (A)" },
];

const PAGE_SIZE = 20;

export default function AdminLogs() {
  const router = useRouter();
  const [role, setRole] = useState<string>("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [deviceList, setDeviceList] = useState<DeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(ALL_FIELDS.map(f => f.key)));
  const [showColPicker, setShowColPicker] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const visibleFields = ALL_FIELDS.filter(f => visibleCols.has(f.key));

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

  useEffect(() => {
    fetchDeviceList();
  }, [fetchDeviceList]);

  const fetchLogs = useCallback(async () => {
    const token = localStorage.getItem("adminToken");
    if (!token) return;
    const params = new URLSearchParams({
      device_id: selectedDevice,
      page: String(page),
      pageSize: String(PAGE_SIZE)
    });
    if (fromDate) params.set("from", new Date(fromDate).toISOString());
    if (toDate) params.set("to", new Date(toDate).toISOString());

    const url = `${API_URL}/api/iot/logs?${params}`;
    console.log("[LOGS] fetching:", url);
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal
      });
      if (res.status === 401) {
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminRole");
        router.push("/admin/login");
        return;
      }
      if (res.ok) {
        const d = await res.json();
        setLogs(d.data || []);
        setTotal(d.total || 0);
        setTotalPages(d.totalPages || 0);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [router, selectedDevice, page, fromDate, toDate]);

  useEffect(() => {
    setPage(0);
  }, [selectedDevice, fromDate, toDate]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const toggleCol = (key: string) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleExport = async () => {
    const token = localStorage.getItem("adminToken");
    try {
      let url = `${API_URL}/api/iot/export-csv?device_id=${selectedDevice}`;
      if (fromDate) url += `&from=${encodeURIComponent(new Date(fromDate).toISOString())}`;
      if (toDate) url += `&to=${encodeURIComponent(new Date(toDate).toISOString())}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `device_${selectedDevice}_data.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("CSV export error:", err);
    }
  };

  const handleReset = async () => {
    if (!confirm("Are you sure you want to reset all data for this device? This cannot be undone.")) return;
    const token = localStorage.getItem("adminToken");
    try {
      const res = await fetch(`${API_URL}/api/iot/reset-csv`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: selectedDevice })
      });
      if (res.ok) {
        setLogs([]);
        setTotal(0);
        setTotalPages(0);
      }
    } catch (err) {
      console.error("Reset error:", err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminRole");
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex text-sm selection:bg-primary/20">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl shadow-slate-200/50 border-r border-border flex flex-col transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:z-auto lg:h-screen lg:sticky lg:top-0 shrink-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="h-20 flex items-center gap-2.5 px-6 border-b border-border bg-white z-10">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary">
            <path d="M12 2L4 7V17L12 22L20 17V7L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M12 6L8 9V15L12 18L16 15V9L12 6Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" opacity="0.6"/>
            <path d="M12 10L10.5 12L12 14L13.5 12L12 10Z" fill="currentColor" opacity="0.8"/>
          </svg>
          <span className="font-bold text-xl tracking-tight text-slate-900">CHETRIKA<span className="text-primary font-extrabold ml-1">RAYZ</span></span>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden ml-auto p-1 text-slate-400 hover:text-slate-900 transition-colors cursor-pointer">
            <X size={20} strokeWidth={2} />
          </button>
        </div>
        <div className="flex-1 px-4 py-6 space-y-2">
          <button onClick={() => { router.push("/admin/dashboard"); setSidebarOpen(false); }} className="w-full flex items-center gap-3 text-slate-500 hover:text-slate-900 hover:bg-slate-50 px-4 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer">
            <LayoutDashboard size={18} strokeWidth={2} /> System Dashboard
          </button>
          <button className="w-full flex items-center gap-3 bg-primary text-white hover:bg-primary/90 rounded-lg transition-all shadow-sm active:scale-95 px-4 py-2.5 text-sm font-bold cursor-pointer">
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
            <span className="text-slate-500 font-medium bg-slate-100 px-2 md:px-3 py-1.5 rounded-lg flex items-center gap-1">
              <RefreshCw size={14} strokeWidth={2} className="text-primary shrink-0" />
              {total} entries
            </span>
            <span className="px-2 md:px-3 py-1.5 border border-primary/20 bg-primary/5 text-primary rounded-lg font-bold text-xs md:text-sm whitespace-nowrap">
              {role === "superadmin" ? "SAdmin" : "Admin"}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {/* Device Selector Bar */}
          <div className="bg-white border border-border rounded-xl px-4 md:px-5 py-3 shadow-sm mb-4 md:mb-6 flex flex-wrap items-center gap-3">
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
            <h1 className="text-base md:text-lg font-bold text-slate-900 tracking-tight ml-auto">Event Logs</h1>
          </div>

          <div className="bg-white border text-sm border-border mb-4 md:mb-6 p-4 md:p-5 rounded-xl shadow-sm shadow-slate-200/50 flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-4 md:gap-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <label className="text-xs md:text-sm text-slate-500 font-bold shrink-0">From:</label>
                <input
                  type="datetime-local"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="text-xs md:text-sm bg-slate-50 border border-border px-2 md:px-3 py-2 rounded-lg text-slate-900 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all w-full sm:w-auto"
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <label className="text-xs md:text-sm text-slate-500 font-bold shrink-0">To:</label>
                <input
                  type="datetime-local"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="text-xs md:text-sm bg-slate-50 border border-border px-2 md:px-3 py-2 rounded-lg text-slate-900 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all w-full sm:w-auto"
                />
              </div>
            </div>
            {(fromDate || toDate) && (
              <button
                onClick={() => { setFromDate(""); setToDate(""); }}
                className="text-xs md:text-sm font-bold text-slate-500 underline hover:text-primary transition-colors cursor-pointer"
              >
                Clear Filters
              </button>
            )}
          </div>

          <div className="bg-white border border-border mb-4 md:mb-6 p-4 md:p-5 rounded-xl shadow-sm shadow-slate-200/50 flex items-center gap-3 md:gap-4 flex-wrap">
            <div className="relative">
              <button
                onClick={() => setShowColPicker(!showColPicker)}
                className="text-xs md:text-sm font-bold text-slate-700 bg-slate-50 border border-border rounded-lg px-3 md:px-4 py-2 hover:bg-slate-100 hover:text-primary transition-all cursor-pointer flex items-center gap-1.5 md:gap-2"
              >
                <Columns size={16} strokeWidth={2} /> <span className="hidden xs:inline">Toggle Columns</span>
              </button>
              {showColPicker && (
                <div className="absolute top-full left-0 mt-2 bg-white border border-border rounded-xl shadow-xl shadow-slate-200/50 z-20 p-4 w-56 md:w-64 max-h-72 md:max-h-96 overflow-y-auto">
                  <p className="text-sm font-bold text-slate-900 mb-3 pb-2 border-b border-border">Visible Columns</p>
                  <div className="space-y-1">
                    {ALL_FIELDS.map(f => (
                      <label key={f.key} className="flex items-center gap-3 py-1.5 cursor-pointer hover:bg-slate-50 px-2 rounded-lg transition-colors group">
                        <input
                          type="checkbox"
                          checked={visibleCols.has(f.key)}
                          onChange={() => toggleCol(f.key)}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/20 accent-primary group-hover:border-primary transition-colors"
                        />
                        <span className="text-xs md:text-sm font-medium text-slate-700 group-hover:text-slate-900 select-none">{f.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {role === "superadmin" && (
              <>
                <button onClick={handleExport} className="text-xs md:text-sm font-bold text-slate-700 bg-slate-50 border border-border rounded-lg px-3 md:px-4 py-2 hover:bg-slate-100 hover:text-primary transition-all cursor-pointer flex items-center gap-1.5 md:gap-2">
                  <Download size={16} strokeWidth={2} /> <span className="hidden xs:inline">Export CSV</span>
                </button>
                <div className="flex-1 min-w-0" />
                <button onClick={handleReset} className="text-xs md:text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 md:px-4 py-2 hover:bg-red-600 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 md:gap-2 shadow-sm">
                  <Trash2 size={16} strokeWidth={2} /> <span className="hidden xs:inline">Reset Data</span>
                </button>
              </>
            )}
          </div>

          {loading ? (
            <div className="bg-white border border-border p-8 md:p-16 rounded-xl text-center shadow-sm flex flex-col items-center gap-4">
              <RefreshCw className="animate-spin text-primary" size={28} />
              <p className="text-slate-500 font-medium text-sm">Fetching telemetry logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="bg-white border border-border p-8 md:p-16 rounded-xl text-center shadow-sm">
              <div className="w-12 h-12 md:w-16 md:h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
                <FileText size={20} className="text-slate-400" />
              </div>
              <p className="text-slate-900 font-bold text-base md:text-lg">No records found</p>
              <p className="text-slate-500 mt-1 text-xs md:text-sm">No log entries found for device {selectedDevice}. Try adjusting your filters.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto border border-border rounded-xl bg-white shadow-sm shadow-slate-200/50 -mx-4 md:mx-0">
                <table className="w-full text-xs md:text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-border">
                      {visibleFields.map((f) => (
                        <th key={f.key} className="text-left px-3 md:px-5 py-3 md:py-3.5 text-slate-500 font-bold tracking-tight whitespace-nowrap">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((entry, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        {visibleFields.map((f) => (
                          <td key={f.key} className="px-3 md:px-5 py-2.5 md:py-3 text-slate-700 font-mono text-[10px] md:text-xs whitespace-nowrap">
                            {(() => {
                              const val = entry[f.key];
                              return val !== undefined && val !== null
                                ? (typeof val === "number" ? val.toFixed(3) : val)
                                : "—";
                            })()}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-4 md:mt-6 gap-3 text-xs md:text-sm">
                <span className="text-slate-500 font-medium order-2 sm:order-1">
                  Page <strong className="text-slate-900">{page + 1}</strong> of <strong className="text-slate-900">{totalPages}</strong> <span className="opacity-50">|</span> {total} total entries
                </span>
                <div className="flex items-center gap-2 md:gap-3 order-1 sm:order-2 w-full sm:w-auto">
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="flex items-center gap-1 md:gap-2 px-3 md:px-4 py-2 border border-border rounded-lg text-slate-700 bg-white hover:bg-slate-50 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm font-bold cursor-pointer text-xs md:text-sm flex-1 sm:flex-none justify-center"
                  >
                    <ChevronLeft size={16} strokeWidth={2} /> Prev
                  </button>
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className="flex items-center gap-1 md:gap-2 px-3 md:px-4 py-2 border border-border rounded-lg text-slate-700 bg-white hover:bg-slate-50 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm font-bold cursor-pointer text-xs md:text-sm flex-1 sm:flex-none justify-center"
                  >
                    Next <ChevronRight size={16} strokeWidth={2} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
