import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  X, Upload, Plus, Trash2, Package,
  Globe, Zap, Calendar, Truck, Box, Clock, CheckCircle, MapPin, Layers, Info, Loader2, ArrowUpRight
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, increment, query, where, getCountFromServer, getDoc } from 'firebase/firestore';
import AvailabilityManager from './AvailabilityManager';
import { showToast } from '@/lib/toast';

// ✅ 1. IMPORT THE COMPREHENSIVE CATEGORIES FROM YOUR DATA FILE
// ⚠️ Adjust the path '../nigeriaData' if your file is located elsewhere (e.g., '@/lib/nigeriaData')
import { STORE_CATEGORIES } from '../nigeriaData'; 

// ✅ 2. MAP TABS TO SPECIFIC CATEGORY GROUPS
// This ensures users only see relevant categories for the type of product they are adding
type ProductType = 'physical' | 'service' | 'booking' | 'utility';
type ProductImage = { file?: File; preview: string; isExisting: boolean };
type ProductVariant = { type: string; value: string };
type ProductRecord = {
  id?: string;
  productType?: ProductType;
  images?: string[];
  features?: string[];
  variants?: ProductVariant[];
  [key: string]: any;
};
type ProductFormData = {
  name: string;
  description: string;
  price: string;
  discountPrice: string;
  mainCategory: string;
  subCategory: string;
  stockCount: string;
  deliveryType: string;
  duration: string;
  metricType: string;
  unitLabel: string;
  locationType: string;
};
type AddProductModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialData?: ProductRecord | null;
};

const TAB_CATEGORY_MAP: Record<ProductType, string[]> = {
  physical: ['physical-products', 'vehicles', 'property'],
  service: ['freelance-services'],
  booking: ['bookable-services', 'events-tickets'],
  utility: ['digital-products']
};

const BRAND_GREEN = "#00A63E";
const CLOUDINARY_UPLOAD_PRESET = "sellonwhatsapp_preset";
const CLOUDINARY_CLOUD_NAME = "dmjzgqigl";

