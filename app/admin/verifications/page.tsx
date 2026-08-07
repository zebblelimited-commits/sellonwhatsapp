// app/admin/verifications/page.tsx
"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { 
  collection, query, where, orderBy, onSnapshot, 
  updateDoc, doc, getDoc, addDoc, serverTimestamp 
} from "firebase/firestore";
import { 
  ShieldCheck, X, Eye, Loader2, FileText, Phone, 
  Building2, MapPin, CreditCard, IdCard, Mail, User,
  Bug, RefreshCw, Database
} from "lucide-react";
import { ExternalLink } from "lucide-react";
import { adminMutation } from "@/components/admin/adminApi";

export default function AdminVerificationsTab() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [storeData, setStoreData] = useState<any>(null);
  
  // ✅ Debug state
  const [debugInfo, setDebugInfo] = useState<{
    queryPath: string;
    filters: string[];
    error?: string;
    count: number;
  } | null>(null);

  useEffect(() => {
    console.log("🔍 Verification Tab: Starting data load...");
    
    // ✅ Debug: Log the exact query being run
    const collectionPath = "store_verifications";
    const q = query(
      collection(db, collectionPath),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );
    
    setDebugInfo({
      queryPath: collectionPath,
      filters: ['status == "pending"', 'orderBy("createdAt", "desc")'],
      count: 0
    });
    
    const unsub = onSnapshot(q, 
      (snap) => {
        console.log("✅ Firestore snapshot received:", {
          size: snap.size,
          docs: snap.docs.map(d => ({ id: d.id, status: d.data().status }))
        });
        
        setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setDebugInfo(prev => prev ? { ...prev, count: snap.size } : null);
        setLoading(false);
      },
      (error) => {
        console.error("❌ Firestore query error:", error);
        setDebugInfo(prev => prev ? { 
          ...prev, 
          error: error.code === "permission-denied" 
            ? "🔐 Permission denied: Check Firestore rules" 
            : error.message 
        } : null);
        setLoading(false);
      }
    );
    
    return () => {
      console.log("🧹 Cleanup: Unsubscribing from snapshot");
      unsub();
    };
  }, []);

  // ✅ Load store data when modal opens for context
  useEffect(() => {
    const loadStoreData = async () => {
      if (selectedRequest?.storeId) {
        try {
          console.log("🔍 Loading store data for:", selectedRequest.storeId);
          const storeSnap = await getDoc(doc(db, "stores", selectedRequest.storeId));
          if (storeSnap.exists()) {
            console.log("✅ Store data loaded:", storeSnap.data());
            setStoreData(storeSnap.data());
          } else {
            console.warn("⚠️ Store document not found:", selectedRequest.storeId);
          }
        } catch (e) {
          console.error("❌ Failed to load store data:", e);
        }
      }
    };
    loadStoreData();
  }, [selectedRequest]);

  // ✅ Test: Create a sample verification request for debugging
  const createTestVerification = async () => {
    if (!confirm("Create a TEST verification request? This will appear in your pending list.")) return;
    
    try {
      console.log("🧪 Creating test verification request...");
      
      const testRequest = {
        storeId: "test_store_" + Date.now(),
        storeName: "Test Store " + Math.random().toString(36).slice(2, 6),
        ownerName: "Test Owner",
        ownerEmail: "test@example.com",
        cacNumber: "RC" + Math.floor(Math.random() * 900000 + 100000),
        whatsappNumber: "+234 800 000 0000",
        businessAddress: "123 Test Street, Lagos",
        bankDetails: {
          bankName: "Test Bank",
          accountNumber: "0000000000",
          accountName: "Test Account"
        },
        idDetails: {
          type: "nin",
          document: {
            url: "https://example.com/test-id.pdf",
            uploadedAt: serverTimestamp()
          }
        },
        cacDocument: {
          url: "https://example.com/test-cac.pdf",
          uploadedAt: serverTimestamp()
        },
        documents: [
          { type: "cac_certificate", url: "https://example.com/test-cac.pdf", uploadedAt: serverTimestamp() },
          { type: "government_id", url: "https://example.com/test-id.pdf", uploadedAt: serverTimestamp() }
        ],
        status: "pending",
        submittedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, "store_verifications"), testRequest);
      console.log("✅ Test verification created:", docRef.id);
      
      alert("✅ Test verification request created! It should appear in the list below.");
      
    } catch (error) {
      console.error("❌ Failed to create test verification:", error);
      alert("❌ Failed to create test verification. Check console for details.");
    }
  };

  const handleDecision = async (requestId: string, storeId: string, approved: boolean, notes: string) => {
    try {
      console.log("🔄 Processing decision:", { requestId, storeId, approved, notes });
      
      // Update verification request
      await updateDoc(doc(db, "store_verifications", requestId), {
        status: approved ? "approved" : "rejected",
        reviewNotes: notes,
        reviewedAt: new Date(),
        updatedAt: new Date()
      });

      // ✅ If approved, update store with BUSINESS verification
      if (approved && storeId) {
        console.log("✅ Approving store verification:", storeId);
        await adminMutation(`/api/admin/stores/${storeId}`, { action: "verify", reason: notes });
      }

      setSelectedRequest(null);
      setStoreData(null);
      console.log("✅ Decision processed successfully");
      
    } catch (error) {
      console.error("❌ Verification update failed:", error);
      alert("Failed to process decision. Check console for details.");
    }
  };

  // ✅ Format date helper
  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A";
    const date = timestamp.toDate?.() || new Date(timestamp);
    return date.toLocaleDateString('en-NG', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // ✅ Format ID type for display
  const formatIdType = (type: string) => {
    const types: Record<string, string> = {
      nin: "National Identity Number (NIN)",
      voters: "Voter's Card",
      passport: "International Passport",
      drivers: "Driver's License"
    };
    return types[type] || type;
  };

  if (loading) return (
    <div className="p-10 text-center">
      <Loader2 className="animate-spin mx-auto text-green-600" size={32} />
      <p className="text-sm text-gray-500 mt-4">Loading verification requests...</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* ✅ Debug Panel - Only show in development */}
      {process.env.NODE_ENV === "development" && debugInfo && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-[10px]">
          <div className="flex items-center gap-2 mb-2 text-amber-800 font-bold">
            <Bug size={12} /> Debug Info (Development Only)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-amber-900">
            <div><strong>Collection:</strong> {debugInfo.queryPath}</div>
            <div><strong>Filters:</strong> {debugInfo.filters.join(", ")}</div>
            <div><strong>Results:</strong> {debugInfo.count} pending requests</div>
            {debugInfo.error && (
              <div className="sm:col-span-3 text-red-600 font-bold">⚠️ {debugInfo.error}</div>
            )}
          </div>
          <button 
            onClick={createTestVerification}
            className="mt-3 px-3 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-lg text-[9px] font-bold flex items-center gap-1"
          >
            <Database size={10} /> Create Test Verification
          </button>
        </div>
      )}

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Business Verification Requests</h2>
        <p className="text-sm text-gray-500">Review and approve store verification applications for Verified Business badge</p>
      </div>

      {/* Empty State */}
      {requests.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-[32px] border border-gray-100">
          <ShieldCheck size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            {debugInfo?.count === 0 ? "No Pending Requests" : "Loading..."}
          </h3>
          <p className="text-gray-500 text-sm mb-4">
            {debugInfo?.count === 0 
              ? "All verification requests have been processed. New submissions will appear here." 
              : "Fetching verification requests from Firestore..."}
          </p>
          
          {/* ✅ Quick Actions */}
          <div className="flex flex-wrap justify-center gap-3">
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold flex items-center gap-1.5"
            >
              <RefreshCw size={12} /> Refresh Page
            </button>
            {process.env.NODE_ENV === "development" && (
              <button 
                onClick={createTestVerification}
                className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Database size={12} /> Create Test Request
              </button>
            )}
            <a 
              href="https://console.firebase.google.com/project/sellonwhatsapp-c3e0c/firestore/data/~2Fstore_verifications" 
              target="_blank" 
              rel="noopener noreferrer"
              className="px-4 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-xl text-xs font-bold flex items-center gap-1.5"
            >
              <Database size={12} /> View in Firestore Console
            </a>
          </div>
          
          {/* ✅ Firestore Rules Reminder */}
          <div className="mt-6 p-4 bg-gray-50 rounded-xl text-left">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Firestore Rules Check</p>
            <p className="text-xs text-gray-600 mb-2">Ensure your <code className="bg-gray-200 px-1 rounded">firestore.rules</code> allows admin reads:</p>
            <pre className="text-[9px] bg-gray-100 p-2 rounded overflow-x-auto">
{`match /store_verifications/{docId} {
  allow read: if request.auth != null && 
    get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role in ["admin", "super_admin"];
  // ... other rules
}`}
            </pre>
          </div>
        </div>
      ) : (
        /* Requests List */
        <div className="space-y-3">
          {requests.map((req) => (
            <div 
              key={req.id} 
              className="bg-white rounded-[32px] border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all cursor-pointer"
              onClick={() => setSelectedRequest(req)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h4 className="font-bold text-sm text-gray-900">{req.storeName || "Unnamed Store"}</h4>
                    <span className="text-[9px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">
                      Pending Review
                    </span>
                    {req.submittedAt && (
                      <span className="text-[9px] text-gray-400">
                        Submitted {formatDate(req.submittedAt).split(',')[0]}
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-gray-500 mb-3">
                    <div><span className="font-bold text-gray-700">Owner:</span> {req.ownerName}</div>
                    <div><span className="font-bold text-gray-700">CAC:</span> {req.cacNumber}</div>
                    <div><span className="font-bold text-gray-700">WhatsApp:</span> {req.whatsappNumber}</div>
                    <div><span className="font-bold text-gray-700">ID:</span> {formatIdType(req.idDetails?.type)}</div>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-wrap">
                    {req.documents?.map((docItem: any, i: number) => (
                      <a 
                        key={i} 
                        href={docItem.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-lg text-[9px] text-[#00a63e] hover:bg-gray-100 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <FileText size={10} /> {docItem.type?.replace("_", " ")}
                      </a>
                    ))}
                  </div>
                </div>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); setSelectedRequest(req); }}
                  className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-bold hover:bg-blue-100 flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  <Eye size={12} /> Review Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ✅ Review Modal - Displays ALL submitted data */}
      {selectedRequest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-4xl rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Review Verification: {selectedRequest.storeName}</h3>
                <p className="text-sm text-gray-500">Submitted {formatDate(selectedRequest.submittedAt)}</p>
              </div>
              <button 
                onClick={() => { setSelectedRequest(null); setStoreData(null); }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-8">
              
              {/* Store Context (if available) */}
              {storeData && (
                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                  <p className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mb-2">Store Context</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div><span className="font-bold text-gray-700">Current Name:</span> {storeData.storeName}</div>
                    <div><span className="font-bold text-gray-700">Category:</span> {storeData.category}</div>
                    <div><span className="font-bold text-gray-700">Location:</span> {storeData.state}, {storeData.lga}</div>
                    <div><span className="font-bold text-gray-700">Status:</span> {storeData.isVerified ? "✅ Verified" : "⏳ Not Verified"}</div>
                  </div>
                </div>
              )}

              {/* Business & Owner Details */}
              <section>
                <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <User size={16} className="text-gray-400" /> Business & Owner Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <DetailItem icon={<User size={14} />} label="Owner Name" value={selectedRequest.ownerName} />
                  <DetailItem icon={<Mail size={14} />} label="Owner Email" value={selectedRequest.ownerEmail || "Not provided"} />
                  <DetailItem icon={<Building2 size={14} />} label="Store Name" value={selectedRequest.storeName} />
                  <DetailItem icon={<IdCard size={14} />} label="CAC Registration" value={selectedRequest.cacNumber} />
                </div>
              </section>

              {/* Contact & Location */}
              <section>
                <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Phone size={16} className="text-gray-400" /> Contact & Location
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <DetailItem icon={<Phone size={14} />} label="WhatsApp Number" value={selectedRequest.whatsappNumber} />
                  <DetailItem icon={<MapPin size={14} />} label="Business Address" value={selectedRequest.businessAddress || "Not provided"} />
                </div>
              </section>

              {/* Bank Details */}
              <section>
                <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <CreditCard size={16} className="text-gray-400" /> Bank Account Details
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <DetailItem icon={<Building2 size={14} />} label="Bank Name" value={selectedRequest.bankDetails?.bankName} />
                  <DetailItem icon={<CreditCard size={14} />} label="Account Number" value={selectedRequest.bankDetails?.accountNumber} />
                  <DetailItem icon={<User size={14} />} label="Account Name" value={selectedRequest.bankDetails?.accountName} />
                </div>
                <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                  <ShieldCheck size={10} className="text-green-600" />
                  Used for payout verification only • Never shared publicly
                </p>
              </section>

              {/* Identity Documents */}
              <section>
                <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <IdCard size={16} className="text-gray-400" /> Identity Verification
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <DetailItem 
                    icon={<IdCard size={14} />} 
                    label="ID Type" 
                    value={formatIdType(selectedRequest.idDetails?.type)} 
                  />
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">ID Document</p>
                    {selectedRequest.idDetails?.document?.url ? (
                      <a 
                        href={selectedRequest.idDetails.document.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors group"
                      >
                        <FileText size={16} className="text-gray-400 group-hover:text-[#00a63e]" />
                        <div>
                          <p className="text-sm font-bold text-gray-900">View ID Document</p>
                          <p className="text-[10px] text-gray-400">
                            Uploaded: {formatDate(selectedRequest.idDetails.document.uploadedAt)}
                          </p>
                        </div>
                        <ExternalLink size={12} className="text-gray-400 ml-auto" />
                      </a>
                    ) : (
                      <p className="text-sm text-gray-400">No ID document uploaded</p>
                    )}
                  </div>
                </div>
              </section>

              {/* CAC Certificate */}
              <section>
                <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText size={16} className="text-gray-400" /> CAC Certificate
                </h4>
                <div>
                  {selectedRequest.cacDocument?.url ? (
                    <a 
                      href={selectedRequest.cacDocument.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors group"
                    >
                      <FileText size={16} className="text-gray-400 group-hover:text-[#00a63e]" />
                      <div>
                        <p className="text-sm font-bold text-gray-900">View CAC Certificate</p>
                        <p className="text-[10px] text-gray-400">
                          Uploaded: {formatDate(selectedRequest.cacDocument.uploadedAt)}
                        </p>
                      </div>
                      <ExternalLink size={12} className="text-gray-400 ml-auto" />
                    </a>
                  ) : (
                    <p className="text-sm text-gray-400">No CAC document uploaded</p>
                  )}
                </div>
              </section>

              {/* Review Notes */}
              <section>
                <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <ShieldCheck size={16} className="text-gray-400" /> Admin Review Notes
                </h4>
                <textarea 
                  id="reviewNotes"
                  className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-green-500 outline-none min-h-[100px]"
                  placeholder="Add notes for the store owner (e.g., 'CAC verified with CAC portal', 'ID matches owner name')..."
                  defaultValue={selectedRequest.reviewNotes}
                />
                <p className="text-[10px] text-gray-400 mt-2">
                  Notes will be saved with the verification decision and visible to the store owner if rejected.
                </p>
              </section>
            </div>

            {/* Modal Footer - Action Buttons */}
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row gap-3 sticky bottom-0">
              <button 
                onClick={() => {
                  const notes = (document.getElementById("reviewNotes") as HTMLTextAreaElement)?.value || "Rejected - see notes";
                  handleDecision(selectedRequest.id, selectedRequest.storeId, false, notes);
                }}
                className="flex-1 py-4 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                <X size={16} /> Reject Application
              </button>
              <button 
                onClick={() => {
                  const notes = (document.getElementById("reviewNotes") as HTMLTextAreaElement)?.value || "Verified successfully";
                  handleDecision(selectedRequest.id, selectedRequest.storeId, true, notes);
                }}
                className="flex-1 py-4 bg-[#00a63e] hover:bg-[#008c34] text-white rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                <ShieldCheck size={16} /> Approve & Verify Business
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ✅ Reusable Detail Item Component
function DetailItem({ icon, label, value }: { 
  icon: React.ReactNode; 
  label: string; 
  value?: string | null 
}) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
        {icon} {label}
      </p>
      <p className="text-sm font-bold text-gray-900">{value || "Not provided"}</p>
    </div>
  );
}
