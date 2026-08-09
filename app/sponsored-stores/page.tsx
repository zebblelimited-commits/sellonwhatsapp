import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SponsoredStores from "@/components/sections/SponsoredStores";

export default function SponsoredStoresPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <Header />
      <SponsoredStores fullPage />
      <Footer />
    </main>
  );
}
