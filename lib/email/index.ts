import crypto from "crypto";

import type {
    SendEmailOptions,
    SendEmailResult,
} from "./types";

import {
    reserveEmail,
    markEmailFailed,
    markEmailSent,
} from "./logger";

import { sendWithFallback } from "./providers/fallback";

/**
 * Generate a random key when the caller doesn't provide
 * an idempotency key.
 *
 * IMPORTANT:
 * For emails that must never be duplicated,
 * always provide your own stable idempotencyKey.
 */
function generateIdempotencyKey() {
    return crypto.randomUUID();
}

/**
 * Normalize recipients into an array.
 */
function normalizeRecipients(options: SendEmailOptions) {
    if (Array.isArray(options.to)) {
        return options.to;
    }

    return [options.to];
}

/**
 * Basic email validation.
 */
function validateEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Main SellOnWhatsApp email sender.
 */
export async function sendEmail(
    options: SendEmailOptions
): Promise<SendEmailResult> {
    const recipients = normalizeRecipients(options);

    // --------------------------------------------------
    // Validate recipient emails
    // --------------------------------------------------

    for (const recipient of recipients) {
        if (!validateEmail(recipient.email)) {
            return {
                success: false,
                error: `Invalid email address: ${recipient.email}`,
            };
        }
    }

    // --------------------------------------------------
    // Create stable idempotency key
    // --------------------------------------------------

    const idempotencyKey =
        options.idempotencyKey || generateIdempotencyKey();

    const finalOptions: SendEmailOptions = {
        ...options,
        idempotencyKey,
    };

    // --------------------------------------------------
    // Reserve email in Firebase
    // --------------------------------------------------

    const reservation = await reserveEmail(
        finalOptions,
        idempotencyKey
    );

    // --------------------------------------------------
    // Already sent
    // --------------------------------------------------

    if (reservation.alreadySent) {
        return {
            success: true,
            alreadySent: true,
            provider: reservation.provider,
            messageId: reservation.messageId,
        };
    }

    // --------------------------------------------------
    // Another request is currently processing it
    // --------------------------------------------------

    if (!reservation.shouldSend) {
        return {
            success: false,
            error:
                "This email is already being processed. No duplicate email was sent.",
        };
    }

    // --------------------------------------------------
    // Send through Resend → Brevo
    // --------------------------------------------------

    try {
        const result = await sendWithFallback(finalOptions);

        // --------------------------------------------------
        // Successful send
        // --------------------------------------------------

        if (result.success) {
            await markEmailSent(idempotencyKey, result);

            return result;
        }

        // --------------------------------------------------
        // Failed send
        // --------------------------------------------------

        await markEmailFailed(idempotencyKey, result);

        return result;
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Unknown email sending error";

        const result: SendEmailResult = {
            success: false,
            error: message,
        };

        await markEmailFailed(idempotencyKey, result);

        return result;
    }
}

/**
 * Convenience helper for generating predictable keys.
 */
export function emailIdempotencyKey(
    type: string,
    id: string
) {
    return `${type}:${id}`;
}