// app/api/cron/subscriptions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import admin from "firebase-admin";
import { sendRenewalReminderEmail, sendSubscriptionConfirmationEmail, sendSubscriptionPaymentFailedEmail } from "@/lib/email/events";

export const runtime = "nodejs";

// ✅ Helper to fetch Nomba Access Token for charging saved payment tokens
async function getNombaToken() {
    const nombaOrigin = process.env.NOMBA_SANDBOX_URL || "https://api.nomba.com";
    const response = await fetch(`${nombaOrigin}/v1/auth/token/issue`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            accountId: process.env.NOMBA_ACCOUNT_ID!,
        },
        body: JSON.stringify({
            grant_type: "client_credentials",
            client_id: process.env.NOMBA_CLIENT_ID,
            client_secret: process.env.NOMBA_CLIENT_SECRET,
        }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result?.description || "Nomba auth failed");
    return result?.data?.access_token;
}

// ✅ Charge saved payment token via Nomba API
async function chargeSavedToken(token: string, amount: number, customerEmail: string, reference: string) {
    const nombaOrigin = process.env.NOMBA_SANDBOX_URL || "https://api.nomba.com";
    const nombaToken = await getNombaToken();

    const response = await fetch(`${nombaOrigin}/v1/checkout/token/charge`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${nombaToken}`,
            accountId: process.env.NOMBA_ACCOUNT_ID!,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            token,
            amount: amount.toFixed(2),
            currency: "NGN",
            orderReference: reference,
            customerEmail,
        }),
    });

    const result = await response.json();
    return response.ok && (result?.code === "00" || result?.status === "SUCCESS");
}

export async function GET(req: NextRequest) {
    // 🔒 Security: Validate Cron Secret to prevent unauthorized public execution
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
    }

    const now = new Date();
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    let processedSubs = 0;
    let renewedSubs = 0;
    let gracePeriodSubs = 0;
    let processedBoosts = 0;

    try {
        console.log("⏰ [CRON START] Running Subscription & Boost Renewal Check...");

        // =========================================================================
        // 1. RENEW / GRACE PERIOD CHECK FOR ACTIVE SUBSCRIPTIONS
        // =========================================================================
        const expiringSubsSnap = await adminDb
            .collection("subscriptions")
            .where("status", "==", "active")
            .where("expiryDate", "<=", next24Hours.toISOString())
            .get();

        for (const subDoc of expiringSubsSnap.docs) {
            processedSubs++;
        const sub = subDoc.data();
        const userId = sub.userId;
        const userSnap = await adminDb.collection("users").doc(userId).get();
        const userData = userSnap.data() || {};
        const savedCardToken = userData.defaultPaymentToken;

        await sendRenewalReminderEmail({
            ...sub,
            id: subDoc.id,
            userId,
            renewalDate: now.toISOString(),
        });

            const planId = sub.planId || "pro_yearly_business_max";

            // ✅ Dynamic Plan Pricing Resolution
            let defaultPlanPrice = 4999;
            if (planId === "pro_yearly_business_max" || planId.includes("max")) {
                defaultPlanPrice = 49990;
            }
            const price = Number(sub.finalPrice ?? defaultPlanPrice);

            const newRef = `SUB_RENEW_${userId}_${Date.now()}`;

            let autoRenewSuccess = false;

            // Attempt charging saved card token if available
            if (savedCardToken && userData.email) {
                try {
                    autoRenewSuccess = await chargeSavedToken(savedCardToken, price, userData.email, newRef);
                } catch (chargeErr) {
                    console.error(`⚠️ Card auto-charge failed for user ${userId}:`, chargeErr);
                }
            }

            if (autoRenewSuccess) {
                // ✅ EXTEND SUBSCRIPTION BY PLAN DURATION
                const newExpiry = new Date(sub.expiryDate || now);
                const durationMonths = Number(sub.durationMonths || 12);
                newExpiry.setMonth(newExpiry.getMonth() + durationMonths);

                await subDoc.ref.update({
                    expiryDate: newExpiry.toISOString(),
                    lastRenewedAt: now.toISOString(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                // Sync Store & User Records
                const isMaxTier = planId === "pro_yearly_business_max" || planId.includes("max");
                await adminDb.collection("stores").doc(userId).set({
                    isPartner: isMaxTier,
                    subscriptionPlan: planId,
                    partnerExpiry: newExpiry.toISOString(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });

                await sendSubscriptionConfirmationEmail({
                    ...sub,
                    id: `${subDoc.id}:${newRef}`,
                    userId,
                    nombaReference: newRef,
                    finalPrice: price,
                    startDate: now.toISOString(),
                    paidAt: now.toISOString(),
                    expiryDate: newExpiry.toISOString(),
                });

                // Push Renewal Notification
                await adminDb.collection("notifications").add({
                    vendorId: userId,
                    type: "system",
                    priority: "high",
                    title: "Subscription Auto-Renewed! 🎉",
                    body: `Your ${sub.planName || "Pro"} subscription has been successfully renewed.`,
                    actionUrl: "/dashboard?tab=overview",
                    actionLabel: "View Dashboard",
                    read: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                renewedSubs++;
            } else {
                // ⚠️ ENTER 7-DAY GRACE PERIOD
                const graceExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

                await subDoc.ref.update({
                    status: "in_grace_period",
                    gracePeriodExpiresAt: graceExpiry.toISOString(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                // Notify user about failing payment / 7-day grace window
                await adminDb.collection("notifications").add({
                    vendorId: userId,
                    type: "system",
                    priority: "urgent",
                    title: "Payment Failed: Grace Period Started ⚠️",
                    body: "We couldn't renew your subscription. You have 7 days of grace remaining before your tier features are downgraded.",
                    actionUrl: "/dashboard?tab=partner",
                    actionLabel: "Update Payment Method",
                    read: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                await sendSubscriptionPaymentFailedEmail({
                    ...sub,
                    id: subDoc.id,
                    userId,
                    renewalAttemptId: `renewal:${subDoc.id}:${sub.expiryDate || "unknown"}`,
                    attemptDate: now.toISOString(),
                    gracePeriodEnds: graceExpiry.toISOString(),
                    failureReason: "Your saved payment method could not be charged.",
                });

                gracePeriodSubs++;
            }
        }

        // =========================================================================
        // 2. EXPIRED GRACE PERIOD DOWNGRADE CHECK
        // =========================================================================
        const expiredGraceSnap = await adminDb
            .collection("subscriptions")
            .where("status", "==", "in_grace_period")
            .where("gracePeriodExpiresAt", "<=", now.toISOString())
            .get();

        for (const subDoc of expiredGraceSnap.docs) {
            const userId = subDoc.data().userId;

            // Mark Subscription Expired
            await subDoc.ref.update({
                status: "expired",
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Downgrade Store Status so Checkout Defaults back to 1.5% commission
            await adminDb.collection("stores").doc(userId).set({
                isPartner: false,
                subscriptionPlan: "free",
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

            // Downgrade User Profile
            await adminDb.collection("users").doc(userId).set({
                isPremium: false,
                planId: "free",
                hasProBadge: false,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

            // Push Downgrade Notification
            await adminDb.collection("notifications").add({
                vendorId: userId,
                type: "system",
                priority: "urgent",
                title: "Subscription Expired ❌",
                body: "Your grace period has ended. Your store has been downgraded to the free tier.",
                actionUrl: "/dashboard?tab=partner",
                actionLabel: "Re-subscribe Now",
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        // =========================================================================
        // 3. BOOST STORE RENEWAL CHECK
        // =========================================================================
        const expiringBoostsSnap = await adminDb
            .collection("boosts")
            .where("status", "==", "active")
            .where("expiryDate", "<=", now.toISOString())
            .get();

        for (const boostDoc of expiringBoostsSnap.docs) {
            processedBoosts++;
            const boost = boostDoc.data();
            const autoRenew = boost.autoRenew === true;

            if (!autoRenew) {
                await boostDoc.ref.update({
                    status: "expired",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
        }

        console.log("✅ [CRON COMPLETE]", { processedSubs, renewedSubs, gracePeriodSubs, processedBoosts });

        return NextResponse.json({
            success: true,
            processedSubs,
            renewedSubs,
            gracePeriodSubs,
            processedBoosts,
        });
    } catch (error: any) {
        console.error("❌ [CRON ERROR]:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
