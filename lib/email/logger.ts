import { FieldValue } from "firebase-admin/firestore";

import type {
    EmailStatus,
    SendEmailOptions,
    SendEmailResult,
} from "./types";

import { adminDb } from "@/lib/firebase-admin";

const COLLECTION = "emailLogs";

// How long a "processing" email can remain locked
// before another attempt is allowed.
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;

function createDocumentId(idempotencyKey: string) {
    return Buffer.from(idempotencyKey).toString("base64url");
}

export interface EmailLogRecord {
    idempotencyKey: string;

    type: SendEmailOptions["type"];

    to: SendEmailOptions["to"];

    subject: string;

    status: EmailStatus;

    provider?: SendEmailResult["provider"];

    messageId?: string;

    fallbackUsed?: boolean;

    error?: string;

    attempts?: SendEmailResult["attempts"];

    metadata?: Record<string, unknown>;

    createdAt?: FirebaseFirestore.Timestamp | FieldValue;

    updatedAt?: FirebaseFirestore.Timestamp | FieldValue;

    sentAt?: FirebaseFirestore.Timestamp | FieldValue;
}

/**
 * Creates the email log and reserves the idempotency key.
 *
 * Returns:
 * - shouldSend=true when this request owns the email send
 * - shouldSend=false when another request already processed it
 */
export async function reserveEmail(
    options: SendEmailOptions,
    idempotencyKey: string
): Promise<{
    shouldSend: boolean;
    alreadySent: boolean;
    messageId?: string;
    provider?: SendEmailResult["provider"];
}> {
    const docId = createDocumentId(idempotencyKey);

    const ref = adminDb.collection(COLLECTION).doc(docId);

    return adminDb.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);

        // --------------------------------------------------
        // Email doesn't exist yet
        // --------------------------------------------------

        if (!snapshot.exists) {
            transaction.create(ref, {
                idempotencyKey,
                type: options.type,
                to: options.to,
                subject: options.subject,
                status: "processing",
                metadata: options.metadata || {},
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });

            return {
                shouldSend: true,
                alreadySent: false,
            };
        }

        const existing = snapshot.data() as EmailLogRecord;

        // --------------------------------------------------
        // Already successfully sent
        // --------------------------------------------------

        if (existing.status === "sent" || existing.status === "fallback") {
            return {
                shouldSend: false,
                alreadySent: true,
                messageId: existing.messageId,
                provider: existing.provider,
            };
        }

        // --------------------------------------------------
        // Check processing lock
        // --------------------------------------------------

        if (existing.status === "processing") {
            const updatedAt = existing.updatedAt;

            if (
                updatedAt &&
                "toMillis" in updatedAt &&
                Date.now() - updatedAt.toMillis() < PROCESSING_TIMEOUT_MS
            ) {
                return {
                    shouldSend: false,
                    alreadySent: false,
                };
            }
        }

        // --------------------------------------------------
        // Existing attempt failed or timed out
        // Allow retry
        // --------------------------------------------------

        transaction.update(ref, {
            status: "processing",
            updatedAt: FieldValue.serverTimestamp(),
        });

        return {
            shouldSend: true,
            alreadySent: false,
        };
    });
}

/**
 * Mark an email as successfully sent.
 */
export async function markEmailSent(
    idempotencyKey: string,
    result: SendEmailResult
) {
    const docId = createDocumentId(idempotencyKey);

    const ref = adminDb.collection(COLLECTION).doc(docId);

    await ref.set(
        {
            status: result.fallbackUsed ? "fallback" : "sent",

            provider: result.provider,

            messageId: result.messageId,

            fallbackUsed: result.fallbackUsed || false,

            attempts: result.attempts || [],

            error: null,

            updatedAt: FieldValue.serverTimestamp(),

            sentAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
    );
}

/**
 * Mark an email as failed.
 */
export async function markEmailFailed(
    idempotencyKey: string,
    result: SendEmailResult
) {
    const docId = createDocumentId(idempotencyKey);

    const ref = adminDb.collection(COLLECTION).doc(docId);

    await ref.set(
        {
            status: "failed",

            attempts: result.attempts || [],

            error: result.error || "Unknown email error",

            updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
    );
}