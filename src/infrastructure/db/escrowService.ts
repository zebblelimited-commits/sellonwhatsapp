import admin from "firebase-admin";
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { inventoryAdjustment } from "@/lib/inventory";
import { ESCROW_COLLECTION, ESCROW_WEBHOOK_EVENTS_COLLECTION, EscrowStatus } from "@/lib/escrow/types";

export { ESCROW_COLLECTION, ESCROW_WEBHOOK_EVENTS_COLLECTION };
export type { EscrowStatus };

export interface CreateEscrowInput {
    externalReference: string;
    amount: number;
    orderIds?: string[];
    buyerId?: string;
    buyerPhone?: string;
    sellerPhone?: string;
    description?: string;
    virtualAccountId?: string;
    virtualAccountNumber?: string;
    virtualAccountBankCode?: string;
    virtualAccountBankName?: string;
    expiryDate?: Date;
    paymentProvider?: "nomba" | "safehaven";
}

export interface FundingInput {
    eventId: string;
    externalReference: string;
    amount: number;
    providerReference?: string;
    sessionId?: string;
    rawPayload?: unknown;
}

const finiteAmount = (value: unknown) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : 0;
};

const eventDocumentId = (eventId: string) => eventId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);

/** Creates an idempotent ledger record before presenting a virtual account. */
export async function createEscrowRecord(input: CreateEscrowInput) {
    if (!input.externalReference.trim()) throw new Error("Escrow reference is required");
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Escrow amount must be greater than zero");

    const docRef = adminDb.collection(ESCROW_COLLECTION).doc(input.externalReference.trim());
    const payload = {
        externalReference: input.externalReference.trim(),
        amount: Math.round(input.amount),
        orderIds: input.orderIds || [],
        buyerId: input.buyerId || null,
        buyerPhone: input.buyerPhone || null,
        sellerPhone: input.sellerPhone || null,
        description: input.description || null,
        virtualAccountId: input.virtualAccountId || null,
        virtualAccountNumber: input.virtualAccountNumber || null,
        virtualAccountBankCode: input.virtualAccountBankCode || null,
        virtualAccountBankName: input.virtualAccountBankName || null,
        paymentProvider: input.paymentProvider || "nomba",
        status: "PENDING_PAYMENT" as EscrowStatus,
        expiryDate: input.expiryDate || null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    };

    try {
        await docRef.create(payload);
        return payload;
    } catch (error: unknown) {
        // A retry after a successful provider call must not create a second
        // ledger. Return the existing document for the same reference.
        if (!([6, "6", "ALREADY_EXISTS"] as unknown[]).includes((error as { code?: unknown })?.code)) throw error;
        const existing = await docRef.get();
        if (!existing.exists) throw error;
        return existing.data();
    }
}

/**
 * Atomically records a Nomba credit and reserves each order's product
 * amount in the seller escrow wallet. The webhook event document is the
 * idempotency key, so retries cannot double-credit an order or wallet.
 */
