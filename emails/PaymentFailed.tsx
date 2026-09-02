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

interface PaymentFailedProps {
    customerName?: string;

    subscriptionType: SubscriptionType;

    planName: string;

    amount: string;

    failureReason?: string;

    expiryDate?: string;

    gracePeriodEnds?: string;

    attemptDate?: string;

    benefits?: string[];

    paymentUrl?: string;

    dashboardUrl?: string;
}

export default function PaymentFailed({
    customerName = "there",
    subscriptionType,
    planName,
    amount,
    failureReason,
    expiryDate,
    gracePeriodEnds,
    attemptDate,
    benefits = [],
    paymentUrl = "https://sellonwhatsapp.com/dashboard/subscription",
    dashboardUrl = "https://sellonwhatsapp.com/dashboard",
}: PaymentFailedProps) {
    const subscriptionInfo = {
        seller: {
            title: "We couldn't renew your seller subscription",
            description:
                "We tried to process your subscription renewal, but the payment wasn't successful.",
            label: "Seller Subscription",
            defaultBenefits: [
                "Keep your seller plan active",
                "Keep your online store running",
                "Continue receiving and managing customer orders",
            ],
        },

        store_boost: {
            title: "We couldn't renew your Store Boost",
            description:
                "We tried to renew your Store Boost subscription, but the payment wasn't successful.",
            label: "Store Boost",
            defaultBenefits: [
                "Keep your Store Boost active",
                "Continue benefiting from increased visibility",
                "Continue promoting your products and services",
            ],
        },

        marketplace_partner: {
            title: "We couldn't renew your Marketplace Partner subscription",
            description:
                "We tried to renew your Marketplace Partner subscription, but the payment wasn't successful.",
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
            preview={`Payment failed for your ${subscriptionInfo.label}.`}
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
                {subscriptionInfo.description} Don't worry —
                your subscription may still be recoverable.
            </Text>

            {/* Failed Status */}
            <Section
                style={{
                    margin: "0 0 24px",
                    padding: "20px",
                    backgroundColor: "#FEF2F2",
                    border: "1px solid #FECACA",
                    borderRadius: "10px",
                }}
            >
                <Text
                    style={{
                        margin: "0 0 10px",
                        fontSize: "13px",
                        lineHeight: "18px",
                        fontWeight: "600",
                        color: "#991B1B",
                        textTransform: "uppercase",
                    }}
                >
                    Payment status
                </Text>

                <StatusBadge status="error">
                    Payment failed
                </StatusBadge>
            </Section>

            {/* Payment Details */}
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
                    Payment details
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

                {attemptDate && (
                    <Row style={{ marginBottom: "10px" }}>
                        <Column style={{ width: "45%" }}>
                            <Text
                                style={{
                                    margin: "0",
                                    fontSize: "13px",
                                    color: "#6B7280",
                                }}
                            >
                                Payment attempt
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
                                {attemptDate}
                            </Text>
                        </Column>
                    </Row>
                )}

                {failureReason && (
                    <Row>
                        <Column style={{ width: "45%" }}>
                            <Text
                                style={{
                                    margin: "0",
                                    fontSize: "13px",
                                    color: "#6B7280",
                                }}
                            >
                                Reason
                            </Text>
                        </Column>

                        <Column>
                            <Text
                                style={{
                                    margin: "0",
                                    fontSize: "14px",
                                    color: "#374151",
                                }}
                            >
                                {failureReason}
                            </Text>
                        </Column>
                    </Row>
                )}
            </Section>

            {/* Grace Period */}
            {gracePeriodEnds && (
                <Section
                    style={{
                        margin: "0 0 24px",
                        padding: "20px",
                        backgroundColor: "#FFFBEB",
                        border: "1px solid #FDE68A",
                        borderRadius: "10px",
                    }}
                >
                    <Text
                        style={{
                            margin: "0 0 8px",
                            fontSize: "16px",
                            lineHeight: "22px",
                            fontWeight: "700",
                            color: "#92400E",
                        }}
                    >
                        Your subscription is still recoverable
                    </Text>

                    <Text
                        style={{
                            margin: "0",
                            fontSize: "14px",
                            lineHeight: "22px",
                            color: "#78350F",
                        }}
                    >
                        Please update your payment method or complete
                        the payment before{" "}
                        <strong>{gracePeriodEnds}</strong> to keep
                        your subscription active.
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
                <Button href={paymentUrl}>
                    Fix My Payment
                </Button>
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
                    Why fix your payment?
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

            {/* Expiry */}
            {expiryDate && (
                <Text
                    style={{
                        margin: "0 0 20px",
                        fontSize: "14px",
                        lineHeight: "22px",
                        color: "#6B7280",
                    }}
                >
                    Your current subscription is scheduled to
                    expire on <strong>{expiryDate}</strong> if the
                    renewal payment is not completed.
                </Text>
            )}

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
                Need help?
            </Text>

            <Text
                style={{
                    margin: "0",
                    fontSize: "14px",
                    lineHeight: "22px",
                    color: "#6B7280",
                }}
            >
                If you believe this payment failure was a mistake
                or you need help updating your payment details,
                simply reply to this email or contact our support
                team.
            </Text>

            {/* Dashboard link */}
            <Text
                style={{
                    margin: "16px 0 0",
                    fontSize: "14px",
                    lineHeight: "22px",
                    color: "#6B7280",
                }}
            >
                You can also review your subscription from your{" "}
                <a
                    href={dashboardUrl}
                    style={{
                        color: "#128C7E",
                        textDecoration: "underline",
                    }}
                >
                    SellOnWhatsApp dashboard
                </a>
                .
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