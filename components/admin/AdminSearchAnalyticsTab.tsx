"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Activity, Hash, Loader2, RefreshCw, Search, TrendingUp } from "lucide-react";
import { getSearchAnalytics, type SearchAnalytics } from "@/lib/analytics";

const emptyData: SearchAnalytics = { totalSearches: 0, uniqueSearches: 0, topSearches: [] };

export default function AdminSearchAnalyticsTab() {
  const [data, setData] = useState<SearchAnalytics>(emptyData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadSearchAnalytics = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      setData(await getSearchAnalytics(20));
    } catch (loadError) {
      console.error("[AdminSearchAnalytics] Load failed:", loadError);
      setError("Search analytics could not be loaded. Check Firestore permissions and indexes.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadSearchAnalytics();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, []);

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-green-600" size={32} /></div>;
  }

  const highestCount = data.topSearches[0]?.count || 1;

  return (
    <section className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-green-600">Marketplace discovery</p>
          <h2 className="text-2xl font-black tracking-tight text-gray-900">Product Search Analytics</h2>
          <p className="mt-1 text-sm font-medium text-gray-500">See what buyers are searching for across the marketplace.</p>
        </div>
        <button type="button" onClick={() => void loadSearchAnalytics(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-black text-gray-700 shadow-sm transition hover:border-green-300 hover:text-green-700 disabled:opacity-60">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {error && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={<Search size={18} />} label="Searches captured" value={data.totalSearches.toLocaleString()} detail="Recent tracked searches" tone="green" />
        <MetricCard icon={<Hash size={18} />} label="Unique terms" value={data.uniqueSearches.toLocaleString()} detail="Distinct buyer queries" tone="blue" />
        <MetricCard icon={<TrendingUp size={18} />} label="Top demand" value={data.topSearches[0]?.query || "—"} detail={data.topSearches[0] ? `${data.topSearches[0].count} searches` : "No search data yet"} tone="purple" />
      </div>

      <div className="overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-gray-100 p-5 sm:p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600"><Activity size={18} /></div>
          <div><h3 className="text-sm font-black text-gray-900">Most searched products and terms</h3><p className="mt-1 text-[11px] font-medium text-gray-500">Top 20 from the latest 500 search events</p></div>
        </div>
        {data.topSearches.length === 0 ? (
          <div className="p-12 text-center text-sm font-semibold text-gray-500">Search activity will appear here as buyers search the marketplace.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.topSearches.map((item, index) => (
              <div key={item.query} className="flex items-center gap-4 px-5 py-4 sm:px-6">
                <span className="w-7 text-center text-xs font-black text-gray-400">{String(index + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-black capitalize text-gray-800">{item.query}</p><span className="shrink-0 text-xs font-black text-gray-700">{item.count.toLocaleString()}</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-300" style={{ width: `${Math.max(6, (item.count / highestCount) * 100)}%` }} /></div>
                </div>
                <span className="hidden w-16 text-right text-[10px] font-bold text-gray-400 sm:block">{((item.count / Math.max(1, data.totalSearches)) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function MetricCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: "green" | "blue" | "purple" }) {
  const styles = { green: "bg-green-50 text-green-600", blue: "bg-blue-50 text-blue-600", purple: "bg-purple-50 text-purple-600" };
  return <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${styles[tone]}`}>{icon}</div><p className="truncate text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p><p className="mt-1 truncate text-xl font-black text-gray-900">{value}</p><p className="mt-1 truncate text-[10px] font-semibold text-gray-500">{detail}</p></div>;
}
