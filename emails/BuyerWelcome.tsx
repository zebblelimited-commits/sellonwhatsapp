import * as React from "react";
import {
    Section,
    Text,
    Hr,
} from "@react-email/components";

import EmailLayout from "@/components/emails/EmailLayout";
import Button from "@/components/emails/Button";

interface BuyerWelcomeProps {
    customerName?: string;
    exploreUrl?: string;
}

export default function BuyerWelcome({
    customerName = "there",
    exploreUrl = "https://sellonwhatsapp.com",
}: BuyerWelcomeProps) {
    return (
        <EmailLayout
            preview="Welcome to SellOnWhatsApp — a simpler way to discover and shop from businesses."
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
                Welcome to SellOnWhatsApp! 👋
            </Text>

            <Text
                style={{
                    margin: "0 0 20px",
                    fontSize: "15px",
                    lineHeight: "24px",
                    color: "#374151",
                }}
            >
                Hey {customerName},
            </Text>

            <Text
                style={{
                    margin: "0 0 16px",
                    fontSize: "15px",
                    lineHeight: "24px",
                    color: "#374151",
                }}
            >
                We're excited to have you here.
            </Text>

            <Text
                style={{
                    margin: "0 0 16px",
                    fontSize: "15px",
                    lineHeight: "24px",
                    color: "#374151",
                }}
            >
                SellOnWhatsApp makes it easier to discover
                businesses, explore what they offer, and shop
                without the usual hassle.
            </Text>

            <Text
                style={{
                    margin: "0 0 24px",
                    fontSize: "15px",
                    lineHeight: "24px",
                    color: "#374151",
                }}
            >
                Whether you're looking for something specific or
                simply exploring, you can discover stores, find
                products and services you like, place orders, and
                stay connected with the businesses you love.
            </Text>

            {/* CTA */}
            <Section
                style={{
                    textAlign: "center",
                    margin: "28px 0",
                }}
            >
                <Button href={exploreUrl}>
                    Explore SellOnWhatsApp
                </Button>
            </Section>

            {/* Simple steps */}
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
                    Getting started is simple
                </Text>

                <Text
                    style={{
                        margin: "0 0 12px",
                        fontSize: "14px",
                        lineHeight: "22px",
                        color: "#374151",
                    }}
                >
                    <strong>1. Discover stores</strong>
                    <br />
                    Find businesses and stores on SellOnWhatsApp.
                </Text>

                <Text
                    style={{
                        margin: "0 0 12px",
                        fontSize: "14px",
                        lineHeight: "22px",
                        color: "#374151",
                    }}
                >
                    <strong>2. Find something you like</strong>
                    <br />
                    Explore products, services, and offers from
                    businesses.
                </Text>

                <Text
                    style={{
                        margin: "0",
                        fontSize: "14px",
                        lineHeight: "22px",
                        color: "#374151",
                    }}
                >
                    <strong>3. Place your order</strong>
                    <br />
                    Order directly and keep track of your purchase.
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
                    A quick question
                </Text>

                <Text
                    style={{
                        margin: "0",
                        fontSize: "14px",
                        lineHeight: "22px",
                        color: "#374151",
                    }}
                >
                    What brought you to SellOnWhatsApp? And what
                    are you hoping to find or buy here?
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
                    myself, and your feedback will help us build a
                    better shopping experience.
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