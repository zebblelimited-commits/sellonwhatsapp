import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const steps = [
  ["01", "Create your store", "Register, choose your seller role, and set up your WhatsApp storefront."],
  ["02", "Add your products", "Publish products or services with images, prices, availability, and delivery details."],
  ["03", "Share your link", "Send your store link to customers or let buyers discover you through the marketplace."],
  ["04", "Receive and fulfil orders", "Customers place orders, pay securely, and track the order until completion."],
];

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50 text-gray-900">
      <Header />
      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
        <div className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-green-600">How SellOnWhatsApp works</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">Turn WhatsApp conversations into a real storefront.</h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-gray-600">Sell products and services, accept payments, manage orders, and grow your customer base from one simple marketplace.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link href="/register" className="rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-700">Create your store</Link><Link href="/explore" className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50">Explore stores</Link></div>
        </div>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([number, title, description]) => <article key={number} className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm"><span className="text-sm font-black text-green-600">{number}</span><h2 className="mt-8 text-lg font-bold">{title}</h2><p className="mt-3 text-sm leading-6 text-gray-500">{description}</p></article>)}
        </div>
      </section>
      <Footer />
    </main>
  );
}
