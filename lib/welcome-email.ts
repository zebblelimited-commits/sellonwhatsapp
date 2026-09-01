import { adminDb } from "@/lib/firebase-admin";

type WelcomeEmailParams = {
  uid: string;
  email: string;
  firstName: string;
  role: "buyer" | "vendor";
  storeName?: string;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildWelcomeEmail({ firstName, role, storeName }: Omit<WelcomeEmailParams, "uid" | "email">) {
  const safeName = escapeHtml(firstName || "there");
  const safeStoreName = escapeHtml(storeName || "your store");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://sellonwhatsapp.com").replace(/\/$/, "");
  const dashboardUrl = `${appUrl}${role === "vendor" ? "/dashboard" : "/buyer/dashboard"}`;
  const roleCopy = role === "vendor"
    ? `Your storefront, <strong>${safeStoreName}</strong>, is ready for its first customer.`
    : "Your new marketplace account is ready whenever you are.";

  return {
    subject: role === "vendor" ? "Welcome to SellOnWhatsApp — your store is ready" : "Welcome to SellOnWhatsApp — let’s get started",
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to SellOnWhatsApp</title>
  </head>
  <body style="margin:0;background:#f3f7f1;font-family:Arial,Helvetica,sans-serif;color:#16301f;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your SellOnWhatsApp journey starts here.</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f3f7f1;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 12px 35px rgba(22,48,31,.08);">
          <tr><td style="background:#14532d;padding:34px 42px 38px;color:#ffffff;">
            <div style="font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#bbf7d0;">SellOnWhatsApp</div>
            <h1 style="margin:24px 0 12px;font-size:34px;line-height:1.12;letter-spacing:-1px;">Welcome aboard, ${safeName}.</h1>
            <p style="margin:0;color:#dcfce7;font-size:16px;line-height:1.6;">A simpler way to discover, sell and grow — now in your hands.</p>
          </td></tr>
          <tr><td style="padding:38px 42px 12px;">
            <p style="margin:0 0 14px;font-size:17px;line-height:1.7;">Hi ${safeName},</p>
            <p style="margin:0;color:#52635a;font-size:15px;line-height:1.75;">Thanks for joining our marketplace. ${roleCopy}</p>
            <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;margin:26px 0 24px;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:15px 24px;border-radius:12px;">Open your dashboard&nbsp; →</a>
          </td></tr>
          <tr><td style="padding:0 42px 30px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td width="33%" valign="top" style="padding:18px 12px 18px 0;border-top:1px solid #e5eee6;"><div style="font-size:22px;">✦</div><strong style="display:block;margin-top:10px;font-size:13px;">Built for people</strong><span style="display:block;margin-top:6px;color:#718078;font-size:12px;line-height:1.5;">A marketplace that feels personal.</span></td>
                <td width="33%" valign="top" style="padding:18px 12px;border-top:1px solid #e5eee6;"><div style="font-size:22px;">↗</div><strong style="display:block;margin-top:10px;font-size:13px;">Share with ease</strong><span style="display:block;margin-top:6px;color:#718078;font-size:12px;line-height:1.5;">Connect customers and stores on WhatsApp.</span></td>
                <td width="33%" valign="top" style="padding:18px 0 18px 12px;border-top:1px solid #e5eee6;"><div style="font-size:22px;">♡</div><strong style="display:block;margin-top:10px;font-size:13px;">Keep growing</strong><span style="display:block;margin-top:6px;color:#718078;font-size:12px;line-height:1.5;">Discover tools made for your next step.</span></td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="background:#f8fbf8;padding:24px 42px;color:#718078;font-size:12px;line-height:1.7;">
            <strong style="color:#31543b;">SellOnWhatsApp</strong><br>
            This email was sent because you created an account on SellOnWhatsApp.<br>
            <a href="${escapeHtml(appUrl)}" style="color:#15803d;text-decoration:none;font-weight:700;">Visit sellonwhatsapp.com</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}

export async function sendWelcomeEmail(params: WelcomeEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = (process.env.EMAIL_FROM || "SellOnWhatsApp <hello@sellonwhatsapp.com>").trim();

  if (!apiKey) {
    console.warn("[WELCOME EMAIL] Skipped: RESEND_API_KEY is not configured.");
    return false;
  }

  const email = buildWelcomeEmail(params);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.email],
        subject: email.subject,
        html: email.html,
        tags: [{ name: "event", value: "welcome-registered" }, { name: "user_id", value: params.uid }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[WELCOME EMAIL] Resend rejected email for ${params.email}: ${response.status} ${errorBody}`);
      return false;
    }

    console.log(`[WELCOME EMAIL] Sent to ${params.email}`);
    await adminDb.collection("notification_deliveries").doc(`welcome-${params.uid}`).set({
      welcomeEmailSentAt: new Date(),
      welcomeEmailAddress: params.email,
      updatedAt: new Date(),
    }, { merge: true });
    return true;
  } catch (error) {
    console.error(`[WELCOME EMAIL] Failed for ${params.email}:`, error);
    return false;
  }
}
