// ./tabs/DisputesTab.jsx
"use client";
import { ShieldAlert, Clock, CheckCircle2, XCircle, MessageSquare, Upload } from "lucide-react";
import DisputeThread from "@/components/disputes/DisputeThread";

/** @param {{ disputes?: any[], vendorId?: string, onAction?: (action: string, dispute: any) => void }} props */
export default function DisputesTab({ disputes = [], vendorId, onAction }) {
  if (disputes.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-gray-100 text-center">
        <div className="w-16 h-16 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShieldAlert size={32} />
        </div>
        <h3 className="font-bold text-gray-900 mb-2">No Active Disputes</h3>
        <p className="text-sm text-gray-500">All your orders are proceeding smoothly. 🎉</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {disputes.map(dispute => (
        <div key={dispute.id} className="bg-white p-5 rounded-2xl border border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-bold text-gray-900">Order #{String(dispute.orderId || "N/A").slice(-6)}</h4>
              <p className="text-xs text-gray-500 mt-1">{dispute.reason}</p>
            </div>
            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${dispute.status === "open" ? "bg-red-100 text-red-700" :
              dispute.status === "resolved_vendor" ? "bg-green-100 text-green-700" :
                "bg-yellow-100 text-yellow-700"
              }`}>
              {dispute.status}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-3">{dispute.description}</p>
          {dispute.resolution && (
            <div className="mt-3 rounded-xl border border-green-100 bg-green-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-green-800">Admin resolution note</p>
              <p className="mt-1 text-xs text-green-700">{dispute.resolution}</p>
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => onAction?.("mark_read", dispute)}
              className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg"
            >
              Mark Read
            </button>
          </div>
          <DisputeThread
            key={dispute.id}
            disputeId={dispute.id}
            currentRole="vendor"
            currentStatus={dispute.status}
            currentResolution={dispute.resolution || ""}
          />
        </div>
      ))}
    </div>
  );
}
