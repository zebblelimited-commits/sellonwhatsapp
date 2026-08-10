"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus_Jakarta_Sans } from "@/lib/fonts";
import { Check, X, ArrowRight, ShieldCheck, Zap, Crown, ChevronDown, Loader2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { ClientOnly } from "@/components/ClientOnly";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

// ✅ Interfaces
interface DurationOption {
  months: number;
  label: string;
  discount: number;
  popular?: boolean;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  interval: string;
  description: string;
  features: string[];
  missingFeatures?: string[];
  cta: string;
  variant: "outline" | "primary" | "dark";
  popular: boolean;
  isFree: boolean;
  selectedDuration?: DurationOption;
}

interface NotificationState {
  show: boolean;
  type: "success" | "error" | "info";
  title: string;
  message: string;
}

// ✅ Constants
const DURATION_OPTIONS: DurationOption[] = [
  { months: 1, label: "1 Month", discount: 0 },
  { months: 3, label: "3 Months", discount: 0.10 },
  { months: 6, label: "6 Months", discount: 0.17, popular: true },
  { months: 12, label: "12 Months", discount: 0.25 }
];

const calculateDurationPrice = (basePrice: number, months: number, discount: number): number => {
  const total = basePrice * months;
  return Math.round(total * (1 - discount));
};

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    interval: "forever",
    description: "Perfect for getting started",
    features: ["Basic store listing", "Up to 20 products", "Standard analytics", "Email support", "WhatsApp order sync"],
    missingFeatures: ["Verified badge", "Real-time chat", "Priority support", "Custom branding"],
    cta: "Get Started Free",
    variant: "outline",
    popular: false,
    isFree: true
  },
  {
    id: "pro_lite",
    name: "Pro Business Lite",
    price: 4999,
    interval: "month",
    description: "For growing businesses",
    features: ["Everything in Free", "✅ Pro Seller badge", "✅ Real-time chat support", "✅ Up to 500 products", "✅ Advanced analytics dashboard", "✅ Priority support (4hr response)"],
    cta: "Upgrade to Pro Lite",
    variant: "primary",
    popular: true,
    isFree: false,
    selectedDuration: DURATION_OPTIONS[0]
  },
  {
    id: "pro_max",
    name: "Pro Yearly Business Max",
    price: 49990,
    interval: "year",
    description: "Scale without limits",
    features: ["Everything in Pro Lite", "✅ Save 17% vs monthly", "✅ Unlimited products", "✅ Custom branding & domain", "✅ API access", "✅ Dedicated account manager", "✅ Early feature access"],
    cta: "Upgrade to Pro Max",
    variant: "dark",
    popular: false,
    isFree: false,
    selectedDuration: { months: 12, label: "12 Months", discount: 0 }
  }
];

const faqs = [
  { q: "Can I switch plans later?", a: "Yes! Upgrade or downgrade anytime. Changes apply at your next billing cycle." },
  { q: "Is there a refund policy?", a: "We offer a 7-day money-back guarantee on all paid plans. No questions asked." },
  { q: "How does the verified badge work?", a: "Once you subscribe to Pro, submit your CAC/business docs. Our team reviews & approves within 24 hours." },
  { q: "What payment methods do you accept?", a: "We accept all major Nigerian debit/credit cards via Nomba, plus bank transfers." },
  { q: "Will I be charged automatically?", a: "Monthly plans renew automatically. Yearly plans renew annually. You can cancel anytime before the next cycle." }
];

