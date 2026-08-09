import LegalPage from "@/components/legal/LegalPage";

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" intro="This page explains the information SellOnWhatsApp collects and how it is used to provide the marketplace, storefront, payment, order, and support features." sections={[
    { title: "Information we collect", body: "We may collect account details, store and product information, contact details, order information, payment references, support messages, and technical usage data needed to operate and secure the service." },
    { title: "How we use information", body: "We use information to create accounts, display storefronts, process orders, provide support, prevent fraud, improve the platform, send relevant notifications, and meet legal or financial record-keeping obligations." },
    { title: "Sharing and service providers", body: "Information is shared only with the service providers needed to operate features such as authentication, payments, hosting, analytics, notifications, and customer support, or when required by law." },
    { title: "Your choices", body: "You may request access to, correction of, or deletion of eligible personal information by contacting support. Some transaction and compliance records may need to be retained." },
  ]} />;
}
