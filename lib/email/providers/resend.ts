import { Resend } from "resend";
import { render } from "@react-email/render";

import { EMAIL_CONFIG } from "../config";

import type {
    ProviderSendResult,
    SendEmailOptions,
} from "../types";

const resendApiKey = process.env.RESEND_API_KEY;

const resend = resendApiKey
    ? new Resend(resendApiKey)
    : null;

function getSender(type: SendEmailOptions["type"]) {
    const isWelcomeEmail =
        type === "buyer_welcome" ||
        type === "seller_welcome";

    return isWelcomeEmail
        ? EMAIL_CONFIG.senders.hello
        : EMAIL_CONFIG.senders.support;
}

export async function sendWithResend(
    options: SendEmailOptions
): Promise<ProviderSendResult> {
    try {
        if (!resend) {
            throw new Error(
                "RESEND_API_KEY is not configured."
            );
        }

        const html = await render(options.react);

        const recipients = Array.isArray(options.to)
            ? options.to
            : [options.to];

        const sender = getSender(options.type);

        const response = await resend.emails.send(
            {
                from: `${sender.name} <${sender.email}>`,

                to: recipients.map((recipient) =>
                    recipient.name
                        ? `${recipient.name} <${recipient.email}>`
                        : recipient.email
                ),

                subject: options.subject,

                html,

                replyTo:
                    options.replyTo ||
                    EMAIL_CONFIG.contact.supportEmail,
            },
            options.idempotencyKey
                ? {
                    idempotencyKey: options.idempotencyKey,
                }
                : undefined
        );

        if (response.error) {
            return {
                success: false,
                provider: "resend",
                error: response.error.message,
            };
        }

        return {
            success: true,
            provider: "resend",
            messageId: response.data?.id,
        };
    } catch (error) {
        return {
            success: false,
            provider: "resend",
            error:
                error instanceof Error
                    ? error.message
                    : "Unknown Resend error.",
        };
    }
}