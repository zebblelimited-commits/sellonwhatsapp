// app/faq/page.tsx
"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus_Jakarta_Sans } from "next/font/google";
import { 
  Search, ChevronDown, ChevronUp, MessageSquare, 
  ShieldCheck, Zap, CreditCard, Package, Truck, 
  HelpCircle, ArrowRight, ExternalLink, Phone, Mail,Crown
} from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

// ✅ FAQ Category Type
type FAQCategory = 
  | "all" 
  | "getting-started" 
  | "store-management" 
  | "products" 
  | "orders-payments" 
  | "shipping" 
  | "disputes" 
  | "premium" 
  | "security" 
  | "billing" 
  | "technical";

// ✅ FAQ Item Type
interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: FAQCategory;
  tags?: string[];
  related?: string[];
}

// ✅ Comprehensive FAQ Data
const FAQ_DATA: FAQItem[] = [
  // 🚀 Getting Started
  {
    id: "gs-1",
    question: "How do I create a seller account on SellOnWhatsApp?",
    answer: "Click 'Sign Up' in the header, enter your email and phone number, verify via OTP, then complete your store profile with business details, logo, and bank account. The entire process takes less than 5 minutes.",
    category: "getting-started",
    tags: ["signup", "registration", "account"]
  },
  {
    id: "gs-2",
    question: "Is SellOnWhatsApp free to use?",
    answer: "Yes! The Free plan includes basic store listing, up to 20 products, standard analytics, and WhatsApp order sync. Premium plans (Pro Lite ₦4,999/mo, Pro Max ₦49,990/yr) unlock verified badges, real-time chat, advanced analytics, and priority support.",
    category: "getting-started",
    tags: ["pricing", "free", "plans"]
  },
  {
    id: "gs-3",
    question: "What documents do I need to verify my store?",
    answer: "For verification, you'll need: (1) CAC registration number and certificate, (2) Government-issued ID (NIN, Voter's Card, Passport, or Driver's License), (3) Business bank account details, and (4) Valid WhatsApp number. Verification typically takes 24-48 hours.",
    category: "getting-started",
    tags: ["verification", "documents", "CAC", "KYC"]
  },

  // 🏪 Store Management
  {
    id: "sm-1",
    question: "How do I customize my store page?",
    answer: "Go to Dashboard → My Store. Upload a banner image (1200x400px recommended) and logo (400x400px). Add your store description, category, location, and social links. Changes save automatically and reflect instantly on your public store URL.",
    category: "store-management",
    tags: ["customization", "branding", "storefront"]
  },
  {
    id: "sm-2",
    question: "Can I have multiple stores under one account?",
    answer: "Currently, one account = one store. If you operate multiple businesses, please create separate accounts with different email addresses. We're working on multi-store support for future releases.",
    category: "store-management",
    tags: ["multiple stores", "account"]
  },
  {
    id: "sm-3",
    question: "How do I change my store username/URL?",
    answer: "Store usernames (e.g., sellonwhatsapp.com/yourstore) can only be changed once within 30 days of creation. Go to Dashboard → Settings → Store Details. If the option is grayed out, you've reached the change limit or are within the cooldown period.",
    category: "store-management",
    tags: ["username", "URL", "settings"]
  },

  // 📦 Products & Listings
  {
    id: "pr-1",
    question: "How many products can I list?",
    answer: "Free plan: up to 20 active products. Pro Lite: up to 500 products. Pro Max: unlimited products. Archived/deleted products don't count toward your limit. You can manage products in Dashboard → Products.",
    category: "products",
    tags: ["product limit", "listings", "inventory"]
  },
  {
    id: "pr-2",
    question: "What product information is required?",
    answer: "Required fields: Product name, price (₦), category, and at least one clear photo. Recommended: detailed description, multiple images, variants (size/color), stock quantity, and shipping info. Complete listings convert 3x better!",
    category: "products",
    tags: ["product details", "requirements", "optimization"]
  },
  {
    id: "pr-3",
    question: "Can I schedule products to go live later?",
    answer: "Yes! When adding/editing a product, toggle 'Publish later' and select a date/time. The product will automatically go live at that time. You can view scheduled products in Dashboard → Products → Scheduled tab.",
    category: "products",
    tags: ["scheduling", "drafts", "publishing"]
  },

  // 💰 Orders & Payments
  {
    id: "op-1",
    question: "How do I receive payments from buyers?",
    answer: "SellOnWhatsApp uses escrow protection: (1) Buyer pays via Nomba (card/transfer), (2) Funds are held securely, (3) You ship the order and mark as 'Shipped', (4) Buyer confirms receipt, (5) Funds release to your wallet within 24 hours. Withdraw anytime to your bank account (3% fee).",
    category: "orders-payments",
    tags: ["payments", "escrow", "payouts", "Nomba"]
  },
  {
    id: "op-2",
    question: "What payment methods do buyers have?",
    answer: "Buyers can pay via: (1) Debit/Credit cards (Visa, Mastercard, Verve), (2) Bank transfer via Nomba, (3) USSD codes. All payments are processed securely by Nomba (PCI-DSS compliant). We do not store card details.",
    category: "orders-payments",
    tags: ["payment methods", "cards", "bank transfer"]
  },
  {
    id: "op-3",
    question: "When do I get paid after a sale?",
    answer: "After you mark an order as 'Shipped' and the buyer confirms receipt (or 7 days pass without dispute), funds release to your available balance. Withdraw anytime: funds arrive in your bank account within 1-3 business days.",
    category: "orders-payments",
    tags: ["payout timing", "withdrawal", "settlement"]
  },

  // 🚚 Shipping & Delivery
  {
    id: "sh-1",
    question: "Who handles shipping and delivery?",
    answer: "You (the seller) handle shipping. We recommend: (1) Clearly state shipping costs/times in product descriptions, (2) Use tracked delivery services (GIG Logistics, DHL, etc.), (3) Share tracking info with buyers via WhatsApp. For local sales, offer pickup options.",
    category: "shipping",
    tags: ["shipping", "delivery", "logistics"]
  },
  {
    id: "sh-2",
    question: "Can I offer free shipping?",
    answer: "Absolutely! In product settings, set shipping cost to ₦0 or create shipping rules (e.g., 'Free shipping on orders over ₦10,000'). Free shipping increases conversion by up to 30% — consider baking the cost into your product price.",
    category: "shipping",
    tags: ["free shipping", "pricing strategy"]
  },
  {
    id: "sh-3",
    question: "What if a package is lost or damaged in transit?",
    answer: "If a package is lost/damaged: (1) Contact the courier immediately for a claim, (2) Notify the buyer via WhatsApp, (3) In Dashboard → Orders, mark the order as 'Issue' and select 'Lost/Damaged'. If the buyer files a dispute, our team will mediate and may refund from escrow if the seller is at fault.",
    category: "shipping",
    tags: ["lost package", "damaged goods", "claims"]
  },

  // ⚖️ Disputes & Refunds
  {
    id: "ds-1",
    question: "How do disputes work?",
    answer: "If a buyer has an issue: (1) They open a dispute in Dashboard → Disputes within 7 days of delivery, (2) You have 48 hours to respond with evidence (photos, chat logs, tracking), (3) Our team reviews and decides within 72 hours, (4) Funds are released to buyer or seller based on evidence. Always communicate via WhatsApp first to resolve issues amicably!",
    category: "disputes",
    tags: ["disputes", "refunds", "mediation"]
  },
  {
    id: "ds-2",
    question: "Can I issue a partial refund?",
    answer: "Yes! In an active dispute, you can offer a partial refund (e.g., 50% for minor damage). The buyer can accept or counter. If agreed, funds adjust automatically. Partial refunds require mutual agreement or admin approval.",
    category: "disputes",
    tags: ["partial refund", "settlement"]
  },
  {
    id: "ds-3",
    question: "What evidence should I provide for disputes?",
    answer: "Strong evidence includes: (1) Clear photos/videos of the product before shipping, (2) Signed delivery confirmation or tracking screenshots, (3) WhatsApp chat logs showing buyer agreement, (4) Packaging photos showing secure wrapping. The more evidence, the stronger your case!",
    category: "disputes",
    tags: ["evidence", "documentation", "proof"]
  },

  // 💎 Premium Features
  {
    id: "pr-1",
    question: "What's included in the Verified Badge?",
    answer: "Verified stores get: (1) Green checkmark badge on store & products, (2) +25% higher search ranking, (3) Priority placement in category listings, (4) Increased buyer trust (verified stores get 2.1x more inquiries). Verification requires CAC docs and ID — approved within 24-48 hours.",
    category: "premium",
    tags: ["verified badge", "trust", "ranking"]
  },
  {
    id: "pr-2",
    question: "How does Store Boosting work?",
    answer: "Boosts increase your visibility: (1) Choose Micro (₦999/day), Pro (₦4,999/day), or Max (₦14,999/day), (2) Select duration (1/3/7/14 days), (3) Pay via Nomba, (4) Your store appears in Trending carousel, category top lists, and nearby buyer notifications. Track performance in real-time analytics.",
    category: "premium",
    tags: ["boost", "promotion", "visibility", "ads"]
  },
  {
    id: "pr-3",
    question: "Can I cancel my Pro subscription early?",
    answer: "Yes! Cancel anytime in Dashboard → Settings → Subscription. You'll retain Pro features until the end of your current billing period. No refunds for partial months, but you won't be charged again. Downgrade to Free anytime.",
    category: "premium",
    tags: ["cancel subscription", "downgrade", "billing"]
  },

  // 🔐 Security & Privacy
  {
    id: "sec-1",
    question: "Is my payment information secure?",
    answer: "Absolutely. We use Nomba (PCI-DSS Level 1 compliant) for all payments. We never store your card details — they're tokenized and encrypted. Your bank account info is stored with 256-bit encryption and only used for payouts. Regular security audits ensure your data stays safe.",
    category: "security",
    tags: ["security", "encryption", "PCI", "data protection"]
  },
  {
    id: "sec-2",
    question: "Who can see my personal information?",
    answer: "Buyers see only your store name, logo, and public contact info (WhatsApp/email if you choose to share). Your legal name, bank details, ID documents, and CAC info are visible only to our verification team and never shared publicly. We comply with Nigeria's NDPR data protection law.",
    category: "security",
    tags: ["privacy", "data sharing", "NDPR"]
  },
  {
    id: "sec-3",
    question: "How do I enable two-factor authentication (2FA)?",
    answer: "Go to Dashboard → Settings → Security → Two-Factor Authentication. Choose SMS or authenticator app (Google Authenticator, Authy). 2FA adds an extra login step to protect your account from unauthorized access. Highly recommended for all sellers!",
    category: "security",
    tags: ["2FA", "two-factor", "login security"]
  },

  // 💳 Billing & Subscriptions
  {
    id: "bl-1",
    question: "When am I charged for my Pro subscription?",
    answer: "You're charged immediately upon subscribing. For monthly plans, renewal occurs on the same date each month. For yearly plans, renewal is annual. You'll receive an email receipt after each charge. Cancel anytime before the renewal date to avoid next charge.",
    category: "billing",
    tags: ["billing cycle", "renewal", "charges"]
  },
  {
    id: "bl-2",
    question: "Can I switch between monthly and yearly billing?",
    answer: "Yes! In Dashboard → Settings → Subscription, click 'Change Plan'. If upgrading (e.g., monthly → yearly), you'll pay the prorated difference. If downgrading, changes apply at next billing cycle. No fees for plan changes.",
    category: "billing",
    tags: ["change plan", "upgrade", "downgrade"]
  },
  {
    id: "bl-3",
    question: "What's your refund policy?",
    answer: "We offer a 7-day money-back guarantee on all paid plans. If you're not satisfied within 7 days of purchase, contact support@sellonwhatsapp.com with your order ID for a full refund. After 7 days, refunds are evaluated case-by-case for technical issues.",
    category: "billing",
    tags: ["refund", "money-back guarantee", "cancellation"]
  },

  // ⚙️ Technical Support
  {
    id: "tech-1",
    question: "What browsers/devices does SellOnWhatsApp support?",
    answer: "We support: (1) Desktop: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+, (2) Mobile: iOS 14+ Safari, Android 10+ Chrome. For best experience, use latest browser versions. Our PWA (Progressive Web App) works like a native app on mobile — add to home screen for quick access!",
    category: "technical",
    tags: ["browser support", "mobile", "PWA", "compatibility"]
  },
  {
    id: "tech-2",
    question: "Why isn't my product image uploading?",
    answer: "Common fixes: (1) Ensure image is JPG/PNG under 5MB, (2) Check internet connection, (3) Clear browser cache, (4) Try incognito mode. If still failing, screenshot the error and contact support@sellonwhatsapp.com with your browser/device details.",
    category: "technical",
    tags: ["image upload", "troubleshooting", "error"]
  },
  {
    id: "tech-3",
    question: "How do I contact support?",
    answer: "Three ways: (1) In-app: Dashboard → Help → Chat with Support (Pro users get priority), (2) Email: support@sellonwhatsapp.com (response within 24 hours), (3) WhatsApp: +234 800 SOWA HELP (for urgent issues). Include your store URL and order ID for faster help!",
    category: "technical",
    tags: ["support", "contact", "help"]
  }
];

