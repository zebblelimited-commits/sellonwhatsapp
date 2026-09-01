import Link from "next/link";
import { ArrowRight, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SocialLinks from "@/components/layout/SocialLinks";
import { Plus_Jakarta_Sans } from "@/lib/fonts";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const primaryWhatsApp = "2349135146692";

export default function ContactPage() {
  return (
    <main className={`${font.className} min-h-screen bg-[#f7faf7] text-gray-900`}>
      <Header />

      <section className="relative overflow-hidden bg-[#123b25] px-6 py-16 text-white sm:py-24">
        <div className="absolute -right-24 -top-32 h-80 w-80 rounded-full bg-green-400/20 blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 h-96 w-96 rounded-full bg-lime-300/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.28em] text-lime-300">We’re here to help</p>
          <h1 className="mt-5 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">Let’s talk about what you’re building.</h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-green-100 sm:text-lg">Have a question about buying, selling, delivery, or your storefront? Reach out and the SellOnWhatsApp team will be happy to help.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={`https://wa.me/${primaryWhatsApp}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-green-900 transition hover:bg-lime-100"><MessageCircle size={17} /> Chat on WhatsApp</a>
            <a href="mailto:support@sellonwhatsapp.com" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-extrabold text-white transition hover:bg-white/20"><Mail size={17} /> Send an email</a>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 py-12 sm:py-16 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-green-600">Contact details</p>
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">A real team, close to your business.</h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-gray-500">Use whichever channel is most convenient. For order or account support, include your store link or order ID so we can assist faster.</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <a href="tel:+2349135146692" className="group rounded-2xl border border-gray-100 bg-gray-50 p-5 transition hover:border-green-200 hover:bg-green-50">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-100 text-green-700"><Phone size={19} /></div>
              <p className="mt-4 text-xs font-bold uppercase tracking-widest text-gray-400">Call us</p>
              <p className="mt-1 text-sm font-extrabold text-gray-900 group-hover:text-green-700">0913 514 6692</p>
              <p className="mt-1 text-sm font-extrabold text-gray-900 group-hover:text-green-700">0803 781 1869</p>
            </a>
            <a href="mailto:support@sellonwhatsapp.com" className="group rounded-2xl border border-gray-100 bg-gray-50 p-5 transition hover:border-green-200 hover:bg-green-50">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Mail size={19} /></div>
              <p className="mt-4 text-xs font-bold uppercase tracking-widest text-gray-400">Email support</p>
              <p className="mt-1 break-all text-sm font-extrabold text-gray-900 group-hover:text-green-700">support@sellonwhatsapp.com</p>
              <p className="mt-2 text-xs text-gray-500">We’ll get back to you as soon as possible.</p>
            </a>
          </div>

          <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><MapPin size={19} /></div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Visit us</p>
                <p className="mt-1 max-w-lg text-sm font-extrabold leading-6 text-gray-900">PLOT 6992, BESIDE NELO PLAZA, OPPOSITE MINING QUARTERS, RANTYA, JOS, PLATEAU, NIGERIA</p>
                <a href="https://www.google.com/maps/search/?api=1&query=Plot+6992+Beside+Nelo+Plaza+Opposite+Mining+Quarters+Rantya+Jos+Plateau+Nigeria" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-green-700 hover:text-green-800">Open in Maps <ArrowRight size={13} /></a>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-gray-100 sm:p-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-green-600">Stay connected</p>
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight">Follow SellOnWhatsApp</h2>
          <p className="mt-4 text-sm leading-7 text-gray-500">Get product tips, seller stories, marketplace updates, and announcements across our social channels.</p>
          <div className="mt-8"><SocialLinks /></div>
          <div className="mt-10 rounded-2xl bg-gradient-to-br from-green-50 to-lime-50 p-5">
            <p className="text-sm font-extrabold text-green-950">Need a quick answer?</p>
            <p className="mt-2 text-sm leading-6 text-green-900/70">Our WhatsApp line is the fastest way to reach the team about an active order or delivery.</p>
            <a href={`https://wa.me/${primaryWhatsApp}?text=${encodeURIComponent("Hello SellOnWhatsApp, I need help.")}`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-green-700 hover:text-green-900">Start a conversation <ArrowRight size={15} /></a>
          </div>
          <Link href="/faq" className="mt-8 inline-flex items-center gap-2 text-sm font-extrabold text-gray-700 hover:text-green-700">Browse frequently asked questions <ArrowRight size={15} /></Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}
