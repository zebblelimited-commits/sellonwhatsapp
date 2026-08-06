"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase"; 
import { doc, onSnapshot, updateDoc } from "firebase/firestore"; 
import { onAuthStateChanged, User } from "firebase/auth";
import { CheckCircle2, Loader2, ArrowRight, ShieldCheck, ShoppingBag, CalendarCheck } from "lucide-react";

export default function SuccessPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    
    const orderReference = searchParams.get("reference") || searchParams.get("orderReference");

    const [status, setStatus] = useState("verifying");
    const [orderData, setOrderData] = useState<any>(null);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);

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
        if (authLoading) return; // Prevent premature execution with empty auth payload

        if (!orderReference) {
            setStatus("error");
            return;
        }

        // Listen for real-time order state updates
        const unsub = onSnapshot(doc(db, "orders", orderReference), async (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                
                // --- PATCH LOGIC START ---
                // If the document is missing the buyerId, patch it safely with attached auth header token
                if (currentUser && !data.buyerId) {
                    console.log("Fixing missing buyerId for Zebble order...");
                    try {
                        await updateDoc(doc(db, "orders", orderReference), {
                            buyerId: currentUser.uid
                        });
                    } catch (patchError) {
                        console.error("Auto-patching buyerId rules restriction fallback:", patchError);
                    }
                }
                // --- PATCH LOGIC END ---

                setOrderData(data);
                
                if (["PAID_HELD", "PAID", "COMPLETED", "SHIPPED"].includes(data.status)) {
                    setStatus("success");
                }
            } else {
                console.log("Waiting for order document...");
            }
        }, (error) => {
            console.error("Firestore Listen Error:", error);
            setStatus("error");
        });

        return () => unsub();
    }, [orderReference, authLoading, currentUser]);

    const isBooking = orderData?.isBooking === true;

    const handleViewDetails = () => {
        const targetPath = isBooking ? '/buyer/dashboard/bookings' : '/buyer/dashboard';
        router.push(targetPath);
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 font-plus-jakarta">
            <div className="max-w-[380px] w-full bg-white rounded-[20px] shadow-xl border border-slate-100 overflow-hidden">

                {status === "verifying" || authLoading ? (
                    <div className="p-8 text-center space-y-4">
                        <Loader2 className="h-10 w-10 text-green-600 animate-spin mx-auto" />
                        <h1 className="text-xl font-extrabold text-slate-900">Verifying...</h1>
                        <p className="text-slate-500 text-xs">Confirming transaction {orderReference?.slice(-6)}</p>
                    </div>
                ) : status === "error" ? (
                    <div className="p-8 text-center space-y-4">
                        <div className="h-12 w-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xl font-extrabold mx-auto">!</div>
                        <h1 className="text-xl font-extrabold text-slate-900">Issue Locating Order</h1>
                        <p className="text-slate-500 text-xs text-balance">We couldn't find order {orderReference}. If you were charged, please contact Zebble support.</p>
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
                                {isBooking ? "Your appointment is locked in" : "Held safely in Zebble Escrow"}
                            </p>
                        </div>

                        <div className="p-5 space-y-5">
                            <div className="flex justify-between items-center px-1">
                                <div className="text-left">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Paid</p>
                                    <p className="text-lg font-extrabold text-slate-900">₦{orderData?.totalAmount?.toLocaleString()}</p>
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
                                Zebble Technologies Limited
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}