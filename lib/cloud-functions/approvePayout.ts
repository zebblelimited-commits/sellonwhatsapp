import { adminDb } from "../firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { NombaProvider } from "@/lib/payments/nomba/client";

export interface PayoutApprovalResult {
    success: boolean;
    message: string;
    payoutId?: string;
    error?: string;
}

/**
 * Approves a vendor payout request
 * - Updates payout status to 'approved'
 * - Records admin who approved
 * - Triggers payment processing
 * - Logs audit trail
 */
export async function approvePayout(
    payoutId: string,
    adminId: string,
    adminEmail: string
): Promise<PayoutApprovalResult> {
    try {
        const payoutRef = adminDb.collection("payouts").doc(payoutId);
        const payoutDoc = await payoutRef.get();

        if (!payoutDoc.exists) {
            return {
                success: false,
                message: "Payout not found",
                error: "PAYOUT_NOT_FOUND",
            };
        }

        const payoutData = payoutDoc.data()!;

        // Validate payout status
        if (payoutData.status !== "pending") {
            return {
                success: false,
                message: `Payout already ${payoutData.status}`,
                error: "INVALID_STATUS",
            };
        }

        const amount = Number(payoutData.netAmount ?? payoutData.amount ?? 0);
        const bankCode = String(payoutData.bankCode || "").trim();
        const accountNumber = String(payoutData.accountNumber || "").trim();
        if (!Number.isFinite(amount) || amount <= 0 || !bankCode || !accountNumber) {
            return { success: false, message: "Payout is missing a valid amount or destination account", error: "INVALID_PAYOUT_DATA" };
        }

        // Lock the request before calling the provider. Nomba transfers
        // are asynchronous, so this function deliberately does not mark the
        // payout completed or increase vendor totals until a provider status
        // webhook confirms the debit.
        await payoutRef.update({
            status: "processing",
            approvedBy: adminId,
            approvedByEmail: adminEmail,
            approvedAt: FieldValue.serverTimestamp(),
            gatewayAttemptedAt: FieldValue.serverTimestamp(),
            paymentProvider: "nomba",
            updatedAt: FieldValue.serverTimestamp(),
        });

        let transfer;
        try {
            transfer = await new NombaProvider().initiatePayout({
                destinationBankCode: bankCode,
                accountNumber,
                amount,
                narration: "SellOnWhatsApp seller payout",
                reference: payoutId,
            });
        } catch (providerError) {
            await payoutRef.update({
                status: "failed",
                failureReason: providerError instanceof Error ? providerError.message : "Nomba transfer failed",
                updatedAt: FieldValue.serverTimestamp(),
            });
            return { success: false, message: "Nomba transfer failed", error: "PROVIDER_TRANSFER_FAILED" };
        }

        await payoutRef.update({
            providerReference: transfer.transferRef,
            providerStatus: transfer.success ? "SUBMITTED" : "REJECTED",
            nombaResponse: transfer.rawResponse || null,
            processedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
        if (!transfer.success) return { success: false, message: "Nomba rejected the payout", error: "PROVIDER_REJECTED" };

        // Update payout with approval details
        await payoutRef.update({
            status: "processing",
            providerReference: transfer.transferRef,
            updatedAt: FieldValue.serverTimestamp(),
        });

        // Create an audit transaction. Final accounting belongs to the
        // Nomba payout completion webhook.
        await adminDb.collection("transactions").add({
            type: "payout",
            payoutId,
            vendorId: payoutData.vendorId,
            amount,
            currency: payoutData.currency || "NGN",
            status: "processing",
            direction: "outbound",
            processedBy: adminId,
            createdAt: FieldValue.serverTimestamp(),
        });

        return {
            success: true,
            message: "Payout submitted to Nomba",
            payoutId,
        };
    } catch (error: any) {
        console.error("Error approving payout:", error);
        return {
            success: false,
            message: "Failed to approve payout",
            error: error.message || "UNKNOWN_ERROR",
        };
    }
}

/**
 * Rejects a vendor payout request
 */
export async function rejectPayout(
    payoutId: string,
    adminId: string,
    adminEmail: string,
    reason: string
): Promise<PayoutApprovalResult> {
    try {
        const payoutRef = adminDb.collection("payouts").doc(payoutId);
        const payoutDoc = await payoutRef.get();

        if (!payoutDoc.exists) {
            return {
                success: false,
                message: "Payout not found",
                error: "PAYOUT_NOT_FOUND",
            };
        }

        const payoutData = payoutDoc.data()!;

        if (payoutData.status !== "pending") {
            return {
                success: false,
                message: `Payout already ${payoutData.status}`,
                error: "INVALID_STATUS",
            };
        }

        await payoutRef.update({
            status: "rejected",
            rejectedBy: adminId,
            rejectedByEmail: adminEmail,
            rejectionReason: reason,
            rejectedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        return {
            success: true,
            message: "Payout rejected",
            payoutId,
        };
    } catch (error: any) {
        console.error("Error rejecting payout:", error);
        return {
            success: false,
            message: "Failed to reject payout",
            error: error.message || "UNKNOWN_ERROR",
        };
    }
}
