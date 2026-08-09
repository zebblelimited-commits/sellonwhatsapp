import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SponsoredProducts from "@/components/sections/SponsoredProducts";

export default function SponsoredProductsPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <Header />
      <SponsoredProducts fullPage />
      <Footer />
    </main>
  );
}
