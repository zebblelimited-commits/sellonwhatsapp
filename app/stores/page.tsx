import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import TrendingStores from "@/components/sections/TrendingStores";

export default function StoresPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <Header />
      <TrendingStores fullPage />
      <Footer />
    </main>
  );
}
