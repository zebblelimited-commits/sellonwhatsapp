import * as React from "react";
import {
    Heading,
    Section,
    Text,
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
    storeName = "your store",
    dashboardUrl = "https://sellonwhatsapp.com/dashboard",
}: SellerWelcomeProps) {
    return (
        <EmailLayout
            preview="Welcome to SellOnWhatsApp — let's get your store ready."
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
                Welcome to SellOnWhatsApp! 🎉
            </Heading>

            <Text
                style={{
                    margin: "0 0 18px",
                    fontSize: "16px",
                    lineHeight: "26px",
                    color: "#374151",
                }}
            >
                Hey {sellerName},
            </Text>

            <Text style={paragraphStyle}>
                I'm Asugh, the Founder and CEO of SellOnWhatsApp.
            </Text>

            <Text style={paragraphStyle}>
                Thanks for joining us. We're excited to have you building
                your business with SellOnWhatsApp.
            </Text>

            <Text style={paragraphStyle}>
                We started SellOnWhatsApp because we believe selling online
                shouldn't be complicated.
            </Text>

            <Text style={paragraphStyle}>
                You already have customers on WhatsApp. We want to give you
                the tools to turn those conversations into a simple,
                organized online shopping experience.
            </Text>

            <Section style={{ margin: "28px 0" }}>
                <Button href={dashboardUrl}>
                    Set Up My Store
                </Button>
            </Section>

            <Text
                style={{
                    margin: "28px 0 14px",
                    fontSize: "17px",
                    lineHeight: "25px",
                    fontWeight: "700",
                    color: "#111827",
                }}
            >
                Here's how to get started:
            </Text>

            <Text style={stepStyle}>
                <strong>1. Set up your store</strong>
                <br />
                Add your business information and make your store yours.
            </Text>

            <Text style={stepStyle}>
                <strong>2. Add what you sell</strong>
                <br />
                Add your products, services, prices, images, and other
                important details.
            </Text>

            <Text style={stepStyle}>
                <strong>3. Share your store</strong>
                <br />
                Share your SellOnWhatsApp store link with your customers on
                WhatsApp, social media, or anywhere else you do business.
            </Text>

            <Text style={stepStyle}>
                <strong>4. Start receiving orders</strong>
                <br />
                Manage your orders, payments, customers, and deliveries from
                your dashboard.
            </Text>

            <Section
                style={{
                    margin: "28px 0",
                    padding: "20px",
                    backgroundColor: "#f8faf9",
                    borderRadius: "10px",
                    border: "1px solid #e5e7eb",
                }}
            >
                <Text
                    style={{
                        margin: "0",
                        fontSize: "14px",
                        lineHeight: "22px",
                        color: "#374151",
                    }}
                >
                    <strong>We'd love to know what you're building.</strong>
                    <br />
                    What do you sell? And what would make SellOnWhatsApp more
                    useful for your business?
                </Text>
            </Section>

            <Text style={paragraphStyle}>
                Just reply to this email and tell us. We're listening, and
                your feedback will help shape the platform.
            </Text>

            <Text
                style={{
                    margin: "30px 0 4px",
                    fontSize: "15px",
                    lineHeight: "22px",
                    color: "#374151",
                }}
            >
                Cheers,
            </Text>

            <Text
                style={{
                    margin: "0",
                    fontSize: "15px",
                    lineHeight: "22px",
                    fontWeight: "700",
                    color: "#111827",
                }}
            >
                Asugh Iyorlaha
            </Text>

            <Text
                style={{
                    margin: "2px 0 0",
                    fontSize: "13px",
                    lineHeight: "20px",
                    color: "#6B7280",
                }}
            >
                C.E.O & Founder, SellOnWhatsApp
            </Text>
        </EmailLayout>
    );
}

const paragraphStyle: React.CSSProperties = {
    margin: "0 0 16px",
    fontSize: "15px",
    lineHeight: "24px",
    color: "#4B5563",
};

const stepStyle: React.CSSProperties = {
    margin: "0 0 18px",
    fontSize: "14px",
    lineHeight: "22px",
    color: "#4B5563",
};