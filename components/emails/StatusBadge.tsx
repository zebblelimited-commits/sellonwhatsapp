import * as React from "react";
import { Text } from "@react-email/components";

type StatusType =
    | "success"
    | "warning"
    | "error"
    | "info"
    | "neutral";

interface StatusBadgeProps {
    status: StatusType;
    children?: React.ReactNode;
}

export default function StatusBadge({
    status,
    children,
}: StatusBadgeProps) {
    const styles: Record<
        StatusType,
        {
            backgroundColor: string;
            color: string;
        }
    > = {
        success: {
            backgroundColor: "#DCFCE7",
            color: "#166534",
        },

        warning: {
            backgroundColor: "#FEF3C7",
            color: "#92400E",
        },

        error: {
            backgroundColor: "#FEE2E2",
            color: "#991B1B",
        },

        info: {
            backgroundColor: "#DBEAFE",
            color: "#1E40AF",
        },

        neutral: {
            backgroundColor: "#F3F4F6",
            color: "#374151",
        },
    };

    const currentStyle = styles[status];

    return (
        <Text
            style={{
                display: "inline-block",
                margin: "0",
                padding: "6px 12px",
                borderRadius: "999px",
                backgroundColor: currentStyle.backgroundColor,
                color: currentStyle.color,
                fontSize: "12px",
                lineHeight: "18px",
                fontWeight: "700",
            }}
        >
            {children || status}
        </Text>
    );
}