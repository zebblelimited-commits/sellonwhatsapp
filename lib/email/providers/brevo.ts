import {
    BrevoClient,
} from "@getbrevo/brevo";

import {
    render,
} from "@react-email/render";

import {
    EMAIL_CONFIG,
} from "../config";

import type {
    SendEmailOptions,
    ProviderSendResult,
} from "../types";

const brevo = new BrevoClient({
    apiKey: process.env.BREVO_API_KEY || "",
});

export async function sendWithBrevo(
    options: SendEmailOptions
): Promise<ProviderSendResult> {
    try {
        if (!process.env.BREVO_API_KEY) {
            throw new Error(
                "BREVO_API_KEY is not configured."
            );
        }

        const html = await render(options.react);

        const recipients = Array.isArray(options.to)
            ? options.to
            : [options.to];

        const sender =
            options.type === "buyer_welcome" ||
                options.type === "seller_welcome"
                ? EMAIL_CONFIG.senders.hello
                : EMAIL_CONFIG.senders.support;

        const result =
            await brevo.transactionalEmails.sendTransacEmail({
                sender: {
                    name: sender.name,
                    email: sender.email,
                },

                to: recipients.map((recipient) => ({
                    email: recipient.email,
                    name: recipient.name,
                })),

                subject: options.subject,

                htmlContent: html,

                replyTo: {
                    email:
                        options.replyTo ||
                        EMAIL_CONFIG.contact.supportEmail,
                },
            });

        return {
            success: true,
            provider: "brevo",
            messageId:
                result?.messageId,
        };
    } catch (error) {
        return {
            success: false,
            provider: "brevo",
            error:
                error instanceof Error
                    ? error.message
                    : "Unknown Brevo error.",
        };
    }
}