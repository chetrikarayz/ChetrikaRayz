"use client";

import { useState, useEffect, useCallback } from "react";
import { Monitor, Radio, WifiOff, RotateCcw, Download, RefreshCw, Zap, Trash2, Clock, AlertTriangle, Cpu, ChevronDown, ChevronRight } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface Device {
  _id: string;
  deviceId: string;
  firmwareVersion: string;
  apiKey: string;
  lastSeen: string;
  rssi: number;
  freeHeap: number;
  uptime: number;
  wifiStatus: string;
  restartReason: string;
  bootCount: number;
  ipAddress: string;
  status: "online" | "offline" | "fault";
}

interface CommandResult {
  message: string;
  command: any;
}

export default function DeviceManager() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [offlineCount, setOfflineCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [commanding, setCommanding] = useState<string | null>(null);

  // Command form
  const [cmdDeviceId, setCmdDeviceId] = useState("");
  const [cmdType, setCmdType] = useState("restart");
  const [cmdParams, setCmdParams] = useState("{}");
  const [sendingCmd, setSendingCmd] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;

  const fetchDevices = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/iot/devices`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        setDevices(d.devices || []);
        setOnlineCount(d.onlineCount ?? 0);
        setOfflineCount(d.offlineCount ?? 0);
      }
    } catch {
      setError("Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 10000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  const sendCommand = async () => {
    if (!token || !cmdDeviceId.trim()) return;
    setSendingCmd(true);
    setError("");
    setSuccess("");

    try {
      const device = devices.find(d => d.deviceId === cmdDeviceId.trim());
      if (!device) {
        setError("Device not found. Enter a valid deviceId.");
        setSendingCmd(false);
        return;
      }

      let params = {};
      try { params = JSON.parse(cmdParams); } catch { params = {}; }

      const res = await fetch(`${API_URL}/api/iot/devices/${device.deviceId}/command`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          command: cmdType,
          device_id: cmdDeviceId.trim(),
          params
        })
      });

      if (res.ok) {
        const d = await res.json();
        setSuccess(`Command '${cmdType}' sent to ${cmdDeviceId.trim()}`);
      } else {
        const d = await res.json();
        setError(d.error || "Failed to send command");
      }
    } catch {
      setError("Network error sending command");
    } finally {
      setSendingCmd(false);
    }
  };

  const formatUptime = (s: number) => {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
  };

  const statusDot = (status: string) => {
    switch (status) {
      case "online": return <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />;
      case "offline": return <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />;
      case "fault": return <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />;
      default: return <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />;
    }
  };

  const rssiBars = (rssi: number) => {
    if (rssi >= -50) return <span className="text-green-600 font-bold">Excellent</span>;
    if (rssi >= -70) return <span className="text-green-500 font-medium">Good</span>;
    if (rssi >= -85) return <span className="text-amber-500 font-medium">Fair</span>;
    return <span className="text-red-500 font-medium">Poor</span>;
  };

  const commandIcon = (type: string) => {
    switch (type) {
      case "restart": return <RotateCcw size={14} />;
      case "ota": return <Download size={14} />;
      case "reset_energy": return <Zap size={14} />;
      case "clear_logs": return <Trash2 size={14} />;
      case "sync_time": return <Clock size={14} />;
      default: return <Cpu size={14} />;
    }
  };

  const toggleExpand = (deviceId: string) => {
    setExpandedDevice(expandedDevice === deviceId ? null : deviceId);
  };

  const displayOnline = onlineCount;
  const displayOffline = offlineCount;

  if (loading) {
    return (
      <div className="bg-white border border-border rounded-xl shadow-sm p-8 text-center">
        <p className="text-xs text-slate-400">Loading devices...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
            <Monitor size={14} className="text-primary" /> Total Devices
          </div>
          <p className="text-2xl font-bold text-slate-900">{devices.length}</p>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
            <Radio size={14} className="text-green-500" /> Online
          </div>
          <p className="text-2xl font-bold text-green-600">{displayOnline}</p>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
            <WifiOff size={14} className="text-slate-400" /> Offline
          </div>
          <p className="text-2xl font-bold text-slate-400">{displayOffline}</p>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
            <RefreshCw size={14} className="text-primary" /> Auto-refresh
          </div>
          <p className="text-2xl font-bold text-slate-900">10s</p>
        </div>
      </div>

      {/* Command Panel */}
      <div className="bg-white border border-border rounded-xl shadow-sm">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Cpu size={16} className="text-primary" />
          <h3 className="text-sm font-bold text-slate-900">Remote Command</h3>
        </div>
        <div className="p-4 md:p-5">
          {error && (
            <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 flex items-center gap-2">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          {success && (
            <div className="mb-3 p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 flex items-center gap-2">
              <RefreshCw size={14} /> {success}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Device ID</label>
              <input
                list="device-ids"
                value={cmdDeviceId}
                onChange={e => setCmdDeviceId(e.target.value)}
                placeholder="e.g. 0xABCDEF123456"
                className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-primary/20"
              />
              <datalist id="device-ids">
                {devices.map(d => (
                  <option key={d.deviceId} value={d.deviceId} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Command</label>
              <select
                value={cmdType}
                onChange={e => setCmdType(e.target.value)}
                className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="restart">Restart</option>
                <option value="ota">OTA Check</option>
                <option value="reset_energy">Reset Energy</option>
                <option value="sync_time">Sync Time</option>
                <option value="clear_logs">Clear Logs</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                {cmdType === "ota" ? "Version / Channel (JSON)" : "Params (JSON)"}
              </label>
              <input
                value={cmdParams}
                onChange={e => setCmdParams(e.target.value)}
                placeholder={cmdType === "ota" ? '{"channel":"stable"}' : '{"key": "value"}'}
                className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={sendCommand}
                disabled={sendingCmd || !cmdDeviceId.trim()}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-bold bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {sendingCmd ? <><RefreshCw size={14} className="animate-spin" /> Sending...</> : <><Cpu size={14} /> Send Command</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Device Table */}
      <div className="bg-white border border-border rounded-xl shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Monitor size={16} className="text-primary" />
            <h3 className="text-sm font-bold text-slate-900">Device Fleet</h3>
            <span className="text-xs text-slate-400 font-medium bg-slate-100 px-2 py-0.5 rounded-full">{devices.length} devices</span>
          </div>
          <button
            onClick={fetchDevices}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-50 border border-border px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {devices.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No devices registered. Devices auto-register when they send their first heartbeat or data.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Device ID</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">FW Version</th>
                  <th className="text-left px-4 py-3">Signal</th>
                  <th className="text-left px-4 py-3">Uptime</th>
                  <th className="text-left px-4 py-3">Last Seen</th>
                  <th className="text-center px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {devices.map(d => (
                  <tr key={d._id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-bold text-slate-900 font-mono text-[11px]">{d.deviceId}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        {statusDot(d.status)}
                        <span className={`font-bold capitalize ${
                          d.status === "online" ? "text-green-600" :
                          d.status === "fault" ? "text-red-600" :
                          "text-slate-400"
                        }`}>{d.status}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">v{d.firmwareVersion}</td>
                    <td className="px-4 py-3 text-slate-600">{rssiBars(d.rssi)}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{formatUptime(d.uptime)}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {d.lastSeen ? new Date(d.lastSeen).toLocaleString() : "Never"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleExpand(d.deviceId)}
                        className="inline-flex items-center gap-1 text-primary hover:bg-primary/5 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                      >
                        {expandedDevice === d.deviceId ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Expanded device details */}
        {expandedDevice && (
          <div className="border-t border-border bg-slate-50/50">
            {(() => {
              const d = devices.find(dev => dev.deviceId === expandedDevice);
              if (!d) return null;
              return (
                <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2">Hardware</h4>
                    <div className="flex justify-between py-1.5 px-2 bg-white rounded-lg border border-border">
                      <span className="text-slate-500">Free Heap</span>
                      <span className="font-mono font-bold text-slate-900">{(d.freeHeap / 1024).toFixed(1)} KB</span>
                    </div>
                    <div className="flex justify-between py-1.5 px-2 bg-white rounded-lg border border-border">
                      <span className="text-slate-500">Boot Count</span>
                      <span className="font-mono font-bold text-slate-900">{d.bootCount}</span>
                    </div>
                    <div className="flex justify-between py-1.5 px-2 bg-white rounded-lg border border-border">
                      <span className="text-slate-500">IP Address</span>
                      <span className="font-mono font-bold text-slate-900">{d.ipAddress || "—"}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2">Network</h4>
                    <div className="flex justify-between py-1.5 px-2 bg-white rounded-lg border border-border">
                      <span className="text-slate-500">RSSI</span>
                      <span className="font-mono font-bold text-slate-900">{d.rssi} dBm</span>
                    </div>
                    <div className="flex justify-between py-1.5 px-2 bg-white rounded-lg border border-border">
                      <span className="text-slate-500">Network</span>
                      <span className="font-mono font-bold text-slate-900">{d.wifiStatus || "cellular"}</span>
                    </div>
                    <div className="flex justify-between py-1.5 px-2 bg-white rounded-lg border border-border">
                      <span className="text-slate-500">Restart Reason</span>
                      <span className="font-mono font-bold text-slate-900">{d.restartReason}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2">Actions</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => { setCmdDeviceId(d.deviceId); setCmdType("restart"); }}
                        className="flex items-center justify-center gap-1.5 text-xs font-bold bg-slate-800 text-white px-3 py-2 rounded-lg hover:bg-slate-700 transition-colors cursor-pointer"
                      >
                        <RotateCcw size={12} /> Restart
                      </button>
                      <button
                        onClick={() => { setCmdDeviceId(d.deviceId); setCmdType("ota"); }}
                        className="flex items-center justify-center gap-1.5 text-xs font-bold bg-amber-500 text-white px-3 py-2 rounded-lg hover:bg-amber-600 transition-colors cursor-pointer"
                      >
                        <Download size={12} /> OTA
                      </button>
                      <button
                        onClick={() => { setCmdDeviceId(d.deviceId); setCmdType("reset_energy"); }}
                        className="flex items-center justify-center gap-1.5 text-xs font-bold bg-purple-500 text-white px-3 py-2 rounded-lg hover:bg-purple-600 transition-colors cursor-pointer"
                      >
                        <Zap size={12} /> Energy
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
