"use client";
import React, { useMemo, useEffect, useState } from "react";
import { ShoppingBag, Globe, Percent, Activity, Eye, ShieldCheck, TrendingUp, BarChart2, MessageCircle, Heart, MousePointer2, Share2, Star, ThumbsUp, Bookmark, MapPin, Mail, Phone } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

interface Order {
  id: string;
  totalAmount: number;
  createdAt: any;
  status: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  deliveryState?: string;
}

const compactNumber = (num: number) => {
  return Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 }).format(num);
};

export default function AnalyticsTab({ orders = [], stats, storeId }: { orders: Order[], stats: any, storeId: string }) {
  const [mounted, setMounted] = useState(false);
  const [timeRange, setTimeRange] = useState("7D");
  const [analyticsData, setAnalyticsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setMounted(true); }, []);

  // 🌟 Fetch real analytics data directly from the Firestore 'analytics' collection
  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!storeId) { 
        console.warn("[AnalyticsTab] storeId is missing, skipping fetch");
        setLoading(false); 
        return; 
      }
      
      try {
        setLoading(true);
        console.log(`[AnalyticsTab] Fetching analytics for storeId: ${storeId}`);
        
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
        
        console.log(`[AnalyticsTab] Fetched ${data.length} analytics events`);
        setAnalyticsData(data);
      } catch (error: any) {
        console.error("[AnalyticsTab] Error fetching analytics:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, [storeId, timeRange]);

  // 🌟 Calculate REAL stats from the analytics collection
  const realStats = useMemo(() => {
    const views = analyticsData.filter(d => d.eventType === "view").length;
    const clicks = analyticsData.filter(d => d.eventType === "click").length;
    const buyNowClicks = analyticsData.filter(d => d.eventType === "buy_now_click").length;
    const whatsappClicks = analyticsData.filter(d => d.eventType === "whatsapp_click").length;
    const totalEvents = analyticsData.length;
    const conversionRate = views > 0 ? ((buyNowClicks / views) * 100).toFixed(1) : "0.0";
    
    console.log("[AnalyticsTab] Calculated stats:", { views, clicks, buyNowClicks, whatsappClicks, totalEvents, conversionRate });
    
    return { views, clicks, buyNowClicks, whatsappClicks, totalEvents, conversionRate };
  }, [analyticsData]);

  // 1. Sales Velocity Trend Data Generation
  const chartData = useMemo(() => {
    const dailyData: Record<string, number> = {};
    const daysToMap = timeRange === "1M" ? 30 : timeRange === "6M" ? 180 : timeRange === "1Y" ? 365 : 6;
    for (let i = daysToMap; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = daysToMap > 30 ? d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : `${d.getMonth() + 1}/${d.getDate()}`;
      dailyData[label] = 0;
    }
    orders.forEach((order) => {
      if (order.status === "PAID_HELD" || order.status === "COMPLETED") {
        const dateObj = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
        const label = daysToMap > 30 ? dateObj.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
        if (dailyData[label] !== undefined) dailyData[label] += (order.totalAmount || 0);
      }
    });
    return Object.entries(dailyData).map(([date, Sales]) => ({ date, Sales }));
  }, [orders, timeRange]);

  // 2. Escrow Health Distribution
  const escrowData = useMemo(() => {
    const counts = { PAID_HELD: 0, COMPLETED: 0, PENDING: 0 };
    orders.forEach(o => { if (counts[o.status as keyof typeof counts] !== undefined) counts[o.status as keyof typeof counts] += o.totalAmount; });
    return [
      { name: "Locked in Escrow", amount: counts.PAID_HELD, color: "#10b981" },
      { name: "Released Funds", amount: counts.COMPLETED, color: "#3b82f6" },
      { name: "Pending Payment", amount: counts.PENDING, color: "#a855f7" },
    ];
  }, [orders]);

  // 3. Hourly Traffic Mapping
  const hourlyData = useMemo(() => {
    const baseline = [
      { hour: "12 AM", Views: Math.round((realStats.views || 0) * 0.05), Orders: 0 },
      { hour: "4 AM", Views: Math.round((realStats.views || 0) * 0.02), Orders: 0 },
      { hour: "8 AM", Views: Math.round((realStats.views || 0) * 0.18), Orders: 0 },
      { hour: "12 PM", Views: Math.round((realStats.views || 0) * 0.32), Orders: 0 },
      { hour: "4 PM", Views: Math.round((realStats.views || 0) * 0.23), Orders: 0 },
      { hour: "8 PM", Views: Math.round((realStats.views || 0) * 0.20), Orders: 0 },
    ];
    orders.forEach(order => {
      const dateObj = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
      const h = dateObj.getHours();
      let slotIndex = 0;
      if (h >= 22 || h < 2) slotIndex = 0;
      else if (h >= 2 && h < 6) slotIndex = 1;
      else if (h >= 6 && h < 10) slotIndex = 2;
      else if (h >= 10 && h < 14) slotIndex = 3;
      else if (h >= 14 && h < 18) slotIndex = 4;
      else if (h >= 18 && h < 22) slotIndex = 5;
      baseline[slotIndex].Orders += 1;
    });
    return baseline;
  }, [orders, realStats.views]);

  // 4. AOV Trend
  const aovData = useMemo(() => {
    const dailyTotals: Record<string, { amount: number; count: number }> = {};
    const daysToMap = timeRange === "1M" ? 15 : timeRange === "6M" ? 30 : timeRange === "1Y" ? 60 : 6;
    for (let i = daysToMap; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      dailyTotals[label] = { amount: 0, count: 0 };
    }
    orders.forEach((order) => {
      const dateObj = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
      const label = dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      if (dailyTotals[label]) { dailyTotals[label].amount += (order.totalAmount || 0); dailyTotals[label].count += 1; }
    });
    return Object.entries(dailyTotals).map(([date, meta]) => ({ date, AOV: meta.count > 0 ? Math.round(meta.amount / meta.count) : 0 }));
  }, [orders, timeRange]);

  const recentOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      return dateB.getTime() - dateA.getTime();
    }).slice(0, 10);
  }, [orders]);

  if (!mounted || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 space-y-8 font-plus-jakarta pb-10">
      
      {/* 🌟 1. COMPACT METRIC CARDS (Matching Overview Tab Layout) */}
      <div className="mb-8">
        {/* Mobile Horizontal Scroll */}
        <div className="flex lg:hidden gap-3 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide -mx-4 px-4">
          <div className="snap-start flex-shrink-0 w-[240px]"> <AnalyticsCard label="Total Revenue" value={`₦${compactNumber(stats.totalSales || 0)}`} icon={<ShoppingBag size={18} />} iconColor="text-emerald-700" iconBg="bg-emerald-50" subtitle="Lifetime revenue" /> </div>
          <div className="snap-start flex-shrink-0 w-[240px]"> <AnalyticsCard label="Total Views" value={realStats.views.toLocaleString()} icon={<Eye size={18} />} iconColor="text-blue-600" iconBg="bg-blue-50" subtitle={`${timeRange} period`} /> </div>
          <div className="snap-start flex-shrink-0 w-[240px]"> <AnalyticsCard label="Total Clicks" value={realStats.clicks.toLocaleString()} icon={<MousePointer2 size={18} />} iconColor="text-indigo-600" iconBg="bg-indigo-50" subtitle={`${timeRange} period`} /> </div>
          <div className="snap-start flex-shrink-0 w-[240px]"> <AnalyticsCard label="Buy Now" value={realStats.buyNowClicks.toLocaleString()} icon={<ShoppingBag size={18} />} iconColor="text-purple-600" iconBg="bg-purple-50" subtitle="Purchase intents" /> </div>
          <div className="snap-start flex-shrink-0 w-[240px]"> <AnalyticsCard label="WhatsApp Clicks" value={realStats.whatsappClicks.toLocaleString()} icon={<MessageCircle size={18} />} iconColor="text-green-600" iconBg="bg-green-50" subtitle="Direct chats" /> </div>
          <div className="snap-start flex-shrink-0 w-[240px]"> <AnalyticsCard label="Conversion" value={`${realStats.conversionRate}%`} icon={<Percent size={18} />} iconColor="text-emerald-600" iconBg="bg-emerald-50" subtitle="Buy Now / Views" /> </div>
          <div className="snap-start flex-shrink-0 w-[240px]"> <AnalyticsCard label="Total Events" value={realStats.totalEvents.toLocaleString()} icon={<Activity size={18} />} iconColor="text-slate-600" iconBg="bg-slate-50" subtitle="All tracked actions" /> </div>
          
          {/* 🌟 COMING SOON CARDS */}
          <div className="snap-start flex-shrink-0 w-[240px]"> <AnalyticsCard label="Shares" value="••••" icon={<Share2 size={18} />} iconColor="text-pink-600" iconBg="bg-pink-50" subtitle="Coming Soon" isLocked={true} /> </div>
          <div className="snap-start flex-shrink-0 w-[240px]"> <AnalyticsCard label="Reviews" value="••••" icon={<Star size={18} />} iconColor="text-yellow-600" iconBg="bg-yellow-50" subtitle="Coming Soon" isLocked={true} /> </div>
          <div className="snap-start flex-shrink-0 w-[240px]"> <AnalyticsCard label="Ratings" value="••••" icon={<ThumbsUp size={18} />} iconColor="text-blue-600" iconBg="bg-blue-50" subtitle="Coming Soon" isLocked={true} /> </div>
          <div className="snap-start flex-shrink-0 w-[240px]"> <AnalyticsCard label="Likes" value="••••" icon={<Heart size={18} />} iconColor="text-red-600" iconBg="bg-red-50" subtitle="Coming Soon" isLocked={true} /> </div>
          <div className="snap-start flex-shrink-0 w-[240px]"> <AnalyticsCard label="Wishlist" value="••••" icon={<Bookmark size={18} />} iconColor="text-purple-600" iconBg="bg-purple-50" subtitle="Coming Soon" isLocked={true} /> </div>
        </div>

        {/* Desktop 4-Column Grid */}
        <div className="hidden lg:grid grid-cols-2 xl:grid-cols-4 gap-4">
          <AnalyticsCard label="Total Revenue" value={`₦${compactNumber(stats.totalSales || 0)}`} icon={<ShoppingBag size={18} />} iconColor="text-emerald-700" iconBg="bg-emerald-50" subtitle="Lifetime revenue" />
          <AnalyticsCard label="Total Views" value={realStats.views.toLocaleString()} icon={<Eye size={18} />} iconColor="text-blue-600" iconBg="bg-blue-50" subtitle={`${timeRange} period`} />
          <AnalyticsCard label="Total Clicks" value={realStats.clicks.toLocaleString()} icon={<MousePointer2 size={18} />} iconColor="text-indigo-600" iconBg="bg-indigo-50" subtitle={`${timeRange} period`} />
          <AnalyticsCard label="Buy Now" value={realStats.buyNowClicks.toLocaleString()} icon={<ShoppingBag size={18} />} iconColor="text-purple-600" iconBg="bg-purple-50" subtitle="Purchase intents" />
          <AnalyticsCard label="WhatsApp Clicks" value={realStats.whatsappClicks.toLocaleString()} icon={<MessageCircle size={18} />} iconColor="text-green-600" iconBg="bg-green-50" subtitle="Direct chats" />
          <AnalyticsCard label="Conversion" value={`${realStats.conversionRate}%`} icon={<Percent size={18} />} iconColor="text-emerald-600" iconBg="bg-emerald-50" subtitle="Buy Now / Views" />
          <AnalyticsCard label="Total Events" value={realStats.totalEvents.toLocaleString()} icon={<Activity size={18} />} iconColor="text-slate-600" iconBg="bg-slate-50" subtitle="All tracked actions" />
          
          {/* 🌟 COMING SOON CARDS */}
          <AnalyticsCard label="Shares" value="••••" icon={<Share2 size={18} />} iconColor="text-pink-600" iconBg="bg-pink-50" subtitle="Coming Soon" isLocked={true} />
          <AnalyticsCard label="Reviews" value="••••" icon={<Star size={18} />} iconColor="text-yellow-600" iconBg="bg-yellow-50" subtitle="Coming Soon" isLocked={true} />
          <AnalyticsCard label="Ratings" value="••••" icon={<ThumbsUp size={18} />} iconColor="text-blue-600" iconBg="bg-blue-50" subtitle="Coming Soon" isLocked={true} />
          <AnalyticsCard label="Likes" value="••••" icon={<Heart size={18} />} iconColor="text-red-600" iconBg="bg-red-50" subtitle="Coming Soon" isLocked={true} />
          <AnalyticsCard label="Wishlist" value="••••" icon={<Bookmark size={18} />} iconColor="text-purple-600" iconBg="bg-purple-50" subtitle="Coming Soon" isLocked={true} />
        </div>
      </div>

      {/* 2. Filters */}
      <div className="flex items-center gap-2 overflow-x-auto py-2">
        <FilterButton label="7 Days" active={timeRange === "7D"} onClick={() => setTimeRange("7D")} />
        <FilterButton label="1 Month" active={timeRange === "1M"} onClick={() => setTimeRange("1M")} />
        <FilterButton label="6 Months" active={timeRange === "6M"} onClick={() => setTimeRange("6M")} />
        <FilterButton label="1 Year" active={timeRange === "1Y"} onClick={() => setTimeRange("1Y")} />
      </div>

      {/* 3. Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sales Velocity */}
        <div className="lg:col-span-2 bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm h-auto transition-all">
          <div className="flex items-start justify-between mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={16} className="text-emerald-600" />
                <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Sales Velocity</h3>
              </div>
              <p className="text-[9px] text-slate-700 font-bold uppercase tracking-widest">Global Escrow Ledger ({timeRange})</p>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-tighter">Sync Active</span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSalesAnalytics" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#b3bfcaff" strokeDasharray="4 4" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} dy={10} tick={{ fontSize: 12, fontWeight: 900, fill: "#475569" }} />
                <YAxis axisLine={false} tickLine={false} dx={-5} tickFormatter={(num) => `₦${compactNumber(num)}`} width={55} tick={{ fontSize: 12, fontWeight: 900, fill: "#475569" }} />
                <Tooltip formatter={(value: any) => [`₦${value.toLocaleString()}`, 'Revenue']} contentStyle={{ borderRadius: "12px", border: "1px solid #f1f5f9" }} />
                <Area type="monotone" dataKey="Sales" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorSalesAnalytics)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Escrow Health */}
        <div className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <ShieldCheck size={16} className="text-purple-600" />
              <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Escrow Health</h3>
            </div>
            <div className="h-44 mt-4 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={escrowData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={3} dataKey="amount">
                    {escrowData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                  </Pie>
                  <Tooltip formatter={(value: any) => [`₦${value.toLocaleString()}`, 'Amount']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-8 space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-slate-50"><span className="text-emerald-600 text-[10px] font-black uppercase">Locked</span><span className="text-slate-900 font-black">₦{compactNumber(escrowData[0].amount)}</span></div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-50"><span className="text-blue-600 text-[10px] font-black uppercase">Released</span><span className="text-slate-900 font-black">₦{compactNumber(escrowData[1].amount)}</span></div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-50"><span className="text-purple-600 text-[10px] font-black uppercase">Pending</span><span className="text-slate-900 font-black">₦{compactNumber(escrowData[2].amount)}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Secondary Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm h-auto">
          <div className="mb-6 flex items-center gap-2">
            <BarChart2 size={16} className="text-blue-600" />
            <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Hourly Traffic vs Conversions</h3>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#b3bfcaff" strokeDasharray="4 4" />
                <XAxis dataKey="hour" axisLine={false} tickLine={false} dy={10} tick={{ fontSize: 12, fontWeight: 900, fill: "#475569" }} />
                <YAxis axisLine={false} tickLine={false} dx={-5} tick={{ fontSize: 12, fontWeight: 900, fill: "#475569" }} />
                <Tooltip />
                <Bar dataKey="Views" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Store Views" />
                <Bar dataKey="Orders" fill="#10b981" radius={[4, 4, 0, 0]} name="Orders Placed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm h-auto">
          <div className="mb-6 flex items-center gap-2">
            <Activity size={16} className="text-purple-600" />
            <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Average Order Value (AOV)</h3>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={aovData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#b3bfcaff" strokeDasharray="4 4" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} dy={10} tick={{ fontSize: 12, fontWeight: 900, fill: "#475569" }} />
                <YAxis axisLine={false} tickLine={false} dx={-5} tickFormatter={(v) => `₦${compactNumber(v)}`} tick={{ fontSize: 12, fontWeight: 900, fill: "#475569" }} />
                <Tooltip formatter={(value: any) => [`₦${value.toLocaleString()}`, 'AOV']} />
                <Line type="monotone" dataKey="AOV" stroke="#a855f7" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 🌟 5. ENHANCED TRANSACTIONS LIST WITH CUSTOMER DETAILS */}
      <div className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Recent Transactions</h3>
            <p className="text-[9px] text-slate-700 font-bold uppercase tracking-widest">Latest Escrow Activities with Customer Details</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-[9px] font-black uppercase text-slate-600 px-0 py-3 whitespace-nowrap">ID</th>
                <th className="text-[9px] font-black uppercase text-slate-600 px-4 py-3 whitespace-nowrap">Customer</th>
                <th className="text-[9px] font-black uppercase text-slate-600 px-4 py-3 whitespace-nowrap">Contact</th>
                <th className="text-[9px] font-black uppercase text-slate-600 px-4 py-3 whitespace-nowrap">Location</th>
                <th className="text-[9px] font-black uppercase text-slate-600 px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-[9px] font-black uppercase text-slate-600 text-right px-4 py-3 whitespace-nowrap">Amount</th>
                <th className="text-[9px] font-black uppercase text-slate-600 text-right px-0 py-3 whitespace-nowrap">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => (
                <tr key={order.id} className="border-b border-gray-100/50 last:border-0 hover:bg-slate-50/50 transition-colors group">
                  <td className="text-[10px] font-bold text-slate-700 px-0 py-4 whitespace-nowrap">#{order.id.slice(-5).toUpperCase()}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white text-[10px] font-black">
                        {(order.customerName || "A").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-slate-900">{order.customerName || "Anonymous"}</p>
                        <p className="text-[9px] text-slate-500 font-medium">Customer</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      {order.customerPhone && (
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-700">
                          <Phone size={10} className="text-green-600" />
                          <span className="font-medium">{order.customerPhone}</span>
                        </div>
                      )}
                      {order.customerEmail && (
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-700">
                          <Mail size={10} className="text-blue-600" />
                          <span className="font-medium truncate max-w-[150px]">{order.customerEmail}</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {order.deliveryState && (
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-700">
                        <MapPin size={10} className="text-purple-600" />
                        <span className="font-medium">{order.deliveryState}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4"><StatusBadge status={order.status} /></td>
                  <td className="text-right text-[11px] font-black text-slate-900 px-4 py-4 whitespace-nowrap">₦{order.totalAmount.toLocaleString()}</td>
                  <td className="text-right text-[10px] text-slate-600 font-medium px-0 py-4 whitespace-nowrap">
                    {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: any = { PAID_HELD: "bg-emerald-50 text-emerald-700 border-emerald-100", COMPLETED: "bg-blue-50 text-blue-700 border-blue-100", PENDING: "bg-slate-50 text-slate-500 border-slate-100" };
  return <span className={`text-[8px] font-black px-2 py-0.5 rounded-md border uppercase ${colors[status] || colors.PENDING}`}>{status.replace("_", " ")}</span>;
}

// 🌟 UPDATED: AnalyticsCard now supports the 'isLocked' prop for Coming Soon features
function AnalyticsCard({ label, value, icon, iconColor, iconBg, subtitle, isLocked = false }: any) {
  return (
    <div className={`bg-white p-4 rounded-2xl border border-gray-100 shadow-sm transition-all hover:shadow-md flex items-center gap-4 h-full relative overflow-hidden ${isLocked ? 'opacity-90' : ''}`}>
      
      {/* COMING SOON BADGE */}
      {isLocked && (
        <div className="absolute top-2 right-2 bg-amber-100 text-amber-700 text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 z-10 shadow-sm">
          <TrendingUp size={10} /> SOON
        </div>
      )}

      <div className={`w-10 h-10 ${iconBg} ${iconColor} rounded-xl flex items-center justify-center shrink-0 ${isLocked ? 'blur-[2px]' : ''}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest truncate">{label}</p>
        <h3 className={`text-lg font-black text-gray-900 tracking-tight truncate ${isLocked ? 'blur-sm select-none' : ''}`}>
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
    <button onClick={onClick} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${active ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600"}`}>
      {label}
    </button>
  );
}