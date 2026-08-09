import LegalPage from "@/components/legal/LegalPage";

export default function TermsPage() {
  return <LegalPage title="Terms of Service" intro="These terms govern access to SellOnWhatsApp and the use of its marketplace, storefront, communication, payment, and order-management features." sections={[
    { title: "Using the platform", body: "You must provide accurate account information, protect your credentials, and use the platform lawfully. Sellers are responsible for their listings, prices, fulfillment, customer communication, and business claims." },
    { title: "Orders and payments", body: "Orders are subject to product availability, seller fulfillment, payment confirmation, and the platform’s dispute and refund procedures. Payment provider terms may also apply." },
    { title: "Prohibited activity", body: "Do not use the platform for fraud, impersonation, prohibited goods, abusive conduct, unauthorized data collection, manipulation of analytics, or attempts to bypass platform security." },
    { title: "Suspension and changes", body: "We may restrict or suspend accounts and listings that violate these terms or create risk for buyers, sellers, or the platform. Features and terms may be updated as the service develops." },
  ]} />;
}
