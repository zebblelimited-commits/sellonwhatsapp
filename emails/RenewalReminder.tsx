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

type SubscriptionType =
    | "seller"
    | "store_boost"
    | "marketplace_partner";

interface RenewalReminderProps {
    customerName?: string;

    subscriptionType: SubscriptionType;

    planName: string;

    amount: string;

    expiryDate: string;

    renewalDate?: string;

    billingPeriod?: string;

    benefits?: string[];

    dashboardUrl?: string;
}

export default function RenewalReminder({
    customerName = "there",
    subscriptionType,
    planName,
    amount,
    expiryDate,
    renewalDate,
    billingPeriod,
    benefits = [],
    dashboardUrl = "https://sellonwhatsapp.com/dashboard",
}: RenewalReminderProps) {
    const subscriptionInfo = {
        seller: {
            title: "Your seller subscription is renewing soon ⏰",
            description:
                "Just a quick heads-up — your SellOnWhatsApp seller subscription is coming up for renewal.",
            label: "Seller Subscription",
            defaultBenefits: [
                "Continue using your seller plan features",
                "Keep your online store active",
                "Continue receiving and managing orders",
            ],
        },

        store_boost: {
            title: "Your Store Boost is renewing soon 🚀",
            description:
                "Your Store Boost subscription is coming up for renewal. Renew to keep your store boost active.",
            label: "Store Boost",
            defaultBenefits: [
                "Keep your store boost active",
                "Continue benefiting from increased visibility",
                "Continue promoting your products and services",
            ],
        },

        marketplace_partner: {
            title: "Your Marketplace Partner subscription is renewing soon 🤝",
            description:
                "Your Marketplace Partner subscription is coming up for renewal. Renew to keep your Partner benefits active.",
            label: "Marketplace Partner",
            defaultBenefits: [
                "Keep your Marketplace Partner status",
                "Continue receiving Partner benefits",
                "Continue enjoying the applicable seller commission benefit",
            ],
        },
    }[subscriptionType];

    const displayBenefits =
        benefits.length > 0
            ? benefits
            : subscriptionInfo.defaultBenefits;

    return (
        <EmailLayout
            preview={`${subscriptionInfo.label} — ${planName} is renewing soon.`}
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
                {subscriptionInfo.title}
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
                {subscriptionInfo.description}
            </Text>

            {/* Status */}
            <Section
                style={{
                    margin: "0 0 24px",
                    padding: "20px",
                    backgroundColor: "#FFFBEB",
                    border: "1px solid #FEF3C7",
                    borderRadius: "10px",
                }}
            >
                <Text
                    style={{
                        margin: "0 0 10px",
                        fontSize: "13px",
                        lineHeight: "18px",
                        fontWeight: "600",
                        color: "#92400E",
                        textTransform: "uppercase",
                    }}
                >
                    Renewal status
                </Text>

                <StatusBadge status="warning">
                    Renewing soon
                </StatusBadge>
            </Section>

            {/* Renewal Details */}
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
                    Renewal details
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
                            Subscription
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
                            {subscriptionInfo.label}
                        </Text>
                    </Column>
                </Row>

                <Row style={{ marginBottom: "10px" }}>
                    <Column style={{ width: "45%" }}>
                        <Text
                            style={{
                                margin: "0",
                                fontSize: "13px",
                                color: "#6B7280",
                            }}
                        >
                            Plan
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
                            {planName}
                        </Text>
                    </Column>
                </Row>

                <Row style={{ marginBottom: "10px" }}>
                    <Column style={{ width: "45%" }}>
                        <Text
                            style={{
                                margin: "0",
                                fontSize: "13px",
                                color: "#6B7280",
                            }}
                        >
                            Renewal amount
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
                            {amount}
                        </Text>
                    </Column>
                </Row>

                {billingPeriod && (
                    <Row style={{ marginBottom: "10px" }}>
                        <Column style={{ width: "45%" }}>
                            <Text
                                style={{
                                    margin: "0",
                                    fontSize: "13px",
                                    color: "#6B7280",
                                }}
                            >
                                Billing period
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
                                {billingPeriod}
                            </Text>
                        </Column>
                    </Row>
                )}

                <Row style={{ marginBottom: renewalDate ? "10px" : "0" }}>
                    <Column style={{ width: "45%" }}>
                        <Text
                            style={{
                                margin: "0",
                                fontSize: "13px",
                                color: "#6B7280",
                            }}
                        >
                            Current expiry
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
                            {expiryDate}
                        </Text>
                    </Column>
                </Row>

                {renewalDate && (
                    <Row>
                        <Column style={{ width: "45%" }}>
                            <Text
                                style={{
                                    margin: "0",
                                    fontSize: "13px",
                                    color: "#6B7280",
                                }}
                            >
                                Renewal date
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
                                {renewalDate}
                            </Text>
                        </Column>
                    </Row>
                )}
            </Section>

            {/* Benefits */}
            <Section
                style={{
                    margin: "0 0 24px",
                    padding: "20px",
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #E5E7EB",
                    borderRadius: "10px",
                }}
            >
                <Text
                    style={{
                        margin: "0 0 14px",
                        fontSize: "16px",
                        lineHeight: "22px",
                        fontWeight: "700",
                        color: "#111827",
                    }}
                >
                    Why keep your subscription active?
                </Text>

                {displayBenefits.map((benefit, index) => (
                    <Row
                        key={index}
                        style={{
                            marginBottom:
                                index === displayBenefits.length - 1
                                    ? "0"
                                    : "10px",
                        }}
                    >
                        <Column
                            style={{
                                width: "28px",
                                verticalAlign: "top",
                            }}
                        >
                            <Text
                                style={{
                                    margin: "0",
                                    fontSize: "16px",
                                    lineHeight: "20px",
                                    color: "#25D366",
                                }}
                            >
                                ✓
                            </Text>
                        </Column>

                        <Column>
                            <Text
                                style={{
                                    margin: "0",
                                    fontSize: "14px",
                                    lineHeight: "21px",
                                    color: "#374151",
                                }}
                            >
                                {benefit}
                            </Text>
                        </Column>
                    </Row>
                ))}
            </Section>

            {/* CTA */}
            <Section
                style={{
                    textAlign: "center",
                    margin: "28px 0",
                }}
            >
                <Button href={dashboardUrl}>
                    Manage My Subscription
                </Button>
            </Section>

            <Hr
                style={{
                    margin: "28px 0",
                    borderColor: "#E5E7EB",
                }}
            />

            <Text
                style={{
                    margin: "0 0 8px",
                    fontSize: "16px",
                    lineHeight: "22px",
                    fontWeight: "700",
                    color: "#111827",
                }}
            >
                No action may be needed
            </Text>

            <Text
                style={{
                    margin: "0",
                    fontSize: "14px",
                    lineHeight: "22px",
                    color: "#6B7280",
                }}
            >
                If you have a valid payment method set up for
                automatic renewal, your subscription may renew
                automatically. You can check or update your
                subscription settings from your dashboard.
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