const AddProductModal = ({ isOpen, onClose, initialData = null }: AddProductModalProps) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [productType, setProductType] = useState<ProductType>('physical');
  const [images, setImages] = useState<ProductImage[]>([]);
  const [features, setFeatures] = useState([""]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [savedProductId, setSavedProductId] = useState<string | null>(null);

  // --- Subscription Limit States ---
  const [currentCount, setCurrentCount] = useState(0);
  const [productLimit, setProductLimit] = useState(20);
  const [loadingLimits, setLoadingLimits] = useState(true);

  // ✅ 3. UPDATED FORM STATE (Replaced 'category' with 'mainCategory' & 'subCategory')
  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    description: '',
    price: '',
    discountPrice: '',
    mainCategory: '', 
    subCategory: '',
    stockCount: '1',
    deliveryType: 'state',
    duration: '1 Hour',
    metricType: 'flat',
    unitLabel: 'Service',
    locationType: 'remote'
  });

  // ✅ 4. HELPER FUNCTIONS FOR CASCADING DROPDOWNS
  const getAvailableCategories = () => {
    const allowedIds = TAB_CATEGORY_MAP[productType] || [];
    return STORE_CATEGORIES.filter(cat => allowedIds.includes(cat.id));
  };

  const getSubcategories = () => {
    const mainCat = STORE_CATEGORIES.find(c => c.id === formData.mainCategory);
    return mainCat ? mainCat.subcategories : [];
  };

  useEffect(() => {
    if (initialData && isOpen) {
      setProductType(initialData.productType || 'physical');
      setImages(initialData.images?.map((url: string) => ({ preview: url, isExisting: true })) || []);
      setFeatures(initialData.features || [""]);
      setVariants(initialData.variants || []);
      setFormData({
        name: initialData.name || '',
        description: initialData.description || '',
        price: initialData.price || '',
        discountPrice: initialData.discountPrice || '',
        mainCategory: initialData.mainCategory || '', 
        subCategory: initialData.subCategory || '',
        stockCount: initialData.stockCount || '1',
        deliveryType: initialData.deliveryType || 'state',
        duration: initialData.duration || '1 Hour',
        metricType: initialData.metricType || 'flat',
        unitLabel: initialData.unitLabel || 'Service',
        locationType: initialData.locationType || 'remote'
      });
    } else if (isOpen) {
      setProductType('physical');
      setImages([]);
      setFeatures([""]);
      setVariants([]);
      setSavedProductId(null);
      setFormData({
        name: '', description: '', price: '', discountPrice: '',
        mainCategory: '', subCategory: '', stockCount: '1', deliveryType: 'state',
        duration: '1 Hour', metricType: 'flat', unitLabel: 'Service', locationType: 'remote'
      });
    }

    // --- Fetch Real-time Subscription Limits ---
    const fetchUsageAndLimits = async () => {
      if (!isOpen) return;
      const user = auth.currentUser;
      if (!user) return;

      try {
        setLoadingLimits(true);
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists() && userDocSnap.data().productLimit !== undefined) {
          setProductLimit(userDocSnap.data().productLimit);
        }

        const productsRef = collection(db, "products");
        const q = query(productsRef, where("storeId", "==", user.uid));
        const countSnapshot = await getCountFromServer(q);
        setCurrentCount(countSnapshot.data().count);
      } catch (error) {
        console.error("Error evaluating threshold restrictions:", error);
      } finally {
        setLoadingLimits(false);
      }
    };

    fetchUsageAndLimits();
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const uploadToCloudinary = async (file: File) => {
    if (!file) return null;
    const data = new FormData();
    data.append("file", file);
    data.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: "POST",
        body: data
      });
      const fileData = await res.json();
      if (!res.ok) throw new Error(fileData.error?.message || "Upload failed");
      return fileData.secure_url;
    } catch (error) {
      console.error("Cloudinary Error:", error);
      throw error;
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files || []);
    if (files.length === 0) return;

    const newImages = files.map(file => ({
      file,
      preview: URL.createObjectURL(file as Blob),
      isExisting: false
    }));
    setImages(prev => [...prev, ...newImages]);
  };

  const addVariant = () => {
    setVariants([...variants, { type: 'Size', value: '' }]);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>) => {
    if (e) e.preventDefault();

    if (currentCount >= productLimit && !initialData) {
      showToast("error", `You have reached your limit of ${productLimit} products. Please upgrade to add more.`);
      router.push('/pricing');
      return;
    }

    setLoading(true);

    const user = auth.currentUser;
    if (!user) {
      showToast("error", "You must be logged in to publish a product.");
      setLoading(false);
      return;
    }

    try {
      const imageUrls = await Promise.all(
        images.map(async (img) => {
          if (img.isExisting) return img.preview;
          if (!img.file) return null;
          return await uploadToCloudinary(img.file);
        })
      );

      // ✅ 5. UPDATED PAYLOAD TO INCLUDE MAIN & SUB CATEGORIES
      const payload = {
        name: formData.name,
        description: formData.description,
        price: parseFloat(formData.price),
        discountPrice: formData.discountPrice ? parseFloat(formData.discountPrice) : null,
        mainCategory: formData.mainCategory,
        subCategory: formData.subCategory,
        category: formData.subCategory, // Kept for backward compatibility with older queries
        productType,
        trackInventory: productType === 'physical',
        images: imageUrls.filter((url): url is string => url !== null),
        features: features.filter(f => f.trim() !== ""),
        variants: variants.filter(v => v.value.trim() !== ""),
        storeId: user.uid,
        updatedAt: serverTimestamp(),
        stockCount: parseInt(formData.stockCount) || 0,

        ...(productType === 'utility' && { metricType: formData.metricType, unitLabel: formData.unitLabel }),
        ...(productType === 'physical' && { deliveryType: formData.deliveryType, stockCount: parseInt(formData.stockCount) }),
        ...(productType === 'service' && { fulfillmentMethod: formData.deliveryType, turnaroundTime: formData.duration }),
        ...(productType === 'booking' && { duration: formData.duration, locationType: formData.locationType, maxDaily: parseInt(formData.stockCount) }),
      };

      let productId = initialData?.id;

      if (initialData?.id) {
        await updateDoc(doc(db, "products", initialData.id), payload);
      } else {
        const docRef = await addDoc(collection(db, "products"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        productId = docRef.id;

        const storeRef = doc(db, "stores", user.uid);
        await updateDoc(storeRef, {
          productCount: increment(1)
        });
      }

      if (productType === 'booking') {
        setSavedProductId(productId || null);
        setLoading(false);
      } else {
        onClose();
      }
    } catch (err) {
      console.error("Submit Error:", err);
      showToast("error", `Submission failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      setLoading(false);
    }
  };

  const isLimitReached = currentCount >= productLimit;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-slate-900">
      <div className="bg-white w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">

        {savedProductId ? (
          <AvailabilityManager
            productId={savedProductId}
            onSaveSuccess={onClose}
          />
        ) : (
          <>
            {/* Header */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/30">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{initialData ? 'Update Listing' : 'Create New Listing'}</h2>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mt-1">Storefront / {productType} Mode</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex bg-gray-100 p-1 mx-6 mt-4 rounded-xl">
              {(['physical', 'service', 'booking', 'utility'] as ProductType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  disabled={!!initialData}
                  onClick={() => {
                    setProductType(type);
                    // ✅ Reset categories when switching tabs so they don't mismatch
                    setFormData(prev => ({ ...prev, mainCategory: '', subCategory: '' }));
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-tight rounded-lg transition-all ${productType === type
                    ? 'bg-white shadow-sm'
                    : `text-gray-400 ${!initialData ? 'hover:text-gray-600' : 'opacity-50 cursor-not-allowed'}`
                    }`}
                  style={productType === type ? { color: BRAND_GREEN } : {}}
                >
                  {type === 'physical' && <Package size={14} />}
                  {type === 'service' && <Globe size={14} />}
                  {type === 'booking' && <Calendar size={14} />}
                  {type === 'utility' && <Zap size={14} />}
                  {type}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                {/* Column 1: Media & Price */}
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Visual Assets</label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="aspect-square border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-all group">
                        <Upload size={24} className="text-gray-300 group-hover:text-emerald-500 mb-2" />
                        <input type="file" multiple onChange={handleImageUpload} className="hidden" />
                      </label>
                      {images.map((img, i) => (
                        <div key={i} className="relative aspect-square rounded-2xl overflow-hidden group border border-gray-100 shadow-sm">
                          <img src={img.preview} className="w-full h-full object-cover" alt="" />
                          <button type="button" onClick={() => setImages(images.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 p-1 bg-white/90 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md">
                            <Trash2 size={12} className="text-red-500" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                      <label className="text-[9px] font-bold text-gray-400 uppercase block mb-1">Base Price (₦)</label>
                      <input required type="number" className="w-full bg-transparent font-bold text-lg outline-none" value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} />
                    </div>
                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                      <label className="text-[9px] font-bold text-gray-400 uppercase block mb-1">Discount Price</label>
                      <input type="number" className="w-full bg-transparent font-bold text-lg outline-none" style={{ color: BRAND_GREEN }} value={formData.discountPrice} onChange={e => setFormData({ ...formData, discountPrice: e.target.value })} />
                    </div>
                  </div>
                </div>

                {/* Column 2: Content & Variations */}
                <div className="space-y-6">
                  <input required placeholder="Product Title" className="text-xl font-bold w-full outline-none border-b border-gray-100 pb-2" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                  <textarea placeholder="Description..." className="w-full h-32 text-sm text-gray-600 outline-none bg-gray-50/50 p-3 rounded-xl border border-transparent focus:border-gray-100" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />

                  <div className="space-y-3">
                    <label className="text-[9px] font-bold text-gray-400 uppercase flex items-center gap-1"><Layers size={12} /> Variations (Attributes)</label>
                    {variants.map((v, i) => (
                      <div key={i} className="flex gap-2 animate-in slide-in-from-left-2">
                        <select
                          className="bg-gray-50 border border-gray-100 rounded-lg p-2 text-xs outline-none w-24"
                          value={v.type}
                          onChange={(e) => {
                            const n = [...variants]; n[i].type = e.target.value; setVariants(n);
                          }}
                        >
                          <option value="Size">Size</option>
                          <option value="Color">Color</option>
                          <option value="Weight">Weight</option>
                          <option value="Material">Material</option>
                        </select>
                        <input
                          className="flex-1 bg-gray-50 border border-gray-100 rounded-lg p-2 text-xs outline-none"
                          placeholder="e.g. XL, Red, 2kg"
                          value={v.value}
                          onChange={(e) => {
                            const n = [...variants]; n[i].value = e.target.value; setVariants(n);
                          }}
                        />
                        <button type="button" onClick={() => setVariants(variants.filter((_, idx) => idx !== i))}><Trash2 size={14} className="text-gray-300 hover:text-red-500" /></button>
                      </div>
                    ))}
                    <button type="button" onClick={addVariant} className="text-[10px] font-bold flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity" style={{ color: BRAND_GREEN }}><Plus size={12} /> Add Variation</button>
                  </div>
                </div>

                {/* Column 3: SETTINGS */}
                <div className="space-y-4">
                  {productType === 'physical' && (
                    <div className="animate-in slide-in-from-right-4 p-4 bg-emerald-50/30 rounded-2xl border border-emerald-100 space-y-3">
                      <label className="text-[9px] font-bold text-emerald-600 uppercase flex items-center gap-1"><Box size={12} /> Inventory & Shipping</label>
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-1">Available Stock Quantity</label>
                        <input type="number" className="w-full bg-white border border-emerald-100 rounded-lg p-2 text-xs outline-none" value={formData.stockCount} onChange={e => setFormData({ ...formData, stockCount: e.target.value })} />
                      </div>
                      <div className="pt-2">
                        <label className="text-[10px] text-gray-500 block mb-2">Fulfillment Region</label>
                        <div className="flex flex-col gap-2">
                          {['state', 'nationwide'].map(opt => (
                            <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer"><input type="radio" checked={formData.deliveryType === opt} onChange={() => setFormData({ ...formData, deliveryType: opt })} style={{ accentColor: BRAND_GREEN }} /> {opt} Delivery</label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {productType === 'booking' && (
                    <div className="animate-in slide-in-from-right-4 p-4 bg-purple-50/30 rounded-2xl border border-purple-100 space-y-3">
                      <label className="text-[9px] font-bold text-purple-600 uppercase flex items-center gap-1"><Calendar size={12} /> Session Capacity</label>
                      <input type="number" className="w-full bg-white border border-purple-100 rounded-lg p-2 text-xs" placeholder="Max daily bookings" value={formData.stockCount} onChange={e => setFormData({ ...formData, stockCount: e.target.value })} />

                      <label className="text-[9px] font-bold text-purple-600 uppercase flex items-center gap-1"><MapPin size={12} /> Location</label>
                      <select className="w-full bg-white border border-purple-100 rounded-lg p-2 text-xs outline-none" value={formData.locationType} onChange={e => setFormData({ ...formData, locationType: e.target.value })}>
                        <option value="remote">Remote / Digital</option><option value="physical">Physical Address</option>
                      </select>

                      <div className="mt-4 p-3 bg-white/60 border border-purple-200 rounded-xl flex gap-2 items-start shadow-sm">
                        <Info size={14} className="text-purple-600 mt-0.5 flex-shrink-0" />
                        <p className="text-[10px] text-purple-800 leading-tight">
                          <strong>Next Step:</strong> After publishing, you will be prompted to set your availability calendar to complete the booking setup.
                        </p>
                      </div>
                    </div>
                  )}

                  {productType === 'service' && (
                    <div className="animate-in slide-in-from-right-4 p-4 bg-blue-50/30 rounded-2xl border border-blue-100 space-y-3">
                      <label className="text-[9px] font-bold text-blue-600 uppercase flex items-center gap-1"><Globe size={12} /> Delivery Method</label>
                      <select className="w-full bg-white border border-blue-100 rounded-lg p-2 text-xs outline-none" value={formData.deliveryType} onChange={e => setFormData({ ...formData, deliveryType: e.target.value })}>
                        <option value="whatsapp">WhatsApp Document</option><option value="email">Email</option><option value="link">Direct Link</option>
                      </select>
                      <label className="text-[9px] font-bold text-blue-600 uppercase flex items-center gap-1"><Clock size={12} /> Turnaround Time</label>
                      <input className="w-full bg-white border border-blue-100 rounded-lg p-2 text-xs" placeholder="Ex: 24 Hours" value={formData.duration} onChange={e => setFormData({ ...formData, duration: e.target.value })} />
                    </div>
                  )}

                  {productType === 'utility' && (
                    <div className="animate-in slide-in-from-right-4 p-4 bg-orange-50/30 rounded-2xl border border-orange-100 space-y-3">
                      <label className="text-[9px] font-bold text-orange-600 uppercase flex items-center gap-1"><Zap size={12} /> Billing Type</label>
                      <select className="w-full bg-white border border-orange-100 rounded-lg p-2 text-xs outline-none" value={formData.metricType} onChange={e => setFormData({ ...formData, metricType: e.target.value })}>
                        <option value="flat">Flat Fee</option><option value="hourly">Hourly</option><option value="usage">Per Unit</option>
                      </select>
                      <input className="w-full bg-white border border-orange-100 rounded-lg p-2 text-xs" placeholder="Unit (e.g. KM, Hour)" value={formData.unitLabel} onChange={e => setFormData({ ...formData, unitLabel: e.target.value })} />
                    </div>
                  )}

                  {/* ✅ 6. NEW CASCADING CATEGORY DROPDOWNS */}
                  <div className="space-y-3 pt-2">
                    <label className="text-[9px] font-bold text-gray-400 uppercase block mb-1">Global Category</label>
                    
                    {/* Main Category Dropdown */}
                    <select 
                      required 
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs outline-none font-medium" 
                      value={formData.mainCategory} 
                      onChange={e => setFormData({ ...formData, mainCategory: e.target.value, subCategory: '' })}
                    >
                      <option value="">Select Main Category</option>
                      {getAvailableCategories().map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>

                    {/* Subcategory Dropdown (Animates in when Main is selected) */}
                    {formData.mainCategory && (
                      <select 
                        required 
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs outline-none font-medium animate-in fade-in slide-in-from-top-2 duration-200" 
                        value={formData.subCategory} 
                        onChange={e => setFormData({ ...formData, subCategory: e.target.value })}
                      >
                        <option value="">Select Subcategory</option>
                        {getSubcategories().map(sub => (
                          <option key={sub} value={sub}>{sub}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            </form>

            {/* Footer with Limit Tracking */}
            <div className="flex flex-col items-stretch gap-4 border-t border-gray-100 bg-gray-50/30 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-6">
              <div className="flex min-w-0 max-w-full flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                {loadingLimits ? (
                  <Loader2 size={16} className="animate-spin text-gray-400" />
                ) : (
                  <div className="flex min-w-0 max-w-full flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <span className={`max-w-full break-words text-center text-[10px] font-bold px-3 py-1.5 rounded-full ${isLimitReached ? 'bg-red-100 text-red-600' : 'bg-gray-200 text-gray-700'}`}>
                      {currentCount} of {productLimit} products used
                    </span>
                    <button
                      type="button"
                      onClick={() => { onClose(); router.push('/pricing'); }}
                      className="flex w-full items-center justify-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white shadow-sm transition-transform hover:from-amber-600 hover:scale-105 active:scale-95 sm:w-auto"
                    >
                      Upgrade <ArrowUpRight size={12} strokeWidth={3} />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:gap-3">
                <button onClick={onClose} type="button" className="flex-1 px-3 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-gray-900 transition-colors sm:flex-none sm:px-6">Discard</button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || (!initialData && isLimitReached) || loadingLimits}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white transition-all shadow-md active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-300 sm:flex-none sm:px-8"
                  style={{ backgroundColor: (!initialData && isLimitReached) ? '#9CA3AF' : BRAND_GREEN }}
                >
                  {loading ? 'Processing...' : <><CheckCircle size={14} /> {initialData ? 'Update Listing' : 'Publish Product'}</>}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AddProductModal;
