import type { ReactElement } from "react";

export type EmailProvider = "resend" | "brevo";

export type EmailStatus =
    | "queued"
    | "processing"
    | "sent"
    | "failed"
    | "fallback";

export type EmailType =
    | "buyer_welcome"
    | "seller_welcome"
    | "order_confirmation"
    | "payment_confirmation"
    | "new_order"
    | "shipping_update"
    | "order_delivered"
    | "subscription_confirmation"
    | "renewal_reminder"
    | "payment_failed";

export interface EmailRecipient {
    email: string;
    name?: string;
}

export interface SendEmailOptions {
    to: EmailRecipient | EmailRecipient[];
    subject: string;
    react: ReactElement;
    type: EmailType;

    /**
     * Stable key used to prevent duplicate emails.
     */
    idempotencyKey?: string;

    /**
     * Optional reply-to address.
     */
    replyTo?: string;

    /**
     * Extra information stored in Firebase email logs.
     */
    metadata?: Record<string, unknown>;
}

export interface ProviderSendResult {
    success: boolean;
    provider: EmailProvider;
    messageId?: string;
    error?: string;
}

export interface SendEmailResult {
    success: boolean;
    provider?: EmailProvider;
    messageId?: string;
    error?: string;
    fallbackUsed?: boolean;
    attempts?: ProviderSendResult[];

    /**
     * True when Firebase determines this exact logical
     * email has already been sent.
     */
    alreadySent?: boolean;
}
