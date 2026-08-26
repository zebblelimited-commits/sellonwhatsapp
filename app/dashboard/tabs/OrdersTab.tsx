"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Package, Truck, CheckCircle, Clock, Info, X, Flag, AlertTriangle, MessageSquare, Search, Briefcase } from "lucide-react";
import DisputeResponseModal from "@/components/disputes/DisputeResponseModal";
import { showToast } from "@/lib/toast";
import { supportChatRequest } from "@/components/chat/chatApi";

type SellerOrder = {
    id: string;
    createdAt?: { toMillis?: () => number; seconds?: number } | null;
    status?: string;
    orderType?: "physical" | "service" | "booking";
    totalAmount?: number;
    customerName?: string;
    customerPhone?: string;
    buyerPhone?: string;
    phone?: string;
    trackingId?: string;
    buyerId?: string;
    [key: string]: any;
};
type SellerDispute = { id: string; orderId?: string; status?: string;[key: string]: any };

export default function OrdersTab({ disputes = [], onDisputeAction }: { disputes?: SellerDispute[]; onDisputeAction?: (action: string, dispute: SellerDispute) => void }) {
    const router = useRouter();
    const [orders, setOrders] = useState<SellerOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [listenerError, setListenerError] = useState("");
    const [shippingLoading, setShippingLoading] = useState(false);
    const [chatLoadingOrderId, setChatLoadingOrderId] = useState<string | null>(null);
    const [completionLoadingOrderId, setCompletionLoadingOrderId] = useState<string | null>(null);

    // Filter and Search State
    const [filter, setFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    // UI State for shipping form
    const [shippingForm, setShippingForm] = useState<{ orderId: string | null; trackingId: string; carrier: string }>({ orderId: null, trackingId: "", carrier: "Zebble Internal" });

    const [responseModal, setResponseModal] = useState<any>(null);
    const [responseText, setResponseText] = useState("");
    const [responseLoading, setResponseLoading] = useState(false);
    const [responseError, setResponseError] = useState("");

    useEffect(() => {
        let unsubscribeOrders = () => { };
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            unsubscribeOrders();
            if (!user) {
                setOrders([]);
                setLoading(false);
                setListenerError("Your seller session has expired. Please sign in again.");
                return;
            }

            setLoading(true);
            setListenerError("");
            const q = query(collection(db, "orders"), where("vendorId", "==", user.uid));
            unsubscribeOrders = onSnapshot(q, (snap) => {
                const data: SellerOrder[] = snap.docs.map(orderDoc => ({ id: orderDoc.id, ...orderDoc.data() }));
                data.sort((a, b) => {
                    const dateA = a.createdAt?.toMillis?.() || (a.createdAt?.seconds || 0) * 1000;
                    const dateB = b.createdAt?.toMillis?.() || (b.createdAt?.seconds || 0) * 1000;
                    return dateB - dateA;
                });
                setOrders(data);
                setLoading(false);
            }, (error) => {
                console.error("Seller orders listener error:", error);
                setOrders([]);
                setLoading(false);
                setListenerError("Orders could not be loaded. Check your seller permissions and try again.");
            });
        });

        return () => {
            unsubscribeAuth();
            unsubscribeOrders();
        };
    }, []);

    const generateInternalTracking = () => {
        const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `ZEB-${new Date().getFullYear()}-${randomStr}`;
    };

    const openShippingForm = (orderId: string) => {
        setShippingForm({
            orderId,
            trackingId: generateInternalTracking(),
            carrier: "Zebble Internal"
        });
    };

    const handleFinalizeShipping = async () => {
        if (!shippingForm.orderId || shippingLoading) return;
        setShippingLoading(true);
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("Your seller session has expired. Please sign in again.");
            const token = await user.getIdToken();
            const response = await fetch("/api/orders/ship", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    orderId: shippingForm.orderId,
                    trackingId: shippingForm.trackingId,
                    carrier: shippingForm.carrier,
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Failed to ship order");
            setShippingForm({ orderId: null, trackingId: "", carrier: "" });
            showToast("success", result.alreadyShipped ? "This order was already marked as shipped." : "Order marked as in transit.");
        } catch (error) {
            console.error("Error updating order:", error);
            showToast("error", error instanceof Error ? error.message : "Failed to update shipment.");
        } finally {
            setShippingLoading(false);
        }
    };

    const handleOpenBuyerChat = async (order: SellerOrder) => {
        if (!order.buyerId || chatLoadingOrderId) {
            if (!order.buyerId) showToast("error", "This order has no buyer account to chat with.");
            return;
        }

        setChatLoadingOrderId(order.id);
        try {
            await supportChatRequest("/api/chats", {
                participantId: order.buyerId,
                participantRole: "buyer",
                subject: `Order ${order.id}`,
            });
            showToast("success", "Buyer chat opened.");
            router.push("/dashboard?tab=chat");
        } catch (error) {
            console.error("Failed to open buyer chat:", error);
            showToast("error", error instanceof Error ? error.message : "Could not open buyer chat.");
        } finally {
            setChatLoadingOrderId(null);
        }
    };

    // Updated completion handler to support services
    const handleMarkAsCompleted = async (order: SellerOrder) => {
        if (completionLoadingOrderId) return;

        const isService = order.orderType === "service" || order.orderType === "booking";
        const promptMsg = isService
            ? "Mark service work as completed? The buyer will be notified to confirm and release escrow funds."
            : "Mark this order as delivered? The funds will be released to your available balance.";

        if (!confirm(promptMsg)) return;

        setCompletionLoadingOrderId(order.id);
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
                body: JSON.stringify({ orderId: order.id })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to complete order');

            showToast("success", isService ? 'Service marked as work completed!' : 'Order marked as completed!');
        } catch (error: any) {
            console.error(error);
            showToast("error", error.message || 'Failed to update order.');
        } finally {
            setCompletionLoadingOrderId(null);
        }
    };

    const openResponseModal = (dispute: SellerDispute) => {
        setResponseModal(dispute);
        setResponseText("");
        setResponseError("");
    };

    const closeResponseModal = () => {
        setResponseModal(null);
        setResponseText("");
        setResponseError("");
    };

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

    const getOrderDispute = (orderId: string) => {
        return disputes?.find(d => d.orderId === orderId && ['open', 'under_review'].includes(String(d.status || "").toLowerCase()));
    };

    // ✅ Map service and booking statuses into canonical UI statuses
    const canonicalStatus = (value: unknown): string => {
        const status = String(value || "").toUpperCase();
        if (["PAID", "HELD", "PAID_HELD"].includes(status)) return "PAID_HELD";
        if (["SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(status)) return "SHIPPED";
        if (["WORK_DONE", "COMPLETED_PENDING_BUYER"].includes(status)) return "WORK_DONE";
        if (["COMPLETED", "DELIVERED"].includes(status)) return "COMPLETED";
        return status;
    };

    const normalizedOrderStatus = (order: SellerOrder) => canonicalStatus(order.status);

    const filteredOrders = useMemo(() => {
        let result = orders;

        if (filter === 'escrow') result = result.filter(o => normalizedOrderStatus(o) === 'PAID_HELD');
        else if (filter === 'transit') result = result.filter(o => ['SHIPPED', 'WORK_DONE'].includes(normalizedOrderStatus(o)));
        else if (filter === 'completed') result = result.filter(o => normalizedOrderStatus(o) === 'COMPLETED');
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
    }, [orders, filter, searchQuery, disputes, getOrderDispute, normalizedOrderStatus]);

    const getStatusStyle = (status: unknown, hasDispute: boolean) => {
        status = canonicalStatus(status);
        if (hasDispute) return "bg-red-50 text-red-600 border-red-100";
        switch (status) {
            case "PAID_HELD": return "bg-orange-50 text-orange-600 border-orange-100";
            case "SHIPPED": return "bg-blue-50 text-blue-600 border-blue-100";
            case "WORK_DONE": return "bg-purple-50 text-purple-600 border-purple-100";
            case "COMPLETED": return "bg-green-50 text-green-600 border-green-100";
            case "DISPUTED": return "bg-red-50 text-red-600 border-red-100";
            default: return "bg-gray-50 text-gray-500 border-gray-100";
        }
    };

    const getStatusIcon = (status: unknown, hasDispute: boolean) => {
        status = canonicalStatus(status);
        if (hasDispute) return <AlertTriangle size={14} />;
        if (status === "PAID_HELD") return <Clock size={14} />;
        if (status === "SHIPPED") return <Truck size={14} />;
        if (status === "WORK_DONE") return <Briefcase size={14} />;
        if (status === "COMPLETED") return <CheckCircle size={14} />;
        return <Info size={14} />;
    };

    const getStatusLabel = (status: unknown, hasDispute: boolean) => {
        status = canonicalStatus(status);
        if (hasDispute) return "Disputed";
        if (status === "PAID_HELD") return "Escrow";
        if (status === "SHIPPED") return "In Transit";
        if (status === "WORK_DONE") return "Work Done";
        if (status === "COMPLETED") return "Completed";
        return canonicalStatus(status).replace("_", " ");
    };

    return (
        <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden animate-in fade-in duration-500 relative">
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
                                    onChange={(e) => setShippingForm({ ...shippingForm, carrier: e.target.value })}
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
                                    onChange={(e) => setShippingForm({ ...shippingForm, trackingId: e.target.value })}
                                />
                            </div>
                            <button
                                onClick={handleFinalizeShipping}
                                disabled={shippingLoading || !shippingForm.trackingId.trim() || !shippingForm.carrier.trim()}
                                className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-2xl font-bold text-sm shadow-lg shadow-green-100 transition-all active:scale-[0.98] mt-4"
                            >
                                {shippingLoading ? "Updating…" : "Confirm Shipment"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* FILTERS & SEARCH BAR */}
            {listenerError && <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-xs font-bold text-red-700">{listenerError}</div>}
            <div className="flex min-w-0 flex-col gap-3 sticky top-0 z-20 bg-[#fafafa] py-2 border-b border-gray-100 sm:-mx-2 sm:flex-row sm:px-2">
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
                        { id: 'transit', label: 'In Progress' },
                        { id: 'completed', label: 'Completed' },
                        { id: 'disputes', label: 'Disputes' }
                    ].map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id)}
                            className={`px-4 py-2.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all ${filter === f.id
                                    ? 'bg-gray-900 text-white shadow-md'
                                    : 'bg-white text-gray-500 border border-gray-100 hover:bg-gray-50'
                                }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* GRID LAYOUT */}
            <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-3 md:grid-cols-2">
                {loading ? (
                    <div className="col-span-full grid gap-3 md:grid-cols-2">
                        {[1, 2, 3, 4].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl bg-white border border-gray-100" />)}
                    </div>
                ) : filteredOrders.length === 0 ? (
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
                        const orderStatus = normalizedOrderStatus(order);
                        const isService = order.orderType === "service" || order.orderType === "booking";
                        const customerPhone = order.customerPhone || order.buyerPhone || order.phone || "";

                        return (
                            <div key={order.id} className={`min-w-0 max-w-full overflow-hidden bg-white p-4 rounded-2xl border shadow-sm transition-all hover:shadow-md ${hasDispute ? 'border-red-200 ring-1 ring-red-100' : 'border-gray-100'}`}>
                                {/* Row 1: ID, Type badge, and Status */}
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className={`p-1.5 rounded-lg border ${getStatusStyle(order.status, hasDispute)}`}>
                                            {getStatusIcon(order.status, hasDispute)}
                                        </div>
                                        <span className="font-bold text-gray-900 text-xs">#{order.id.slice(-6).toUpperCase()}</span>
                                        {isService && <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">SERVICE</span>}
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

                                {/* Row 3: Disputes */}
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

                                {/* Row 4: Dynamic Actions based on Service vs Physical */}
                                <div className="flex items-center gap-2">
                                    {customerPhone ? (
                                        <a
                                            href={`https://wa.me/${customerPhone.replace(/\D/g, '')}`}
                                            target="_blank" rel="noopener noreferrer"
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#25D366] hover:bg-[#20ba5a] text-white rounded-xl text-[10px] font-bold transition-all"
                                        >
                                            <MessageSquare size={12} /> WhatsApp
                                        </a>
                                    ) : (
                                        <button
                                            onClick={() => void handleOpenBuyerChat(order)}
                                            disabled={chatLoadingOrderId !== null}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#25D366] hover:bg-[#20ba5a] disabled:opacity-60 text-white rounded-xl text-[10px] font-bold transition-all"
                                        >
                                            <MessageSquare size={12} /> {chatLoadingOrderId === order.id ? "Opening…" : "Chat"}
                                        </button>
                                    )}

                                    {hasDispute ? (
                                        <div className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-[9px] font-bold ${getStatusStyle(order.status, true)}`}>
                                            <Flag size={10} /> Reviewing
                                        </div>
                                    ) : orderStatus === "PAID_HELD" ? (
                                        isService ? (
                                            <button
                                                onClick={() => handleMarkAsCompleted(order)}
                                                disabled={completionLoadingOrderId !== null}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white rounded-xl text-[10px] font-bold transition-all"
                                            >
                                                <Briefcase size={12} /> {completionLoadingOrderId === order.id ? "Updating…" : "Work Done"}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => openShippingForm(order.id)}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-[10px] font-bold transition-all"
                                            >
                                                <Truck size={12} /> Ship
                                            </button>
                                        )
                                    ) : ["SHIPPED", "OUT_FOR_DELIVERY", "WORK_DONE"].includes(orderStatus) ? (
                                        <button
                                            onClick={() => handleMarkAsCompleted(order)}
                                            disabled={completionLoadingOrderId !== null}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl text-[10px] font-bold transition-all"
                                        >
                                            <CheckCircle size={12} /> {completionLoadingOrderId === order.id ? "Updating…" : "Complete"}
                                        </button>
                                    ) : orderStatus === "COMPLETED" ? (
                                        <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-green-100 bg-green-50 text-green-700 text-[10px] font-bold">
                                            <CheckCircle size={12} /> Completed
                                        </div>
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