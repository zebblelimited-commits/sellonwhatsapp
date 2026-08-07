"use client";
import { useEffect, useState } from "react";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { 
  collection, query, where, onSnapshot, doc, updateDoc, 
  serverTimestamp, addDoc 
} from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation"; // ✅ Add router for programmatic navigation
import { 
  ShoppingBag, ChevronRight, Clock, Truck, CheckCircle, Package, 
  ShieldCheck, AlertTriangle, X, Flag, MessageSquare, Loader2
} from "lucide-react";

type BuyerDispute = { orderId: string; status?: string; reason?: string; description?: string; vendorResponded?: boolean };

export function BuyerOrders({ disputes = [], onDisputeAction }: { disputes?: BuyerDispute[]; onDisputeAction?: (action: string, payload: unknown) => void }) {
    const router = useRouter(); // ✅ Initialize router
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Modal States
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [updateError, setUpdateError] = useState("");
    
    // Dispute Form State
    const [disputeForm, setDisputeForm] = useState({
        reason: "item_not_received",
        description: ""
    });

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            if (user) {
                const q = query(
                    collection(db, "orders"), 
                    where("buyerId", "==", user.uid)
                );

                const unsubOrders = onSnapshot(q, (snap) => {
                    const docs = snap.docs.map(doc => ({ 
                        id: doc.id, 
                        ...doc.data(),
                        createdAt: doc.data().createdAt?.toDate?.() || new Date()
                    }));
                    setOrders(docs.sort((a, b) => 
                        (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0)
                    ));
                    setLoading(false);
                }, (error) => {
                    console.error("Firestore Error:", error);
                    setLoading(false);
                });

                return () => unsubOrders();
            } else {
                setLoading(false);
            }
        });

        return () => unsubscribeAuth();
    }, []);

    // ✅ Helper: Check if order has active dispute
    const getOrderDispute = (orderId: string) => {
        return disputes?.find(d => 
            d.orderId === orderId && 
            ["open", "under_review"].includes(String(d.status || ""))
        );
    };

    // Triggered when "Confirm Receipt" is clicked
    const openConfirmModal = (e: React.MouseEvent, orderId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedOrderId(orderId);
        setUpdateError("");
        setIsConfirmModalOpen(true);
    };

    const handleConfirmFinal = async () => {
        if (!selectedOrderId || !auth.currentUser) return;
        setIsUpdating(true);

        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch("/api/orders/complete", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ orderId: selectedOrderId }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Failed to complete order");
            setIsConfirmModalOpen(false);
            setSelectedOrderId(null);
        } catch (error) {
            console.error("Update Error:", error);
            if (error instanceof DOMException && error.name === "AbortError") return;
            setUpdateError(error instanceof Error ? error.message : "Could not complete the order. Please try again.");
        } finally {
            setIsUpdating(false);
        }
    };

    // ✅ NEW: Open dispute modal
    const openDisputeModal = (e: React.MouseEvent, order: any) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedOrderId(order.id);
        setUpdateError("");
        setDisputeForm({ reason: "item_not_received", description: "" });
        setIsDisputeModalOpen(true);
    };

    // ✅ NEW: Submit dispute to Firestore
    const handleSubmitDispute = async () => {
        if (!selectedOrderId || !auth.currentUser) return;
        setIsUpdating(true);

        try {
            const order = orders.find(o => o.id === selectedOrderId);
            if (!order) throw new Error("Order not found");

            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch("/api/disputes", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ orderId: selectedOrderId, reason: disputeForm.reason, description: disputeForm.description, evidence: [] }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Failed to create dispute");

            // Notify parent component
            onDisputeAction?.("dispute_opened", { 
                orderId: selectedOrderId, 
                disputeId: result.disputeId
            });

            // Reset and close
            setIsDisputeModalOpen(false);
            setSelectedOrderId(null);
            setDisputeForm({ reason: "item_not_received", description: "" });
            
        } catch (error) {
            console.error("Dispute Error:", error);
        } finally {
            setIsUpdating(false);
        }
    };

    // ✅ Generate WhatsApp link (safe handling for undefined phone)
    const getWhatsAppLink = (order: any) => {
        const phone = order.vendorPhone?.replace(/\D/g, '');
        if (!phone) return '#';
        const message = `Hello, I have a question about order #${order.id?.slice(-6)}`;
        return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    };

    // ✅ Handle external link click (WhatsApp, tracking) - prevents nested <a> error
    const handleExternalLink = (e: React.MouseEvent, url: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (url && url !== '#') {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    if (loading) return (
        <div className="text-center py-10 font-bold text-gray-300 flex items-center justify-center">
            <Loader2 className="animate-spin mr-2" size={20} /> Syncing with Zebble Network...
        </div>
    );

    return (
        <div className="space-y-4 animate-in fade-in duration-500">
            
            {/* --- CONFIRMATION MODAL --- */}
            {isConfirmModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-[400px] rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle size={32} />
                            </div>
                            <h3 className="text-xl font-extrabold text-slate-900 mb-2">Final Confirmation</h3>
                            <p className="text-sm text-slate-500 leading-relaxed mb-6">
                                Are you sure you have received your items in good condition? 
                                <span className="block mt-2 font-bold text-slate-700">
                                    This action will release funds from Escrow to the vendor immediately.
                                </span>
                            </p>
                            {updateError && <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-left text-xs font-semibold leading-relaxed text-red-700">{updateError}</div>}
                            
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={handleConfirmFinal}
                                    disabled={isUpdating}
                                    className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-bold text-sm transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {isUpdating ? "Processing..." : "Yes, Release Funds"}
                                </button>
                                <button
                                    onClick={() => {
                                        setIsConfirmModalOpen(false);
                                        setSelectedOrderId(null);
                                        setUpdateError("");
                                    }}
                                    className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold text-sm transition-all"
                                >
                                    Not Yet, Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ✅ NEW: DISPUTE MODAL */}
            {isDisputeModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-[400px] rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                                    <Flag size={20} className="text-red-500" /> Report Issue
                                </h3>
                                <button 
                                    onClick={() => {
                                        setIsDisputeModalOpen(false);
                                        setSelectedOrderId(null);
                                    }}
                                    className="p-2 bg-slate-50 rounded-full text-slate-400 hover:text-slate-900 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <p className="text-sm text-slate-500 mb-4">
                                Describe the issue with your order. Funds are held securely in escrow until resolved.
                            </p>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1 mb-1 block">
                                        Reason
                                    </label>
                                    <select 
                                        className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-500/20"
                                        value={disputeForm.reason}
                                        onChange={(e) => setDisputeForm({...disputeForm, reason: e.target.value})}
                                    >
                                        <option value="item_not_received">Item Not Received</option>
                                        <option value="damaged">Item Damaged</option>
                                        <option value="wrong_item">Wrong Item Sent</option>
                                        <option value="not_as_described">Not As Described</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1 mb-1 block">
                                        Description
                                    </label>
                                    <textarea 
                                        className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-500/20 min-h-[100px]"
                                        placeholder="Describe the issue in detail..."
                                        value={disputeForm.description}
                                        onChange={(e) => setDisputeForm({...disputeForm, description: e.target.value})}
                                    />
                                </div>

                                <div className="flex flex-col gap-3 pt-2">
                                    <button
                                        onClick={handleSubmitDispute}
                                        disabled={isUpdating || !disputeForm.description.trim()}
                                        className="w-full py-4 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-2xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        {isUpdating ? (
                                            <><Loader2 size={16} className="animate-spin mr-2" /> Processing...</>
                                        ) : (
                                            <><Flag size={16} /> Submit Dispute</>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsDisputeModalOpen(false);
                                            setSelectedOrderId(null);
                                        }}
                                        className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold text-sm transition-all"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {orders.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[32px] border border-dashed border-gray-200">
                    <ShoppingBag className="mx-auto text-gray-200 mb-4" size={48} />
                    <p className="text-gray-400 font-bold">No active orders found for this account.</p>
                </div>
            ) : (
                orders.map((order) => {
                    const dispute = getOrderDispute(order.id);
                    const hasActiveDispute = !!dispute;
                    
                    return (
                        // ✅ FIXED: Link to correct buyer order detail path
                        <Link 
                            href={`/buyer/orders/${order.id}`} 
                            key={order.id} 
                            className="block"
                        >
                            <div 
                                className={`bg-white p-5 rounded-[32px] border shadow-sm flex flex-col gap-4 active:scale-[0.99] transition-all ${
                                    hasActiveDispute 
                                        ? 'border-red-200 ring-1 ring-red-100 hover:border-red-300' 
                                        : 'border-gray-50 hover:border-green-100'
                                }`}
                            >
                                
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-2xl ${
                                            hasActiveDispute ? "bg-red-50 text-red-500" :
                                            order.status === "PAID_HELD" ? "bg-orange-50 text-orange-500" :
                                            order.status === "SHIPPED" ? "bg-blue-50 text-blue-500" :
                                            "bg-green-50 text-green-500"
                                        }`}>
                                            {hasActiveDispute ? <AlertTriangle size={20} /> :
                                             order.status === "PAID_HELD" ? <Clock size={20} /> :
                                             order.status === "SHIPPED" ? <Truck size={20} /> :
                                             <CheckCircle size={20} />}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-900 text-sm">Order #{order.id.slice(-6).toUpperCase()}</h4>
                                            <p className="text-[11px] text-gray-400 font-bold">₦{order.totalAmount?.toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[9px] font-black px-3 py-1 rounded-full border uppercase tracking-wider ${
                                            hasActiveDispute ? "bg-red-50 text-red-600 border-red-100" :
                                            order.status === "PAID_HELD" ? "bg-orange-50 text-orange-600 border-orange-100" :
                                            order.status === "SHIPPED" ? "bg-blue-50 text-blue-600 border-blue-100" :
                                            "bg-green-50 text-green-600 border-green-100"
                                        }`}>
                                            {hasActiveDispute ? "Disputed" : 
                                             order.status === "PAID_HELD" ? "Escrow" : 
                                             order.status}
                                        </span>
                                        <ChevronRight size={16} className="text-gray-300" />
                                    </div>
                                </div>

                                {/* ✅ Dispute Banner */}
                                {hasActiveDispute && (
                                    <div className="p-3 bg-red-50 rounded-xl border border-red-100">
                                        <div className="flex items-start gap-2">
                                            <AlertTriangle size={14} className="text-red-600 shrink-0 mt-0.5" />
                                            <div className="flex-1">
                                                <p className="text-[10px] font-bold text-red-800">
                                                    Dispute: {dispute.reason?.replace('_', ' ')}
                                                </p>
                                                <p className="text-[9px] text-red-700 mt-0.5 line-clamp-1">
                                                    {dispute.description}
                                                </p>
                                                {dispute.vendorResponded && (
                                                    <span className="inline-flex items-center gap-1 mt-1 text-[9px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                                        <CheckCircle size={10} /> Vendor Responded
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ✅ SHIPPED Status Actions */}
                                {order.status === "SHIPPED" && !hasActiveDispute && (
                                    <div className="flex flex-col sm:flex-row items-center gap-3">
                                        <div className="flex flex-1 items-center gap-3 px-4 py-3 bg-gray-50 rounded-2xl border border-gray-100 w-full">
                                            <Package size={14} className="text-gray-400" />
                                            <div className="flex-1">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Tracking</p>
                                                <p className="text-xs font-bold text-gray-700">{order.trackingId || "Pending ID"}</p>
                                            </div>
                                        </div>
                                        
                                        {/* ✅ Track Order Button - Uses button + window.open to avoid nested <a> */}
                                        {order.trackingUrl && (
                                            <button 
                                                onClick={(e) => handleExternalLink(e, order.trackingUrl)}
                                                className="w-full sm:w-auto px-6 py-3.5 bg-blue-600 text-white rounded-2xl font-bold text-xs hover:bg-blue-700 shadow-lg shadow-blue-100 active:scale-[0.95] flex items-center justify-center gap-2"
                                            >
                                                <Truck size={14} /> Track
                                            </button>
                                        )}
                                        
                                        <button 
                                            onClick={(e) => openConfirmModal(e, order.id)}
                                            className="w-full sm:w-auto px-6 py-3.5 bg-green-600 text-white rounded-2xl font-bold text-xs hover:bg-green-700 shadow-lg shadow-green-100 active:scale-[0.95]"
                                        >
                                            Confirm Receipt
                                        </button>
                                    </div>
                                )}

                                {/* ✅ COMPLETED Status Actions */}
                                {order.status === "COMPLETED" && !hasActiveDispute && (
                                    <div className="flex flex-col sm:flex-row items-center gap-3">
                                        <div className="flex items-center gap-2 px-4 py-3 bg-green-50/50 text-green-700 rounded-2xl text-[10px] font-black uppercase border border-green-100 flex-1">
                                            <ShieldCheck size={14} /> Order Finished
                                        </div>
                                        
                                        {/* ✅ Report Issue Button */}
                                        <button 
                                            onClick={(e) => openDisputeModal(e, order)}
                                            className="w-full sm:w-auto px-5 py-3.5 text-red-600 hover:bg-red-50 border border-red-200 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2"
                                        >
                                            <Flag size={14} /> Report Issue
                                        </button>
                                        
                                        {/* ✅ Chat with Vendor Button - Uses button + window.open to avoid nested <a> */}
                                        <button 
                                            onClick={(e) => handleExternalLink(e, getWhatsAppLink(order))}
                                            className="w-full sm:w-auto px-5 py-3.5 text-[#25D366] hover:bg-[#25D366]/10 border border-[#25D366]/20 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2"
                                        >
                                            <MessageSquare size={14} /> Chat
                                        </button>
                                    </div>
                                )}

                                {/* ✅ Dispute Status Actions */}
                                {hasActiveDispute && (
                                    <div className="flex items-center justify-between px-4 py-3 bg-red-50 rounded-2xl border border-red-100">
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-red-700">
                                            <AlertTriangle size={14} /> Under Review
                                        </div>
                                        <button 
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onDisputeAction?.("view_dispute", dispute);
                                            }}
                                            className="text-[10px] font-bold text-red-600 hover:underline flex items-center gap-1"
                                        >
                                            View Details <ChevronRight size={12} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </Link>
                    );
                })
            )}
        </div>
    );
}
