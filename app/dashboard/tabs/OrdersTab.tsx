"use client";
import { useEffect, useState, useMemo } from "react";
import { db, auth } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, addDoc, getDocs } from "firebase/firestore";
import { Package, Truck, CheckCircle, Clock, Info, X, MapPin, Flag, AlertTriangle, MessageSquare, Search } from "lucide-react";
import Image from "next/image";
import DisputeResponseModal from "@/components/disputes/DisputeResponseModal";

export default function OrdersTab({ disputes = [], onDisputeAction }) {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // ✅ NEW: Filter and Search State
    const [filter, setFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    // UI State for the shipping form
    const [shippingForm, setShippingForm] = useState({ orderId: null, trackingId: "", carrier: "Zebble Internal" });
    
    // Dispute modal state
    const [disputeForm, setDisputeForm] = useState({ 
        orderId: null, 
        reason: "item_not_received", 
        description: "",
        evidence: [] 
    });
    const [responseModal, setResponseModal] = useState<any>(null);
    const [responseText, setResponseText] = useState("");
    const [responseLoading, setResponseLoading] = useState(false);
    const [responseError, setResponseError] = useState("");

    useEffect(() => {
        const user = auth.currentUser;
        if (!user) return;
        const q = query(collection(db, "orders"), where("vendorId", "==", user.uid));
        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setOrders(data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    // 1. Internal ID Generator
    const generateInternalTracking = () => {
        const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `ZEB-${new Date().getFullYear()}-${randomStr}`;
    };

    // 2. Open the shipping form
    const openShippingForm = (orderId) => {
        setShippingForm({
            orderId,
            trackingId: generateInternalTracking(),
            carrier: "Zebble Internal"
        });
    };

    // 3. Finalize shipping
    const handleFinalizeShipping = async () => {
        if (!shippingForm.orderId) return;
        try {
            const orderRef = doc(db, "orders", shippingForm.orderId);
            await updateDoc(orderRef, {
                status: "SHIPPED",
                shippedAt: serverTimestamp(),
                trackingId: shippingForm.trackingId,
                carrier: shippingForm.carrier
            });
            setShippingForm({ orderId: null, trackingId: "", carrier: "" });
        } catch (error) {
            console.error("Error updating order:", error);
        }
    };

    // Mark order as completed and release funds from escrow
    const handleMarkAsCompleted = async (orderId: string) => {
        if (!confirm("Mark this order as delivered? The funds will be released to your available balance for withdrawal.")) return;
        try {
            const user = auth.currentUser;
            if (!user) return;
            const idToken = await user.getIdToken();
            const res = await fetch('/api/orders/complete', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}` 
                },
                body: JSON.stringify({ orderId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to complete order');
            alert('✅ Order marked as delivered! Funds released to your available balance.');
        } catch (error: any) {
            console.error(error);
            alert('❌ ' + (error.message || 'Failed to update order.'));
        }
    };

    // Open dispute form
    const openDisputeForm = (order) => {
        setDisputeForm({
            orderId: order.id,
            reason: "item_not_received",
            description: "",
            evidence: []
        });
    };

    // Submit dispute to Firestore
    const handleSubmitDispute = async () => {
        if (!disputeForm.orderId || !auth.currentUser) return;
        try {
            const order = orders.find(o => o.id === disputeForm.orderId);
            if (!order) throw new Error("Order not found");

            await addDoc(collection(db, "disputes"), {
                orderId: disputeForm.orderId,
                vendorId: order.vendorId,
                buyerId: order.buyerId,
                reason: disputeForm.reason,
                description: disputeForm.description,
                evidence: disputeForm.evidence,
                status: "open",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                read: false,
                vendorResponded: false
            });

            const orderRef = doc(db, "orders", disputeForm.orderId);
            await updateDoc(orderRef, {
                status: "DISPUTED",
                disputedAt: serverTimestamp()
            });

            onDisputeAction?.("dispute_opened", { orderId: disputeForm.orderId });
            setDisputeForm({ orderId: null, reason: "item_not_received", description: "", evidence: [] });
        } catch (error) {
            console.error("Error creating dispute:", error);
        }
    };

    const openResponseModal = (dispute) => {
        setResponseModal(dispute);
        setResponseText("");
        setResponseError("");
    };

    const closeResponseModal = () => {
        setResponseModal(null);
        setResponseText("");
        setResponseError("");
    };

    // Respond to existing dispute
    const handleRespondToDispute = async () => {
        if (!auth.currentUser || !responseModal || !responseText.trim()) return;
        setResponseLoading(true);
        setResponseError("");

        try {
            const idToken = await auth.currentUser.getIdToken();
            const result = await fetch(`/api/disputes/${encodeURIComponent(responseModal.id)}/actions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ action: "respond", content: responseText.trim() }),
            });
            const data = await result.json();

            if (!result.ok) throw new Error(data.error || "Failed to submit response");

            onDisputeAction?.("dispute_responded", responseModal);
            closeResponseModal();
        } catch (error: any) {
            console.error("Error responding to dispute:", error);
            setResponseError(error.message || "Failed to submit response. Please try again.");
        } finally {
            setResponseLoading(false);
        }
    };

    // Helper: Get active dispute for an order
    const getOrderDispute = (orderId) => {
        return disputes?.find(d => d.orderId === orderId && ['open', 'under_review'].includes(d.status));
    };

    // ✅ NEW: Filter and Search Logic
    const filteredOrders = useMemo(() => {
        let result = orders;
        
        if (filter === 'escrow') result = result.filter(o => o.status === 'PAID_HELD');
        else if (filter === 'transit') result = result.filter(o => o.status === 'SHIPPED');
        else if (filter === 'completed') result = result.filter(o => o.status === 'COMPLETED');
        else if (filter === 'disputes') result = result.filter(o => getOrderDispute(o.id));
        
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(o => 
                o.id.toLowerCase().includes(q) ||
                o.customerName?.toLowerCase().includes(q) ||
                o.customerPhone?.includes(q) ||
                o.totalAmount?.toString().includes(q) ||
                o.trackingId?.toLowerCase().includes(q)
            );
        }
        
        return result;
    }, [orders, filter, searchQuery, disputes]);

    const getStatusStyle = (status, hasDispute) => {
        if (hasDispute) return "bg-red-50 text-red-600 border-red-100";
        switch (status) {
            case "PAID_HELD": return "bg-orange-50 text-orange-600 border-orange-100";
            case "SHIPPED": return "bg-blue-50 text-blue-600 border-blue-100";
            case "COMPLETED": return "bg-green-50 text-green-600 border-green-100";
            case "DISPUTED": return "bg-red-50 text-red-600 border-red-100";
            default: return "bg-gray-50 text-gray-500 border-gray-100";
        }
    };

    const getStatusIcon = (status, hasDispute) => {
        if (hasDispute) return <AlertTriangle size={14} />;
        if (status === "PAID_HELD") return <Clock size={14} />;
        if (status === "SHIPPED") return <Truck size={14} />;
        if (status === "COMPLETED") return <CheckCircle size={14} />;
        return <Info size={14} />;
    };

    const getStatusLabel = (status, hasDispute) => {
        if (hasDispute) return "Disputed";
        if (status === "PAID_HELD") return "Escrow";
        if (status === "SHIPPED") return "Transit";
        if (status === "COMPLETED") return "Done";
        return status.replace("_", " ");
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-500 relative">
            {/* SHIPPING MODAL */}
            {shippingForm.orderId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
                    <div className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl border border-gray-100">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-gray-900">Ship Order</h3>
                            <button onClick={() => setShippingForm({ ...shippingForm, orderId: null })} className="p-2 bg-gray-50 rounded-full text-gray-400 hover:text-gray-900">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Carrier Name</label>
                                <select 
                                    className="w-full mt-1 p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-green-500/20"
                                    value={shippingForm.carrier}
                                    onChange={(e) => setShippingForm({...shippingForm, carrier: e.target.value})}
                                >
                                    <option value="Zebble Internal">Zebble Internal</option>
                                    <option value="GIG Logistics">GIG Logistics</option>
                                    <option value="DHL">DHL</option>
                                    <option value="Local Park/Driver">Local Park / Driver</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Tracking ID (Auto-Generated)</label>
                                <input 
                                    type="text"
                                    className="w-full mt-1 p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-green-500/20"
                                    value={shippingForm.trackingId}
                                    onChange={(e) => setShippingForm({...shippingForm, trackingId: e.target.value})}
                                />
                            </div>
                            <button 
                                onClick={handleFinalizeShipping}
                                className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-green-100 transition-all active:scale-[0.98] mt-4"
                            >
                                Confirm Shipment
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* DISPUTE MODAL */}
            {disputeForm.orderId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
                    <div className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl border border-gray-100">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                <Flag size={20} className="text-red-600" /> Report Issue
                            </h3>
                            <button onClick={() => setDisputeForm({ ...disputeForm, orderId: null })} className="p-2 bg-gray-50 rounded-full text-gray-400 hover:text-gray-900">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Reason</label>
                                <select 
                                    className="w-full mt-1 p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-500/20"
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
                                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Description</label>
                                <textarea 
                                    className="w-full mt-1 p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-500/20 min-h-[100px]"
                                    placeholder="Describe the issue in detail..."
                                    value={disputeForm.description}
                                    onChange={(e) => setDisputeForm({...disputeForm, description: e.target.value})}
                                />
                            </div>
                            <div className="text-[10px] text-gray-400 bg-gray-50 p-3 rounded-xl">
                                💡 <strong>Tip:</strong> Attach screenshots or tracking info in the next step. Funds are held securely in escrow until resolved.
                            </div>
                            <button 
                                onClick={handleSubmitDispute}
                                disabled={!disputeForm.description.trim()}
                                className="w-full py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-2xl font-bold text-sm shadow-lg shadow-red-100 transition-all active:scale-[0.98] mt-4 flex items-center justify-center gap-2"
                            >
                                <Flag size={16} /> Submit Dispute
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ✅ NEW: FILTERS & SEARCH BAR (Sticky) */}
            <div className="flex flex-col sm:flex-row gap-3 sticky top-0 z-20 bg-[#fafafa] py-2 -mx-2 px-2 border-b border-gray-100">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                        type="text"
                        placeholder="Search Order ID, Customer, or Amount..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-100 rounded-xl text-xs font-bold focus:border-green-500 outline-none transition-all shadow-sm"
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
                    {[
                        { id: 'all', label: 'All' },
                        { id: 'escrow', label: 'Escrow' },
                        { id: 'transit', label: 'In Transit' },
                        { id: 'completed', label: 'Completed' },
                        { id: 'disputes', label: 'Disputes' }
                    ].map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id)}
                            className={`px-4 py-2.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all ${
                                filter === f.id 
                                    ? 'bg-gray-900 text-white shadow-md' 
                                    : 'bg-white text-gray-500 border border-gray-100 hover:bg-gray-50'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ✅ NEW: COMPACT 2-COLUMN GRID LAYOUT */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredOrders.length === 0 && !loading ? (
                    <div className="col-span-full text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                        <Package className="mx-auto text-gray-200 mb-4" size={48} />
                        <p className="text-gray-400 font-bold text-sm">
                            {searchQuery || filter !== 'all' ? 'No orders match your filters.' : 'No orders found yet.'}
                        </p>
                    </div>
                ) : (
                    filteredOrders.map((order) => {
                        const dispute = getOrderDispute(order.id);
                        const hasDispute = !!dispute;
                        return (
                            <div key={order.id} className={`bg-white p-4 rounded-2xl border shadow-sm transition-all hover:shadow-md ${hasDispute ? 'border-red-200 ring-1 ring-red-100' : 'border-gray-100'}`}>
                                {/* Row 1: ID and Status */}
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className={`p-1.5 rounded-lg border ${getStatusStyle(order.status, hasDispute)}`}>
                                            {getStatusIcon(order.status, hasDispute)}
                                        </div>
                                        <span className="font-bold text-gray-900 text-xs">#{order.id.slice(-6).toUpperCase()}</span>
                                        {hasDispute && <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">DISPUTED</span>}
                                    </div>
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${getStatusStyle(order.status, hasDispute)}`}>
                                        {getStatusLabel(order.status, hasDispute)}
                                    </span>
                                </div>

                                {/* Row 2: Amount and Details */}
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <p className="text-sm font-extrabold text-gray-800">₦{order.totalAmount?.toLocaleString()}</p>
                                        <p className="text-[10px] text-gray-400 font-bold mt-0.5 truncate max-w-[120px]">{order.customerName || order.customerPhone || 'Customer'}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-gray-400 font-bold">
                                            {order.createdAt?.seconds ? new Date(order.createdAt.seconds * 1000).toLocaleDateString() : ''}
                                        </p>
                                        {order.trackingId && <p className="text-[9px] text-gray-300 font-mono truncate max-w-[100px]">{order.trackingId}</p>}
                                    </div>
                                </div>

                                {/* Row 3: Dispute quick action (if applicable) */}
                                {hasDispute && !dispute.vendorResponded && (
                                    <div className="mb-3 p-2 bg-red-50 rounded-lg border border-red-100 flex items-center justify-between gap-2">
                                        <p className="text-[10px] font-bold text-red-700 line-clamp-1">Issue: {dispute.description}</p>
                                        <button 
                                            onClick={() => openResponseModal(dispute)}
                                            className="shrink-0 text-[9px] font-bold text-white bg-red-600 px-2 py-1 rounded-lg hover:bg-red-700"
                                        >
                                            Respond
                                        </button>
                                    </div>
                                )}
                                {hasDispute && dispute.vendorResponded && (
                                    <div className="mb-3 p-2 bg-green-50 rounded-lg border border-green-100 flex items-center gap-1">
                                        <CheckCircle size={10} className="text-green-600 shrink-0" />
                                        <p className="text-[10px] font-bold text-green-700 line-clamp-1">Vendor Responded</p>
                                    </div>
                                )}

                                {/* Row 4: Actions */}
                                <div className="flex items-center gap-2">
                                    <a 
                                        href={`https://wa.me/${order.customerPhone?.replace(/\D/g, '')}`} 
                                        target="_blank" rel="noopener noreferrer"
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#25D366] hover:bg-[#20ba5a] text-white rounded-xl text-[10px] font-bold transition-all"
                                    >
                                        <MessageSquare size={12} /> Chat
                                    </a>
                                    
                                    {hasDispute ? (
                                        <div className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-[9px] font-bold ${getStatusStyle(order.status, true)}`}>
                                            <Flag size={10} /> Reviewing
                                        </div>
                                    ) : order.status === "PAID_HELD" ? (
                                        <button 
                                            onClick={() => openShippingForm(order.id)}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-[10px] font-bold transition-all"
                                        >
                                            <Truck size={12} /> Ship
                                        </button>
                                    ) : order.status === "SHIPPED" ? (
                                        <button 
                                            onClick={() => handleMarkAsCompleted(order.id)}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-[10px] font-bold transition-all"
                                        >
                                            <CheckCircle size={12} /> Delivered
                                        </button>
                                    ) : order.status === "COMPLETED" ? (
                                        <button 
                                            onClick={() => openDisputeForm(order)}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-red-600 hover:bg-red-50 border border-red-200 rounded-xl text-[10px] font-bold transition-all"
                                        >
                                            <Flag size={12} /> Issue
                                        </button>
                                    ) : (
                                        <div className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-[9px] font-bold ${getStatusStyle(order.status, false)}`}>
                                            <Info size={10} /> {order.status}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <DisputeResponseModal
                open={Boolean(responseModal)}
                orderId={responseModal?.orderId}
                title="Respond to buyer dispute"
                value={responseText}
                loading={responseLoading}
                error={responseError}
                onChange={setResponseText}
                onClose={closeResponseModal}
                onSubmit={handleRespondToDispute}
            />
        </div>
    );
}