// ✅ Category configuration
const CATEGORIES: { id: FAQCategory; label: string; icon: any }[] = [
  { id: "all", label: "All Questions", icon: HelpCircle },
  { id: "getting-started", label: "Getting Started", icon: Zap },
  { id: "store-management", label: "Store Management", icon: Package },
  { id: "products", label: "Products & Listings", icon: Package },
  { id: "orders-payments", label: "Orders & Payments", icon: CreditCard },
  { id: "shipping", label: "Shipping & Delivery", icon: Truck },
  { id: "disputes", label: "Disputes & Refunds", icon: ShieldCheck },
  { id: "premium", label: "Premium Features", icon: Crown },
  { id: "security", label: "Security & Privacy", icon: ShieldCheck },
  { id: "billing", label: "Billing & Subscriptions", icon: CreditCard },
  { id: "technical", label: "Technical Support", icon: HelpCircle }
];

export default function FAQPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<FAQCategory>("all");
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  // ✅ Filter FAQs based on search and category
  const filteredFAQs = useMemo(() => {
    return FAQ_DATA.filter((faq) => {
      const matchesSearch = 
        searchQuery === "" ||
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesCategory = activeCategory === "all" || faq.category === activeCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, activeCategory]);

  // ✅ Toggle FAQ item open/closed
  const toggleItem = (id: string) => {
    setOpenItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // ✅ Group FAQs by category for "Related Questions"
  const getRelatedFAQs = (currentId: string, category: FAQCategory) => {
    return FAQ_DATA
      .filter(faq => faq.category === category && faq.id !== currentId)
      .slice(0, 2);
  };

  return (
    <div className={`${font.className} min-h-screen flex flex-col bg-white`}>
      {/* ✅ Header */}
      <Header/>

      {/* ✅ Main Content */}
      <main className="flex-1">
        {/* 🌟 Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-green-50 to-white pt-24 pb-16 px-4 text-center">
          <div className="absolute inset-0 opacity-30 pointer-events-none">
            <div className="absolute top-10 left-10 w-72 h-72 bg-green-200 rounded-full blur-3xl" />
            <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-200 rounded-full blur-3xl" />
          </div>
          
          <div className="relative z-10 max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4">
              <HelpCircle size={12} /> We're Here to Help
            </span>
            <h1 className="text-4xl md:text-5xl font-black text-gray-900 mb-4 leading-tight">
              Frequently Asked <span className="text-green-600">Questions</span>
            </h1>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              Find quick answers to common questions about selling on SellOnWhatsApp. 
              Can't find what you're looking for? <button onClick={() => router.push("/contact")} className="text-green-600 font-bold hover:underline">Contact support</button>.
            </p>
          </div>
        </section>

        {/* 🔍 Search & Filter */}
        <section className="max-w-5xl mx-auto px-4 py-8">
          <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
            {/* Search Bar */}
            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search questions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-green-500/20 outline-none transition-all"
              />
            </div>

            {/* Category Filters */}
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? "bg-green-600 text-white shadow-md"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    <Icon size={14} />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ❓ FAQ List */}
        <section className="max-w-4xl mx-auto px-4 pb-20">
          {filteredFAQs.length === 0 ? (
            <div className="text-center py-16">
              <HelpCircle size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">No questions found</h3>
              <p className="text-gray-500 mb-6">Try adjusting your search or filter</p>
              <button 
                onClick={() => { setSearchQuery(""); setActiveCategory("all"); }}
                className="px-6 py-3 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredFAQs.map((faq) => {
                const isOpen = openItems.has(faq.id);
                const related = getRelatedFAQs(faq.id, faq.category);
                
                return (
                  <div 
                    key={faq.id} 
                    className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden"
                  >
                    <button
                      onClick={() => toggleItem(faq.id)}
                      className="w-full flex items-center justify-between p-6 text-left font-bold text-gray-900 hover:bg-gray-50 transition-colors"
                      aria-expanded={isOpen}
                    >
                      <span className="pr-4">{faq.question}</span>
                      {isOpen ? (
                        <ChevronUp size={18} className="text-gray-400 shrink-0" />
                      ) : (
                        <ChevronDown size={18} className="text-gray-400 shrink-0" />
                      )}
                    </button>
                    
                    {isOpen && (
                      <div className="px-6 pb-6 pt-0">
                        <div className="prose prose-sm max-w-none text-gray-600">
                          <p>{faq.answer}</p>
                        </div>
                        
                        {/* Related Questions */}
                        {related.length > 0 && (
                          <div className="mt-6 pt-4 border-t border-gray-100">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Related Questions</p>
                            <div className="space-y-2">
                              {related.map((rel) => (
                                <button
                                  key={rel.id}
                                  onClick={() => {
                                    toggleItem(rel.id);
                                    // Scroll to the related question
                                    document.getElementById(rel.id)?.scrollIntoView({ behavior: "smooth" });
                                  }}
                                  className="block w-full text-left text-sm text-green-600 hover:text-green-700 hover:underline"
                                >
                                  {rel.question}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Tags */}
                        {faq.tags && faq.tags.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {faq.tags.map((tag) => (
                              <span 
                                key={tag}
                                className="px-2 py-1 bg-gray-100 text-gray-600 text-[9px] font-bold rounded-full uppercase tracking-wider"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 💬 Still Have Questions? */}
        <section className="bg-gray-50 py-20 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <MessageSquare size={28} />
            </div>
            <h2 className="text-3xl font-black text-gray-900 mb-4">Still Have Questions?</h2>
            <p className="text-gray-500 text-lg mb-8">
              Our support team is ready to help. Get answers in minutes, not hours.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
              <a 
                href="https://wa.me/234800SOWAHELP" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex flex-col items-center p-6 bg-white rounded-2xl border border-gray-100 hover:shadow-md transition-shadow"
              >
                <Phone size={24} className="text-green-600 mb-3" />
                <span className="font-bold text-gray-900">WhatsApp Support</span>
                <span className="text-sm text-gray-500">+234 800 SOWA HELP</span>
              </a>
              
              <button 
                onClick={() => router.push("/contact")}
                className="flex flex-col items-center p-6 bg-white rounded-2xl border border-gray-100 hover:shadow-md transition-shadow"
              >
                <Mail size={24} className="text-green-600 mb-3" />
                <span className="font-bold text-gray-900">Email Support</span>
                <span className="text-sm text-gray-500">support@sellonwhatsapp.com</span>
              </button>
              
              <button 
                onClick={() => {
                  // Open in-app chat if available, else redirect to contact
                  if (typeof window !== "undefined" && (window as any).ZebbleChat) {
                    (window as any).ZebbleChat.open();
                  } else {
                    router.push("/contact");
                  }
                }}
                className="flex flex-col items-center p-6 bg-white rounded-2xl border border-gray-100 hover:shadow-md transition-shadow"
              >
                <MessageSquare size={24} className="text-green-600 mb-3" />
                <span className="font-bold text-gray-900">Live Chat</span>
                <span className="text-sm text-gray-500">Chat with an expert</span>
              </button>
            </div>
            
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <ShieldCheck size={16} className="text-green-600" />
              <span>Average response time: <span className="font-bold text-gray-900">under 2 hours</span></span>
            </div>
          </div>
        </section>

        {/* 📚 Resource Links */}
        <section className="max-w-5xl mx-auto px-4 py-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-gray-900 mb-3">Helpful Resources</h2>
            <p className="text-gray-500">Guides, tutorials, and tools to help you succeed</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { title: "Seller Handbook", desc: "Complete guide to selling on WhatsApp", icon: Package, href: "/guides/seller-handbook" },
              { title: "Video Tutorials", desc: "Step-by-step walkthroughs", icon: ExternalLink, href: "/guides/videos" },
              { title: "Pricing Guide", desc: "Understand fees and payouts", icon: CreditCard, href: "/pricing" },
              { title: "API Documentation", desc: "For developers & integrations", icon: ExternalLink, href: "/developers" }
            ].map((resource, i) => (
              <a 
                key={i}
                href={resource.href}
                className="block p-6 bg-white rounded-2xl border border-gray-100 hover:border-green-200 hover:shadow-md transition-all group"
              >
                <resource.icon size={20} className="text-green-600 mb-3 group-hover:scale-110 transition-transform" />
                <h3 className="font-bold text-gray-900 mb-1">{resource.title}</h3>
                <p className="text-sm text-gray-500">{resource.desc}</p>
              </a>
            ))}
          </div>
        </section>
      </main>

      {/* ✅ Footer */}
      <Footer/>
    </div>
  );
}