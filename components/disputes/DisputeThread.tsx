"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Loader2, MessageSquare, Send, ShieldCheck } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { collection, onSnapshot, query } from "firebase/firestore";
import DisputeResponseModal from "@/components/disputes/DisputeResponseModal";

type DisputeRole = "buyer" | "vendor" | "admin";
type DateValue = Date | string | number | { toDate: () => Date } | null | undefined;

interface DisputeThreadProps {
  disputeId: string;
  currentRole: DisputeRole;
  currentStatus?: string;
  currentResolution?: string;
  onStatusChanged?: () => void;
}

interface DisputeMessage {
  id: string;
  senderId?: string;
  senderName?: string;
  senderEmail?: string;
  role?: DisputeRole;
  content?: string;
  createdAt?: DateValue;
}

const closedStatuses = ["resolved_refund", "resolved_vendor", "closed"];
const statusOptions = [
  { value: "open", label: "Open" },
  { value: "under_review", label: "Under review" },
  { value: "resolved_refund", label: "Resolved — refund buyer" },
  { value: "resolved_vendor", label: "Resolved — release to seller" },
  { value: "closed", label: "Closed" },
];

const toDate = (value: DateValue) => {
  if (!value) return null;
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "object") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateTime = (value: DateValue) => {
  const date = toDate(value);
  return date
    ? date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })
    : "Sending…";
};

