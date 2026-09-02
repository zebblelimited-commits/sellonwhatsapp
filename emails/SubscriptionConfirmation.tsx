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

interface SubscriptionConfirmationProps {
    customerName?: string;

    subscriptionType: SubscriptionType;

    planName: string;

    amount: string;

    billingPeriod?: string;

    startDate?: string;

    expiryDate?: string;

    transactionReference?: string;

    benefits?: string[];

    dashboardUrl?: string;
}

export default function SubscriptionConfirmation({
    customerName = "there",
    subscriptionType,
    planName,
    amount,
    billingPeriod,
    startDate,
    expiryDate,
    transactionReference,
    benefits = [],
    dashboardUrl = "https://sellonwhatsapp.com/dashboard",
}: SubscriptionConfirmationProps) {
    const subscriptionInfo = {
        seller: {
            title: "Your seller subscription is active 🎉",
            description:
                "Your SellOnWhatsApp seller subscription has been successfully activated.",
            label: "Seller Subscription",
            defaultBenefits: [
                "Access to your seller plan features",
                "Manage your online store",
                "Receive and manage customer orders",
            ],
        },

        store_boost: {
            title: "Your store boost is active 🚀",
            description:
                "Your Store Boost subscription has been successfully activated.",
            label: "Store Boost",
            defaultBenefits: [
                "Boost your store visibility",
                "Reach more potential customers",
                "Promote your products and services",
            ],
        },

        marketplace_partner: {
            title: "Welcome to the Marketplace Partner program 🤝",
            description:
                "Your Marketplace Partner subscription has been successfully activated.",
            label: "Marketplace Partner",
            defaultBenefits: [
                "Marketplace Partner benefits",
                "Partner status on SellOnWhatsApp",
                "Seller commission benefits while your subscription is active",
            ],
        },
    }[subscriptionType];

    const displayBenefits =
        benefits.length > 0
            ? benefits
            : subscriptionInfo.defaultBenefits;

    return (
        <EmailLayout
            preview={`${subscriptionInfo.label} — ${planName} is now active.`}
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

            {/* Active Status */}
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
                    Subscription status
                </Text>

                <StatusBadge status="success">
                    Active
                </StatusBadge>
            </Section>

            {/* Subscription Details */}
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
                    Subscription details
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
                            Amount
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

                {startDate && (
                    <Row style={{ marginBottom: "10px" }}>
                        <Column style={{ width: "45%" }}>
                            <Text
                                style={{
                                    margin: "0",
                                    fontSize: "13px",
                                    color: "#6B7280",
                                }}
                            >
                                Start date
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
                                {startDate}
                            </Text>
                        </Column>
                    </Row>
                )}

                {expiryDate && (
                    <Row>
                        <Column style={{ width: "45%" }}>
                            <Text
                                style={{
                                    margin: "0",
                                    fontSize: "13px",
                                    color: "#6B7280",
                                }}
                            >
                                Next renewal / expiry
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
                )}
            </Section>

            {/* Benefits */}
            {displayBenefits.length > 0 && (
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
                        What's included
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
            )}

            {/* Payment Reference */}
            {transactionReference && (
                <Section
                    style={{
                        margin: "0 0 24px",
                        padding: "16px",
                        backgroundColor: "#F9FAFB",
                        borderRadius: "8px",
                    }}
                >
                    <Text
                        style={{
                            margin: "0 0 5px",
                            fontSize: "12px",
                            lineHeight: "18px",
                            color: "#6B7280",
                        }}
                    >
                        Payment reference
                    </Text>

                    <Text
                        style={{
                            margin: "0",
                            fontSize: "13px",
                            lineHeight: "20px",
                            fontWeight: "600",
                            color: "#374151",
                            wordBreak: "break-all",
                        }}
                    >
                        {transactionReference}
                    </Text>
                </Section>
            )}

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

            {/* Renewal information */}
            <Text
                style={{
                    margin: "0 0 8px",
                    fontSize: "16px",
                    lineHeight: "22px",
                    fontWeight: "700",
                    color: "#111827",
                }}
            >
                What happens next?
            </Text>

            <Text
                style={{
                    margin: "0",
                    fontSize: "14px",
                    lineHeight: "22px",
                    color: "#6B7280",
                }}
            >
                Your subscription is now active. You can manage
                your plan, view your subscription details, and
                access your available features from your
                SellOnWhatsApp dashboard.
            </Text>

            {expiryDate && (
                <Text
                    style={{
                        margin: "14px 0 0",
                        fontSize: "14px",
                        lineHeight: "22px",
                        color: "#6B7280",
                    }}
                >
                    Your current subscription is active until{" "}
                    <strong>{expiryDate}</strong>.
                </Text>
            )}

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