import LegalPage from "@/components/legal/LegalPage";

export default function CookiesPage() {
  return <LegalPage title="Cookie Policy" intro="SellOnWhatsApp uses cookies and similar technologies to keep sessions secure, remember preferences, understand platform usage, and improve the customer experience." sections={[
    { title: "Essential cookies", body: "These support authentication, security, navigation, and core marketplace functions. The platform may not work correctly if they are disabled." },
    { title: "Preferences and analytics", body: "These help us remember settings and understand aggregate usage such as page views, searches, clicks, and feature performance. Analytics data is used to improve the service." },
    { title: "Managing cookies", body: "You can manage cookies through your browser settings. Blocking or deleting cookies may sign you out or affect features that rely on a secure session." },
  ]} />;
}
