"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation"; // ✅ Removed useSearchParams
import { Plus_Jakarta_Sans } from "next/font/google";
import { Search, LayoutDashboard, LogOut, ExternalLink, Store, Menu, X } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { collection, query as firestoreQuery, where, getDocs, getDoc, doc, limit } from "firebase/firestore";

const font = Plus_Jakarta_Sans({ subsets: ["latin"] });

export default function Header({ isStorePage = false, storeName = "" }) {
  const router = useRouter();

  // ✅ FIX 1: Removed useSearchParams() to prevent Next.js Suspense boundary errors
  const [query, setQuery] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [vendorUsername, setVendorUsername] = useState("");
  const [isBuyer, setIsBuyer] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Initialize query from URL safely on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get("q") || "");
  }, []);

  // AJAX Overlay States
  const [isFocused, setIsFocused] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<{ stores: any[], products: any[] }>({ stores: [], products: [] });
  const searchRef = useRef<HTMLDivElement>(null);

  // 1. Auth Monitoring - ✅ FIX 2: Added try/catch to prevent unhandled rejections crashing the app
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const [adminSnap, storeSnap, vendorSnap, buyerSnap, userSnap] = await Promise.all([
            getDoc(doc(db, "admins", currentUser.uid)).catch(() => null),
            getDoc(doc(db, "stores", currentUser.uid)),
            getDoc(doc(db, "vendors", currentUser.uid)).catch(() => null),
            getDoc(doc(db, "buyers", currentUser.uid)).catch(() => null),
            getDoc(doc(db, "users", currentUser.uid)).catch(() => null),
          ]);

          if (adminSnap?.exists() && adminSnap.data()?.isActive === true) {
            setIsAdmin(true);
            setIsBuyer(false);
            setVendorUsername("");
          } else if (storeSnap.exists() || vendorSnap?.exists()) {
            const storeData = storeSnap.exists() ? storeSnap.data() : vendorSnap?.data();
            setIsAdmin(false);
            setIsBuyer(false); // ✅ User has a store = vendor
            setVendorUsername(storeData?.username || "");
          } else {
            setIsAdmin(false);
            setVendorUsername("");
            setIsBuyer(Boolean(buyerSnap?.exists() || userSnap?.exists()));
          }
        } catch (error) {
          console.error("Header: Error checking vendor status:", error);
          setVendorUsername("");
          setIsBuyer(false);
          setIsAdmin(false);
        }
      } else {
        setVendorUsername("");
        setIsBuyer(false);
        setIsAdmin(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Global AJAX Search Logic
  useEffect(() => {
    const performGlobalSearch = async () => {
      if (query.length < 2) {
        setResults({ stores: [], products: [] });
        return;
      }

      setIsSearching(true);
      try {
        const cleanQuery = query.toLowerCase().replace("@", "");

        // Fetch Stores and Products in parallel
        const [storeSnap, prodSnap] = await Promise.all([
          getDocs(firestoreQuery(collection(db, "stores"), limit(10))),
          getDocs(firestoreQuery(collection(db, "products"), limit(20)))
        ]);

        const matchedStores = storeSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((s: any) => s.username?.toLowerCase().includes(cleanQuery) || s.storeName?.toLowerCase().includes(cleanQuery))
          .slice(0, 3);

        const matchedProducts = prodSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((p: any) => p.name?.toLowerCase().includes(cleanQuery))
          .slice(0, 5);

        setResults({ stores: matchedStores, products: matchedProducts });
      } catch (err) {
        console.error("Search failed", err);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceId = setTimeout(performGlobalSearch, 300);
    return () => clearTimeout(debounceId);
  }, [query]);

  // Close overlay on click outside
  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setIsFocused(false);
    };
    document.addEventListener("mousedown", clickOutside);
    return () => document.removeEventListener("mousedown", clickOutside);
  }, []);

  // ✅ FIX 3: Updated handleSearch to use window.location.search instead of searchParams
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setIsFocused(false);
    if (isStorePage) {
      const params = new URLSearchParams(window.location.search);
      query ? params.set("q", query) : params.delete("q");
      router.push(`?${params.toString()}`, { scroll: false });
    } else {
      router.push(`/explore?q=${query}`);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } finally {
      await fetch('/api/session', { method: 'DELETE' }).catch(() => undefined);
      window.location.href = "/";
    }
  };

  // ✅ Determine correct dashboard URL based on user role
  const dashboardUrl = isAdmin ? "/admin" : isBuyer ? "/buyer/dashboard" : "/dashboard";

  return (
    <header className={`${font.className} flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 md:px-6 py-4 border-b border-gray-200 bg-white sticky top-0 z-50`}>

      {/* Balanced & Enlarged Logo Container */}
      <div className="flex w-full items-center justify-between md:w-auto">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-700 transition-colors hover:bg-gray-100 md:hidden"
          >
            {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <Link href="/" onClick={() => setIsMobileMenuOpen(false)}>
            <div className="flex items-center px-2">
              <img
                src="/icons/sowa.png"
                alt="Sowa Logo"
                className="h-8 md:h-9 w-auto object-contain"
              />
            </div>
          </Link>
        </div>

        {/* Mobile Authentication Actions */}
        <div className="flex md:hidden gap-2">
          {user ? (
            <>
              <Link href={dashboardUrl} className="px-3 py-1 text-xs font-bold border border-gray-200 rounded-lg">
                Dashboard
              </Link>
              <button onClick={handleLogout} className="px-3 py-1 text-xs font-bold border border-red-200 text-red-600 rounded-lg">
                Logout
              </button>
            </>
          ) : (
            <Link href="/login" className="px-3 py-1 text-xs font-bold border border-gray-200 rounded-lg">
              Login
            </Link>
          )}
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="w-full space-y-1 border-t border-gray-100 pt-3 md:hidden">
          {!isStorePage && (
            <>
              <Link href="/explore" onClick={() => setIsMobileMenuOpen(false)} className="block rounded-xl px-3 py-3 text-sm font-semibold text-gray-700 hover:bg-green-50 hover:text-green-700">Explore</Link>
              <Link href="/categories" onClick={() => setIsMobileMenuOpen(false)} className="block rounded-xl px-3 py-3 text-sm font-semibold text-gray-700 hover:bg-green-50 hover:text-green-700">Categories</Link>
              <Link href="/search" onClick={() => setIsMobileMenuOpen(false)} className="block rounded-xl px-3 py-3 text-sm font-semibold text-gray-700 hover:bg-green-50 hover:text-green-700">Search</Link>
              <Link href="/pricing" onClick={() => setIsMobileMenuOpen(false)} className="block rounded-xl px-3 py-3 text-sm font-semibold text-gray-700 hover:bg-green-50 hover:text-green-700">Pricing</Link>
              <Link href="/boost-store" onClick={() => setIsMobileMenuOpen(false)} className="block rounded-xl px-3 py-3 text-sm font-semibold text-gray-700 hover:bg-green-50 hover:text-green-700">Boost Store</Link>
              <Link href="/faq" onClick={() => setIsMobileMenuOpen(false)} className="block rounded-xl px-3 py-3 text-sm font-semibold text-gray-700 hover:bg-green-50 hover:text-green-700">FAQ</Link>
            </>
          )}
          {user && vendorUsername && <Link href={`/${vendorUsername}`} onClick={() => setIsMobileMenuOpen(false)} className="block rounded-xl px-3 py-3 text-sm font-semibold text-green-700 hover:bg-green-50">Visit Store</Link>}
          {user ? (
            <>
              <Link href={dashboardUrl} onClick={() => setIsMobileMenuOpen(false)} className="block rounded-xl px-3 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100">Dashboard</Link>
              <button type="button" onClick={() => { setIsMobileMenuOpen(false); void handleLogout(); }} className="block w-full rounded-xl px-3 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50">Logout</button>
            </>
          ) : (
            <>
              <Link href="/login" onClick={() => setIsMobileMenuOpen(false)} className="block rounded-xl px-3 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100">Login</Link>
              <Link href="/register" onClick={() => setIsMobileMenuOpen(false)} className="block rounded-xl bg-green-600 px-3 py-3 text-center text-sm font-bold text-white hover:bg-green-700">Get Started</Link>
            </>
          )}
        </div>
      )}

      {/* Global Search with AJAX Overlay */}
      <div ref={searchRef} className="w-full md:max-w-md relative">
        <form onSubmit={handleSearch} className="relative group z-[60]">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-green-600 transition-colors">
            <Search size={18} strokeWidth={2.5} />
          </div>
          <input
            value={query}
            onFocus={() => setIsFocused(true)}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isStorePage ? `Search in ${storeName}...` : "Search store @foodexpress or product..."}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-4 focus:ring-green-500/10 focus:border-green-600 transition-all bg-gray-50/50 focus:bg-white"
          />
        </form>

        {/* AJAX DROPDOWN */}
        {isFocused && (query.length > 0 || isSearching) && (
          <div className="absolute top-full left-0 w-full bg-white mt-2 rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-[50] animate-in fade-in slide-in-from-top-1">
            {isSearching ? (
              <div className="p-4 text-center text-xs text-gray-400">Searching...</div>
            ) : (results.stores.length > 0 || results.products.length > 0) ? (
              <div className="max-h-[400px] overflow-y-auto">
                {/* Store Results */}
                {results.stores.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Stores</div>
                    {results.stores.map(s => (
                      <Link key={s.id} href={`/${s.username}`} onClick={() => setIsFocused(false)} className="flex items-center gap-3 p-3 hover:bg-green-50 transition-colors border-b border-gray-50 last:border-0">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600"><Store size={14} /></div>
                        <div>
                          <p className="text-xs font-bold text-gray-900">{s.storeName}</p>
                          <p className="text-[10px] text-green-600">@{s.username}</p>
                        </div>
                      </Link>
                    ))}
                  </>
                )}

                {/* Product Results */}
                {results.products.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Products</div>
                    {results.products.map(p => (
                      <Link key={p.id} href={`/products/${p.id}`} onClick={() => setIsFocused(false)} className="flex items-center gap-3 p-3 hover:bg-green-50 transition-colors border-b border-gray-50 last:border-0">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                          <img src={p.images?.[0] || p.image || "/placeholder.png"} className="w-full h-full object-cover" alt="" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">{p.name}</p>
                          <p className="text-[10px] text-gray-500">₦{Number(p.price).toLocaleString()}</p>
                        </div>
                      </Link>
                    ))}
                  </>
                )}
                <button onClick={handleSearch} className="w-full p-3 text-[11px] font-bold text-center text-gray-500 hover:bg-gray-50 border-t border-gray-50">
                  Press Enter for all results
                </button>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-gray-400">No stores or products found</div>
            )}
          </div>
        )}
      </div>

      {!isStorePage && (
        <nav className="hidden md:flex gap-6 text-sm font-medium text-gray-600">
          <Link href="/explore" className="hover:text-green-600">Explore</Link>
          <Link href="/categories" className="hover:text-green-600">Categories</Link>
          <Link href="/search" className="hover:text-green-600">Search</Link>
          <a href="/pricing" className="hover:text-green-600">Pricing</a>
          <a href="/boost-store" className="hover:text-green-600">Boost Store</a>
          <a href="/faq" className="hover:text-green-600">FAQ</a>
        </nav>
      )}

      {/* Auth Buttons */}
      <div className="hidden md:flex gap-2">
        {user ? (
          <>
            {vendorUsername && (
              <Link href={`/${vendorUsername}`} target="_blank" className="flex items-center gap-2 px-5 py-2 text-sm font-bold border border-green-100 text-[#00a63e] rounded-xl hover:bg-green-50 transition-all">
                <ExternalLink size={16} /> Visit Store
              </Link>
            )}
            <Link href={dashboardUrl} className="flex items-center gap-2 px-5 py-2 text-sm font-bold border border-gray-200 rounded-xl hover:bg-gray-50 transition-all">
              <LayoutDashboard size={16} /> Dashboard
            </Link>
            <button onClick={handleLogout} className="flex items-center gap-2 px-5 py-2 text-sm font-bold border border-red-100 text-red-600 rounded-xl hover:bg-red-50 transition-all active:scale-95">
              <LogOut size={16} /> Logout
            </button>
          </>
        ) : (
          <>
            <Link href="/login" className="px-5 py-2 text-sm font-bold border border-gray-200 rounded-xl hover:bg-gray-50 transition-all">Login</Link>
            <Link href="/register" className="px-5 py-2 text-sm font-bold bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all shadow-sm">Get Started</Link>
          </>
        )}
      </div>
    </header>
  );
}
