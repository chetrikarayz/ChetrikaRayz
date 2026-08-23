"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, LayoutDashboard, FileText, Shuffle, Menu, X, Cpu, Monitor } from "lucide-react";
import PhaseSwapperManager from "../../components/PhaseSwapperManager";

export default function PhaseSwappersPage() {
  const router = useRouter();
  const [role, setRole] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("adminToken");
    const r = localStorage.getItem("adminRole") || "admin";
    if (!token) { router.push("/admin/login"); return; }
    setRole(r);
    setVerified(true);
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminRole");
    router.push("/");
  };

  if (!verified) return null;

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
          <button onClick={() => { router.push("/admin/logs"); setSidebarOpen(false); }} className="w-full flex items-center gap-3 text-slate-500 hover:text-slate-900 hover:bg-slate-50 px-4 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer">
            <FileText size={18} strokeWidth={2} /> Telemetry Logs
          </button>
          <button className="w-full flex items-center gap-3 bg-primary text-white hover:bg-primary/90 rounded-lg transition-all shadow-sm active:scale-95 px-4 py-2.5 text-sm font-bold cursor-pointer">
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
        <header className="min-h-20 bg-white border-b border-border flex items-center justify-between px-4 md:px-8 shrink-0 z-10 sticky top-0 shadow-sm shadow-slate-200/50 gap-3">
          <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-shrink">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all cursor-pointer">
              <Menu size={20} strokeWidth={2} />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                <Shuffle size={16} className="text-primary" />
              </div>
              <h1 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight whitespace-nowrap">Phase Swapper Management</h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5 md:gap-3 text-xs md:text-sm flex-shrink-0">
            <span className="px-2 md:px-3 py-1.5 border border-primary/20 bg-primary/5 text-primary rounded-lg font-bold text-xs md:text-sm whitespace-nowrap">
              {role === "superadmin" ? "SAdmin" : "Admin"}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <PhaseSwapperManager />
        </div>
      </main>
    </div>
  );
}
