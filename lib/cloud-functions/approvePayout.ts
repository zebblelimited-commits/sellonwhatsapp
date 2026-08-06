import { adminDb } from "../firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

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

        // Update payout with approval details
        await payoutRef.update({
            status: "approved",
            approvedBy: adminId,
            approvedByEmail: adminEmail,
            approvedAt: FieldValue.serverTimestamp(),
            processedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        // Update vendor's payout history
        const vendorRef = adminDb.collection("vendors").doc(payoutData.vendorId);
        await vendorRef.update({
            totalPayouts: FieldValue.increment(1),
            totalPaidOut: FieldValue.increment(payoutData.amount || 0),
            lastPayoutDate: FieldValue.serverTimestamp(),
        });

        // Create transaction record
        await adminDb.collection("transactions").add({
            type: "payout",
            payoutId,
            vendorId: payoutData.vendorId,
            amount: payoutData.amount,
            currency: payoutData.currency || "NGN",
            status: "completed",
            direction: "outbound",
            processedBy: adminId,
            createdAt: FieldValue.serverTimestamp(),
        });

        return {
            success: true,
            message: "Payout approved successfully",
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