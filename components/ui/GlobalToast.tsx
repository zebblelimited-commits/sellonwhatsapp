"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import type { ToastType } from "@/lib/toast";

type Toast = { id: number; type: ToastType; message: string };

export default function GlobalToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: ToastType; message?: string }>).detail;
      if (!detail?.message) return;
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { id, type: detail.type || "info", message: detail.message || "" }]);
      window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500);
    };
    window.addEventListener("zebble:toast", handleToast);
    return () => window.removeEventListener("zebble:toast", handleToast);
  }, []);

  return <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">{toasts.map((toast) => <div key={toast.id} className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 text-sm font-medium shadow-xl ${toast.type === "success" ? "border-green-200 bg-green-50 text-green-800" : toast.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>{toast.type === "success" ? <CheckCircle2 size={18} className="shrink-0" /> : toast.type === "error" ? <XCircle size={18} className="shrink-0" /> : <Info size={18} className="shrink-0" />}<span className="flex-1">{toast.message}</span><button onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} aria-label="Dismiss notification"><X size={15} /></button></div>)}</div>;
}
