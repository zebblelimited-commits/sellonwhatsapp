// app/dashboard/tabs/OverviewTab.tsx
"use client";
import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import {
  Eye, MousePointer2, Users, Package,
  Store, ExternalLink, ShoppingBag, TrendingUp, Share2, ShieldCheck, Loader2,
  MessageCircle, Crown
} from "lucide-react";

const compactNumber = (num: number) => {
  return Intl.NumberFormat("en-NG", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(num);
};

export default function OverviewTab({
  username,
  storeUrl,
  storeId,
  disputeStats,
  totalSales = 0,
  followers = 0,
  productCount = 0,
  hasProAccess = false
}: {
  username: string,
  storeUrl: string,
  storeId: string,
  disputeStats?: any,
  totalSales?: number,
  followers?: number,
  productCount?: number,
  hasProAccess?: boolean
}) {
  const [timeRange, setTimeRange] = useState("7D");
  const [analyticsData, setAnalyticsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!storeId) return;
      try {
        setLoading(true);
        const endDate = new Date();
        const startDate = new Date();
        if (timeRange === "7D") startDate.setDate(startDate.getDate() - 7);
        else if (timeRange === "1M") startDate.setDate(startDate.getDate() - 30);
        else if (timeRange === "6M") startDate.setMonth(startDate.getMonth() - 6);
        else if (timeRange === "1Y") startDate.setFullYear(startDate.getFullYear() - 1);

        const q = query(
          collection(db, "analytics"),
          where("storeId", "==", storeId),
          where("timestamp", ">=", Timestamp.fromDate(startDate)),
          where("timestamp", "<=", Timestamp.fromDate(endDate))
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAnalyticsData(data);
      } catch (error: any) {
        console.error("Error fetching analytics:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, [storeId, timeRange]);

  const stats = useMemo(() => {
    const views = analyticsData.filter(d => d.eventType === "view").length;
    const clicks = analyticsData.filter(d => d.eventType === "click").length;
    const buyNowClicks = analyticsData.filter(d => d.eventType === "buy_now_click").length;
    const whatsappClicks = analyticsData.filter(d => d.eventType === "whatsapp_click").length;
    return { views, clicks, buyNowClicks, whatsappClicks, total: analyticsData.length };
  }, [analyticsData]);

  // 🌟 UPDATED: Added WhatsApp to the chart data generation
  const chartData = useMemo(() => {
    const grouped: Record<string, { Sales: number; Clicks: number; WhatsApp: number }> = {};
    analyticsData.forEach(item => {
      const timestamp = item.timestamp?.toDate ? item.timestamp.toDate() : new Date(item.timestamp);
      let dateKey: string;
      if (timeRange === "1Y") dateKey = timestamp.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      else dateKey = `${timestamp.getMonth() + 1}/${timestamp.getDate()}`;

      if (!grouped[dateKey]) grouped[dateKey] = { Sales: 0, Clicks: 0, WhatsApp: 0 };
      if (item.eventType === "buy_now_click") grouped[dateKey].Sales++;
      else if (item.eventType === "click") grouped[dateKey].Clicks++;
      else if (item.eventType === "whatsapp_click") grouped[dateKey].WhatsApp++;
    });

    const data = [];
    const points = timeRange === "1M" ? 30 : timeRange === "6M" ? 180 : timeRange === "1Y" ? 12 : 7;
    for (let i = points; i >= 0; i--) {
      const d = new Date();
      if (timeRange === "1Y") d.setMonth(d.getMonth() - i);
      else d.setDate(d.getDate() - i);
      const label = timeRange === "1Y" ? d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : `${d.getMonth() + 1}/${d.getDate()}`;
      data.push({ 
        date: label, 
        Sales: grouped[label]?.Sales || 0, 
        Clicks: grouped[label]?.Clicks || 0, 
        WhatsApp: grouped[label]?.WhatsApp || 0 
      });
    }
    return data;
  }, [analyticsData, timeRange]);

  const sourceData = useMemo(() => {
    const whatsapp = analyticsData.filter(d => d.referrer?.includes("whatsapp") || d.referrer?.includes("wa.me")).length;
    const direct = analyticsData.filter(d => !d.referrer || d.referrer === "" || d.referrer === "direct").length;
    const other = analyticsData.length - whatsapp - direct;
    return [
      { name: "WhatsApp", amount: whatsapp },
      { name: "Direct Link", amount: direct },
      { name: "Social/Other", amount: other },
    ];
  }, [analyticsData]);

  const DONUT_COLORS = ["#10b981", "#3b82f6", "#a855f7"];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-green-600" size={40} />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 font-plus-jakarta pb-10">
      {/* 1. Metric Cards */}
      <div className="mb-8">
        <div className="flex lg:hidden gap-3 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide -mx-4 px-4">
          <div className="snap-start flex-shrink-0 w-[240px]"> <StatCard label="Total Sales" value={`₦${totalSales.toLocaleString()}`} icon={<ShoppingBag size={18} />} color="text-green-700" bg="bg-green-50" subtitle="Lifetime revenue" isPrice={true} /> </div>
          <div className="snap-start flex-shrink-0 w-[240px]"> <StatCard label="Followers" value={followers.toLocaleString()} icon={<Users size={18} />} color="text-indigo-600" bg="bg-indigo-50" subtitle="Store followers" /> </div>
          <div className="snap-start flex-shrink-0 w-[240px]"> <StatCard label="Products" value={productCount.toString()} icon={<Package size={18} />} color="text-purple-600" bg="bg-purple-50" subtitle="Active listings" /> </div>
          <div className="snap-start flex-shrink-0 w-[240px]"> <StatCard label="Total Views" value={stats.views.toLocaleString()} icon={<Eye size={18} />} color="text-blue-600" bg="bg-blue-50" subtitle={`${timeRange} period`} /> </div>
          <div className="snap-start flex-shrink-0 w-[240px]"> <StatCard label="Total Clicks" value={stats.clicks.toLocaleString()} icon={<MousePointer2 size={18} />} color="text-green-600" bg="bg-green-50" subtitle={`${timeRange} period`} /> </div>
          <div className="snap-start flex-shrink-0 w-[240px]"> <StatCard label="Buy Now" value={stats.buyNowClicks.toLocaleString()} icon={<ShoppingBag size={18} />} color="text-purple-600" bg="bg-purple-50" subtitle="Purchase intents" /> </div>
          <div className="snap-start flex-shrink-0 w-[240px]"> <StatCard label="WhatsApp Clicks" value={stats.whatsappClicks.toLocaleString()} icon={<MessageCircle size={18} />} color="text-green-600" bg="bg-green-50" subtitle="Premium Metric" isLocked={!hasProAccess} /> </div>
          <div className="snap-start flex-shrink-0 w-[240px]"> <StatCard label="Conversion" value={stats.views > 0 ? `${((stats.buyNowClicks / stats.views) * 100).toFixed(1)}%` : "0%"} icon={<TrendingUp size={18} />} color="text-emerald-600" bg="bg-emerald-50" subtitle="Buy Now / Views" /> </div>
        </div>

        <div className="hidden lg:grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Total Sales" value={`₦${totalSales.toLocaleString()}`} icon={<ShoppingBag size={18} />} color="text-green-700" bg="bg-green-50" subtitle="Lifetime revenue" isPrice={true} />
          <StatCard label="Followers" value={followers.toLocaleString()} icon={<Users size={18} />} color="text-indigo-600" bg="bg-indigo-50" subtitle="Store followers" />
          <StatCard label="Products" value={productCount.toString()} icon={<Package size={18} />} color="text-purple-600" bg="bg-purple-50" subtitle="Active listings" />
          <StatCard label="Total Views" value={stats.views.toLocaleString()} icon={<Eye size={18} />} color="text-blue-600" bg="bg-blue-50" subtitle={`${timeRange} period`} />
          <StatCard label="Total Clicks" value={stats.clicks.toLocaleString()} icon={<MousePointer2 size={18} />} color="text-green-600" bg="bg-green-50" subtitle={`${timeRange} period`} />
          <StatCard label="Buy Now" value={stats.buyNowClicks.toLocaleString()} icon={<ShoppingBag size={18} />} color="text-purple-600" bg="bg-purple-50" subtitle="Purchase intents" />
          <StatCard label="WhatsApp Clicks" value={stats.whatsappClicks.toLocaleString()} icon={<MessageCircle size={18} />} color="text-green-600" bg="bg-green-50" subtitle="Premium Metric" isLocked={!hasProAccess} />
          <StatCard label="Conversion" value={stats.views > 0 ? `${((stats.buyNowClicks / stats.views) * 100).toFixed(1)}%` : "0%"} icon={<TrendingUp size={18} />} color="text-emerald-600" bg="bg-emerald-50" subtitle="Buy Now / Views" />
        </div>
      </div>

      {/* 2. Date Filter Controls */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        <FilterButton label="7 Days" active={timeRange === "7D"} onClick={() => setTimeRange("7D")} />
        <FilterButton label="1 Month" active={timeRange === "1M"} onClick={() => setTimeRange("1M")} />
        <FilterButton label="6 Months" active={timeRange === "6M"} onClick={() => setTimeRange("6M")} />
        <FilterButton label="1 Year" active={timeRange === "1Y"} onClick={() => setTimeRange("1Y")} />
      </div>

      {/* 3. Growth Velocity Section */}
      <div className="mb-8">
        <div className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm h-auto transition-all">
          <div className="flex items-start justify-between mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={16} className="text-emerald-600" />
                <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Growth Velocity</h3>
              </div>
              <p className="text-[9px] text-slate-700 font-extrabold uppercase tracking-widest">Network Performance ({timeRange})</p>
            </div>
            
            {/* 🌟 UPDATED: Added WhatsApp to the legend with a PRO badge for free users */}
            <div className="flex gap-4">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-purple-500" /><span className="text-[9px] font-black text-slate-500 uppercase">Buy Now</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-[9px] font-black text-slate-500 uppercase">Clicks</span></div>
              
              {/* WhatsApp Legend Item */}
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#25D366]" />
                <span className="text-[9px] font-black text-slate-500 uppercase flex items-center gap-1">
                  WhatsApp 
                  {!hasProAccess && <Crown size={10} className="text-amber-500 fill-amber-400" />}
                </span>
              </div>
            </div>
          </div>
          
          <div className="w-full" style={{ height: '288px' }}>
            <ResponsiveContainer width="100%" height={288}>
              <RechartsAreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  {/* 🌟 NEW: WhatsApp Gradient (Official WhatsApp Green) */}
                  <linearGradient id="colorWhatsApp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#25D366" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#25D366" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} interval={timeRange === "7D" ? 0 : timeRange === "1M" ? 5 : timeRange === "6M" ? 30 : 1} tick={{ fontSize: 12, fontWeight: 900, fill: "#475569" }} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={compactNumber} tick={{ fontSize: 12, fontWeight: 900, fill: "#475569" }} />
                <Tooltip 
                  formatter={(value: number, name: string) => [value.toLocaleString(), `${name}:`]}
                  contentStyle={{ backgroundColor: "#fff", borderRadius: "16px", border: "1px solid #f1f5f9", boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}
                  itemStyle={{ fontWeight: "900", fontSize: "10px", textTransform: "capitalize" }}
                  labelStyle={{ fontWeight: "900", fontSize: "9px", color: "#64748b", textTransform: "uppercase", marginBottom: "4px" }}
                />
                <Area type="monotone" dataKey="Sales" stroke="#a855f7" strokeWidth={2.5} fillOpacity={1} fill="url(#colorSales)" activeDot={{ r: 5, strokeWidth: 0 }} />
                <Area type="monotone" dataKey="Clicks" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorClicks)" activeDot={{ r: 5, strokeWidth: 0 }} />
                
                {/* 🌟 CONDITIONAL: Only render WhatsApp line if user has Pro access */}
                {hasProAccess && (
                  <Area type="monotone" dataKey="WhatsApp" stroke="#25D366" strokeWidth={2.5} fillOpacity={1} fill="url(#colorWhatsApp)" activeDot={{ r: 5, strokeWidth: 0 }} />
                )}
              </RechartsAreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-8 pt-4 border-t border-slate-50 flex justify-between items-center">
            <p className="text-[8px] font-black text-slate-700 uppercase tracking-[0.2em]">Zebble-Q Analytics Engine</p>
            <div className="flex items-center gap-1">
              <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[8px] font-black text-emerald-600 uppercase">Core Sync Live</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Secondary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[#ecfcca] rounded-[32px] p-8 relative overflow-hidden group border border-green-100 shadow-sm flex flex-col justify-center min-h-[340px]">
          <div className="relative z-10">
            <h3 className="font-bold text-gray-900 text-lg mb-1">Live Storefront</h3>
            <p className="text-green-800/60 text-xs font-bold mb-4 uppercase tracking-wider">Public Channel</p>
            <div className="bg-white/60 backdrop-blur-sm px-4 py-3 rounded-2xl mb-6 text-[11px] font-mono font-bold text-green-900 break-all border border-white/40 shadow-inner">{storeUrl}</div>
            <Link href={storeUrl} target="_blank" className="bg-green-700 text-white px-6 py-3 rounded-2xl inline-flex items-center gap-2 text-sm font-extrabold hover:bg-green-800 transition-all shadow-lg shadow-green-200/50">Visit Store <ExternalLink size={14} /></Link>
          </div>
          <Store className="absolute -right-6 -bottom-6 text-green-700/5 rotate-12 transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-0" size={180} />
        </div>
        <div className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm flex flex-col justify-between min-h-[340px]">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <Share2 size={16} className="text-purple-600" />
              <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Traffic Sources</h3>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-8">
              <div className="flex items-center justify-center" style={{ width: '160px', height: '160px' }}>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={sourceData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={4} dataKey="amount">
                      {sourceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [value.toLocaleString(), "Views"]} contentStyle={{ backgroundColor: "#fff", borderRadius: "14px", border: "1px solid #f1f5f9" }} itemStyle={{ fontWeight: "800", fontSize: "11px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-4 w-full">
                <SourceRow label="WhatsApp" color="text-emerald-600" value={stats.total > 0 ? ((sourceData[0].amount / stats.total) * 100).toFixed(0) : "0"} />
                <SourceRow label="Direct Link" color="text-blue-600" value={stats.total > 0 ? ((sourceData[1].amount / stats.total) * 100).toFixed(0) : "0"} />
                <SourceRow label="Others" color="text-purple-600" value={stats.total > 0 ? ((sourceData[2].amount / stats.total) * 100).toFixed(0) : "0"} />
              </div>
            </div>
          </div>
          <div className="mt-8 pt-4 border-t border-slate-50 flex justify-between items-center">
            <div className="flex items-center gap-1.5 text-[8px] font-black text-slate-600 uppercase tracking-[0.2em]">
              <ShieldCheck size={20} className="text-emerald-500" />
              Secure Data Ledger
            </div>
            <span className="text-[8px] font-black text-slate-700 uppercase tracking-widest">v3.1.2-Stable</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceRow({ label, color, value }: any) {
  return (
    <div className="flex justify-between items-center pb-2 border-b border-slate-50">
      <span className={`${color} text-[10px] font-black uppercase tracking-tighter`}>{label}</span>
      <span className="text-slate-900 text-[12px] font-black">{value}%</span>
    </div>
  );
}

function StatCard({ label, value, icon, color, bg, subtitle, isPrice = false, isLocked = false }: any) {
  return (
    <div className={`bg-white p-4 rounded-2xl border border-gray-100 shadow-sm transition-all hover:shadow-md flex items-center gap-4 h-full relative overflow-hidden ${isLocked ? 'opacity-90' : ''}`}>
      {isLocked && (
        <div className="absolute top-2 right-2 bg-amber-100 text-amber-700 text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 z-10 shadow-sm">
          <Crown size={10} className="fill-amber-400" /> PRO
        </div>
      )}
      <div className={`w-10 h-10 ${bg} ${color} rounded-xl flex items-center justify-center shrink-0 ${isLocked ? 'blur-[2px]' : ''}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest truncate">{label}</p>
        <h3 className={`${isPrice ? "text-sm" : "text-lg"} font-black text-gray-900 tracking-tight truncate ${isLocked ? 'blur-sm select-none' : ''}`}>
          {isLocked ? '•••••' : value}
        </h3>
        {subtitle ? (
          <p className={`text-[9px] font-extrabold uppercase mt-0.5 flex items-center gap-1 ${isLocked ? 'text-amber-500' : 'text-green-500'}`}>
            <span className={`w-1 h-1 rounded-full animate-pulse inline-block shrink-0 ${isLocked ? 'bg-amber-500' : 'bg-green-500'}`} />
            <span className="truncate">{isLocked ? 'Upgrade to unlock' : subtitle}</span>
          </p>
        ) : (
          <p className="text-[9px] font-extrabold text-gray-300 uppercase mt-0.5">Active Tracker</p>
        )}
      </div>
    </div>
  );
}

function FilterButton({ label, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${active ? "bg-slate-900 text-white border-slate-900 shadow-md scale-[0.98]" : "bg-white text-slate-400 border-slate-100 hover:border-slate-300 hover:text-slate-600"}`}
    >
      {label}
    </button>
  );
}