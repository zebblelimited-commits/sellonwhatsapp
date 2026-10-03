"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Package, Truck, CheckCircle, Clock, Info, Flag, AlertTriangle, MessageSquare, Search, Briefcase, X, Hand } from "lucide-react";
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
    storeId?: string;
    courierId?: string;
    courierName?: string;
    shippingMethod?: string;
    trackingId?: string;
    buyerId?: string;
    checkoutReference?: string;
    orderReference?: string;
    orderNumber?: string;
    orderId?: string;
    productName?: string;
    productTitle?: string;
    productImage?: string;
    imageUrl?: string;
    image?: string;
    images?: string[];
    deliveryMode?: string;
    deliveryStatus?: string;
    fundsState?: string;
    [key: string]: any;
};
type SellerDispute = { id: string; orderId?: string; status?: string;[key: string]: any };

function firstOrderItem(order: SellerOrder) {
    return Array.isArray(order.items) && order.items.length > 0 ? order.items[0] : undefined;
}

function orderReference(order: SellerOrder) {
    return String(order.checkoutReference || order.orderReference || order.orderNumber || order.orderId || order.id);
}

function orderProductTitle(order: SellerOrder) {
    const item = firstOrderItem(order);
    return String(order.productName || order.productTitle || order.title || item?.name || item?.productName || item?.title || "Marketplace order");
}

function orderProductImage(order: SellerOrder) {
    const item = firstOrderItem(order);
    const itemImages = Array.isArray(item?.images) ? item.images : [];
    return String(order.productImage || order.imageUrl || order.image || order.images?.[0] || item?.image || item?.imageUrl || item?.thumbnail || itemImages[0] || "");
}

