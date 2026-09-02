"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { collection, query, where, onSnapshot, updateDoc } from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { CheckCircle2, Loader2, ArrowRight, ShieldCheck, ShoppingBag, CalendarCheck, Smartphone } from "lucide-react";

type SuccessOrder = {
    isBooking?: boolean;
    totalAmount?: number;
    total?: number;
    status?: string;
    buyerId?: string;
    slotId?: string;
    [key: string]: unknown;
};

function amountOf(...values: unknown[]): number {
    for (const value of values) {
        const parsed = typeof value === "string"
            ? Number(value.replace(/[^\d.-]/g, ""))
            : Number(value);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 0;
}

export default function SuccessPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const orderReference = searchParams.get("reference") || searchParams.get("orderReference") || searchParams.get("orderRef");

    const [status, setStatus] = useState("verifying");
    const [orderData, setOrderData] = useState<SuccessOrder | null>(null);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const paymentConfirmedRef = useRef(false);
    const verificationRequestRef = useRef<Promise<{ confirmed: boolean; pending: boolean }> | null>(null);

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setAuthLoading(false);
        });
        return () => unsubscribeAuth();
    }, []);

    useEffect(() => {
        if (authLoading) return;
        if (!orderReference) return;

        const q = query(collection(db, "orders"), where("checkoutReference", "==", orderReference));

        const unsub = onSnapshot(q, async (querySnapshot) => {
            if (!querySnapshot.empty) {
                let allPaid = true;
                let totalAmount = 0;
                const firstOrderData = querySnapshot.docs[0].data() as Record<string, unknown>;

                querySnapshot.forEach((docSnap) => {
                    const data = docSnap.data() as Record<string, unknown>;
                    // Some older payment/webhook writes leave `total` as zero
                    // while the real amount is in totalAmount/amount. Ignore
                    // zero placeholders so the success screen cannot show ₦0
                    // for a successfully paid order.
                    totalAmount += amountOf(
                        data.total,
                        data.totalAmount,
                        data.amount,
                        data.escrowAmount,
                        data.productSubtotal,
                    );

                    if (!["PAID_HELD", "PAID", "COMPLETED", "SHIPPED"].includes(String(data.status || "").toUpperCase())) {
                        allPaid = false;
                    }
                });

                if (currentUser && !firstOrderData.buyerId) {
                    try {
                        querySnapshot.forEach(async (d) => {
                            if (!d.data().buyerId) await updateDoc(d.ref, { buyerId: currentUser.uid });
                        });
                    } catch (patchError) { console.error("Auto-patching buyerId failed:", patchError); }
                }

                const displayData = { ...firstOrderData, totalAmount };
                setOrderData(displayData as SuccessOrder);

                if (allPaid) {
                    paymentConfirmedRef.current = true;
                    setStatus("success");
                }
            }
        }, (error) => {
            console.error("Firestore Listen Error:", error);
            if (!paymentConfirmedRef.current) setStatus("pending");
        });

        return () => unsub();
    }, [orderReference, authLoading, currentUser]);

    useEffect(() => {
        if (authLoading || !currentUser || !orderReference) return;
        let cancelled = false;
        const confirmPayment = async (): Promise<{ confirmed: boolean; pending: boolean }> => {
            const pendingTimer = window.setTimeout(() => { if (!cancelled) setStatus("pending"); }, 10000);
            try {
                const token = await currentUser.getIdToken();
                const response = await fetch("/api/orders/confirm-payment", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ orderReference }),
                });
                const result = await response.json().catch(() => ({}));
                return { confirmed: result.confirmed === true, pending: response.status === 202 };
            } catch (error) {
                if (error instanceof DOMException && error.name === "AbortError") return { confirmed: false, pending: true };
                return { confirmed: false, pending: true };
            } finally { window.clearTimeout(pendingTimer); }
        };
        if (!verificationRequestRef.current) verificationRequestRef.current = confirmPayment();
        void verificationRequestRef.current.then((result) => {
            if (cancelled) return;
            if (result.confirmed) { paymentConfirmedRef.current = true; setStatus("success"); }
            else if (result.pending) { setStatus("pending"); }
        });
        return () => { cancelled = true; };
    }, [authLoading, currentUser, orderReference]);

    useEffect(() => {
        if (status === "success" && orderData && orderReference) {
            const deepLinkUrl = `sowa://payment-success?orderRef=${orderReference}&reference=${orderReference}`;
            if (typeof window !== "undefined") window.location.href = deepLinkUrl;
            const closeTimer = setTimeout(() => { if (typeof window !== "undefined") window.close(); }, 2500);
            return () => { clearTimeout(closeTimer); };
        }
    }, [status, orderData, orderReference]);

    const isBooking = orderData?.isBooking === true;
    // The verification request can finish before the Firestore listener has
    // loaded the order. Keep showing verification until totals are available
    // instead of rendering the numeric fallback as a misleading ₦0.
    const viewStatus = !orderReference
        ? "error"
        : status === "success" && !orderData
            ? "verifying"
            : status;
    const handleViewDetails = () => router.push(isBooking ? '/buyer/dashboard/bookings' : '/buyer/dashboard');
    const deepLinkUrl = `sowa://payment-success?orderRef=${orderReference}&reference=${orderReference}`;

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 font-plus-jakarta">
            <div className="max-w-[380px] w-full bg-white rounded-[20px] shadow-xl border border-slate-100 overflow-hidden">
                {viewStatus === "verifying" || authLoading ? (
                    <div className="p-8 text-center space-y-4">
                        <Loader2 className="h-10 w-10 text-green-600 animate-spin mx-auto" />
                        <h1 className="text-xl font-extrabold text-slate-900">Verifying...</h1>
                        <p className="text-slate-500 text-xs">Confirming transaction {orderReference?.slice(-6)}</p>
                    </div>
                ) : viewStatus === "pending" ? (
                    <div className="p-8 text-center space-y-4">
                        <Loader2 className="h-10 w-10 text-amber-500 animate-spin mx-auto" />
                        <h1 className="text-xl font-extrabold text-slate-900">Payment received</h1>
                        <p className="text-slate-500 text-xs leading-relaxed">We are waiting for the payment provider to finish confirmation.</p>
                        <button onClick={() => window.location.reload()} className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white">Check again</button>
                    </div>
                ) : viewStatus === "error" ? (
                    <div className="p-8 text-center space-y-4">
                        <div className="h-12 w-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xl font-extrabold mx-auto">!</div>
                        <h1 className="text-xl font-extrabold text-slate-900">Issue Locating Order</h1>
                        <p className="text-slate-500 text-xs">We couldn&apos;t find order {orderReference}.</p>
                        <button onClick={() => router.push('/')} className="text-sm font-bold text-slate-900 underline">Go Back</button>
                    </div>
                ) : (
                    <>
                        <div className={`${isBooking ? "bg-indigo-600" : "bg-green-600"} p-6 text-center text-white relative`}>
                            {isBooking ? <CalendarCheck className="h-12 w-12 text-white mx-auto mb-2" /> : <CheckCircle2 className="h-12 w-12 text-white mx-auto mb-2" />}
                            <h1 className="text-xl font-extrabold tracking-tight">{isBooking ? "Booking Confirmed" : "Payment Secured"}</h1>
                            <p className="text-xs text-white/90 opacity-90">{isBooking ? "Your appointment is locked in" : "Held safely in Escrow"}</p>
                        </div>
                        <div className="p-5 space-y-5">
                            <div className="flex justify-between items-center px-1">
                                <div className="text-left">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Paid</p>
                                    {/* ✅ FIX: Safely display the aggregated total */}
                                    <p className="text-lg font-extrabold text-slate-900">₦{(orderData?.totalAmount || 0).toLocaleString()}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ref</p>
                                    <p className="text-xs font-mono text-slate-600">#{orderReference?.split('_').pop()?.slice(-8)}</p>
                                </div>
                            </div>
                            {!isBooking && (
                                <div className="bg-blue-50/80 border border-blue-100 p-3 rounded-xl flex items-start gap-3">
                                    <ShieldCheck className="text-blue-600 shrink-0 mt-0.5" size={16} />
                                    <p className="text-[10px] text-blue-800 leading-tight font-medium">Funds are locked. Release them only after you receive your items.</p>
                                </div>
                            )}
                            <button type="button" onClick={handleViewDetails} className="w-full flex items-center justify-center gap-2 py-3.5 bg-slate-900 hover:bg-black text-white text-sm font-bold rounded-xl transition-all">
                                <ShoppingBag size={16} /> {isBooking ? "View Booking Details" : "View Order Details"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
