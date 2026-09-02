import * as React from "react";
import {
    Heading,
    Section,
    Text,
} from "@react-email/components";

import EmailLayout from "@/components/emails/EmailLayout";
import Button from "@/components/emails/Button";
import OrderCard, {
    type OrderItem,
} from "@/components/emails/OrderCard";

interface OrderConfirmationProps {
    customerName?: string;
    orderNumber: string;

    storeName?: string;

    items: OrderItem[];

    subtotal: string;
    shipping?: string;
    discount?: string;
    total: string;

    orderUrl?: string;
}

export default function OrderConfirmation({
    customerName = "there",
    orderNumber,
    storeName,
    items,
    subtotal,
    shipping = "₦0",
    discount = "₦0",
    total,
    orderUrl,
}: OrderConfirmationProps) {
    return (
        <EmailLayout
            preview={`Your order #${orderNumber} has been received.`}
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
                We’ve received your order 🎉
            </Heading>

            <Text style={greetingStyle}>
                Hey {customerName},
            </Text>

            <Text style={paragraphStyle}>
                Thanks for your order! Your order has been received and the
                seller will begin processing it.
            </Text>

            {storeName && (
                <Text style={paragraphStyle}>
                    You’ll receive updates as your order from{" "}
                    <strong>{storeName}</strong> progresses.
                </Text>
            )}

            <OrderCard
                orderNumber={orderNumber}
                storeName={storeName}
                items={items}
                subtotal={subtotal}
                shipping={shipping}
                discount={discount}
                total={total}
            />

            <Section
                style={{
                    margin: "24px 0",
                    padding: "18px",
                    backgroundColor: "#f8faf9",
                    border: "1px solid #e5e7eb",
                    borderRadius: "10px",
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
                    The seller will review and process your order. We’ll keep you
                    updated when your order is confirmed, shipped, or ready for
                    delivery.
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
                If you have any questions about your order, you can reply to
                this email or contact our support team.
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

const closingStyle: React.CSSProperties = {
    margin: "28px 0 0",
    fontSize: "15px",
    lineHeight: "24px",
    fontWeight: "600",
    color: "#111827",
};