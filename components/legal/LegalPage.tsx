import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

type LegalSection = { title: string; body: string };

export default function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: LegalSection[] }) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50 text-gray-900">
      <Header />
      <article className="mx-auto max-w-4xl px-6 py-14 sm:py-20">
        <Link href="/" className="text-sm font-bold text-green-600 hover:text-green-700">← Back to home</Link>
        <h1 className="mt-8 text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-5 text-base leading-8 text-gray-600">{intro}</p>
        <div className="mt-10 space-y-8 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-10">
          {sections.map((section) => <section key={section.title}><h2 className="text-lg font-bold text-gray-900">{section.title}</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 text-gray-600">{section.body}</p></section>)}
        </div>
        <p className="mt-6 text-xs text-gray-400">For questions about these policies, contact support@sellonwhatsapp.com.</p>
      </article>
      <Footer />
    </main>
  );
}
