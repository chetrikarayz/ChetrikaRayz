"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, User, ArrowLeft, Shield } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("adminToken", data.token);
        localStorage.setItem("adminRole", data.role);
        router.push("/admin/dashboard");
      } else {
        setErrorMsg(data.error || "Authentication failed");
      }
    } catch {
      setErrorMsg("System offline or network connection failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/20 rounded-full blur-[100px] pointer-events-none"></div>

      <header className="border-b border-border h-16 md:h-20 w-full flex items-center px-4 md:px-6 fixed top-0 bg-white/80 backdrop-blur-md z-10">
        <Link href="/" className="inline-flex items-center gap-2 text-xs md:text-sm text-slate-500 hover:text-primary transition-colors font-medium cursor-pointer bg-white px-3 md:px-4 py-2 rounded-lg border border-border shadow-sm">
          <ArrowLeft size={16} /> Return to Site
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 mt-16 relative z-10">
        <div className="w-full max-w-[400px]">
          <div className="text-center mb-6 md:mb-8">
            <div className="w-14 h-14 md:w-16 md:h-16 bg-white border border-border shadow-md rounded-2xl flex items-center justify-center mx-auto mb-4 md:mb-5 relative overflow-hidden">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 md:h-8 md:w-8 text-primary">
                  <path d="M12 2L4 7V17L12 22L20 17V7L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M12 6L8 9V15L12 18L16 15V9L12 6Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" opacity="0.6"/>
                  <path d="M12 10L10.5 12L12 14L13.5 12L12 10Z" fill="currentColor" opacity="0.8"/>
                </svg>
              </div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">System Portal</h1>
              <p className="text-slate-500 font-medium text-xs md:text-sm mt-1.5 flex items-center justify-center gap-1.5">
                <Shield size={14} className="text-primary shrink-0" /> Authorized personnel only
              </p>
            </div>
          <div className="bg-white border border-border rounded-2xl shadow-xl shadow-slate-200/50 p-6 md:p-8 backdrop-blur-xl">
            {errorMsg && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex gap-3 items-start font-medium">
                <span>{errorMsg}</span>
              </div>
            )}
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-2 pointer-events-none">Username</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-slate-400" />
                  </div>
                  <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-slate-50 border border-border text-slate-900 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-medium"
                    placeholder="Enter username" required />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-2 pointer-events-none">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400" />
                  </div>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-border text-slate-900 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-medium"
                    placeholder="Enter password" required />
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25 rounded-xl font-bold py-3 text-sm transition-all active:scale-[0.98] disabled:opacity-50 mt-2">
                {loading ? "Authenticating..." : "Sign In securely"}
              </button>
            </form>
          </div>

          <p className="mt-8 text-center text-xs font-medium text-slate-400">
            Chetrika Rayz &copy; {new Date().getFullYear()}
          </p>
        </div>
      </main>
    </div>
  );
}
