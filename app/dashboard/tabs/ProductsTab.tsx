"use client";
import React, { useState, useEffect, useRef } from "react";
import { 
  Package, Search, Plus, Loader2, Calendar, ShoppingBag, 
  MoreVertical, Trash2, Edit3, Share2, ExternalLink,
  CheckCircle2, XCircle, AlertTriangle, X
} from "lucide-react";
import { db, auth } from "@/lib/firebase";
import { 
  collection, query, where, onSnapshot, orderBy, 
  doc, deleteDoc, updateDoc, increment, serverTimestamp
} from "firebase/firestore";

type Product = {
  id: string;
  name?: string;
  images?: string[];
  productType?: string;
  stockCount?: number;
  stock?: number;
  availability?: string;
  [key: string]: any;
};
type ProductsTabProps = {
  onOpenModal: () => void;
  storeSlug: string;
  onEditProduct: (product: Product) => void;
  onShareProduct: (product: Product) => void;
};

export default function ProductsTab({ onOpenModal, storeSlug, onEditProduct, onShareProduct }: ProductsTabProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, "products"),
      where("storeId", "==", auth.currentUser.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: Product[] = snapshot.docs.map(productDoc => ({ id: productDoc.id, ...productDoc.data() }));
      setProducts(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleDeleteConfirm = async () => {
  if (!deleteTarget) return;
  try {
    // 1. Delete the product
    await deleteDoc(doc(db, "products", deleteTarget.id));

    // 2. Decrement the count in the Store document
    // We use the currentUser.uid because that is your storeId
    const user = auth.currentUser;
    if (!user) return;
    const storeRef = doc(db, "stores", user.uid);
    await updateDoc(storeRef, {
      productCount: increment(-1) // You'll need to import { increment } from "firebase/firestore"
    });

    setDeleteTarget(null);
  } catch (err) {
    console.error("Delete error:", err);
  }
};

  const filteredProducts = products.filter(p => 
    String(p.name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="animate-in fade-in duration-500 space-y-6 font-jakarta">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input 
            type="text" 
            placeholder="Search your inventory..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-100 rounded-lg text-xs outline-none focus:border-green-500 transition-all shadow-sm text-gray-900"
          />
        </div>
        <button 
          onClick={onOpenModal}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-2xl text-xs font-bold hover:bg-green-700 shadow-lg shadow-green-100 transition-all"
        >
          <Plus size={14} /> NEW LISTING
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center gap-2">
          <Loader2 className="animate-spin text-green-600" size={24} />
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Syncing Inventory...</p>
        </div>
      ) : filteredProducts.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredProducts.map((product) => (
            <ProductItem 
              key={product.id} 
              item={product} 
              storeSlug={storeSlug}
              onEdit={() => onEditProduct(product)}
              onDeleteClick={() => setDeleteTarget(product)}
              onShare={() => onShareProduct(product)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-100 p-16 text-center shadow-sm">
          <div className="w-12 h-12 bg-gray-50 rounded-lg flex items-center justify-center mx-auto mb-4">
            <Package className="text-gray-200" size={24} />
          </div>
          <h3 className="text-sm font-bold text-gray-900">{searchQuery ? "No matches found" : "No products yet"}</h3>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 scale-in-center">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="text-red-600" size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete listing?</h3>
            <p className="text-xs text-gray-500 mb-6 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-gray-900 italic">"{deleteTarget.name}"</span>? 
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 border border-gray-100 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-50 transition-all uppercase">Cancel</button>
              <button onClick={handleDeleteConfirm} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 shadow-lg shadow-red-100 transition-all uppercase">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductItem({ item, storeSlug, onEdit, onDeleteClick, onShare }: { item: Product; storeSlug: string; onEdit: () => void; onDeleteClick: () => void; onShare: () => void }) {
  const [showMenu, setShowMenu] = useState(false);
  const [updatingStock, setUpdatingStock] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Logic Variables
  const isBooking = item.productType === "booking";
  const isServiceOrUtility = item.productType === "service" || item.productType === "utility";
  const stockCount = Number(item.stockCount ?? item.stock ?? 0);
  const isOutOfStock = isServiceOrUtility
    ? item.availability === "out_of_stock"
    : !Number.isFinite(stockCount) || stockCount <= 0 || item.availability === "out_of_stock";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleStock = async () => {
    setUpdatingStock(true);
    try {
      const newStatus = isOutOfStock ? "in_stock" : "out_of_stock";
      const newCount = isOutOfStock ? 10 : 0; 
      
      await updateDoc(doc(db, "products", item.id), {
        availability: newStatus,
        stockCount: newCount,
        stock: newCount,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Stock update error:", err);
    }
    setUpdatingStock(false);
  };

  // Helper to render hybrid stock label
  const getStockDisplay = () => {
    if (isOutOfStock) {
      if (isBooking) return "Fully Booked";
      if (item.productType === "service") return "Fully Committed";
      return "Unavailable";
    }
    
    if (isServiceOrUtility) return "Available";
    return `${stockCount || 0} ${isBooking ? 'Slots' : 'Left'}`;
  };

  return (
    <div className="bg-white border border-gray-100 rounded-lg group hover:shadow-md transition-all duration-300 relative z-10">
      <div className="aspect-square bg-gray-50 relative overflow-hidden rounded-t-lg">
        {item.images?.[0] ? (
          <img 
            src={item.images[0]} 
            alt={item.name} 
            className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${isOutOfStock ? 'grayscale opacity-70' : ''}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-200"><Package size={24}/></div>
        )}
        
        <div className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest text-white shadow-sm ${isBooking ? 'bg-blue-500' : isServiceOrUtility ? 'bg-emerald-600' : 'bg-gray-900/80'}`}>
          {item.productType}
        </div>

        {isOutOfStock && (
          <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] flex items-center justify-center p-2">
            <span className="bg-red-600 text-white text-[8px] font-black px-2 py-1 rounded uppercase shadow-lg text-center">
                {isBooking ? "No Slots" : isServiceOrUtility ? "Fully Committed" : "Sold Out"}
            </span>
          </div>
        )}
      </div>

      <div className="p-3 space-y-1">
        <div className="flex justify-between items-start relative">
          <h4 className="text-[11px] font-bold text-gray-900 truncate flex-1 uppercase tracking-tighter">{item.name}</h4>
          <div className="relative" ref={menuRef}>
            <button onClick={() => setShowMenu(!showMenu)} className="text-gray-300 hover:text-gray-600 p-1">
              <MoreVertical size={14}/>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-gray-100 rounded-lg shadow-2xl z-[100] py-1 animate-in zoom-in-95 duration-100 origin-top-right text-gray-900">
                <button onClick={() => { onShare(); setShowMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-gray-600 hover:bg-gray-50">
                  <Share2 size={12}/> Share Listing
                </button>
                <button onClick={() => { onEdit(); setShowMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-gray-600 hover:bg-gray-50">
                  <Edit3 size={12}/> Edit Listing
                </button>
                <div className="border-t border-gray-50 my-1"></div>
                <button onClick={() => { onDeleteClick(); setShowMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-red-500 hover:bg-red-50">
                  <Trash2 size={12}/> Delete Listing
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-gray-900">₦{Number(item.price).toLocaleString()}</span>
          <span className={`text-[8px] font-bold uppercase ${isOutOfStock ? 'text-red-500' : 'text-green-600'}`}>
            {getStockDisplay()}
          </span>
        </div>

        <button 
          onClick={toggleStock}
          disabled={updatingStock}
          className={`w-full mt-2 py-2 rounded text-[8px] font-black uppercase tracking-[0.1em] flex items-center justify-center gap-2 transition-all border ${
            isOutOfStock 
            ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-600 hover:text-white' 
            : 'bg-green-50 text-green-600 border-green-100 hover:bg-green-600 hover:text-white'
          }`}
        >
          {updatingStock ? <Loader2 size={10} className="animate-spin" /> : (isOutOfStock ? <CheckCircle2 size={10} /> : <XCircle size={10} />)}
          {isOutOfStock 
            ? (isServiceOrUtility ? "Open for Orders" : `Mark In ${isBooking ? 'Slots' : 'Stock'}`) 
            : (isServiceOrUtility ? "Stop Taking Orders" : `Mark Out of ${isBooking ? 'Slots' : 'Stock'}`)
          }
        </button>
      </div>
    </div>
  );
}