export async function fundEscrowAndOrders(input: FundingInput) {
    const escrowRef = adminDb.collection(ESCROW_COLLECTION).doc(input.externalReference);
    const eventRef = adminDb.collection(ESCROW_WEBHOOK_EVENTS_COLLECTION).doc(eventDocumentId(input.eventId));

    return adminDb.runTransaction(async (transaction) => {
        const [escrowSnap, eventSnap] = await Promise.all([
            transaction.get(escrowRef),
            transaction.get(eventRef),
        ]);
        if (!escrowSnap.exists) return { found: false, duplicate: false, funded: false, orderIds: [] as string[] };
        if (eventSnap.exists) return { found: true, duplicate: true, funded: true, orderIds: [] as string[] };

        const escrow = escrowSnap.data() || {};
        const expectedAmount = finiteAmount(escrow.amount);
        const paidAmount = finiteAmount(input.amount);
        if (expectedAmount <= 0 || paidAmount < expectedAmount) {
            throw new Error(`Nomba payment amount is below the escrow amount (${paidAmount}/${expectedAmount})`);
        }
        if (!["PENDING_PAYMENT", "FUNDED"].includes(String(escrow.status))) {
            throw new Error(`Escrow cannot be funded from status ${escrow.status}`);
        }

        const orderIds = Array.isArray(escrow.orderIds) ? escrow.orderIds.filter((id): id is string => typeof id === "string") : [];
        let orders = orderIds.length
            ? await Promise.all(orderIds.map((id) => transaction.get(adminDb.collection("orders").doc(id))))
            : (await transaction.get(adminDb.collection("orders").where("checkoutReference", "==", input.externalReference))).docs;
        const now = admin.firestore.FieldValue.serverTimestamp();
        const fundedOrderIds: string[] = [];

        // Firestore requires all reads to happen before the first write in a
        // transaction. Build every update first, then commit them below.
        const writes: Array<{ orderRef: FirebaseFirestore.DocumentReference; order: DocumentData; storeRef: FirebaseFirestore.DocumentReference; store: DocumentData; productRef?: FirebaseFirestore.DocumentReference; productUpdate?: DocumentData; orderUpdate?: DocumentData }> = [];
        for (const orderSnap of orders) {
            if (!orderSnap.exists) continue;
            const order = orderSnap.data() || {};
            const orderRef = orderSnap.ref;
            const currentFundsState = String(order.fundsState || "").toLowerCase();
            if (currentFundsState === "held" && order.escrowReservedAt) {
                fundedOrderIds.push(orderRef.id);
                continue;
            }
            if (["released", "refunded", "refund_pending"].includes(currentFundsState)) {
                throw new Error(`Order ${orderRef.id} is already settled`);
            }
            const storeId = String(order.storeId || order.vendorId || "").trim();
            const orderAmount = finiteAmount(order.escrowAmount ?? order.productSubtotal ?? order.totalAmount ?? order.total);
            if (!storeId || orderAmount <= 0) throw new Error(`Order ${orderRef.id} has invalid escrow metadata`);

            const storeRef = adminDb.collection("stores").doc(storeId);
            const storeSnap = await transaction.get(storeRef);
            if (!storeSnap.exists) throw new Error(`Seller wallet not found for order ${orderRef.id}`);
            const store = storeSnap.data() || {};
            const escrowBalance = finiteAmount(store.escrowBalance);
            if (escrowBalance < 0) throw new Error(`Seller escrow ledger is invalid for order ${orderRef.id}`);

            let productRef: FirebaseFirestore.DocumentReference | undefined;
            let productUpdate: DocumentData | undefined;
            let orderUpdate: DocumentData | undefined;
            const productId = String(order.productId || "").trim();
            if (productId) {
                productRef = adminDb.collection("products").doc(productId);
                const productSnap = await transaction.get(productRef);
                if (productSnap.exists) {
                    const inventory = inventoryAdjustment(productSnap.data() || {}, order, now, input.externalReference);
                    if (inventory.error) throw new Error(inventory.error);
                    if (inventory.tracked) productUpdate = inventory.productUpdate;
                    orderUpdate = inventory.orderUpdate;
                }
            }

            writes.push({ orderRef, order, storeRef, store: { ...store, escrowBalance: escrowBalance + orderAmount }, productRef, productUpdate, orderUpdate });
            fundedOrderIds.push(orderRef.id);
        }

        for (const write of writes) {
            if (write.productRef && write.productUpdate) transaction.update(write.productRef, write.productUpdate);
            transaction.update(write.storeRef, { escrowBalance: write.store.escrowBalance, updatedAt: now });
            transaction.update(write.orderRef, {
                ...(write.orderUpdate || {}),
                status: ["SHIPPED", "DISPUTED"].includes(String(write.order.status || "").toUpperCase()) ? write.order.status : "PAID_HELD",
                paymentStatus: "paid",
                paymentProvider: "nomba",
                paymentReference: input.providerReference || input.externalReference,
                providerSessionId: input.sessionId || null,
                fundsState: "held",
                escrowReservedAmount: finiteAmount(write.order.escrowAmount ?? write.order.productSubtotal ?? write.order.totalAmount ?? write.order.total),
                escrowReservedAt: now,
                updatedAt: now,
            });
            transaction.set(adminDb.collection("auditLogs").doc(), {
                action: "nomba_payment_credited_and_escrow_reserved",
                targetType: "order",
                targetId: write.orderRef.id,
                performedBy: "system:nomba-webhook",
                details: { externalReference: input.externalReference, providerReference: input.providerReference || null, amount: input.amount },
                timestamp: now,
            });
        }

        transaction.update(escrowRef, {
            status: "FUNDED" as EscrowStatus,
            fundedAmount: paidAmount,
            providerReference: input.providerReference || null,
            providerSessionId: input.sessionId || null,
            paidAt: now,
            updatedAt: now,
        });
        transaction.create(eventRef, {
            eventId: input.eventId,
            externalReference: input.externalReference,
            amount: paidAmount,
            providerReference: input.providerReference || null,
            receivedAt: now,
            rawPayload: input.rawPayload || null,
        });

        return { found: true, duplicate: false, funded: true, orderIds: fundedOrderIds };
    });
}

export async function markEscrowAsFunded(externalReference: string, sessionId?: string, amount?: number, eventId = `manual_${externalReference}`) {
    return fundEscrowAndOrders({
        eventId,
        externalReference,
        amount: amount ?? Number.MAX_SAFE_INTEGER,
        sessionId,
        providerReference: sessionId,
    });
}

export async function expirePendingEscrow(externalReference: string) {
    const ref = adminDb.collection(ESCROW_COLLECTION).doc(externalReference);
    return adminDb.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) return false;
        const data = snapshot.data() || {};
        if (data.status !== "PENDING_PAYMENT") return false;
        const expiry = data.expiryDate?.toDate ? data.expiryDate.toDate() : new Date(data.expiryDate);
        if (Number.isNaN(expiry.getTime()) || expiry.getTime() > Date.now()) return false;
        transaction.update(ref, { status: "EXPIRED" as EscrowStatus, expiredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        return true;
    });
}

export async function getEscrowByReference(externalReference: string) {
    const snapshot = await adminDb.collection(ESCROW_COLLECTION).doc(externalReference).get();
    return snapshot.exists ? snapshot.data() : null;
}

export async function getEscrowByVirtualAccount(accountIdOrNumber: string) {
    const value = accountIdOrNumber.trim();
    if (!value) return null;
    for (const field of ["virtualAccountId", "virtualAccountNumber"]) {
        const snapshot = await adminDb.collection(ESCROW_COLLECTION).where(field, "==", value).limit(1).get();
        if (!snapshot.empty) return { reference: snapshot.docs[0].id, data: snapshot.docs[0].data() };
    }
    return null;
}
