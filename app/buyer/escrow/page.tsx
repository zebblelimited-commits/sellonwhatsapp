"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    updateDoc,
    addDoc
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import OrderStatus from "@/components/OrderStatus";
import { showToast } from "@/lib/toast";

interface EscrowOrder {
    id: string;
    orderId: string;
    buyerId: string;
    vendorId: string;
    amount: number;
    currency: string;
    status: "held" | "released" | "disputed" | "refunded";
    products: any[];
    createdAt: any;
    releasedAt?: any;
    disputeReason?: string;
}

export default function EscrowPage() {
    const { user, loading: authLoading } = useAuth();
    const [escrowOrders, setEscrowOrders] = useState<EscrowOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [showDisputeModal, setShowDisputeModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<EscrowOrder | null>(null);
    const [disputeReason, setDisputeReason] = useState("");

    useEffect(() => {
        async function loadEscrowOrders() {
            if (!user || authLoading) return;
            try {
                setLoading(true);
                const q = query(
                    collection(db, "escrow"),
                    where("buyerId", "==", user.uid),
                    where("status", "in", ["held", "disputed"])
                );
                const snapshot = await getDocs(q);
                const orders = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...(doc.data() as any), // Cast to any to prevent spread TS errors
                })) as EscrowOrder[];
                setEscrowOrders(orders);
            } catch (error: any) {
                console.error("Error loading escrow orders:", error);
            } finally {
                setLoading(false);
            }
        }
        loadEscrowOrders();
    }, [user, authLoading]);

    const handleReleaseFunds = async (orderId: string, escrowId: string) => {
        if (!confirm("Confirm you have received the order and want to release payment to the vendor?")) {
            return;
        }
        try {
            setActionLoading(orderId);
            if (!user) throw new Error("Please sign in again");
            const idToken = await user.getIdToken();
            const response = await fetch("/api/orders/complete", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ orderId }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Failed to release funds");

            showToast("success", "Funds released successfully! The vendor will receive payment shortly.");

            // Refresh list
            setEscrowOrders(prev => prev.filter(o => o.id !== escrowId));
        } catch (error: any) {
            console.error("Error releasing funds:", error);
            showToast("error", "Failed to release funds. Please try again.");
        } finally {
            setActionLoading(null);
        }
    };

    const handleInitiateDispute = async () => {
        if (!selectedOrder || !disputeReason.trim()) {
            showToast("error", "Please provide a reason for the dispute");
            return;
        }
        try {
            setActionLoading(selectedOrder.orderId);

            const escrowRef = doc(db, "escrow", selectedOrder.id);
            await updateDoc(escrowRef, {
                status: "disputed",
                disputeReason,
                disputedAt: new Date(),
                disputedBy: user?.uid,
            });

            // Update order status
            const orderRef = doc(db, "orders", selectedOrder.orderId);
            await updateDoc(orderRef, {
                status: "disputed",
                disputeReason,
                disputedAt: new Date(),
            });

            // Create dispute record (Cleaned up from dynamic import)
            await addDoc(collection(db, "disputes"), {
                orderId: selectedOrder.orderId,
                escrowId: selectedOrder.id,
                buyerId: user?.uid,
                vendorId: selectedOrder.vendorId,
                reason: disputeReason,
                status: "open",
                createdAt: new Date(),
            });

            showToast("success", "Dispute initiated successfully. Our team will review and contact you within 48 hours.");
            setShowDisputeModal(false);
            setDisputeReason("");
            setSelectedOrder(null);

            // Refresh list
            setEscrowOrders(prev => prev.filter(o => o.id !== selectedOrder.id));
        } catch (error: any) {
            console.error("Error initiating dispute:", error);
            showToast("error", "Failed to initiate dispute. Please try again.");
        } finally {
            setActionLoading(null);
        }
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Payment Escrow</h1>
                    <p className="text-gray-600 mt-2">
                        Manage held payments for your orders. Release funds when you receive your items.
                    </p>
                </div>

                {/* Info Banner */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-blue-800">How Escrow Works</h3>
                            <div className="mt-2 text-sm text-blue-700">
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Your payment is held securely until you confirm receipt</li>
                                    <li>Release funds when you're satisfied with your order</li>
                                    <li>Initiate a dispute if there's an issue with your order</li>
                                    <li>Funds are automatically released after 7 days if no action is taken</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Escrow Orders List */}
                {escrowOrders.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-lg shadow">
                        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <h3 className="mt-2 text-sm font-medium text-gray-900">No held payments</h3>
                        <p className="mt-1 text-sm text-gray-500">
                            You don't have any orders with held payments at the moment.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {escrowOrders.map((order) => (
                            <div key={order.id} className="bg-white rounded-lg shadow p-6">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center space-x-3">
                                            <h3 className="text-lg font-semibold text-gray-900">Order #{order.orderId}</h3>
                                            <OrderStatus status={order.status} />
                                        </div>

                                        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div>
                                                <p className="text-sm text-gray-500">Amount Held</p>
                                                <p className="text-lg font-semibold text-gray-900">
                                                    ₦{order.amount.toLocaleString()}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">Date Ordered</p>
                                                <p className="text-sm font-medium text-gray-900">
                                                    {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'N/A'}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">Products</p>
                                                <p className="text-sm font-medium text-gray-900">
                                                    {order.products?.length || 0} item(s)
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">Status</p>
                                                <p className={`text-sm font-medium ${order.status === "held" ? "text-yellow-600" : "text-red-600"
                                                    }`}>
                                                    {order.status.toUpperCase()}
                                                </p>
                                            </div>
                                        </div>

                                        {order.products && order.products.length > 0 && (
                                            <div className="mt-4">
                                                <p className="text-sm font-medium text-gray-700 mb-2">Products:</p>
                                                <ul className="text-sm text-gray-600 space-y-1">
                                                    {order.products.slice(0, 3).map((product: any, idx: number) => (
                                                        <li key={idx}>• {product.name || "Product"}</li>
                                                    ))}
                                                    {order.products.length > 3 && (
                                                        <li className="text-gray-500">+{order.products.length - 3} more items</li>
                                                    )}
                                                </ul>
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="ml-6 flex flex-col space-y-2">
                                        {order.status === "held" && (
                                            <>
                                                <button
                                                    onClick={() => handleReleaseFunds(order.orderId, order.id)}
                                                    disabled={actionLoading === order.orderId}
                                                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {actionLoading === order.orderId ? "Processing..." : "Release Funds"}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setSelectedOrder(order);
                                                        setShowDisputeModal(true);
                                                    }}
                                                    disabled={actionLoading === order.orderId}
                                                    className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Initiate Dispute
                                                </button>
                                            </>
                                        )}
                                        {order.status === "disputed" && (
                                            <span className="px-4 py-2 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-md text-center">
                                                Under Review
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Dispute Modal */}
                {showDisputeModal && selectedOrder && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Initiate Dispute</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Please describe the issue with your order. Our support team will review and contact you within 48 hours.
                            </p>

                            <textarea
                                value={disputeReason}
                                onChange={(e) => setDisputeReason(e.target.value)}
                                placeholder="Describe the issue (e.g., item not received, damaged item, wrong item...)"
                                className="w-full border border-gray-300 rounded-md p-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                rows={4}
                            />

                            <div className="mt-4 flex justify-end space-x-3">
                                <button
                                    onClick={() => {
                                        setShowDisputeModal(false);
                                        setDisputeReason("");
                                        setSelectedOrder(null);
                                    }}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleInitiateDispute}
                                    disabled={!disputeReason.trim() || actionLoading === selectedOrder.orderId}
                                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {actionLoading === selectedOrder.orderId ? "Submitting..." : "Submit Dispute"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
