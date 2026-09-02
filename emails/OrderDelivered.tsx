import * as React from "react";
import {
    Section,
    Text,
    Hr,
    Row,
    Column,
} from "@react-email/components";

import EmailLayout from "@/components/emails/EmailLayout";
import Button from "@/components/emails/Button";
import StatusBadge from "@/components/emails/StatusBadge";

interface OrderDeliveredProps {
    customerName?: string;
    orderNumber: string;
    storeName?: string;
    deliveredAt?: string;
    orderUrl?: string;
}

export default function OrderDelivered({
    customerName = "there",
    orderNumber,
    storeName,
    deliveredAt,
    orderUrl = "https://sellonwhatsapp.com/orders",
}: OrderDeliveredProps) {
    return (
        <EmailLayout
            preview={`Order #${orderNumber} has been delivered.`}
        >
            {/* Heading */}
            <Text
                style={{
                    margin: "0 0 8px",
                    fontSize: "28px",
                    lineHeight: "36px",
                    fontWeight: "700",
                    color: "#111827",
                }}
            >
                Your order has arrived 🎉
            </Text>

            <Text
                style={{
                    margin: "0 0 24px",
                    fontSize: "15px",
                    lineHeight: "24px",
                    color: "#4B5563",
                }}
            >
                Hey {customerName},
            </Text>

            <Text
                style={{
                    margin: "0 0 20px",
                    fontSize: "15px",
                    lineHeight: "24px",
                    color: "#374151",
                }}
            >
                Good news — your order has been marked as delivered.
                We hope everything arrived safely and exactly as
                expected.
            </Text>

            {/* Status */}
            <Section
                style={{
                    margin: "0 0 24px",
                    padding: "20px",
                    backgroundColor: "#F0FDF4",
                    border: "1px solid #DCFCE7",
                    borderRadius: "10px",
                }}
            >
                <Text
                    style={{
                        margin: "0 0 10px",
                        fontSize: "13px",
                        lineHeight: "18px",
                        fontWeight: "600",
                        color: "#166534",
                        textTransform: "uppercase",
                    }}
                >
                    Delivery status
                </Text>

                <StatusBadge status="success">
                    Delivered
                </StatusBadge>
            </Section>

            {/* Order Details */}
            <Section
                style={{
                    margin: "0 0 24px",
                    padding: "20px",
                    backgroundColor: "#F9FAFB",
                    border: "1px solid #E5E7EB",
                    borderRadius: "10px",
                }}
            >
                <Text
                    style={{
                        margin: "0 0 16px",
                        fontSize: "16px",
                        lineHeight: "22px",
                        fontWeight: "700",
                        color: "#111827",
                    }}
                >
                    Delivery details
                </Text>

                <Row style={{ marginBottom: "10px" }}>
                    <Column style={{ width: "45%" }}>
                        <Text
                            style={{
                                margin: "0",
                                fontSize: "13px",
                                color: "#6B7280",
                            }}
                        >
                            Order number
                        </Text>
                    </Column>

                    <Column>
                        <Text
                            style={{
                                margin: "0",
                                fontSize: "14px",
                                fontWeight: "600",
                                color: "#111827",
                            }}
                        >
                            #{orderNumber}
                        </Text>
                    </Column>
                </Row>

                {storeName && (
                    <Row style={{ marginBottom: "10px" }}>
                        <Column style={{ width: "45%" }}>
                            <Text
                                style={{
                                    margin: "0",
                                    fontSize: "13px",
                                    color: "#6B7280",
                                }}
                            >
                                Store
                            </Text>
                        </Column>

                        <Column>
                            <Text
                                style={{
                                    margin: "0",
                                    fontSize: "14px",
                                    fontWeight: "600",
                                    color: "#111827",
                                }}
                            >
                                {storeName}
                            </Text>
                        </Column>
                    </Row>
                )}

                {deliveredAt && (
                    <Row>
                        <Column style={{ width: "45%" }}>
                            <Text
                                style={{
                                    margin: "0",
                                    fontSize: "13px",
                                    color: "#6B7280",
                                }}
                            >
                                Delivered
                            </Text>
                        </Column>

                        <Column>
                            <Text
                                style={{
                                    margin: "0",
                                    fontSize: "14px",
                                    fontWeight: "600",
                                    color: "#111827",
                                }}
                            >
                                {deliveredAt}
                            </Text>
                        </Column>
                    </Row>
                )}
            </Section>

            {/* CTA */}
            <Section
                style={{
                    textAlign: "center",
                    margin: "28px 0",
                }}
            >
                <Button href={orderUrl}>
                    View My Order
                </Button>
            </Section>

            <Hr
                style={{
                    margin: "28px 0",
                    borderColor: "#E5E7EB",
                }}
            />

            {/* Feedback */}
            <Text
                style={{
                    margin: "0 0 8px",
                    fontSize: "16px",
                    lineHeight: "22px",
                    fontWeight: "700",
                    color: "#111827",
                }}
            >
                Everything okay?
            </Text>

            <Text
                style={{
                    margin: "0 0 16px",
                    fontSize: "14px",
                    lineHeight: "22px",
                    color: "#6B7280",
                }}
            >
                If your order arrived safely, great! If something
                isn't right with your order, please contact the
                seller or reach out to our support team so we can
                help.
            </Text>

            <Text
                style={{
                    margin: "0",
                    fontSize: "14px",
                    lineHeight: "22px",
                    color: "#6B7280",
                }}
            >
                Thanks for shopping with SellOnWhatsApp.
            </Text>

            {/* Signature */}
            <Text
                style={{
                    margin: "28px 0 0",
                    fontSize: "14px",
                    lineHeight: "22px",
                    color: "#374151",
                }}
            >
                Best,
                <br />
                <strong>Asugh Iyorlaha</strong>
                <br />
                C.E.O & Founder
                <br />
                SellOnWhatsApp
            </Text>
        </EmailLayout>
    );
}