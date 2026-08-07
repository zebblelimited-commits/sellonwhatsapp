// @/components/admin/ActionConfirmModal.tsx
"use client";

import { useState } from "react";
import { X, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

interface ActionConfirmModalProps {
  action: string;
  target: string;
  onConfirm: (reason: string) => Promise<void> | void;
  onCancel: () => void;
  loading?: boolean;
}

export function ActionConfirmModal({ 
  action, 
  target, 
  onConfirm, 
  onCancel,
  loading = false 
}: ActionConfirmModalProps) {
  const [reason, setReason] = useState("");

  const config: Record<string, { title: string; description: string; color: string; requiresReason: boolean }> = {
    ban: { 
      title: "Ban User", 
      description: "This will prevent the user from accessing their account. Provide a reason for the ban.",
      color: "red",
      requiresReason: true
    },
    unban: {
      title: "Unban User",
      description: "This will restore the user's account access.",
      color: "green",
      requiresReason: false
    },
    verify: {
      title: "Verify User",
      description: "Mark this user as verified. They'll receive a verification badge.",
      color: "blue",
      requiresReason: false
    },
    suspend: {
      title: "Suspend User",
      description: "Temporarily restrict account access. Provide a reason.",
      color: "amber",
      requiresReason: true
    },
    approve: {
      title: "Approve Store",
      description: "Approve this store and make it available as an active marketplace store.",
      color: "green",
      requiresReason: false
    },
    reject: {
      title: "Reject Store",
      description: "Reject this store application. Provide a reason for the decision.",
      color: "red",
      requiresReason: true
    },
    restore: {
      title: "Restore Record",
      description: "Restore this account or store to active status.",
      color: "green",
      requiresReason: false
    },
    delete: {
      title: "Delete Record",
      description: "This action cannot be undone. Provide a reason for deletion.",
      color: "red",
      requiresReason: true
    },
  };

  const { title, description, color, requiresReason } = config[action] || config.ban;

  const handleConfirm = async () => {
    if (requiresReason && !reason.trim()) {
      alert("Please provide a reason for this action");
      return;
    }
    await onConfirm(reason);
  };

  const colorClasses: Record<string, string> = {
    red: "bg-red-600 hover:bg-red-700 border-red-200 text-red-600",
    green: "bg-green-600 hover:bg-green-700 border-green-200 text-green-600",
    blue: "bg-blue-600 hover:bg-blue-700 border-blue-200 text-blue-600",
    amber: "bg-amber-600 hover:bg-amber-700 border-amber-200 text-amber-600",
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h3 className={`text-lg font-bold flex items-center gap-2 text-${color}-600`}>
            <AlertTriangle size={20} /> {title}
          </h3>
          <button 
            onClick={onCancel}
            disabled={loading}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-500 mb-4">{description}</p>
        
        {/* Target */}
        <div className="p-3 bg-gray-50 rounded-xl mb-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Target</p>
          <p className="text-sm font-bold text-gray-900">{target}</p>
        </div>
        
        {/* Reason Input (if required) */}
        {requiresReason && (
          <div className="mb-4">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-green-500 outline-none min-h-[80px] resize-none"
              placeholder="Ex: Violated community guidelines, spam activity, etc."
              disabled={loading}
            />
          </div>
        )}
        
        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-2xl font-bold text-sm transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || (requiresReason && !reason.trim())}
            className={`flex-1 py-3 ${colorClasses[color].split(' ')[0]} ${colorClasses[color].split(' ')[1]} text-white rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50`}
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin" /> Processing...</>
            ) : (
              <><CheckCircle2 size={16} /> Confirm {title}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