export default function DisputeThread({
  disputeId,
  currentRole,
  currentStatus = "open",
  currentResolution = "",
  onStatusChanged,
}: DisputeThreadProps) {
  const [messages, setMessages] = useState<DisputeMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [listenerError, setListenerError] = useState("");
  const [responseModalOpen, setResponseModalOpen] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [responseLoading, setResponseLoading] = useState(false);
  const [responseError, setResponseError] = useState("");
  const [statusDraft, setStatusDraft] = useState(currentStatus);
  const [resolutionDraft, setResolutionDraft] = useState(currentResolution);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState("");

  useEffect(() => {
    if (!disputeId) return;

    const messagesQuery = query(collection(db, "disputes", disputeId, "messages"));
    let fallbackTimer: ReturnType<typeof setInterval> | undefined;
    let disposed = false;
    const loadMessagesFromApi = async () => {
      if (!auth.currentUser) throw new Error("Authentication required");
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch(`/api/disputes/${encodeURIComponent(disputeId)}/actions`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to load messages");
      setMessages(result.messages || []);
      setLoading(false);
      setListenerError("");
    };
    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const nextMessages = snapshot.docs
          .map((message) => ({ id: message.id, ...message.data() } as DisputeMessage))
          .sort((left, right) => {
            const leftTime = toDate(left.createdAt)?.getTime() || 0;
            const rightTime = toDate(right.createdAt)?.getTime() || 0;
            return leftTime - rightTime;
          });
        setMessages(nextMessages);
        setLoading(false);
      },
      (error) => {
        console.error("Dispute messages listener error:", error);
        loadMessagesFromApi()
          .then(() => {
            if (disposed) return;
            fallbackTimer = setInterval(() => {
              loadMessagesFromApi().catch((fallbackError) => console.error("Dispute message polling error:", fallbackError));
            }, 5000);
          })
          .catch(() => {
            setListenerError("Messages could not be loaded. Please refresh and try again.");
            setLoading(false);
          });
      }
    );

    return () => {
      disposed = true;
      unsubscribe();
      if (fallbackTimer) clearInterval(fallbackTimer);
    };
  }, [disputeId]);

  const canRespond = !closedStatuses.includes(currentStatus);
  const roleLabel = currentRole === "admin" ? "Admin" : currentRole === "vendor" ? "Seller" : "Buyer";
  const statusLabel = useMemo(
    () => statusOptions.find((option) => option.value === currentStatus)?.label || currentStatus.replaceAll("_", " "),
    [currentStatus]
  );

  const openResponseModal = () => {
    setResponseText("");
    setResponseError("");
    setResponseModalOpen(true);
  };

  const closeResponseModal = () => {
    if (responseLoading) return;
    setResponseModalOpen(false);
    setResponseText("");
    setResponseError("");
  };

  const submitResponse = async () => {
    if (!auth.currentUser || !responseText.trim()) return;
    setResponseLoading(true);
    setResponseError("");

    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch(`/api/disputes/${encodeURIComponent(disputeId)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ action: "respond", content: responseText.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to send response");
      closeResponseModal();
    } catch (error: unknown) {
      console.error("Dispute response submission failure:", error);
      setResponseError(error instanceof Error ? error.message : "Failed to send response. Please try again.");
    } finally {
      setResponseLoading(false);
    }
  };

  const updateStatus = async () => {
    if (currentRole !== "admin" || !auth.currentUser) return;
    setStatusLoading(true);
    setStatusError("");

    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch(`/api/disputes/${encodeURIComponent(disputeId)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          action: "update_status",
          content: { status: statusDraft, resolution: resolutionDraft.trim() },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to update dispute status");
      onStatusChanged?.();
    } catch (error: unknown) {
      console.error("Dispute status update failure:", error);
      setStatusError(error instanceof Error ? error.message : "Failed to update dispute status. Please try again.");
    } finally {
      setStatusLoading(false);
    }
  };

  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare size={15} className="text-green-600" />
          <p className="text-xs font-black uppercase tracking-wider text-gray-500">Dispute conversation</p>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
            {messages.length} {messages.length === 1 ? "message" : "messages"}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-1 text-[10px] font-bold capitalize text-yellow-700">
          <Clock3 size={11} /> {statusLabel}
        </span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 rounded-2xl bg-gray-50 p-4 text-xs font-medium text-gray-500">
          <Loader2 size={14} className="animate-spin" /> Loading conversation…
        </div>
      )}
      {listenerError && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-4 text-xs font-medium text-red-700">
          <AlertCircle size={14} /> {listenerError}
        </div>
      )}
      {!loading && !listenerError && messages.length === 0 && (
        <p className="rounded-2xl bg-gray-50 p-4 text-xs text-gray-500">No replies yet. The dispute description is the opening statement.</p>
      )}

      {messages.length > 0 && (
        <div className="max-h-80 space-y-3 overflow-y-auto rounded-2xl bg-gray-50 p-3">
          {messages.map((message) => {
            const isOwnMessage = message.role === currentRole;
            const messageRole = message.role === "admin" ? "Admin" : message.role === "vendor" ? "Seller" : "Buyer";
            return (
              <div key={message.id} className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] rounded-2xl px-3 py-2.5 text-sm ${isOwnMessage ? "bg-green-600 text-white" : "bg-white text-gray-700 shadow-sm"}`}>
                  <div className={`mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide ${isOwnMessage ? "text-green-100" : "text-gray-400"}`}>
                    {message.role === "admin" && <ShieldCheck size={11} />}
                    <span>{isOwnMessage ? `You (${roleLabel})` : message.senderName || messageRole}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  <p className={`mt-1 text-[10px] ${isOwnMessage ? "text-green-100" : "text-gray-400"}`}>{formatDateTime(message.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {canRespond ? (
          <button onClick={openResponseModal} className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-green-700">
            <Send size={13} /> {currentRole === "admin" ? "Message parties" : "Reply"}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-400"><CheckCircle2 size={14} /> Conversation closed</span>
        )}

        {currentRole === "admin" && (
          <div className="w-full rounded-2xl border border-gray-200 bg-white p-3 sm:flex-1 sm:min-w-[340px]">
            <div className="flex flex-col gap-2 sm:flex-row">
              <select value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)} className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:border-green-600">
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button onClick={updateStatus} disabled={statusLoading || statusDraft === currentStatus && resolutionDraft.trim() === currentResolution.trim()} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2 text-xs font-bold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50">
                {statusLoading && <Loader2 size={13} className="animate-spin" />} Update status
              </button>
            </div>
            <textarea value={resolutionDraft} onChange={(event) => setResolutionDraft(event.target.value)} rows={2} placeholder="Optional resolution note visible to buyer and seller" className="mt-2 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-xs outline-none focus:border-green-600" />
            {statusError && <p className="mt-2 text-[11px] font-medium text-red-600">{statusError}</p>}
          </div>
        )}
      </div>

      <DisputeResponseModal
        open={responseModalOpen}
        title={currentRole === "admin" ? "Message dispute participants" : "Reply to dispute"}
        value={responseText}
        loading={responseLoading}
        error={responseError}
        onChange={setResponseText}
        onClose={closeResponseModal}
        onSubmit={submitResponse}
      />
    </div>
  );
}
