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
    total?: number; // ✅ Added to support new multi-seller checkout field
    status?: string;
    buyerId?: string;
    slotId?: string;
    [key: string]: unknown;
};

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

    // 1. Sync and wait for Firebase Auth instance to hydrate session token
    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setAuthLoading(false);
        });
        return () => unsubscribeAuth();
    }, []);

    // 2. Establish Firestore Listener ONLY after authentication layer is verified active
    useEffect(() => {
        if (authLoading) return;
        if (!orderReference) return;

        // ✅ MULTI-SELLER FIX: Query by checkoutReference field instead of document ID
        const q = query(collection(db, "orders"), where("checkoutReference", "==", orderReference));

        const unsub = onSnapshot(q, async (querySnapshot) => {
            if (!querySnapshot.empty) {
                let allPaid = true;
                let totalAmount = 0;
                let firstOrderData: any = null;

                querySnapshot.forEach((docSnap) => {
                    const data = docSnap.data();

                    // ✅ FIX: Read 'total' (from new checkout API) or fallback to 'totalAmount'
                    totalAmount += Number(data.total ?? data.totalAmount ?? 0);

                    if (!["PAID_HELD", "PAID", "COMPLETED", "SHIPPED"].includes(String(data.status || "").toUpperCase())) {
                        allPaid = false;
                    }
                    if (!firstOrderData) firstOrderData = data;
                });

                // --- PATCH LOGIC START ---
                if (currentUser && firstOrderData && !firstOrderData.buyerId) {
                    console.log("Fixing missing buyerId for order session...");
                    try {
                        querySnapshot.forEach(async (d) => {
                            if (!d.data().buyerId) {
                                await updateDoc(d.ref, { buyerId: currentUser.uid });
                            }
                        });
                    } catch (patchError) {
                        console.error("Auto-patching buyerId rules restriction fallback:", patchError);
                    }
                }
                // --- PATCH LOGIC END ---

                const displayData = { ...firstOrderData, totalAmount };
                setOrderData(displayData as SuccessOrder);

                if (allPaid) {
                    paymentConfirmedRef.current = true;
                    setStatus("success");
                }
            } else {
                console.log("Waiting for order document(s)...");
            }
        }, (error) => {
            console.error("Firestore Listen Error:", error);
            if (!paymentConfirmedRef.current) setStatus("pending");
        });

        return () => unsub();
    }, [orderReference, authLoading, currentUser]);

    // 3. Webhooks & authenticated payment verification
    useEffect(() => {
        if (authLoading || !currentUser || !orderReference) return;
        let cancelled = false;
        const confirmPayment = async (): Promise<{ confirmed: boolean; pending: boolean }> => {
            const pendingTimer = window.setTimeout(() => {
                if (!cancelled) setStatus("pending");
            }, 10000);
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
                console.error("Payment verification fallback error:", error);
                return { confirmed: false, pending: true };
            } finally {
                window.clearTimeout(pendingTimer);
            }
        };
        if (!verificationRequestRef.current) verificationRequestRef.current = confirmPayment();
        void verificationRequestRef.current.then((result) => {
            if (cancelled) return;
            if (result.confirmed) {
                paymentConfirmedRef.current = true;
                setStatus("success");
            } else if (result.pending) {
                setStatus("pending");
            }
        });
        return () => {
            cancelled = true;
        };
    }, [authLoading, currentUser, orderReference]);

    // 4. AUTO-DISMISS & MOBILE DEEP LINKING HOOK
    useEffect(() => {
        if (status === "success" && orderReference) {
            const deepLinkUrl = `sowa://payment-success?orderRef=${orderReference}&reference=${orderReference}`;

            if (typeof window !== "undefined" && (window as unknown as { FlutterWebView?: { postMessage: (msg: string) => void } }).FlutterWebView) {
                (window as unknown as { FlutterWebView: { postMessage: (msg: string) => void } }).FlutterWebView.postMessage(
                    JSON.stringify({
                        status: "SUCCESS",
                        reference: orderReference,
                        orderRef: orderReference
                    })
                );
            }

            if (typeof window !== "undefined") {
                window.location.href = deepLinkUrl;
            }

            const deepLinkTimer = setTimeout(() => {
                if (typeof window !== "undefined") {
                    window.location.href = deepLinkUrl;
                }
            }, 800);

            const closeTimer = setTimeout(() => {
                if (typeof window !== "undefined") {
                    window.close();
                }
            }, 2500);

            return () => {
                clearTimeout(deepLinkTimer);
                clearTimeout(closeTimer);
            };
        }
    }, [status, orderReference]);

    const isBooking = orderData?.isBooking === true;
    const viewStatus = !orderReference ? "error" : status;

    const handleViewDetails = () => {
        const targetPath = isBooking ? '/buyer/dashboard/bookings' : '/buyer/dashboard';
        router.push(targetPath);
    };

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
                        <p className="text-slate-500 text-xs leading-relaxed">We are waiting for the payment provider to finish confirmation. Your order is safe and this page can be refreshed shortly.</p>
                        <button onClick={() => window.location.reload()} className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white">Check again</button>
                        <button onClick={() => router.push('/buyer/dashboard')} className="text-sm font-bold text-slate-500 underline">Go to dashboard</button>
                    </div>
                ) : viewStatus === "error" ? (
                    <div className="p-8 text-center space-y-4">
                        <div className="h-12 w-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xl font-extrabold mx-auto">!</div>
                        <h1 className="text-xl font-extrabold text-slate-900">Issue Locating Order</h1>
                        <p className="text-slate-500 text-xs text-balance">We couldn&apos;t find order {orderReference}. If you were charged, please contact support.</p>
                        <button onClick={() => router.push('/')} className="text-sm font-bold text-slate-900 underline">Go Back</button>
                    </div>
                ) : (
                    <>
                        <div className={`${isBooking ? "bg-indigo-600" : "bg-green-600"} p-6 text-center text-white relative`}>
                            {isBooking ? (
                                <CalendarCheck className="h-12 w-12 text-white mx-auto mb-2 animate-in zoom-in" />
                            ) : (
                                <CheckCircle2 className="h-12 w-12 text-white mx-auto mb-2 animate-in zoom-in" />
                            )}
                            <h1 className="text-xl font-extrabold tracking-tight">
                                {isBooking ? "Booking Confirmed" : "Payment Secured"}
                            </h1>
                            <p className="text-xs text-white/90 opacity-90">
                                {isBooking ? "Your appointment is locked in" : "Held safely in Escrow"}
                            </p>
                        </div>

                        <div className="p-5 space-y-5">
                            <div className="flex justify-between items-center px-1">
                                <div className="text-left">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Paid</p>
                                    {/* ✅ This will now correctly display the aggregated total */}
                                    <p className="text-lg font-extrabold text-slate-900">₦{(orderData?.totalAmount || 0).toLocaleString()}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ref</p>
                                    <p className="text-xs font-mono text-slate-600">#{orderReference?.split('_').pop()?.slice(-8)}</p>
                                </div>
                            </div>

                            {isBooking && orderData?.slotId && (
                                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl space-y-2">
                                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Appointment Details</p>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-slate-700">
                                            {(() => {
                                                const dateString = orderData?.slotId?.split('_')[0];
                                                return dateString ? new Date(dateString).toLocaleDateString('en-GB', {
                                                    weekday: 'long', day: 'numeric', month: 'short'
                                                }) : "N/A";
                                            })()}
                                        </span>
                                        <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-[10px] font-black">
                                            {orderData?.slotId?.split('_')[1]?.replace('-', ':') || "N/A"}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {!isBooking && (
                                <div className="bg-blue-50/80 border border-blue-100 p-3 rounded-xl flex items-start gap-3">
                                    <ShieldCheck className="text-blue-600 shrink-0 mt-0.5" size={16} />
                                    <p className="text-[10px] text-blue-800 leading-tight font-medium">
                                        Funds are locked. Release them only after you receive your items.
                                    </p>
                                </div>
                            )}

                            <a
                                href={deepLinkUrl}
                                className="w-full flex items-center justify-center gap-2 py-3.5 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition-all active:scale-[0.97]"
                            >
                                <Smartphone size={16} />
                                Return to Mobile App
                            </a>

                            <button
                                type="button"
                                onClick={handleViewDetails}
                                className="w-full flex items-center justify-center gap-2 py-3.5 bg-slate-900 hover:bg-black text-white text-sm font-bold rounded-xl transition-all active:scale-[0.97]"
                            >
                                <ShoppingBag size={16} />
                                {isBooking ? "View Booking Details" : "View Order Details"}
                            </button>

                            <button
                                type="button"
                                onClick={() => router.push('/')}
                                className="w-full flex items-center justify-center gap-1 text-slate-400 hover:text-slate-600 font-bold text-[11px] uppercase tracking-wide"
                            >
                                Return to Store <ArrowRight size={12} />
                            </button>
                        </div>

                        <div className="bg-slate-50 py-3 text-center border-t border-slate-100">
                            <p className="text-[9px] font-extrabold text-slate-400 tracking-[0.1em] uppercase">
                                Zebble Quantum Solutions LTD
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}