export default function OrdersTab({ disputes = [], onDisputeAction }: { disputes?: SellerDispute[]; onDisputeAction?: (action: string, dispute: SellerDispute) => void }) {
    const router = useRouter();
    const [orders, setOrders] = useState<SellerOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [listenerError, setListenerError] = useState("");
    const [chatLoadingOrderId, setChatLoadingOrderId] = useState<string | null>(null);
    const [completionLoadingOrderId, setCompletionLoadingOrderId] = useState<string | null>(null);
    const [handoverOrder, setHandoverOrder] = useState<SellerOrder | null>(null);
    const [handoverLoadingOrderId, setHandoverLoadingOrderId] = useState<string | null>(null);
    const [handoverError, setHandoverError] = useState("");

    // Filter and Search State
    const [filter, setFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

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
            const ordersBySource = new Map<string, Map<string, SellerOrder>>();
            const publishOrders = () => {
                const merged = new Map<string, SellerOrder>();
                ordersBySource.forEach((sourceOrders) => {
                    sourceOrders.forEach((order, orderId) => merged.set(orderId, order));
                });
                const data = Array.from(merged.values());
                data.sort((a, b) => {
                    const dateA = a.createdAt?.toMillis?.() || (a.createdAt?.seconds || 0) * 1000;
                    const dateB = b.createdAt?.toMillis?.() || (b.createdAt?.seconds || 0) * 1000;
                    return dateB - dateA;
                });
                setOrders(data);
                setLoading(false);
            };

            const unsubscribeOrderSources = (["storeId", "vendorId"] as const).map((ownerField) => {
                const sourceOrders = new Map<string, SellerOrder>();
                ordersBySource.set(ownerField, sourceOrders);
                const ordersQuery = query(collection(db, "orders"), where(ownerField, "==", user.uid));
                return onSnapshot(ordersQuery, (snap) => {
                    sourceOrders.clear();
                    snap.docs.forEach((orderDoc) => {
                        sourceOrders.set(orderDoc.id, { id: orderDoc.id, ...orderDoc.data() });
                    });
                    publishOrders();
                }, (error) => {
                    console.error(`Seller orders listener error (${ownerField}):`, error);
                    setLoading(false);
                    setListenerError("Orders could not be loaded. Check your seller permissions and try again.");
                });
            });
            unsubscribeOrders = () => unsubscribeOrderSources.forEach((unsubscribe) => unsubscribe());
        });

        return () => {
            unsubscribeAuth();
            unsubscribeOrders();
        };
    }, []);

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

    const handleConfirmHandover = async () => {
        if (!handoverOrder || handoverLoadingOrderId) return;

        setHandoverLoadingOrderId(handoverOrder.id);
        setHandoverError("");

        try {
            const user = auth.currentUser;
            if (!user) throw new Error("Your seller session has expired. Please sign in again.");

            const idToken = await user.getIdToken();
            const response = await fetch("/api/orders/ship", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ orderId: handoverOrder.id, carrier: "self_arranged" }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || "Could not confirm handover.");

            setOrders((currentOrders) => currentOrders.map((order) => (
                order.id === handoverOrder.id
                    ? {
                        ...order,
                        status: data.status || "SHIPPED",
                        deliveryStatus: "IN_TRANSIT",
                        handoverMethod: "self_arranged",
                    }
                    : order
            )));
            setHandoverOrder(null);
            showToast("success", "Handover confirmed. The buyer can now track the order as in transit.");
        } catch (error) {
            console.error("Failed to confirm order handover:", error);
            const message = error instanceof Error ? error.message : "Could not confirm handover.";
            setHandoverError(message);
        } finally {
            setHandoverLoadingOrderId(null);
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
                orderReference(o).toLowerCase().includes(q) ||
                orderProductTitle(o).toLowerCase().includes(q) ||
                o.customerName?.toLowerCase().includes(q) ||
                o.customerPhone?.includes(q) ||
                (o.totalAmount ?? o.total)?.toString().includes(q) ||
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

    const isPaymentHeld = (order: SellerOrder, orderStatus: string) => {
        const fundsState = String(order.fundsState || "").toLowerCase();
        return fundsState === "held" || ["PAID_HELD", "SHIPPED", "WORK_DONE"].includes(orderStatus);
    };

    const isSelfArranged = (order: SellerOrder) =>
        String(order.shippingMethod || "").toLowerCase() === "self_arranged" ||
        String(order.deliveryMode || "").toLowerCase() === "self_arranged";

    const getDisplayStatusLabel = (order: SellerOrder, orderStatus: string, hasDispute: boolean) => {
        if (hasDispute) return "Disputed";
        if (isSelfArranged(order) && orderStatus === "PAID_HELD" && isPaymentHeld(order, orderStatus)) return "Ready for handover";
        if (orderStatus === "PAID_HELD") return "Escrow Held";
        return getStatusLabel(order.status, false);
    };

    return (
        <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden animate-in fade-in duration-500 relative">
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
                        const selfArranged = isSelfArranged(order);
                        const paymentHeld = isPaymentHeld(order, orderStatus);
                        const readyForHandover = selfArranged && paymentHeld && orderStatus === "PAID_HELD";
                        const productTitle = orderProductTitle(order);
                        const productImage = orderProductImage(order);
                        const customerPhone = order.customerPhone || order.buyerPhone || order.phone || "";

                        return (
                            <div key={order.id} className={`min-w-0 max-w-full overflow-hidden bg-white p-4 rounded-2xl border shadow-sm transition-all hover:shadow-md ${hasDispute ? 'border-red-200 ring-1 ring-red-100' : 'border-gray-100'}`}>
                                {/* Row 1: ID, Type badge, and Status */}
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <div className={`p-1.5 rounded-lg border ${getStatusStyle(order.status, hasDispute)}`}>
                                            {getStatusIcon(order.status, hasDispute)}
                                        </div>
                                        <span className="min-w-0 break-all font-bold text-gray-900 text-xs" title={orderReference(order)}>#{orderReference(order)}</span>
                                        {isService && <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">SERVICE</span>}
                                        {hasDispute && <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">DISPUTED</span>}
                                    </div>
                                    <span className={`shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${getStatusStyle(readyForHandover ? "PAID_HELD" : order.status, hasDispute)}`}>
                                        {getDisplayStatusLabel(order, orderStatus, hasDispute)}
                                    </span>
                                </div>

                                {/* Product summary */}
                                <div className="mb-3 flex min-w-0 items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-2.5">
                                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-white">
                                        {productImage ? (
                                            <img src={productImage} alt={productTitle} className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-gray-300"><Package size={20} /></div>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-extrabold text-gray-900" title={productTitle}>{productTitle}</p>
                                        <p className="mt-1 break-all text-[10px] font-bold text-gray-400">Order reference: {orderReference(order)}</p>
                                    </div>
                                </div>

                                {/* Amount and Details */}
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <p className="text-sm font-extrabold text-gray-800">₦{(order.totalAmount ?? order.total ?? 0).toLocaleString()}</p>
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
                                        ) : selfArranged ? (
                                            <button
                                                onClick={() => { setHandoverError(""); setHandoverOrder(order); }}
                                                disabled={handoverLoadingOrderId !== null}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl text-[10px] font-bold transition-all"
                                            >
                                                <Hand size={12} /> Confirm Handover
                                            </button>
                                        ) : (
                                            <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-blue-100 bg-blue-50 text-blue-700 text-[10px] font-bold">
                                                <Truck size={12} /> {order.courierName || order.shippingMethod || "Courier processing"}
                                            </div>
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

            {handoverOrder && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !handoverLoadingOrderId) setHandoverOrder(null); }}>
                    <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="confirm-handover-title">
                        <div className="mb-4 flex items-start justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-green-600">Seller action</p>
                                <h2 id="confirm-handover-title" className="mt-1 text-lg font-extrabold text-gray-900">Confirm Handover</h2>
                            </div>
                            <button type="button" onClick={() => setHandoverOrder(null)} disabled={Boolean(handoverLoadingOrderId)} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50" aria-label="Close confirmation dialog">
                                <X size={18} />
                            </button>
                        </div>
                        <p className="text-sm leading-6 text-gray-600">Confirm that this order has been handed over or released for delivery. The buyer will see it as in transit and can confirm delivery when it arrives.</p>
                        <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-3">
                            <p className="truncate text-xs font-extrabold text-gray-900">{orderProductTitle(handoverOrder)}</p>
                            <p className="mt-1 break-all text-[10px] font-bold text-gray-400">Reference: {orderReference(handoverOrder)}</p>
                        </div>
                        {handoverError && <p className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-bold text-red-700">{handoverError}</p>}
                        <div className="mt-5 flex gap-2">
                            <button type="button" onClick={() => setHandoverOrder(null)} disabled={Boolean(handoverLoadingOrderId)} className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                            <button type="button" onClick={() => void handleConfirmHandover()} disabled={handoverLoadingOrderId === handoverOrder.id} className="flex-1 rounded-xl bg-green-600 px-4 py-3 text-xs font-bold text-white hover:bg-green-700 disabled:cursor-wait disabled:opacity-60">
                                {handoverLoadingOrderId === handoverOrder.id ? "Confirming…" : "Confirm Handover"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
