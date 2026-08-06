"use client";

import { FormEvent } from "react";
import { Loader2, MessageSquare, X } from "lucide-react";

interface DisputeResponseModalProps {
  open: boolean;
  orderId?: string;
  title?: string;
  value: string;
  loading?: boolean;
  error?: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export default function DisputeResponseModal({
  open,
  orderId,
  title = "Respond to dispute",
  value,
  loading = false,
  error,
  onChange,
  onClose,
  onSubmit,
}: DisputeResponseModalProps) {
  if (!open) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!value.trim() || loading) return;
    onSubmit();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button aria-label="Close response modal" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="dispute-response-title" className="relative w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600">
              <MessageSquare size={19} />
            </div>
            <h2 id="dispute-response-title" className="text-lg font-black text-gray-900">{title}</h2>
            {orderId && <p className="mt-1 text-xs font-medium text-gray-500">Order #{String(orderId).slice(-6).toUpperCase()}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <label htmlFor="dispute-response" className="mb-2 block text-xs font-bold text-gray-600">Your response</label>
        <textarea
          id="dispute-response"
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Write a clear response to this dispute..."
          rows={5}
          disabled={loading}
          className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-900 outline-none transition focus:border-green-600 focus:bg-white focus:ring-4 focus:ring-green-500/10 disabled:opacity-60"
        />
        {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={loading} className="rounded-xl px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={loading || !value.trim()} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "Sending..." : "Send response"}
          </button>
        </div>
      </form>
    </div>
  );
}
