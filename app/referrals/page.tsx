"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, Crown, Landmark, Loader2, Share2, Trophy, Wallet, Users } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { MINIMUM_REFERRAL_WITHDRAWAL } from "@/lib/referral-constants";
import { REFERRAL_STORAGE_KEY } from "@/components/referrals/ReferralCapture";

type ReferralState = {
  wallet: { availablePoints: number; pendingPoints: number; lifetimePoints: number; redeemedPoints: number; referralCode: string; payoutSettings?: any };
  activity: { buyers: number; sellers: number; orders: number; totalEarned: number };
  ledger: any[];
  payouts: any[];
};

const naira = (value: number) => `₦${Number(value || 0).toLocaleString("en-NG")}`;

export default function ReferralsPage() {
  const [user, setUser] = useState(auth.currentUser);
  const [data, setData] = useState<ReferralState | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [bankForm, setBankForm] = useState({ bankName: "", bankCode: "", accountNumber: "", accountName: "" });
  const [loading, setLoading] = useState(true);
  const [savingBank, setSavingBank] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => onAuthStateChanged(auth, (nextUser) => setUser(nextUser)), []);

  useEffect(() => {
    void fetch("/api/referrals/leaderboard").then((response) => response.json()).then((payload) => setLeaderboard(payload.leaderboard || [])).catch(() => setLeaderboard([]));
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const pendingReferral = localStorage.getItem(REFERRAL_STORAGE_KEY);
        if (pendingReferral) {
          const attributionResponse = await fetch("/api/referrals", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ action: "attribute", referralCode: pendingReferral }) });
          if (attributionResponse.ok) localStorage.removeItem(REFERRAL_STORAGE_KEY);
        }
        const [walletResponse, banksResponse] = await Promise.all([
          fetch("/api/referrals", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
          fetch("/api/webhooks/nomba/banks"),
        ]);
        const walletPayload = await walletResponse.json();
        const banksPayload = await banksResponse.json().catch(() => ({}));
        if (!walletResponse.ok) throw new Error(walletPayload.error || "Could not load your referral wallet");
        if (!cancelled) {
          setData(walletPayload);
          setBankForm(walletPayload.wallet.payoutSettings || { bankName: "", bankCode: "", accountNumber: "", accountName: "" });
          setBanks((banksPayload.banks || []).map((bank: any) => ({ name: bank.name, code: bank.code })).sort((a: any, b: any) => a.name.localeCompare(b.name)));
        }
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "Could not load your referral wallet");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const referralLink = useMemo(() => {
    if (!data?.wallet.referralCode) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "https://sellonwhatsapp.com"; return `${origin}/join?ref=${encodeURIComponent(data.wallet.referralCode)}`;
  }, [data?.wallet.referralCode]);
  const referralWhatsAppLink = useMemo(() => {
    if (!referralLink) return "";
    const message = `🎁 I found a great way to shop and sell online.

You can create your own store, sell products and services, or discover businesses on SellOnWhatsApp.

Join here:

👉 ${referralLink}

You can even start selling without building a website.`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }, [referralLink]);
  const progress = Math.min(100, ((data?.wallet.availablePoints || 0) / MINIMUM_REFERRAL_WITHDRAWAL) * 100);

  const copyReferralLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setNotice("Referral link copied");
  };

  const copyReferralCode = async () => {
    const code = data?.wallet.referralCode;
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setNotice("Referral code copied");
  };

  const saveBank = async () => {
    if (!user) return;
    setSavingBank(true);
    setNotice("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/referrals/payout-account", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(bankForm) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save payout account");
      setData((current) => current ? { ...current, wallet: { ...current.wallet, payoutSettings: payload.payoutSettings } } : current);
      setNotice("Referral payout account submitted for review");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save payout account"); }
    finally { setSavingBank(false); }
  };

  const requestWithdrawal = async () => {
    if (!user || !data || data.wallet.availablePoints < MINIMUM_REFERRAL_WITHDRAWAL) return;
    setWithdrawing(true);
    setNotice("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/referrals/withdraw", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ points: data.wallet.availablePoints, idempotencyKey: crypto.randomUUID() }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Withdrawal request failed");
      setNotice("Withdrawal request submitted for admin review");
      window.location.reload();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Withdrawal request failed"); }
    finally { setWithdrawing(false); }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-gray-900">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-xs font-black uppercase tracking-[0.2em] text-green-600">Earn. Share. Grow.</p><h1 className="mt-2 text-3xl font-black tracking-tight">Referral Leaderboard</h1><p className="mt-2 max-w-xl text-sm text-gray-500">Invite buyers and sellers, help them grow on SellOnWhatsApp, and earn points that can be redeemed as cash.</p></div>
          {!user && <Link href="/join" className="rounded-2xl bg-green-600 px-5 py-3 text-center text-sm font-bold text-white">Join and earn</Link>}
        </div>

        {notice && <div className="mb-6 rounded-2xl border border-green-100 bg-green-50 p-4 text-sm font-bold text-green-700">{notice}</div>}

        {user && loading && <div className="rounded-3xl bg-white p-12 text-center shadow-sm"><Loader2 className="mx-auto animate-spin text-green-600" /></div>}
        {user && !loading && data && (
          <section className="mb-10 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
            <div className="rounded-[32px] bg-gradient-to-br from-green-700 to-green-500 p-7 text-white shadow-xl shadow-green-100">
              <div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-green-100">Your rewards</p><p className="mt-4 text-4xl font-black">{naira(data.wallet.availablePoints)}</p><p className="mt-1 text-sm font-medium text-green-100">Available balance</p></div><Wallet size={30} className="opacity-80" /></div>
              <div className="mt-7 h-3 overflow-hidden rounded-full bg-green-900/30"><div className="h-full rounded-full bg-white transition-all" style={{ width: `${progress}%` }} /></div>
              <div className="mt-2 flex justify-between text-xs font-bold text-green-100"><span>{naira(data.wallet.availablePoints)} / {naira(MINIMUM_REFERRAL_WITHDRAWAL)}</span><span>{progress.toFixed(0)}%</span></div>
              <p className="mt-6 text-sm font-bold">{data.wallet.availablePoints >= MINIMUM_REFERRAL_WITHDRAWAL ? "You are ready to cash out 🎉" : `${naira(MINIMUM_REFERRAL_WITHDRAWAL - data.wallet.availablePoints)} more to unlock withdrawal.`}</p>
              <button onClick={() => void requestWithdrawal()} disabled={withdrawing || data.wallet.availablePoints < MINIMUM_REFERRAL_WITHDRAWAL} className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-green-700 disabled:cursor-not-allowed disabled:opacity-50">{withdrawing ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />} Withdraw earnings</button>
            </div>
            <div className="rounded-[32px] border border-gray-100 bg-white p-7 shadow-sm"><p className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Your referral activity</p><div className="mt-6 grid grid-cols-2 gap-4"><Metric icon={<Users size={17} />} label="Buyers referred" value={data.activity.buyers} /><Metric icon={<Crown size={17} />} label="Sellers referred" value={data.activity.sellers} /><Metric icon={<CheckCircle2 size={17} />} label="Orders generated" value={data.activity.orders} /><Metric icon={<Wallet size={17} />} label="Total earned" value={naira(data.activity.totalEarned)} /></div></div>
          </section>
        )}

        {user && data && <section className="mb-10 grid gap-5 lg:grid-cols-2">
          <div className="rounded-[32px] border border-gray-100 bg-white p-7 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Your referral link</p><p className="mt-3 break-all text-sm font-bold text-gray-800">{referralLink}</p><p className="mt-2 text-xs font-bold text-gray-500">Referral code: <span className="text-green-700">{data.wallet.referralCode}</span></p></div><Share2 className="shrink-0 text-green-600" size={22} /></div><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => void copyReferralLink()} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-xs font-bold text-white"><Copy size={14} /> Copy link</button><button onClick={() => void copyReferralCode()} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-bold text-gray-700"><Copy size={14} /> Copy code</button><a href={referralWhatsAppLink} target="_blank" rel="noreferrer" className="rounded-xl bg-[#25D366] px-4 py-2.5 text-xs font-bold text-white">Share on WhatsApp</a></div></div>
          <div className="rounded-[32px] border border-gray-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-2"><Landmark size={18} className="text-green-600" /><h2 className="font-black">Referral payout account</h2></div><p className="mt-2 text-xs text-gray-500">Add the bank account where approved referral withdrawals should be paid.</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><select value={bankForm.bankCode} onChange={(event) => { const bank = banks.find((item) => item.code === event.target.value); setBankForm({ ...bankForm, bankCode: event.target.value, bankName: bank?.name || "" }); }} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-xs font-bold sm:col-span-2"><option value="">Select bank</option>{banks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}</select><input value={bankForm.accountNumber} onChange={(event) => setBankForm({ ...bankForm, accountNumber: event.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="10-digit account number" className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-xs font-bold" /><input value={bankForm.accountName} onChange={(event) => setBankForm({ ...bankForm, accountName: event.target.value })} placeholder="Account name" className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-xs font-bold" /></div>{data.wallet.payoutSettings && <p className="mt-3 text-[10px] font-bold text-gray-500">{data.wallet.payoutSettings.bankName || "Selected bank"} · ****{String(data.wallet.payoutSettings.accountNumber || "").slice(-4)} · <span className="text-amber-600">{String(data.wallet.payoutSettings.status || "pending_review").replace(/_/g, " ")}</span></p>}<button onClick={() => void saveBank()} disabled={savingBank} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-50">{savingBank && <Loader2 size={14} className="animate-spin" />} Save payout details</button></div>
        </section>}

        <section className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          <div className="rounded-[32px] border border-gray-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-2"><Trophy className="text-amber-500" size={20} /><h2 className="font-black">Referral champions</h2></div><p className="mt-1 text-xs text-gray-500">People helped this month and beyond</p><div className="mt-5 space-y-3">{leaderboard.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3"><span className="w-7 text-center text-sm font-black text-amber-600">#{item.rank}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{item.name}</p><p className="text-[10px] text-gray-400">{item.peopleHelped} people helped</p></div><span className="text-sm font-black text-green-700">{naira(item.points)}</span></div>)}{leaderboard.length === 0 && <p className="py-8 text-center text-sm text-gray-400">Be the first referral champion.</p>}</div></div>
          <div className="rounded-[32px] border border-gray-100 bg-white p-7 shadow-sm"><h2 className="font-black">How rewards work</h2><div className="mt-5 space-y-3 text-sm text-gray-600"><Reward label="Complete your profile" points={100} /><Reward label="Referred buyer activates" points={600} /><Reward label="Referred seller activates" points={1000} /><Reward label="Successful first order" points={400} /><Reward label="Minimum withdrawal" points={MINIMUM_REFERRAL_WITHDRAWAL} /></div></div>
        </section>

        {user && data && <section className="mt-10 rounded-[32px] border border-gray-100 bg-white p-7 shadow-sm"><h2 className="font-black">Recent rewards</h2><div className="mt-4 divide-y divide-gray-100">{data.ledger.filter((item) => Number(item.points) > 0).slice(0, 8).map((item) => <div key={item.id} className="flex items-center justify-between py-3 text-sm"><span className="font-bold text-gray-700">{item.description}</span><span className="font-black text-green-600">+{naira(item.points)}</span></div>)}{data.ledger.filter((item) => Number(item.points) > 0).length === 0 && <p className="py-5 text-sm text-gray-400">Your rewards will appear here as you help people join and grow.</p>}</div></section>}
      </main>
      <Footer />
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) { return <div className="rounded-2xl bg-gray-50 p-3"><div className="flex items-center gap-2 text-green-600">{icon}<span className="text-[10px] font-black uppercase tracking-wide text-gray-400">{label}</span></div><p className="mt-2 text-lg font-black">{value}</p></div>; }
function Reward({ label, points }: { label: string; points: number }) { return <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3"><span>{label}</span><span className="font-black text-green-600">{points >= 1000 ? naira(points) : `+${naira(points)}`}</span></div>; }