export default function PricingPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [notification, setNotification] = useState<NotificationState | null>(null);
  
  // ✅ SAFELY ACCESS WINDOW.ORIGIN
  const [origin, setOrigin] = useState("");

  const [selectedDurations, setSelectedDurations] = useState<Record<string, DurationOption>>({
    pro_lite: DURATION_OPTIONS[0],
    pro_max: { months: 12, label: "12 Months", discount: 0 }
  });
  
  const [autoRenew, setAutoRenew] = useState<Record<string, boolean>>({
    pro_lite: true,
    pro_max: true
  });

  // ✅ SET ORIGIN ON CLIENT MOUNT ONLY
  useEffect(() => {
    setOrigin(window.location.origin);
    const unsub = onAuthStateChanged(auth, (user: User | null) => {
      setCurrentUser(user);
    });
    return () => unsub();
  }, []);

  const showNotification = (type: "success" | "error" | "info", title: string, message: string): void => {
    setNotification({ show: true, type, title, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleDurationSelect = (planId: string, duration: DurationOption) => {
    setSelectedDurations(prev => ({ ...prev, [planId]: duration }));
  };

  const handlePlanSelect = async (planId: string): Promise<void> => {
    const plan = PLANS.find((p): boolean => p.id === planId);
    if (!plan) return;

    if (plan.isFree) {
      router.push(`/register?plan=${planId}`);
      return;
    }

    if (!currentUser) {
      const duration = selectedDurations[planId] || DURATION_OPTIONS[0];
      router.push(`/login?redirect=/pricing&plan=${planId}&duration=${duration.months}`);
      return;
    }

    const duration = selectedDurations[planId] || DURATION_OPTIONS[0];
    const renew = autoRenew[planId] ?? true;
    await handlePaidCheckout(planId, plan, duration, renew);
  };

  const handlePaidCheckout = async (
    planId: string,
    plan: Plan,
    duration: DurationOption,
    autoRenewEnabled: boolean
  ): Promise<void> => {
    setLoadingPlan(planId);
    try {
      const user = currentUser;
      if (!user) throw new Error("Authentication failed");
      const idToken = await currentUser?.getIdToken();
      if (!idToken) throw new Error("Authentication failed");

      const monthlyBasePrice = plan.price;
      const totalBasePrice = monthlyBasePrice * duration.months;
      const finalPrice = calculateDurationPrice(monthlyBasePrice, duration.months, duration.discount);
      const savingsAmount = totalBasePrice - finalPrice;

      const response = await fetch("/api/premium/subscription-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
          planId,
          planName: plan.name,
          durationMonths: duration.months,
          durationLabel: duration.label,
          monthlyBasePrice: monthlyBasePrice,
          basePrice: totalBasePrice,
          finalPrice: finalPrice,
          discount: duration.discount,
          discountPercentage: Math.round(duration.discount * 100),
          savingsAmount: savingsAmount,
          autoRenew: autoRenewEnabled,
          userId: user.uid,
          userEmail: user.email,
          // ✅ USE THE SAFE STATE VARIABLE HERE
          returnUrl: `${origin}/payment/subscription-success`, 
          metadata: {
            isSubscription: true,
            planType: planId,
            durationMonths: duration.months,
            userId: user.uid,
            userEmail: user.email
          }
        })
      });

      const data = await response.json();
      if (!response.ok || !data.checkoutLink) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      showNotification("info", "Redirecting to Payment", `Complete your payment of ₦${finalPrice.toLocaleString()} for ${plan.name} (${duration.label})`);
      window.location.assign(data.checkoutLink);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An unknown error occurred";
      console.error("Subscription checkout failed:", error);
      showNotification("error", "Payment Failed", message);
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className={`${font.className} min-h-screen flex flex-col bg-white`}>
      <Header />
      <main className="flex-1">
        {/* ✅ WRAP INTERACTIVE UI IN CLIENTONLY */}
        <ClientOnly>
          {/* 🌟 Hero Section */}
          <section className="relative overflow-hidden bg-gradient-to-b from-green-50 to-white pt-24 pb-16 px-4 text-center">
            <div className="absolute inset-0 opacity-30 pointer-events-none">
              <div className="absolute top-10 left-10 w-72 h-72 bg-green-200 rounded-full blur-3xl" />
              <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-200 rounded-full blur-3xl" />
            </div>
            <div className="relative z-10 max-w-3xl mx-auto">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4">
                <Zap size={12} /> Simple, Transparent Pricing
              </span>
              <h1 className="text-4xl md:text-5xl font-black text-gray-900 mb-4 leading-tight">
                Choose the plan that fits your <span className="text-green-600">growth</span>
              </h1>
              <p className="text-gray-500 text-lg max-w-2xl mx-auto">
                Start free, upgrade when you&apos;re ready. No hidden fees, cancel anytime.
                Trusted by 2,000+ Nigerian vendors.
              </p>
            </div>
          </section>

          {/* 💳 Pricing Cards */}
          <section className="max-w-7xl mx-auto px-4 pb-20 -mt-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
              {PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className={`relative p-8 rounded-[32px] border-2 transition-all hover:shadow-xl ${plan.variant === "primary" ? "border-green-600 bg-green-50/30 md:scale-[1.03] md:z-10" :
                      plan.variant === "dark" ? "border-gray-900 bg-gray-900 text-white" :
                        "border-gray-100 bg-white hover:border-gray-200"
                    }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-600 text-white text-[10px] font-bold rounded-full uppercase tracking-widest shadow-lg">
                      Most Popular
                    </span>
                  )}
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={`text-xl font-black ${plan.variant === "dark" ? "text-white" : "text-gray-900"}`}>{plan.name}</h3>
                      {plan.id === "pro_max" && <Crown size={16} className="text-yellow-400 fill-yellow-400" />}
                    </div>
                    <p className={`text-sm ${plan.variant === "dark" ? "text-gray-300" : "text-gray-500"}`}>{plan.description}</p>
                  </div>

                  {!plan.isFree && (
                    <DurationSelector
                      basePrice={plan.price}
                      selectedDuration={selectedDurations[plan.id] || DURATION_OPTIONS[0]}
                      onSelect={(duration) => handleDurationSelect(plan.id, duration)}
                      isDark={plan.variant === "dark"}
                    />
                  )}

                  {!plan.isFree && (
                    <AutoRenewToggle
                      enabled={autoRenew[plan.id] ?? true}
                      onToggle={() => setAutoRenew(prev => ({
                        ...prev,
                        [plan.id]: !(prev[plan.id] ?? true)
                      }))}
                      duration={selectedDurations[plan.id] || DURATION_OPTIONS[0]}
                      isDark={plan.variant === "dark"}
                    />
                  )}

                  <div className="mb-8">
                    {!plan.isFree ? (
                      <>
                        <span className={`text-4xl font-black ${plan.variant === "dark" ? "text-white" : "text-gray-900"}`}>
                          ₦{calculateDurationPrice(
                            plan.price,
                            (selectedDurations[plan.id] || DURATION_OPTIONS[0]).months,
                            (selectedDurations[plan.id] || DURATION_OPTIONS[0]).discount
                          ).toLocaleString()}
                        </span>
                        <span className={`text-sm ml-1 ${plan.variant === "dark" ? "text-gray-200" : "text-gray-500"}`}>
                          total
                        </span>
                        <p className={`text-[10px] ${plan.variant === "dark" ? "text-gray-300" : "text-gray-400"} mt-1`}>
                          ≈ ₦{Math.round(
                            calculateDurationPrice(
                              plan.price,
                              (selectedDurations[plan.id] || DURATION_OPTIONS[0]).months,
                              (selectedDurations[plan.id] || DURATION_OPTIONS[0]).discount
                            ) / (selectedDurations[plan.id] || DURATION_OPTIONS[0]).months
                          ).toLocaleString()}/mo
                        </p>
                      </>
                    ) : (
                      <>
                        <span className={`text-4xl font-black ${plan.variant === "dark" ? "text-white" : "text-gray-900"}`}>
                          ₦{plan.price.toLocaleString()}
                        </span>
                        <span className={`text-sm ml-1 ${plan.variant === "dark" ? "text-gray-200" : "text-gray-500"}`}>
                          /{plan.interval === "forever" ? "forever" : plan.interval}
                        </span>
                      </>
                    )}
                  </div>

                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feat: string, i: number) => (
                      <li key={i} className="flex items-start gap-3 text-sm">
                        <Check size={16} className="text-green-600 mt-0.5 shrink-0" />
                        <span className={plan.variant === "dark" ? "text-gray-100" : "text-gray-700"}>{feat.replace("✅ ", "")}</span>
                      </li>
                    ))}
                    {plan.missingFeatures?.map((feat: string, i: number) => (
                      <li key={i} className="flex items-start gap-3 text-sm opacity-40">
                        <X size={16} className="mt-0.5 shrink-0" />
                        <span className="line-through">{feat}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handlePlanSelect(plan.id)}
                    disabled={loadingPlan === plan.id}
                    className={`w-full py-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed ${plan.variant === "primary" ? "bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-200" :
                        plan.variant === "dark" ? "bg-white hover:bg-gray-100 text-gray-900" :
                          "bg-gray-100 hover:bg-gray-200 text-gray-700"
                      }`}
                  >
                    {loadingPlan === plan.id ? (
                      <><Loader2 size={14} className="animate-spin" /> Processing...</>
                    ) : (
                      <>
                        {plan.cta}
                        {!plan.isFree && selectedDurations[plan.id]?.months > 1 && (
                          <span className="text-[10px] opacity-80">
                            ({selectedDurations[plan.id]?.label})
                          </span>
                        )}
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>

                  {!plan.isFree && (selectedDurations[plan.id]?.discount || 0) > 0 && (
                    <p className={`text-[10px] font-bold text-center mt-3 ${plan.variant === "dark" ? "text-green-300" : "text-green-600"}`}>
                      Save ₦{(
                        plan.price * (selectedDurations[plan.id]?.months || 1) -
                        calculateDurationPrice(
                          plan.price,
                          selectedDurations[plan.id]?.months || 1,
                          selectedDurations[plan.id]?.discount || 0
                        )
                      ).toLocaleString()} with {selectedDurations[plan.id]?.label}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ❓ FAQ Section */}
          <section className="bg-gray-50 py-20 px-4">
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-black text-gray-900 mb-3">Frequently Asked Questions</h2>
                <p className="text-gray-500">Everything you need to know about billing &amp; features</p>
              </div>
              <div className="space-y-4">
                {faqs.map((faq, i) => (
                  <FAQItem key={i} question={faq.q} answer={faq.a} />
                ))}
              </div>
            </div>
          </section>

          {/* 🚀 CTA Section */}
          <section className="px-6 py-16">
            <div className="max-w-4xl mx-auto bg-lime-100 rounded-2xl p-10 text-center border border-lime-200">
              <h2 className="text-3xl md:text-4xl font-bold">
                Start selling smarter on WhatsApp today
              </h2>
              <p className="mt-3 text-gray-700">
                Join thousands of vendors already growing their sales with SellOnWhatsApp
              </p>
              <div className="mt-6 flex flex-col md:flex-row gap-3 justify-center">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  className="w-full md:w-[320px] px-4 py-3 rounded-xl border border-gray-300 outline-none focus:ring-2 focus:ring-lime-500 bg-white"
                />
                <button className="px-6 py-3 rounded-xl bg-lime-600 hover:bg-lime-700 text-white font-medium transition">
                  Get Early Access
                </button>
              </div>
              <p className="mt-4 text-xs text-gray-500">
                No spam. Just updates about your store growth tools.
              </p>
            </div>
          </section>
        </ClientOnly>
      </main>
      <Footer />

      {/* ✅ Notification Toast (Kept outside ClientOnly as it relies on client-side state anyway) */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={`flex items-start gap-3 p-4 rounded-2xl shadow-lg border max-w-sm ${notification.type === "success" ? "bg-green-50 border-green-100 text-green-800" :
              notification.type === "error" ? "bg-red-50 border-red-100 text-red-800" :
                "bg-blue-50 border-blue-100 text-blue-800"
            }`}>
            <div className={`p-1.5 rounded-lg ${notification.type === "success" ? "bg-green-100" :
                notification.type === "error" ? "bg-red-100" :
                  "bg-blue-100"
              }`}>
              {notification.type === "success" ? <Check size={14} /> :
                notification.type === "error" ? <X size={14} /> :
                  <ShieldCheck size={14} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">{notification.title}</p>
              <p className="text-xs mt-0.5 opacity-90">{notification.message}</p>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="p-1 hover:bg-black/5 rounded-lg transition-colors"
              aria-label="Close notification"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ✅ Duration Selector Component
function DurationSelector({
  basePrice,
  selectedDuration,
  onSelect,
  isDark = false
}: {
  basePrice: number;
  selectedDuration: DurationOption;
  onSelect: (d: DurationOption) => void;
  isDark?: boolean;
}) {
  return (
    <div className="mb-6">
      <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${isDark ? "text-gray-300" : "text-gray-400"}`}>Billing Duration</p>
      <div className="grid grid-cols-2 gap-2">
        {DURATION_OPTIONS.map((option) => {
          const finalPrice = calculateDurationPrice(basePrice, option.months, option.discount);
          const monthlyEquivalent = Math.round(finalPrice / option.months);
          const isYearly = option.months >= 12;
          const isSelected = selectedDuration.months === option.months;

          return (
            <button
              key={option.months}
              onClick={() => onSelect(option)}
              className={`relative p-3 rounded-xl border-2 text-left transition-all ${
                isSelected
                  ? isDark
                    ? "border-blue-400 bg-blue-900/60 shadow-lg shadow-blue-500/20"
                    : "border-green-600 bg-green-50"
                  : `border-gray-100 hover:border-green-300 ${isDark ? "hover:bg-gray-800" : "hover:bg-gray-50"}`
              } ${option.popular ? "ring-2 ring-green-200" : ""} ${!isSelected && isDark ? "bg-gray-800/50" : ""}`}
            >
              {option.popular && (
                <span className="absolute -top-2 -right-2 px-2 py-0.5 bg-green-600 text-white text-[8px] font-bold rounded-full">
                  Best Value
                </span>
              )}
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-bold ${isSelected && isDark ? "text-white" : isDark ? "text-white" : "text-gray-900"}`}>{option.label}</span>
                {option.discount > 0 && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    isSelected && isDark
                      ? "text-blue-200 bg-blue-800/60"
                      : isDark ? "text-green-300 bg-green-900/50" : "text-green-600 bg-green-100"
                  }`}>
                    -{Math.round(option.discount * 100)}%
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-lg font-black ${isSelected && isDark ? "text-white" : isDark ? "text-white" : "text-gray-900"}`}>₦{finalPrice.toLocaleString()}</span>
                {!isYearly && (
                  <span className={`text-[10px] ${isSelected && isDark ? "text-blue-200" : isDark ? "text-gray-300" : "text-gray-400"}`}>total</span>
                )}
              </div>
              {!isYearly && (
                <p className={`text-[9px] mt-0.5 ${isSelected && isDark ? "text-blue-200" : isDark ? "text-gray-300" : "text-gray-400"}`}>
                  ≈ ₦{monthlyEquivalent.toLocaleString()}/mo
                </p>
              )}
              {option.discount > 0 && (
                <p className={`text-[9px] font-bold mt-1 ${isSelected && isDark ? "text-blue-200" : isDark ? "text-green-300" : "text-green-600"}`}>
                  Save ₦{(basePrice * option.months - finalPrice).toLocaleString()}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ✅ Auto-Renew Toggle Component
function AutoRenewToggle({
  enabled,
  onToggle,
  duration,
  isDark = false
}: {
  enabled: boolean;
  onToggle: () => void;
  duration: DurationOption;
  isDark?: boolean;
}) {
  return (
    <div className={`mb-6 p-4 rounded-2xl border ${isDark ? "bg-gray-800/50 border-gray-700" : "bg-gray-50 border-gray-100"}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Auto-renew subscription</p>
          <p className={`text-[10px] mt-0.5 ${isDark ? "text-gray-300" : "text-gray-500"}`}>
            {enabled
              ? `Renews every ${duration.months} ${duration.months === 1 ? 'month' : 'months'} • Cancel anytime`
              : "Manual renewal • You'll be notified before expiry"
            }
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? "bg-green-600" : isDark ? "bg-gray-600" : "bg-gray-300"}`}
          aria-label={enabled ? "Disable auto-renew" : "Enable auto-renew"}
        >
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${enabled ? "left-6" : "left-1"}`} />
        </button>
      </div>
      {enabled && (
        <div className={`mt-3 flex items-center gap-2 text-[10px] px-3 py-2 rounded-lg ${isDark ? "text-green-300 bg-green-900/30" : "text-green-600 bg-green-50"}`}>
          <ShieldCheck size={12} />
          <span>Never lose access • 7-day grace period before expiry</span>
        </div>
      )}
    </div>
  );
}

// 📦 FAQ Accordion Component
function FAQItem({ question, answer }: { question: string; answer: string }): ReactNode {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 text-left font-bold text-gray-900 hover:bg-gray-50 transition-colors"
        aria-expanded={isOpen}
      >
        <span>{question}</span>
        <ChevronDown size={18} className={`text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${isOpen ? "max-h-40 opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="px-5 pb-5 text-sm text-gray-600 leading-relaxed border-t border-gray-50 pt-3">
          {answer}
        </div>
      </div>
    </div>
  );
}
