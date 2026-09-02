import * as React from "react";
import {
    Section,
    Text,
    Hr,
} from "@react-email/components";

import EmailLayout from "@/components/emails/EmailLayout";
import Button from "@/components/emails/Button";

interface SellerWelcomeProps {
    sellerName?: string;
    storeName?: string;
    dashboardUrl?: string;
}

export default function SellerWelcome({
    sellerName = "there",
    storeName,
    dashboardUrl = "https://sellonwhatsapp.com/dashboard",
}: SellerWelcomeProps) {
    return (
        <EmailLayout
            preview="Welcome to SellOnWhatsApp — let's get your store ready."
        >
            {/* Heading */}
            <Text
                style={{
                    margin: "0 0 12px",
                    fontSize: "28px",
                    lineHeight: "36px",
                    fontWeight: "700",
                    color: "#111827",
                }}
            >
                Welcome to SellOnWhatsApp! 🎉
            </Text>

            <Text
                style={{
                    margin: "0 0 20px",
                    fontSize: "15px",
                    lineHeight: "24px",
                    color: "#374151",
                }}
            >
                Hey {sellerName},
            </Text>

            <Text
                style={{
                    margin: "0 0 16px",
                    fontSize: "15px",
                    lineHeight: "24px",
                    color: "#374151",
                }}
            >
                I'm Asugh, Founder and CEO of SellOnWhatsApp.
            </Text>

            <Text
                style={{
                    margin: "0 0 16px",
                    fontSize: "15px",
                    lineHeight: "24px",
                    color: "#374151",
                }}
            >
                Thanks for joining us. I'm excited to have you
                building your business with SellOnWhatsApp.
            </Text>

            {storeName && (
                <Section
                    style={{
                        margin: "0 0 20px",
                        padding: "16px 18px",
                        backgroundColor: "#F0FDF4",
                        border: "1px solid #DCFCE7",
                        borderRadius: "10px",
                    }}
                >
                    <Text
                        style={{
                            margin: "0 0 4px",
                            fontSize: "12px",
                            lineHeight: "18px",
                            color: "#6B7280",
                            textTransform: "uppercase",
                            fontWeight: "600",
                        }}
                    >
                        Your store
                    </Text>

                    <Text
                        style={{
                            margin: "0",
                            fontSize: "17px",
                            lineHeight: "24px",
                            fontWeight: "700",
                            color: "#111827",
                        }}
                    >
                        {storeName}
                    </Text>
                </Section>
            )}

            <Text
                style={{
                    margin: "0 0 16px",
                    fontSize: "15px",
                    lineHeight: "24px",
                    color: "#374151",
                }}
            >
                We started SellOnWhatsApp because selling online
                shouldn't have to be complicated.
            </Text>

            <Text
                style={{
                    margin: "0 0 24px",
                    fontSize: "15px",
                    lineHeight: "24px",
                    color: "#374151",
                }}
            >
                Your customers are already on WhatsApp. Our goal
                is to give you the tools to turn those conversations
                into a simple, organized online shopping experience
                — without making you learn a complicated system.
            </Text>

            {/* CTA */}
            <Section
                style={{
                    textAlign: "center",
                    margin: "28px 0",
                }}
            >
                <Button href={dashboardUrl}>
                    Set Up My Store
                </Button>
            </Section>

            {/* Getting started */}
            <Section
                style={{
                    margin: "28px 0",
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
                    Getting your store ready
                </Text>

                <Text
                    style={{
                        margin: "0 0 12px",
                        fontSize: "14px",
                        lineHeight: "22px",
                        color: "#374151",
                    }}
                >
                    <strong>1. Set up your store</strong>
                    <br />
                    Add your business information and customize your
                    storefront.
                </Text>

                <Text
                    style={{
                        margin: "0 0 12px",
                        fontSize: "14px",
                        lineHeight: "22px",
                        color: "#374151",
                    }}
                >
                    <strong>2. Add what you sell</strong>
                    <br />
                    Add your products, services, or anything you want
                    your customers to discover.
                </Text>

                <Text
                    style={{
                        margin: "0 0 12px",
                        fontSize: "14px",
                        lineHeight: "22px",
                        color: "#374151",
                    }}
                >
                    <strong>3. Share your store</strong>
                    <br />
                    Share your SellOnWhatsApp store with your
                    customers and WhatsApp contacts.
                </Text>

                <Text
                    style={{
                        margin: "0",
                        fontSize: "14px",
                        lineHeight: "22px",
                        color: "#374151",
                    }}
                >
                    <strong>4. Start receiving orders</strong>
                    <br />
                    Customers can browse, order, pay, and keep track
                    of their purchases.
                </Text>
            </Section>

            <Hr
                style={{
                    margin: "28px 0",
                    borderColor: "#E5E7EB",
                }}
            />

            {/* Founder message */}
            <Section
                style={{
                    padding: "20px",
                    backgroundColor: "#F0FDF4",
                    border: "1px solid #DCFCE7",
                    borderRadius: "10px",
                }}
            >
                <Text
                    style={{
                        margin: "0 0 10px",
                        fontSize: "16px",
                        lineHeight: "22px",
                        fontWeight: "700",
                        color: "#111827",
                    }}
                >
                    I'd love to hear from you
                </Text>

                <Text
                    style={{
                        margin: "0",
                        fontSize: "14px",
                        lineHeight: "22px",
                        color: "#374151",
                    }}
                >
                    What do you sell? And what's one thing that would
                    make SellOnWhatsApp more useful for your business?
                </Text>

                <Text
                    style={{
                        margin: "12px 0 0",
                        fontSize: "14px",
                        lineHeight: "22px",
                        color: "#374151",
                    }}
                >
                    Just reply to this email. I read the replies
                    myself, and we're building SellOnWhatsApp around
                    what sellers actually need.
                </Text>
            </Section>

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