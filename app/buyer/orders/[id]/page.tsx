"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import {
    doc, onSnapshot, updateDoc, serverTimestamp,
    collection, addDoc
} from "firebase/firestore";
import {
    ArrowLeft, ShieldCheck, Package, CheckCircle2,
    AlertCircle, Truck, Flag, Loader2, ExternalLink
} from "lucide-react";
import Image from "next/image";
import OrderTimeline from "@/components/buyer/OrderTimeline";
import { useAuth } from "@/contexts/AuthContext"; // ✅ Added Auth Context

export default function OrderDetailsPage() {
    const { id } = useParams();
    const router = useRouter();
    const { user } = useAuth(); // ✅ Use context instead of auth.currentUser

    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [showDisputeModal, setShowDisputeModal] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [disputeReason, setDisputeReason] = useState("item_not_received");
    const [disputeDescription, setDisputeDescription] = useState("");

    useEffect(() => {
        if (!id) return;

        const unsub = onSnapshot(doc(db, "orders", id as string), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setOrder({
                    id: docSnap.id,
                    ...data,
                    createdAt: data.createdAt?.toDate?.() || (data.createdAt ? new Date(data.createdAt) : new Date()),
                    completedAt: data.completedAt?.toDate?.() || null,
                    disputedAt: data.disputedAt?.toDate?.() || null,
                    shippedAt: data.shippedAt?.toDate?.() || null
                });
            }
            setLoading(false);
        }, (error) => {
            console.error("Order fetch error:", error);
            setLoading(false);
        });

        return () => unsub();
    }, [id]);

    const handleConfirmReceipt = async () => {
        if (!user) {
            alert("Please log in to confirm receipt");
            return;
        }

        setProcessing(true);
        try {
            const idToken = await user.getIdToken();
            const response = await fetch("/api/orders/complete", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ orderId: id as string }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Failed to complete order");

            setShowConfirmModal(false);
            setShowSuccessModal(true);
        } catch (error: any) {
            console.error("Confirmation error:", error);
            alert(`❌ Failed to confirm: ${error.message || "Please try again."}`);
        } finally {
            setProcessing(false);
        }
    };

    const handleSubmitDispute = async () => {
        if (!user || !order) return;

        if (!disputeDescription.trim()) {
            alert("Please describe the issue");
            return;
        }

        setProcessing(true);
        try {
            const disputeRef = await addDoc(collection(db, "disputes"), {
                orderId: order.id,
                buyerId: user.uid,
                vendorId: order.vendorId,
                reason: disputeReason,
                description: disputeDescription,
                evidence: [],
                status: "open",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                read: false,
                vendorResponded: false,
                amount: order.totalAmount
            });

            const orderRef = doc(db, "orders", order.id);
            await updateDoc(orderRef, {
                status: "disputed", // ✅ Changed to lowercase to match OrderStatus.tsx
                disputedAt: serverTimestamp(),
                disputeId: disputeRef.id,
                disputeReason: disputeReason,
                disputeDescription: disputeDescription,
                updatedAt: serverTimestamp()
            });

            alert("✅ Dispute submitted. Our team will review shortly.");
            setShowDisputeModal(false);
            setDisputeDescription("");
        } catch (error: any) {
            console.error("Dispute error:", error);
            alert(`❌ Failed to submit dispute: ${error.message || "Please try again."}`);
        } finally {
            setProcessing(false);
        }
    };

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount || 0);

    const getStatusText = (status: string) => {
        const upperStatus = status?.toUpperCase();
        const texts: any = {
            PAID_HELD: "Payment secured in escrow",
            PENDING: "Payment secured in escrow",
            SHIPPED: "Order shipped - awaiting delivery",
            OUT_FOR_DELIVERY: "Order shipped - awaiting delivery",
            COMPLETED: "Order completed - funds released",
            DISPUTED: "Dispute under review",
            UNDER_REVIEW: "Dispute under review",
            CANCELLED: "Order cancelled"
        };
        return texts[upperStatus] || "Processing";
    };

    if (loading) return (
        <div className="p-10 text-center font-bold text-gray-400 flex items-center justify-center min-h-[60vh]">
            <Loader2 className="animate-spin mr-2" size={20} /> Loading Order...
        </div>
    );

    if (!order) return (
        <div className="p-10 text-center font-bold text-red-400">
            <AlertCircle className="mx-auto mb-2" size={32} />
            Order not found.
        </div>
    );

    // ✅ FIX: Normalize status to lowercase to prevent case-sensitivity bugs
    const status = order.status?.toLowerCase();
    const isShipped = status === "shipped" || status === "out_for_delivery";
    const isCompleted = status === "completed";
    const isDisputed = status === "disputed" || status === "under_review";

    const whatsappUrl = `https://wa.me/${order.vendorPhone?.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello ${order.storeName}, I have a question about order #${order.id?.slice(-6)}`)}`;

    return (
        <div className="max-w-2xl mx-auto p-4 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="font-black text-xl text-gray-900">Order Details</h1>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        #{order.id?.slice(-8).toUpperCase()}
                    </p>
                </div>
            </div>

            {/* Status Timeline */}
            <div className="bg-white rounded-[32px] border border-gray-100 p-6 mb-6 shadow-sm">
                <OrderTimeline
                    status={order.status}
                    createdAt={order.createdAt}
                    shippedAt={order.shippedAt}
                    completedAt={order.completedAt}
                />
            </div>

            {/* Escrow Shield Info */}
            <div className={`rounded-3xl p-5 mb-6 flex items-start gap-4 ${isDisputed ? "bg-red-50 border border-red-100" : "bg-green-50 border border-green-100"
                }`}>
                <div className={`p-2 rounded-xl ${isDisputed ? "bg-red-600" : "bg-green-600"} text-white`}>
                    {isDisputed ? <AlertCircle size={20} /> : <ShieldCheck size={20} />}
                </div>
                <div>
                    <h4 className={`font-bold text-sm ${isDisputed ? "text-red-900" : "text-green-900"}`}>
                        {isDisputed ? "Dispute Under Review" : "Zebble Protected Escrow"}
                    </h4>
                    <p className={`text-[11px] font-medium leading-relaxed ${isDisputed ? "text-red-700" : "text-green-700"}`}>
                        {isDisputed
                            ? `Your payment of ${formatCurrency(order.totalAmount)} is held securely while we review your dispute.`
                            : `Your payment of ${formatCurrency(order.totalAmount)} is held securely. Funds are only released after you confirm delivery.`
                        }
                    </p>
                    {isDisputed && order.disputeReason && (
                        <p className="text-[10px] text-red-600 mt-2 font-bold">
                            Reason: {order.disputeReason.replace('_', ' ')}
                        </p>
                    )}
                </div>
            </div>

            {/* Order Summary */}
            <div className="bg-white rounded-[32px] border border-gray-100 p-6 mb-6 shadow-sm">
                <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
                    <Package size={16} className="text-gray-400" /> Order Summary
                </h3>

                <div className="space-y-3 mb-4">
                    {order.items?.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                            <div>
                                <p className="text-xs font-bold text-gray-700">{item.name}</p>
                                <p className="text-[10px] text-gray-400">Qty: {item.quantity}</p>
                            </div>
                            <p className="text-xs font-black">{formatCurrency(item.price * item.quantity)}</p>
                        </div>
                    ))}
                </div>

                <div className="space-y-2 pt-4 border-t border-dashed border-gray-100">
                    <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Subtotal</span>
                        <span className="font-medium">{formatCurrency(order.totalAmount - (order.deliveryFee || 0))}</span>
                    </div>
                    {order.deliveryFee != null && order.deliveryFee > 0 && (
                        <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Delivery</span>
                            <span className="font-medium">{formatCurrency(order.deliveryFee)}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center pt-2">
                        <span className="text-sm font-black text-gray-900">Total Paid</span>
                        <span className="text-sm font-black text-green-600">{formatCurrency(order.totalAmount)}</span>
                    </div>
                </div>
            </div>

            {/* Tracking Info */}
            {isShipped && order.trackingId && (
                <div className="bg-blue-50 border border-blue-100 rounded-3xl p-5 mb-6">
                    <div className="flex items-start gap-3">
                        <Truck size={20} className="text-blue-600 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-bold text-blue-900 text-sm">Tracking Information</h4>
                            <p className="text-[11px] text-blue-700 mt-1">
                                <span className="font-bold">ID:</span> {order.trackingId}<br />
                                <span className="font-bold">Carrier:</span> {order.carrier || "Zebble Logistics"}
                            </p>
                            {order.trackingUrl && (
                                <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-blue-600 hover:underline">
                                    Track Package <ExternalLink size={10} />
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Dispute Banner */}
            {isDisputed && (
                <div className="bg-red-50 border border-red-100 rounded-3xl p-5 mb-6">
                    <div className="flex items-start gap-3">
                        <Flag size={20} className="text-red-600 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-bold text-red-900 text-sm">Dispute Details</h4>
                            <p className="text-[11px] text-red-700 mt-1">
                                <span className="font-bold">Reason:</span> {order.disputeReason?.replace('_', ' ')}<br />
                                <span className="font-bold">Description:</span> {order.disputeDescription}
                            </p>
                            {order.disputeVendorResponded && (
                                <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 px-2 py-1 rounded-full">
                                    <CheckCircle2 size={10} /> Vendor has responded
                                </div>
                            )}
                            <button onClick={() => router.push("/buyer/dashboard?tab=disputes")} className="mt-3 text-[10px] font-bold text-red-600 hover:underline">
                                View Full Dispute →
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Actions */}
            <div className="space-y-3 pt-6 border-t border-gray-100">
                {isShipped && !isDisputed && (
                    <button
                        onClick={() => setShowConfirmModal(true)}
                        disabled={processing}
                        className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-2xl font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2"
                    >
                        {processing ? <><Loader2 size={18} className="animate-spin" /> Processing...</> : <><CheckCircle2 size={18} /> Confirm Receipt & Release Funds</>}
                    </button>
                )}

                {!isDisputed && !isCompleted && (
                    <button
                        onClick={() => setShowDisputeModal(true)}
                        className="w-full py-4 bg-white border-2 border-red-200 text-red-600 rounded-2xl font-bold text-sm hover:bg-red-50 transition-all flex items-center justify-center gap-2"
                    >
                        <Flag size={18} /> Report an Issue
                    </button>
                )}

                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="w-full py-4 bg-[#25D366] hover:bg-[#20ba5a] text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all">
                    <Image src="/icons/whatsapplogo.svg" alt="WA" width={18} height={18} className="brightness-0 invert" />
                    Chat with Vendor
                </a>
            </div>

            {/* ✅ Dispute Modal (Kept only ONE instance) */}
            {showDisputeModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <Flag size={20} className="text-red-600" /> Report Issue
                            </h3>
                            <button onClick={() => setShowDisputeModal(false)} className="p-2 hover:bg-gray-100 rounded-full">
                                <ArrowLeft size={20} className="rotate-180" />
                            </button>
                        </div>

                        <p className="text-sm text-gray-500 mb-4">Describe the issue with your order. Funds remain held in escrow until resolved.</p>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-1 block">Reason</label>
                                <select
                                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500/20 outline-none"
                                    value={disputeReason}
                                    onChange={(e) => setDisputeReason(e.target.value)}
                                >
                                    <option value="item_not_received">Item Not Received</option>
                                    <option value="damaged">Item Damaged</option>
                                    <option value="wrong_item">Wrong Item Sent</option>
                                    <option value="not_as_described">Not As Described</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-1 block">Description</label>
                                <textarea
                                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500/20 outline-none min-h-[100px]"
                                    placeholder="Describe the issue in detail..."
                                    value={disputeDescription}
                                    onChange={(e) => setDisputeDescription(e.target.value)}
                                />
                            </div>

                            <button
                                onClick={handleSubmitDispute}
                                disabled={processing || !disputeDescription.trim()}
                                className="w-full py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
                            >
                                {processing ? <><Loader2 size={18} className="animate-spin" /> Submitting...</> : <><Flag size={18} /> Submit Dispute</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Order Receipt Confirmation Modal */}
            {showConfirmModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex flex-col items-center text-center">
                            <div className="p-4 bg-green-50 text-green-600 rounded-full mb-4">
                                <ShieldCheck size={32} />
                            </div>
                            <h3 className="text-lg font-black text-gray-900 mb-2">Confirm Order Receipt</h3>
                            <p className="text-xs font-medium text-gray-500 leading-relaxed mb-6">
                                Are you sure you have received your order in good condition? This action will immediately release funds to the vendor.
                            </p>
                            <div className="w-full flex flex-col gap-2">
                                <button
                                    onClick={handleConfirmReceipt}
                                    disabled={processing}
                                    className="w-full py-3.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                                >
                                    {processing ? <><Loader2 size={16} className="animate-spin" /> Releasing Funds...</> : "Yes, Release Funds"}
                                </button>
                                <button
                                    onClick={() => setShowConfirmModal(false)}
                                    disabled={processing}
                                    className="w-full py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl font-bold text-sm transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Alert Modal */}
            {showSuccessModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl text-center animate-in zoom-in-95 duration-200">
                        <div className="mx-auto w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mb-4">
                            <CheckCircle2 size={24} />
                        </div>
                        <h3 className="text-lg font-black text-gray-900 mb-2">Order Confirmed!</h3>
                        <p className="text-xs font-medium text-gray-500 leading-relaxed mb-6">
                            Funds have been successfully released to the vendor. Thank you for using Zebble Protected Escrow!
                        </p>
                        <button
                            onClick={() => setShowSuccessModal(false)}
                            className="w-full py-3.5 bg-gray-950 hover:bg-gray-900 text-white rounded-xl font-bold text-sm transition-colors shadow-sm"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
