// app/payment/subscription-success/page.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, AlertCircle, Crown, ArrowRight } from "lucide-react";

export default function SubscriptionSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference") || "";
  const isMock = searchParams.get("mock") === "true";

  const [status, setStatus] = useState<"checking" | "active" | "failed" | "timeout">("checking");
  const [planName, setPlanName] = useState<string>("");
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Use a ref to track attempts across manual "Check Again" clicks cleanly
  const attemptsRef = useRef<number>(0);
  const maxAttempts = 15; // Increased slightly to give webhook processing more headroom

  useEffect(() => {
    if (!reference) {
      router.push("/dashboard");
      return;
    }

    let pollTimer: NodeJS.Timeout;

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/subscription/${reference}`);

        if (res.ok) {
          const data = await res.json();

          // Handle multiple payload shapes for maximum compatibility
          const subscription = data.subscription || data.data || data;

          if (subscription?.status === "active") {
            setPlanName(subscription.planName || "Pro Plan");
            if (subscription.expiryDate) {
              const expiry = new Date(subscription.expiryDate);
              setExpiryDate(expiry.toLocaleDateString('en-NG', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              }));
            }
            setStatus("active");
            // Redirect to dashboard after showing success animation
            setTimeout(() => router.push("/dashboard"), 2500);
            return;
          }

          // Handle explicit failed status
          if (subscription?.status === "failed") {
            setErrorMessage(subscription.failureReason || "Payment was declined");
            setStatus("failed");
            return;
          }
        } else if (res.status === 404) {
          // Document not active or created yet - keep polling cleanly
          console.log(`⏳ Subscription ${reference} verification is processing, retrying...`);
        }

        attemptsRef.current += 1;
        if (attemptsRef.current <maxAttempts) {
          pollTimer = setTimeout(checkStatus, 2000); // Poll every 2s
        } else {
          setStatus("timeout");
        }
      } catch (e: any) {
        console.error("Status poll error:", e);
        attemptsRef.current += 1;
        if (attemptsRef.current <maxAttempts) {
          pollTimer = setTimeout(checkStatus, 2000);
        } else {
          setStatus("failed");
          setErrorMessage(e.message || "Network error while verifying payment");
        }
      }
    };

    if (status === "checking") {
      checkStatus();
    }

    return () => {
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [reference, router, status]);

  // Handler to safely reset retry attempts when checking again manually
  const handleCheckAgain = () => {
    attemptsRef.current = 0;
    setStatus("checking");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center space-y-6">

        {/* ✅ Checking Status */}
        {status === "checking" && (
          <>
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
              <Loader2 size={32} className="animate-spin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Activating Subscription</h2>
              <p className="text-gray-500 text-sm mt-2">
                {isMock
                  ? "Mock mode: Simulating payment confirmation..."
                  : "Please wait while we confirm your payment and upgrade your plan..."
                }
              </p>
              <p className="text-[10px] text-gray-400 mt-1 font-mono">Ref: {reference.slice(0, 20)}...</p>
            </div>
          </>
        )}

        {/* ✅ Active - Success */}
        {status === "active" && (
          <>
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto animate-in zoom-in duration-300">
              <CheckCircle2 size={40} />
            </div>
            <div>
              <div className="flex items-center justify-center gap-2 mb-2">
                <Crown size={20} className="text-yellow-500 fill-yellow-500" />
                <h2 className="text-2xl font-bold text-gray-900">Welcome to {planName}! 🎉</h2>
              </div>
              <p className="text-gray-500 mt-2">Your subscription is now active.</p>
              {expiryDate && (
                <p className="text-sm text-green-600 font-medium mt-1">
                  Next renewal: {expiryDate}
                </p>
              )}
              <p className="text-gray-400 text-xs mt-3">Redirecting to your dashboard...</p>
            </div>
          </>
        )}

        {/* ✅ Timeout - Still Processing */}
        {status === "timeout" && (
          <>
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={32} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Payment Processing</h2>
              <p className="text-gray-500 text-sm mt-2">
                We're still confirming your payment with the bank. This usually takes 1-2 minutes.
              </p>
              <div className="mt-4 space-y-2">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="w-full px-6 py-2 bg-gray-900 text-white rounded-xl font-medium text-sm hover:bg-black transition-colors flex items-center justify-center gap-2"
                >
                  Go to Dashboard <ArrowRight size={14} />
                </button>
                <button
                  onClick={handleCheckAgain}
                  className="w-full px-6 py-2 border border-gray-200 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors"
                >
                  Check Again
                </button>
              </div>
            </div>
          </>
        )}

        {/* ✅ Failed - Error State */}
        {status === "failed" && (
          <>
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={32} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Payment Issue</h2>
              <p className="text-gray-500 text-sm mt-2">
                {errorMessage || "We couldn't verify your transaction."}
              </p>
              <div className="mt-4 space-y-2">
                <button
                  onClick={() => router.push("/pricing")}
                  className="w-full px-6 py-2 bg-gray-900 text-white rounded-xl font-medium text-sm hover:bg-black transition-colors"
                >
                  Try Another Plan
                </button>
                <button
                  onClick={() => router.push("/support")}
                  className="w-full px-6 py-2 border border-gray-200 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors"
                >
                  Contact Support
                </button>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}