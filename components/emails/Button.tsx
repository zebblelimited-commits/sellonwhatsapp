import * as React from "react";
import { Button as ReactEmailButton } from "@react-email/components";

interface ButtonProps {
    href: string;
    children: React.ReactNode;
    variant?: "primary" | "secondary";
}

export default function Button({
    href,
    children,
    variant = "primary",
}: ButtonProps) {
    const isPrimary = variant === "primary";

    return (
        <ReactEmailButton
            href={href}
            style={{
                display: "inline-block",
                padding: "13px 22px",
                borderRadius: "8px",
                backgroundColor: isPrimary ? "#25D366" : "#ffffff",
                color: isPrimary ? "#ffffff" : "#111827",
                border: isPrimary ? "none" : "1px solid #d1d5db",
                fontSize: "14px",
                lineHeight: "20px",
                fontWeight: "600",
                textDecoration: "none",
                textAlign: "center",
            }}
        >
            {children}
        </ReactEmailButton>
    );
}