import * as React from "react";
import {
    Section,
    Text,
    Link,
    Hr,
} from "@react-email/components";

export default function EmailFooter() {
    return (
        <Section
            style={{
                width: "100%",
                padding: "32px 32px 36px",
                backgroundColor: "#f8f9fa",
                textAlign: "center",
            }}
        >
            <Hr
                style={{
                    border: 0,
                    borderTop: "1px solid #e5e7eb",
                    margin: "0 0 24px",
                }}
            />

            <Text
                style={{
                    margin: "0 0 10px",
                    fontSize: "14px",
                    lineHeight: "22px",
                    fontWeight: "600",
                    color: "#111827",
                }}
            >
                SellOnWhatsApp
            </Text>

            <Text
                style={{
                    margin: "0 0 16px",
                    fontSize: "13px",
                    lineHeight: "20px",
                    color: "#6b7280",
                }}
            >
                Making online selling and shopping simpler.
            </Text>

            <Text
                style={{
                    margin: "0 0 8px",
                    fontSize: "13px",
                    lineHeight: "20px",
                    color: "#6b7280",
                }}
            >
                Need help?{" "}
                <Link
                    href="mailto:support@sellonwhatsapp.com"
                    style={{
                        color: "#008000",
                        textDecoration: "none",
                        fontWeight: "600",
                    }}
                >
                    support@sellonwhatsapp.com
                </Link>
            </Text>

            <Text
                style={{
                    margin: "16px 0 0",
                    fontSize: "12px",
                    lineHeight: "18px",
                    color: "#9ca3af",
                }}
            >
                © {new Date().getFullYear()} SellOnWhatsApp. All rights reserved.
            </Text>
        </Section>
    );
}
