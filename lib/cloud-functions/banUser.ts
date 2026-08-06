import { adminDb, adminAuth } from "../firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export interface BanUserResult {
    success: boolean;
    message: string;
    userId?: string;
    error?: string;
}

export interface BanUserOptions {
    reason: string;
    duration?: "temporary" | "permanent";
    banUntil?: Date; // For temporary bans
    additionalNotes?: string;
}

/**
 * Bans a user (vendor or buyer) from the platform
 * - Updates user status to 'banned'
 * - Records admin who banned
 * - Logs audit trail
 * - Optionally bans associated stores
 */
export async function banUser(
    userId: string,
    adminId: string,
    adminEmail: string,
    options: BanUserOptions
): Promise<BanUserResult> {
    try {
        const { reason, duration = "permanent", banUntil, additionalNotes } = options;

        // Check if user exists in vendors collection
        let userType: "vendor" | "buyer" | "unknown" = "unknown";
        let userData: any = null;

        const vendorDoc = await adminDb.collection("vendors").doc(userId).get();
        if (vendorDoc.exists) {
            userType = "vendor";
            userData = vendorDoc.data();
        } else {
            const buyerDoc = await adminDb.collection("users").doc(userId).get();
            if (buyerDoc.exists) {
                userType = "buyer";
                userData = buyerDoc.data();
            }
        }

        if (userType === "unknown") {
            return {
                success: false,
                message: "User not found",
                error: "USER_NOT_FOUND",
            };
        }

        // Check if already banned
        if (userData?.status === "banned") {
            return {
                success: false,
                message: "User is already banned",
                error: "ALREADY_BANNED",
            };
        }

        // Prepare ban data
        const banData: any = {
            status: "banned",
            bannedAt: FieldValue.serverTimestamp(),
            bannedBy: adminId,
            bannedByEmail: adminEmail,
            banReason: reason,
            banDuration: duration,
            updatedAt: FieldValue.serverTimestamp(),
        };

        if (duration === "temporary" && banUntil) {
            banData.banUntil = banUntil;
            banData.banExpiresAt = banUntil;
        }

        if (additionalNotes) {
            banData.banNotes = additionalNotes;
        }

        // Update user document
        const collectionName = userType === "vendor" ? "vendors" : "users";
        await adminDb.collection(collectionName).doc(userId).update(banData);

        // If vendor, also ban their stores
        if (userType === "vendor") {
            const storesSnapshot = await adminDb
                .collection("stores")
                .where("vendorId", "==", userId)
                .get();

            const batch = adminDb.batch();
            storesSnapshot.forEach((storeDoc) => {
                batch.update(storeDoc.ref, {
                    status: "banned",
                    bannedAt: FieldValue.serverTimestamp(),
                    bannedBy: adminId,
                    banReason: reason,
                    updatedAt: FieldValue.serverTimestamp(),
                });
            });

            if (!storesSnapshot.empty) {
                await batch.commit();
            }

            // Deactivate vendor's products
            const productsSnapshot = await adminDb
                .collection("products")
                .where("vendorId", "==", userId)
                .get();

            const productBatch = adminDb.batch();
            productsSnapshot.forEach((productDoc) => {
                productBatch.update(productDoc.ref, {
                    status: "inactive",
                    deactivatedAt: FieldValue.serverTimestamp(),
                    deactivationReason: "vendor_banned",
                    updatedAt: FieldValue.serverTimestamp(),
                });
            });

            if (!productsSnapshot.empty) {
                await productBatch.commit();
            }
        }

        // Disable Firebase Auth account
        try {
            await adminAuth.updateUser(userId, { disabled: true });
        } catch (authError: any) {
            console.warn("Failed to disable Firebase Auth account:", authError.message);
            // Continue anyway - we've already banned them at DB level
        }

        // Create audit log entry
        await adminDb.collection("auditLogs").add({
            action: "user_banned",
            targetType: userType,
            targetId: userId,
            performedBy: adminId,
            performedByEmail: adminEmail,
            details: {
                reason,
                duration,
                banUntil: banUntil || null,
                notes: additionalNotes,
            },
            timestamp: FieldValue.serverTimestamp(),
        });

        return {
            success: true,
            message: `User ${userType} banned successfully`,
            userId,
        };
    } catch (error: any) {
        console.error("Error banning user:", error);
        return {
            success: false,
            message: "Failed to ban user",
            error: error.message || "UNKNOWN_ERROR",
        };
    }
}

/**
 * Unbans a user and restores their access
 */
export async function unbanUser(
    userId: string,
    adminId: string,
    adminEmail: string,
    notes?: string
): Promise<BanUserResult> {
    try {
        // Check vendors first
        let userType: "vendor" | "buyer" | "unknown" = "unknown";
        let userData: any = null;

        const vendorDoc = await adminDb.collection("vendors").doc(userId).get();
        if (vendorDoc.exists) {
            userType = "vendor";
            userData = vendorDoc.data();
        } else {
            const buyerDoc = await adminDb.collection("users").doc(userId).get();
            if (buyerDoc.exists) {
                userType = "buyer";
                userData = buyerDoc.data();
            }
        }

        if (userType === "unknown") {
            return {
                success: false,
                message: "User not found",
                error: "USER_NOT_FOUND",
            };
        }

        if (userData?.status !== "banned") {
            return {
                success: false,
                message: "User is not currently banned",
                error: "NOT_BANNED",
            };
        }

        // Update user status
        const collectionName = userType === "vendor" ? "vendors" : "users";
        await adminDb.collection(collectionName).doc(userId).update({
            status: "active",
            unbannedAt: FieldValue.serverTimestamp(),
            unbannedBy: adminId,
            unbannedByEmail: adminEmail,
            unbanNotes: notes || null,
            updatedAt: FieldValue.serverTimestamp(),
        });

        // If vendor, restore their stores
        if (userType === "vendor") {
            const storesSnapshot = await adminDb
                .collection("stores")
                .where("vendorId", "==", userId)
                .where("status", "==", "banned")
                .get();

            const batch = adminDb.batch();
            storesSnapshot.forEach((storeDoc) => {
                batch.update(storeDoc.ref, {
                    status: "active",
                    unbannedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
            });

            if (!storesSnapshot.empty) {
                await batch.commit();
            }
        }

        // Enable Firebase Auth account
        try {
            await adminAuth.updateUser(userId, { disabled: false });
        } catch (authError: any) {
            console.warn("Failed to enable Firebase Auth account:", authError.message);
        }

        // Create audit log entry
        await adminDb.collection("auditLogs").add({
            action: "user_unbanned",
            targetType: userType,
            targetId: userId,
            performedBy: adminId,
            performedByEmail: adminEmail,
            details: {
                notes: notes || null,
            },
            timestamp: FieldValue.serverTimestamp(),
        });

        return {
            success: true,
            message: "User unbanned successfully",
            userId,
        };
    } catch (error: any) {
        console.error("Error unbanning user:", error);
        return {
            success: false,
            message: "Failed to unban user",
            error: error.message || "UNKNOWN_ERROR",
        };
    }
}