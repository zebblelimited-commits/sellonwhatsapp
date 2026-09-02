import type {
    ProviderSendResult,
    SendEmailOptions,
    SendEmailResult,
} from "../types";

import { sendWithResend } from "./resend";
import { sendWithBrevo } from "./brevo";

export async function sendWithFallback(
    options: SendEmailOptions
): Promise<SendEmailResult> {
    const attempts: ProviderSendResult[] = [];

    // 1. Try Resend first
    const resendResult =
        await sendWithResend(options);

    attempts.push(resendResult);

    if (resendResult.success) {
        return {
            success: true,
            provider: "resend",
            messageId: resendResult.messageId,
            fallbackUsed: false,
            attempts,
        };
    }

    console.error(
        "[Email] Resend failed:",
        resendResult.error
    );

    // 2. Try Brevo
    const brevoResult =
        await sendWithBrevo(options);

    attempts.push(brevoResult);

    if (brevoResult.success) {
        return {
            success: true,
            provider: "brevo",
            messageId: brevoResult.messageId,
            fallbackUsed: true,
            attempts,
        };
    }

    console.error(
        "[Email] Brevo failed:",
        brevoResult.error
    );

    return {
        success: false,
        fallbackUsed: true,
        attempts,
        error: [
            `Resend: ${resendResult.error || "Unknown error"
            }`,
            `Brevo: ${brevoResult.error || "Unknown error"
            }`,
        ].join(" | "),
    };
}