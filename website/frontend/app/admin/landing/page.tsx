"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminLanding() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("adminToken");
    if (!token) {
      router.push("/admin/login");
    } else {
      router.push("/admin/dashboard");
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
        <p className="text-sm text-slate-500 font-medium">Redirecting to system portal...</p>
      </div>
    </div>
  );
}
