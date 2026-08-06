"use client";
import { useState, useEffect } from "react";
import { 
  Flag, Clock, CheckCircle2, AlertTriangle, MessageSquare, 
  Upload, Eye, ChevronRight, Loader2, ShieldAlert
} from "lucide-react";

export function BuyerDisputesTab({ disputes = [], buyerId, onAction }) {
  const [filter, setFilter] = useState("all");
  const [uploading, setUploading] = useState(null);
  
  // ✅ Debug: Log disputes when they change
  useEffect(() => {
    console.log("🔍 BuyerDisputesTab received:", {
      count: disputes.length,
      first: disputes[0] ? {
        id: disputes[0].id,
        status: disputes[0].status,
        createdAt: disputes[0].createdAt,
        orderId: disputes[0].orderId
      } : null
    });
  }, [disputes]);

  // ✅ Robust filter with fallback
  const filteredDisputes = disputes.filter(d => {
    if (!d?.status) return false; // Skip invalid entries
    if (filter === "all") return true;
    if (filter === "open") return ["open", "under_review"].includes(d.status);
    if (filter === "resolved") return ["resolved_refund", "resolved_vendor", "closed"].includes(d.status);
    return true;
  });

  const formatCurrency = (amount) => 
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount || 0);

  // ✅ Robust date formatter with multiple fallbacks
  const parseDate = (dateInput) => {
    if (!dateInput) return null;
    // Handle Firestore Timestamp
    if (typeof dateInput === 'object' && dateInput?.toDate) {
      return dateInput.toDate();
    }
    // Handle ISO string or timestamp number
    const date = new Date(dateInput);
    if (!isNaN(date.getTime())) {
      return date;
    }
    return null;
  };

  const formatDate = (dateInput) => {
    const date = parseDate(dateInput);
    if (!date) return '—';
    return date.toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTimeAgo = (dateInput) => {
    const date = parseDate(dateInput);
    if (!date) return '';
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return formatDate(dateInput);
  };

  const getStatusConfig = (status) => {
    const configs = {
      open: { label: "Open", class: "bg-red-100 text-red-700", icon: AlertTriangle },
      under_review: { label: "Under Review", class: "bg-yellow-100 text-yellow-700", icon: Clock },
      resolved_refund: { label: "Refunded", class: "bg-green-100 text-green-700", icon: CheckCircle2 },
      resolved_vendor: { label: "Closed", class: "bg-gray-100 text-gray-700", icon: CheckCircle2 },
      closed: { label: "Closed", class: "bg-gray-100 text-gray-700", icon: CheckCircle2 }
    };
    return configs[status] || { label: "Unknown", class: "bg-gray-100 text-gray-700", icon: AlertTriangle };
  };

  const handleAddEvidence = async (dispute) => {
    setUploading(dispute.id);
    try {
      onAction?.("add_evidence", dispute);
    } finally {
      setUploading(null);
    }
  };

  // ✅ Better empty state with debug hint
  if (filteredDisputes.length === 0) {
    return (
      <div className="bg-white rounded-[32px] p-8 border border-gray-100 text-center">
        <div className="w-16 h-16 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShieldAlert size={32} />
        </div>
        <h3 className="font-bold text-gray-900 mb-2">
          {filter === "all" ? "No Disputes Yet" : `No ${filter} disputes`}
        </h3>
        <p className="text-sm text-gray-500 mb-6">
          {filter === "all" 
            ? "All your orders are proceeding smoothly. 🎉" 
            : `You don't have any ${filter} disputes at the moment.`
          }
        </p>
        
        {/* ✅ Debug info for developers */}
        {process.env.NODE_ENV === 'development' && (
          <details className="text-left text-[10px] text-gray-400 mb-4">
            <summary className="cursor-pointer">Debug Info</summary>
            <p>Total disputes received: {disputes.length}</p>
            <p>Filtered count: {filteredDisputes.length}</p>
            <p>Current filter: {filter}</p>
            {disputes[0] && <p>Sample dispute ID: {disputes[0].id}</p>}
          </details>
        )}
        
        {filter !== "all" && (
          <button 
            onClick={() => setFilter("all")}
            className="text-xs font-bold text-green-600 hover:underline"
          >
            View all disputes →
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-gray-900">Your Disputes</h2>
          {disputes.filter(d => ["open", "under_review"].includes(d.status)).length > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full">
              {disputes.filter(d => ["open", "under_review"].includes(d.status)).length}
            </span>
          )}
        </div>
        
        <div className="flex bg-gray-100 rounded-xl p-1">
          {[
            { id: "all", label: "All" },
            { id: "open", label: "Open" },
            { id: "resolved", label: "Resolved" }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filter === tab.id 
                  ? "bg-white text-gray-900 shadow-sm" 
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Disputes List */}
      <div className="space-y-3">
        {filteredDisputes.map((dispute) => {
          // ✅ Safe property access with fallbacks
          const disputeId = dispute?.id || 'unknown';
          const orderId = dispute?.orderId || 'N/A';
          const reason = dispute?.reason?.replace('_', ' ') || 'No reason provided';
          const description = dispute?.description || 'No description';
          const amount = dispute?.amount;
          const status = dispute?.status || 'unknown';
          const createdAt = dispute?.createdAt;
          const updatedAt = dispute?.updatedAt;
          const vendorResponded = dispute?.vendorResponded;
          const evidence = dispute?.evidence || [];
          const resolution = dispute?.resolution;
          
          const { label, class: badgeClass, icon: StatusIcon } = getStatusConfig(status);
          const isResolved = ["resolved_refund", "resolved_vendor", "closed"].includes(status);
          
          return (
            <div 
              key={disputeId} 
              className={`bg-white p-5 rounded-[32px] border ${!dispute.read && !isResolved ? 'border-red-200 ring-1 ring-red-100' : 'border-gray-100'} hover:shadow-md transition-all`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                {/* Left: Dispute Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h4 className="font-bold text-gray-900 text-sm">
                      Order #{String(orderId).slice(-6).toUpperCase()}
                    </h4>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${badgeClass}`}>
                      <StatusIcon size={10} /> {label}
                    </span>
                    {!dispute.read && !isResolved && (
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" title="New" />
                    )}
                  </div>
                  
                  <p className="text-xs text-gray-500 mb-2">
                    <span className="font-medium">Reason:</span> {reason}
                  </p>
                  
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {description}
                  </p>
                  
                  {/* Timeline */}
                  <div className="flex items-center gap-4 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> Opened {formatTimeAgo(createdAt)}
                    </span>
                    {updatedAt && updatedAt !== createdAt && (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 size={12} /> Updated {formatTimeAgo(updatedAt)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Amount & Actions */}
                <div className="flex flex-col sm:items-end gap-3 shrink-0">
                  {amount != null && (
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Order Value</p>
                      <p className="text-lg font-black text-gray-900">{formatCurrency(amount)}</p>
                    </div>
                  )}
                  
                  <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => onAction?.("view_order", dispute)}
                      className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl flex items-center gap-1"
                    >
                      <Eye size={14} /> View Order
                    </button>
                    
                    {!isResolved && vendorResponded && (
                      <button 
                        onClick={() => onAction?.("view_messages", dispute)}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-xl hover:bg-green-700 flex items-center gap-1"
                      >
                        <MessageSquare size={14} /> Respond
                      </button>
                    )}
                    
                    {!isResolved && evidence.length === 0 && (
                      <button 
                        onClick={() => handleAddEvidence(dispute)}
                        disabled={uploading === disputeId}
                        className="px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-xl flex items-center gap-1 disabled:opacity-50"
                      >
                        {uploading === disputeId ? (
                          <><Loader2 size={14} className="animate-spin" /> Uploading...</>
                        ) : (
                          <><Upload size={14} /> Add Evidence</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Evidence Preview (if any) */}
              {evidence.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Evidence</p>
                  <div className="flex flex-wrap gap-2">
                    {evidence.slice(0, 3).map((item, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-lg text-[10px] text-gray-600">
                        <Flag size={10} className="text-gray-400" />
                        <span className="truncate max-w-[120px]">{item?.name || `File ${idx + 1}`}</span>
                      </div>
                    ))}
                    {evidence.length > 3 && (
                      <span className="text-[10px] text-gray-400">+{evidence.length - 3} more</span>
                    )}
                  </div>
                </div>
              )}

              {/* Resolution Note (if resolved) */}
              {isResolved && resolution && (
                <div className="mt-4 p-3 bg-green-50 rounded-xl border border-green-100">
                  <p className="text-xs font-bold text-green-800">Resolution</p>
                  <p className="text-[10px] text-green-700 mt-1">{resolution}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Load More */}
      {filteredDisputes.length >= 10 && (
        <div className="text-center pt-4">
          <button className="text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors">
            Load older disputes
          </button>
        </div>
      )}
    </div>
  );
}