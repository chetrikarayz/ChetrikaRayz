"use client";

import { useState, useEffect, useCallback } from "react";
import { Upload, Package, History, RefreshCw, CheckCircle, XCircle, AlertTriangle, Cpu } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface FirmwareEntry {
  version: string;
  channel: string;
  filename: string;
  size: number;
  sha256: string;
  isLatest: boolean;
  changelog: string;
  minDeviceVersion: string;
  createdAt: string;
  createdBy: string;
}

interface OTAEvent {
  deviceId: string;
  fromVersion: string;
  toVersion: string;
  status: "success" | "failed" | "in_progress";
  detail: string;
  timestamp: string;
}

export default function FirmwareManager() {
  const [firmwares, setFirmwares] = useState<FirmwareEntry[]>([]);
  const [otaEvents, setOtaEvents] = useState<OTAEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Upload form
  const [fwVersion, setFwVersion] = useState("");
  const [fwChannel, setFwChannel] = useState("stable");
  const [fwChangelog, setFwChangelog] = useState("");
  const [fwMinVersion, setFwMinVersion] = useState("0.0.0");
  const [fwFile, setFwFile] = useState<File | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;

  const fetchFirmwares = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/iot/firmware/versions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        setFirmwares(d.firmwares || []);
      }
    } catch {
      setError("Failed to load firmware list");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchOTAEvents = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/iot/firmware/ota-events?limit=30`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        setOtaEvents(d.events || []);
      }
    } catch {} finally {
      setEventsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchFirmwares();
    fetchOTAEvents();
  }, [fetchFirmwares, fetchOTAEvents]);

  const handleUpload = async () => {
    if (!token || !fwFile || !fwVersion.trim()) return;
    setUploading(true);
    setError("");

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(",")[1];
        const res = await fetch(`${API_URL}/api/iot/firmware/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            version: fwVersion.trim(),
            channel: fwChannel,
            binary_base64: base64,
            changelog: fwChangelog.trim(),
            minDeviceVersion: fwMinVersion.trim()
          })
        });
        if (res.ok) {
          setShowUpload(false);
          setFwVersion("");
          setFwChannel("stable");
          setFwChangelog("");
          setFwMinVersion("0.0.0");
          setFwFile(null);
          fetchFirmwares();
        } else {
          const d = await res.json();
          setError(d.error || "Upload failed");
        }
        setUploading(false);
      };
      reader.readAsDataURL(fwFile);
    } catch {
      setError("Upload failed");
      setUploading(false);
    }
  };

  const handleDelete = async (version: string) => {
    if (!token || !confirm(`Delete firmware v${version}?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/iot/firmware/${version}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchFirmwares();
      else {
        const d = await res.json();
        setError(d.error || "Delete failed");
      }
    } catch {
      setError("Delete failed");
    }
  };

  const formatBytes = (b: number) => (b / 1024).toFixed(1) + " KB";

  const statusIcon = (s: string) => {
    switch (s) {
      case "success": return <CheckCircle size={14} className="text-green-500" />;
      case "failed": return <XCircle size={14} className="text-red-500" />;
      case "in_progress": return <RefreshCw size={14} className="text-amber-500 animate-spin" />;
      default: return <AlertTriangle size={14} className="text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Firmware Versions */}
      <div className="bg-white border border-border rounded-xl shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-primary" />
            <h3 className="text-sm font-bold text-slate-900">Firmware Versions</h3>
            <span className="text-xs text-slate-400 font-medium bg-slate-100 px-2 py-0.5 rounded-full">{firmwares.length} versions</span>
          </div>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="flex items-center gap-1.5 text-xs font-bold bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
          >
            <Upload size={14} /> Upload New
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">{error}</div>
        )}

        {showUpload && (
          <div className="mx-5 my-3 p-4 bg-slate-50 border border-border rounded-lg space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Version (semver)</label>
                <input
                  value={fwVersion}
                  onChange={e => setFwVersion(e.target.value)}
                  placeholder="e.g. 2.1.0"
                  className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Channel</label>
                <select
                  value={fwChannel}
                  onChange={e => setFwChannel(e.target.value)}
                  className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="stable">Stable</option>
                  <option value="beta">Beta</option>
                  <option value="rc">Release Candidate</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Min Device Version</label>
                <input
                  value={fwMinVersion}
                  onChange={e => setFwMinVersion(e.target.value)}
                  placeholder="0.0.0"
                  className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Firmware Binary (.bin)</label>
                <input
                  type="file"
                  accept=".bin"
                  onChange={e => setFwFile(e.target.files?.[0] || null)}
                  className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-primary/20 file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-xs file:bg-primary/10 file:text-primary"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Changelog</label>
              <textarea
                value={fwChangelog}
                onChange={e => setFwChangelog(e.target.value)}
                placeholder="What's new in this release?"
                rows={2}
                className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowUpload(false)}
                className="text-xs font-bold text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || !fwVersion.trim() || !fwFile}
                className="flex items-center gap-1.5 text-xs font-bold bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {uploading ? <><RefreshCw size={14} className="animate-spin" /> Uploading...</> : <><Upload size={14} /> Upload</>}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading firmware versions...</div>
        ) : firmwares.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No firmware versions uploaded. Click "Upload New" to add one.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Version</th>
                  <th className="text-left px-4 py-3">Channel</th>
                  <th className="text-left px-4 py-3">Size</th>
                  <th className="text-left px-4 py-3">SHA256</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Changelog</th>
                  <th className="text-left px-4 py-3">Uploaded</th>
                  <th className="text-right px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {firmwares.map(fw => (
                  <tr key={fw.version} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-bold text-slate-900 font-mono">v{fw.version}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                        fw.channel === "stable" ? "bg-green-50 text-green-700" :
                        fw.channel === "beta" ? "bg-amber-50 text-amber-700" :
                        "bg-blue-50 text-blue-700"
                      }`}>
                        {fw.channel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono">{formatBytes(fw.size)}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-[10px] max-w-[120px] truncate" title={fw.sha256}>{fw.sha256.substring(0, 16)}...</td>
                    <td className="px-4 py-3">
                      {fw.isLatest ? (
                        <span className="inline-flex items-center gap-1 text-green-600 font-bold">
                          <CheckCircle size={12} /> Latest
                        </span>
                      ) : (
                        <span className="text-slate-400">Archived</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 max-w-[180px] truncate">{fw.changelog || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(fw.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleDelete(fw.version)}
                        className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors cursor-pointer"
                        title="Delete"
                      >
                        <XCircle size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* OTA Event History */}
      <div className="bg-white border border-border rounded-xl shadow-sm">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <History size={16} className="text-primary" />
          <h3 className="text-sm font-bold text-slate-900">OTA Update History</h3>
          <span className="text-xs text-slate-400 font-medium bg-slate-100 px-2 py-0.5 rounded-full">{otaEvents.length} events</span>
          <button onClick={fetchOTAEvents} className="ml-auto text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
            <RefreshCw size={14} />
          </button>
        </div>

        {eventsLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading OTA events...</div>
        ) : otaEvents.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No OTA update events recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Device ID</th>
                  <th className="text-left px-4 py-3">From</th>
                  <th className="text-left px-4 py-3">To</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Detail</th>
                  <th className="text-left px-4 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {otaEvents.map((ev, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-slate-900 font-medium">{ev.deviceId.substring(0, 12)}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">v{ev.fromVersion}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{ev.toVersion ? `v${ev.toVersion}` : "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1">
                        {statusIcon(ev.status)}
                        <span className="capitalize">{ev.status === "in_progress" ? "In Progress" : ev.status}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate">{ev.detail || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(ev.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
