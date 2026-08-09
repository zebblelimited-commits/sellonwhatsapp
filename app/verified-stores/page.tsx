import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import NewStores from "@/components/sections/NewStores";

export default function VerifiedStoresPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <Header />
      <NewStores fullPage />
      <Footer />
    </main>
  );
}
