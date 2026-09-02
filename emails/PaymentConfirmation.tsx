import * as React from "react";
import {
    Heading,
    Section,
    Text,
} from "@react-email/components";

import EmailLayout from "@/components/emails/EmailLayout";
import Button from "@/components/emails/Button";

interface PaymentConfirmationProps {
    customerName?: string;

    orderNumber: string;

    amount: string;

    paymentReference?: string;

    paymentMethod?: string;

    orderUrl?: string;
}

export default function PaymentConfirmation({
    customerName = "there",
    orderNumber,
    amount,
    paymentReference,
    paymentMethod,
    orderUrl,
}: PaymentConfirmationProps) {
    return (
        <EmailLayout
            preview={`Your payment of ${amount} for order #${orderNumber} was successful.`}
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
                Payment confirmed 🎉
            </Heading>

            <Text style={greetingStyle}>
                Hey {customerName},
            </Text>

            <Text style={paragraphStyle}>
                We've successfully received your payment for order{" "}
                <strong>#{orderNumber}</strong>.
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
                        margin: "0 0 16px",
                        fontSize: "14px",
                        lineHeight: "20px",
                        fontWeight: "700",
                        color: "#111827",
                    }}
                >
                    Payment details
                </Text>

                <table
                    width="100%"
                    cellPadding="0"
                    cellSpacing="0"
                    role="presentation"
                >
                    <tbody>
                        <tr>
                            <td>
                                <Text style={labelStyle}>
                                    Order
                                </Text>
                            </td>

                            <td align="right">
                                <Text style={valueStyle}>
                                    #{orderNumber}
                                </Text>
                            </td>
                        </tr>

                        <tr>
                            <td>
                                <Text style={labelStyle}>
                                    Amount paid
                                </Text>
                            </td>

                            <td align="right">
                                <Text
                                    style={{
                                        ...valueStyle,
                                        fontWeight: "700",
                                        color: "#111827",
                                    }}
                                >
                                    {amount}
                                </Text>
                            </td>
                        </tr>

                        {paymentMethod && (
                            <tr>
                                <td>
                                    <Text style={labelStyle}>
                                        Payment method
                                    </Text>
                                </td>

                                <td align="right">
                                    <Text style={valueStyle}>
                                        {paymentMethod}
                                    </Text>
                                </td>
                            </tr>
                        )}

                        {paymentReference && (
                            <tr>
                                <td>
                                    <Text style={labelStyle}>
                                        Payment reference
                                    </Text>
                                </td>

                                <td
                                    align="right"
                                    style={{
                                        maxWidth: "190px",
                                        wordBreak: "break-all",
                                    }}
                                >
                                    <Text style={valueStyle}>
                                        {paymentReference}
                                    </Text>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </Section>

            <Section
                style={{
                    margin: "24px 0",
                    padding: "18px",
                    borderRadius: "10px",
                    backgroundColor: "#f8faf9",
                    border: "1px solid #e5e7eb",
                }}
            >
                <Text
                    style={{
                        margin: "0 0 6px",
                        fontSize: "14px",
                        lineHeight: "21px",
                        fontWeight: "600",
                        color: "#111827",
                    }}
                >
                    What happens next?
                </Text>

                <Text
                    style={{
                        margin: "0",
                        fontSize: "13px",
                        lineHeight: "21px",
                        color: "#4b5563",
                    }}
                >
                    The seller has been notified and can now begin processing
                    your order. We'll keep you updated as your order progresses.
                </Text>
            </Section>

            {orderUrl && (
                <Section style={{ margin: "28px 0" }}>
                    <Button href={orderUrl}>
                        View My Order
                    </Button>
                </Section>
            )}

            <Text style={paragraphStyle}>
                Please keep this email as a record of your payment.
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