import * as React from "react";
import {
    Heading,
    Section,
    Text,
} from "@react-email/components";

import EmailLayout from "@/components/emails/EmailLayout";
import Button from "@/components/emails/Button";
import StatusBadge from "@/components/emails/StatusBadge";
import TrackingTimeline, {
    type TrackingStep,
} from "@/components/emails/TrackingTimeline";

interface ShippingUpdateProps {
    customerName?: string;

    orderNumber: string;

    storeName?: string;

    courierName?: string;

    trackingNumber?: string;

    trackingUrl?: string;

    status: string;

    statusDescription?: string;

    estimatedDelivery?: string;

    steps: TrackingStep[];

    orderUrl?: string;
}

export default function ShippingUpdate({
    customerName = "there",
    orderNumber,
    storeName,
    courierName,
    trackingNumber,
    trackingUrl,
    status,
    statusDescription,
    estimatedDelivery,
    steps,
    orderUrl,
}: ShippingUpdateProps) {
    return (
        <EmailLayout
            preview={`Shipping update for order #${orderNumber}: ${status}`}
        >
            <Heading
                style={{
                    margin: "0 0 16px",
                    fontSize: "28px",
                    lineHeight: "36px",
                    fontWeight: "700",
                    color: "#111827",
                    letterSpacing: "-0.5px",
                }}
            >
                Your order is on the move 📦
            </Heading>

            <Text style={greetingStyle}>
                Hey {customerName},
            </Text>

            <Text style={paragraphStyle}>
                We have an update on your order{" "}
                <strong>#{orderNumber}</strong>
                {storeName ? ` from ${storeName}` : ""}.
            </Text>

            <Section
                style={{
                    margin: "24px 0",
                    padding: "20px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "12px",
                    backgroundColor: "#ffffff",
                }}
            >
                <Text
                    style={{
                        margin: "0 0 10px",
                        fontSize: "13px",
                        lineHeight: "20px",
                        fontWeight: "600",
                        color: "#6b7280",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                    }}
                >
                    Current status
                </Text>

                <StatusBadge status="info">
                    {status}
                </StatusBadge>

                {statusDescription && (
                    <Text
                        style={{
                            margin: "14px 0 0",
                            fontSize: "14px",
                            lineHeight: "22px",
                            color: "#4b5563",
                        }}
                    >
                        {statusDescription}
                    </Text>
                )}
            </Section>

            {(courierName || trackingNumber) && (
                <Section
                    style={{
                        margin: "24px 0",
                        padding: "20px",
                        border: "1px solid #e5e7eb",
                        borderRadius: "12px",
                        backgroundColor: "#ffffff",
                    }}
                >
                    <Text
                        style={{
                            margin: "0 0 16px",
                            fontSize: "15px",
                            lineHeight: "22px",
                            fontWeight: "700",
                            color: "#111827",
                        }}
                    >
                        Delivery details
                    </Text>

                    <table
                        width="100%"
                        cellPadding="0"
                        cellSpacing="0"
                        role="presentation"
                    >
                        <tbody>
                            {courierName && (
                                <tr>
                                    <td>
                                        <Text style={labelStyle}>
                                            Courier
                                        </Text>
                                    </td>

                                    <td align="right">
                                        <Text style={valueStyle}>
                                            {courierName}
                                        </Text>
                                    </td>
                                </tr>
                            )}

                            {trackingNumber && (
                                <tr>
                                    <td>
                                        <Text style={labelStyle}>
                                            Tracking number
                                        </Text>
                                    </td>

                                    <td
                                        align="right"
                                        style={{
                                            maxWidth: "220px",
                                            wordBreak: "break-all",
                                        }}
                                    >
                                        <Text
                                            style={{
                                                ...valueStyle,
                                                fontWeight: "600",
                                            }}
                                        >
                                            {trackingNumber}
                                        </Text>
                                    </td>
                                </tr>
                            )}

                            {estimatedDelivery && (
                                <tr>
                                    <td>
                                        <Text style={labelStyle}>
                                            Estimated delivery
                                        </Text>
                                    </td>

                                    <td align="right">
                                        <Text style={valueStyle}>
                                            {estimatedDelivery}
                                        </Text>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </Section>
            )}

            {steps.length > 0 && (
                <Section
                    style={{
                        margin: "28px 0",
                        padding: "20px",
                        border: "1px solid #e5e7eb",
                        borderRadius: "12px",
                        backgroundColor: "#ffffff",
                    }}
                >
                    <Text
                        style={{
                            margin: "0 0 20px",
                            fontSize: "15px",
                            lineHeight: "22px",
                            fontWeight: "700",
                            color: "#111827",
                        }}
                    >
                        Tracking history
                    </Text>

                    <TrackingTimeline steps={steps} />
                </Section>
            )}

            <Section style={{ margin: "28px 0" }}>
                {trackingUrl && (
                    <Button href={trackingUrl}>
                        Track My Order
                    </Button>
                )}

                {orderUrl && (
                    <Text
                        style={{
                            margin: trackingUrl
                                ? "14px 0 0"
                                : "0",
                            textAlign: "center",
                            fontSize: "13px",
                            lineHeight: "20px",
                            color: "#6b7280",
                        }}
                    >
                        <a
                            href={orderUrl}
                            style={{
                                color: "#128C7E",
                                textDecoration: "none",
                                fontWeight: "600",
                            }}
                        >
                            View order details
                        </a>
                    </Text>
                )}
            </Section>

            <Text style={paragraphStyle}>
                We'll continue to send you updates as your order moves
                through the delivery process.
            </Text>

            <Text style={closingStyle}>
                Thanks for shopping with SellOnWhatsApp.
            </Text>
        </EmailLayout>
    );
}

const greetingStyle: React.CSSProperties = {
    margin: "0 0 18px",
    fontSize: "16px",
    lineHeight: "26px",
    color: "#374151",
};

const paragraphStyle: React.CSSProperties = {
    margin: "0 0 16px",
    fontSize: "15px",
    lineHeight: "24px",
    color: "#4b5563",
};

const labelStyle: React.CSSProperties = {
    margin: "0 0 10px",
    fontSize: "13px",
    lineHeight: "20px",
    color: "#6b7280",
};

const valueStyle: React.CSSProperties = {
    margin: "0 0 10px",
    fontSize: "13px",
    lineHeight: "20px",
    color: "#374151",
};

const closingStyle: React.CSSProperties = {
    margin: "28px 0 0",
    fontSize: "15px",
    lineHeight: "24px",
    fontWeight: "600",
    color: "#111827",
};