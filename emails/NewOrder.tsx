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

interface NewOrderProps {
    sellerName?: string;

    orderNumber: string;

    customerName?: string;

    items: OrderItem[];

    subtotal: string;

    shipping?: string;

    discount?: string;

    total: string;

    orderUrl?: string;

    paymentStatus?: string;
}

export default function NewOrder({
    sellerName = "there",
    orderNumber,
    customerName,
    items,
    subtotal,
    shipping = "₦0",
    discount = "₦0",
    total,
    orderUrl,
    paymentStatus = "Paid",
}: NewOrderProps) {
    return (
        <EmailLayout
            preview={`New paid order #${orderNumber} is ready for processing.`}
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
                You have a new order 🎉
            </Heading>

            <Text style={greetingStyle}>
                Hey {sellerName},
            </Text>

            <Text style={paragraphStyle}>
                Great news! A customer has placed a new order from your store.
            </Text>

            {customerName && (
                <Text style={paragraphStyle}>
                    <strong>{customerName}</strong> has placed order{" "}
                    <strong>#{orderNumber}</strong>.
                </Text>
            )}

            {!customerName && (
                <Text style={paragraphStyle}>
                    A customer has placed order{" "}
                    <strong>#{orderNumber}</strong>.
                </Text>
            )}

            <Section
                style={{
                    margin: "20px 0",
                    padding: "14px 16px",
                    borderRadius: "10px",
                    backgroundColor: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                }}
            >
                <Text
                    style={{
                        margin: "0",
                        fontSize: "14px",
                        lineHeight: "21px",
                        color: "#166534",
                        fontWeight: "600",
                    }}
                >
                    Payment status: {paymentStatus}
                </Text>
            </Section>

            <OrderCard
                orderNumber={orderNumber}
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
                    What you need to do next
                </Text>

                <Text
                    style={{
                        margin: "0",
                        fontSize: "13px",
                        lineHeight: "21px",
                        color: "#4b5563",
                    }}
                >
                    Review the order, prepare the items, and update the order
                    status from your dashboard when you're ready to continue
                    with delivery or fulfillment.
                </Text>
            </Section>

            {orderUrl && (
                <Section style={{ margin: "28px 0" }}>
                    <Button href={orderUrl}>
                        View Order
                    </Button>
                </Section>
            )}

            <Text style={paragraphStyle}>
                Keeping your order status updated helps your customer stay
                informed and makes the buying experience smoother.
            </Text>

            <Text style={closingStyle}>
                Keep selling 🚀
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