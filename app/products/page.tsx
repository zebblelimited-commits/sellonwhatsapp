import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Popular from "@/components/sections/Popular";

export default function ProductsPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <Header />
      <Popular fullPage />
      <Footer />
    </main>
  );
}
