import { adminDb } from "./firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export type AuditAction =
    | "user_banned"
    | "user_unbanned"
    | "payout_approved"
    | "payout_rejected"
    | "dispute_resolved"
    | "refund_processed"
    | "store_verified"
    | "store_suspended"
    | "product_removed"
    | "admin_created"
    | "admin_updated"
    | "settings_changed"
    | "bulk_operation"
    | "data_export"
    | "user_login"
    | "failed_login_attempt"
    | "permission_changed";

export interface AuditLogEntry {
    action: AuditAction;
    targetType?: "user" | "vendor" | "store" | "product" | "order" | "payout" | "dispute" | "admin" | "system";
    targetId?: string;
    performedBy: string;
    performedByEmail: string;
    performedByRole?: string;
    details?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    timestamp?: any;
}

/**
 * Creates an audit log entry for admin actions
 */
export async function createAuditLog(
    entry: AuditLogEntry
): Promise<{ success: boolean; logId?: string; error?: string }> {
    try {
        const logRef = await adminDb.collection("auditLogs").add({
            action: entry.action,
            targetType: entry.targetType || null,
            targetId: entry.targetId || null,
            performedBy: entry.performedBy,
            performedByEmail: entry.performedByEmail,
            performedByRole: entry.performedByRole || null,
            details: entry.details || {},
            ipAddress: entry.ipAddress || null,
            userAgent: entry.userAgent || null,
            timestamp: entry.timestamp || FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
        });

        return {
            success: true,
            logId: logRef.id,
        };
    } catch (error: any) {
        console.error("Error creating audit log:", error);
        return {
            success: false,
            error: error.message || "UNKNOWN_ERROR",
        };
    }
}

/**
 * Retrieves audit logs with filtering and pagination
 */
export async function getAuditLogs(options?: {
    action?: AuditAction;
    performedBy?: string;
    targetType?: string;
    targetId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    orderBy?: "timestamp" | "action" | "targetType";
    orderDirection?: "asc" | "desc";
}): Promise<{ success: boolean; logs?: any[]; error?: string }> {
    try {
        let query: any = adminDb.collection("auditLogs");

        // Apply filters
        if (options?.action) {
            query = query.where("action", "==", options.action);
        }

        if (options?.performedBy) {
            query = query.where("performedBy", "==", options.performedBy);
        }

        if (options?.targetType) {
            query = query.where("targetType", "==", options.targetType);
        }

        if (options?.targetId) {
            query = query.where("targetId", "==", options.targetId);
        }

        if (options?.startDate) {
            query = query.where("timestamp", ">=", options.startDate);
        }

        if (options?.endDate) {
            query = query.where("timestamp", "<=", options.endDate);
        }

        // Apply ordering
        const orderByField = options?.orderBy || "timestamp";
        const orderDir = options?.orderDirection || "desc";
        query = query.orderBy(orderByField, orderDir as any);

        // Apply limit
        const limit = options?.limit || 50;
        query = query.limit(limit);

        const snapshot = await query.get();
        const logs = snapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data(),
        }));

        return {
            success: true,
            logs,
        };
    } catch (error: any) {
        console.error("Error retrieving audit logs:", error);
        return {
            success: false,
            error: error.message || "UNKNOWN_ERROR",
        };
    }
}

/**
 * Exports audit logs for compliance/reporting
 */
export async function exportAuditLogs(options?: {
    startDate?: Date;
    endDate?: Date;
    format?: "json" | "csv";
}): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
        const startDate = options?.startDate || new Date(0);
        const endDate = options?.endDate || new Date();
        const format = options?.format || "json";

        let query = adminDb
            .collection("auditLogs")
            .where("timestamp", ">=", startDate)
            .where("timestamp", "<=", endDate)
            .orderBy("timestamp", "asc");

        const snapshot = await query.get();
        const logs = snapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data(),
        }));

        if (format === "csv") {
            // Convert to CSV format
            const headers = [
                "id",
                "timestamp",
                "action",
                "targetType",
                "targetId",
                "performedBy",
                "performedByEmail",
                "details",
            ];

            const csvRows = logs.map((log: any) => [
                log.id,
                log.timestamp?.toDate ? log.timestamp.toDate().toISOString() : log.timestamp,
                log.action,
                log.targetType || "",
                log.targetId || "",
                log.performedBy,
                log.performedByEmail,
                JSON.stringify(log.details || {}),
            ]);

            const csvContent = [
                headers.join(","),
                ...csvRows.map((row: any[]) =>
                    row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
                ),
            ].join("\n");

            return {
                success: true,
                data: csvContent,
            };
        }

        return {
            success: true,
            data: logs,
        };
    } catch (error: any) {
        console.error("Error exporting audit logs:", error);
        return {
            success: false,
            error: error.message || "UNKNOWN_ERROR",
        };
    }
}

/**
 * Helper to create common audit log entries
 */
export const auditActions = {
    userBanned: (
        performedBy: string,
        performedByEmail: string,
        userId: string,
        reason: string
    ) =>
        createAuditLog({
            action: "user_banned",
            targetType: "user",
            targetId: userId,
            performedBy,
            performedByEmail,
            details: { reason },
        }),

    payoutApproved: (
        performedBy: string,
        performedByEmail: string,
        payoutId: string,
        amount: number
    ) =>
        createAuditLog({
            action: "payout_approved",
            targetType: "payout",
            targetId: payoutId,
            performedBy,
            performedByEmail,
            details: { amount },
        }),

    payoutRejected: (
        performedBy: string,
        performedByEmail: string,
        payoutId: string,
        reason: string
    ) =>
        createAuditLog({
            action: "payout_rejected",
            targetType: "payout",
            targetId: payoutId,
            performedBy,
            performedByEmail,
            details: { reason },
        }),

    disputeResolved: (
        performedBy: string,
        performedByEmail: string,
        disputeId: string,
        resolution: string
    ) =>
        createAuditLog({
            action: "dispute_resolved",
            targetType: "dispute",
            targetId: disputeId,
            performedBy,
            performedByEmail,
            details: { resolution },
        }),

    settingsChanged: (
        performedBy: string,
        performedByEmail: string,
        settingName: string,
        oldValue: any,
        newValue: any
    ) =>
        createAuditLog({
            action: "settings_changed",
            targetType: "system",
            performedBy,
            performedByEmail,
            details: { settingName, oldValue, newValue },
        }),
};