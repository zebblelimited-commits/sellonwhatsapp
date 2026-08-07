"use client";

import { useEffect, useRef, useState } from "react";
import { collection, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { MessageCircle, Send, Loader2, User } from "lucide-react";
import { db } from "@/lib/firebase";
import { supportChatRequest } from "@/components/chat/chatApi";

type Conversation = {
  id: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  contactPhone?: string;
  lastMessage?: string;
  lastMessageAt?: unknown;
  unreadCount?: number;
};
type Message = { id: string; content?: string; senderRole?: string; timestamp?: unknown };
type SellerOption = { id: string; name: string; email: string };

const time = (value: unknown) => {
  if (!value) return "";
  const date = typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function" ? value.toDate() : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
};

export default function BuyerSupportChat({ buyerId }: { buyerId: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sellerOptions, setSellerOptions] = useState<SellerOption[]>([]);
  const [sellerId, setSellerId] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!buyerId) return;
    void getDocs(query(collection(db, "orders"), where("buyerId", "==", buyerId), limit(100))).then((snapshot) => {
      const options = new Map<string, SellerOption>();
      snapshot.docs.forEach((item) => {
        const data = item.data();
        const id = String(data.vendorId || data.storeId || "");
        if (id) options.set(id, { id, name: String(data.storeName || data.vendorName || id), email: String(data.vendorEmail || "") });
      });
      setSellerOptions(Array.from(options.values()));
    }).catch((loadError) => console.error("Buyer seller list failed:", loadError));
  }, [buyerId]);

  useEffect(() => {
    if (!buyerId) return;
    return onSnapshot(query(collection(db, "support_chats"), where("buyerId", "==", buyerId), orderBy("lastMessageAt", "desc")), (snapshot) => {
      setConversations(snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          ...data,
          userName: data.userName || data.storeName || data.username || data.name || data.userEmail || data.contactPhone || "Seller",
          userEmail: data.userEmail || data.email || "",
          userPhone: data.userPhone || data.contactPhone || data.whatsappNumber || data.phone || "",
          unreadCount: data.unreadBy?.buyer ?? 0,
        } as Conversation;
      }));
    }, (listenerError) => setError(listenerError.message || "Support conversations could not be loaded."));
  }, [buyerId]);

  useEffect(() => {
    if (!selected?.id) {
      return;
    }
    return onSnapshot(query(collection(db, "support_chats", selected.id, "messages"), orderBy("timestamp", "asc")), (snapshot) => {
      setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Message)));
      if ((selected.unreadCount || 0) > 0) supportChatRequest(`/api/chats/${encodeURIComponent(selected.id)}/read`).catch((readError) => console.error("Failed to mark buyer chat read:", readError));
    }, (listenerError) => setError(listenerError.message || "Support messages could not be loaded."));
  }, [selected]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const startConversation = async () => {
    if (!sellerId.trim()) return;
    setStarting(true);
    setError("");
    try {
      const result = await supportChatRequest<{ chat: Conversation }>("/api/chats", { participantId: sellerId.trim(), participantRole: "vendor" });
      setSelected(result.chat);
      setSellerId("");
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start the seller chat");
    } finally {
      setStarting(false);
    }
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !message.trim()) return;
    setSending(true);
    setError("");
    try {
      await supportChatRequest(`/api/chats/${encodeURIComponent(selected.id)}/messages`, { content: message.trim() });
      setMessage("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Message could not be sent");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[520px] overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
      <div className={`${selected ? "hidden md:flex" : "flex"} w-full flex-col border-r border-gray-100 md:w-80`}>
        <div className="border-b border-gray-100 p-5">
          <h2 className="font-black">Support chat</h2>
          <p className="mt-1 text-xs text-gray-400">Message sellers and Zebble support</p>
          <div className="mt-4 rounded-2xl bg-gray-50 p-3">
            <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-gray-400">Start a seller chat</p>
            <input list="buyer-sellers" value={sellerId} onChange={(event) => setSellerId(event.target.value)} placeholder="Seller/store ID" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-green-600" />
            <datalist id="buyer-sellers">{sellerOptions.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}</datalist>
            <button onClick={() => void startConversation()} disabled={starting || !sellerId.trim()} className="mt-2 w-full rounded-xl bg-green-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{starting ? "Opening…" : "Start chat"}</button>
            <p className="mt-2 text-[10px] text-gray-400">Sellers from your orders are suggested as you type.</p>
          </div>
        </div>
        {error && <p className="border-b border-red-100 bg-red-50 p-3 text-[10px] font-medium text-red-700">{error}</p>}
        <div className="flex-1 overflow-y-auto">
          {conversations.map((conversation) => <button key={conversation.id} onClick={() => setSelected(conversation)} className={`w-full border-b border-gray-50 p-4 text-left hover:bg-gray-50 ${selected?.id === conversation.id ? "border-l-4 border-l-green-600 bg-green-50" : ""}`}><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100"><User size={17} className="text-gray-400" /></div><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="truncate text-sm font-bold">{conversation.userName}</p>{Boolean(conversation.unreadCount) && <span className="rounded-full bg-red-500 px-1.5 text-[9px] font-bold text-white">{conversation.unreadCount}</span>}</div><p className="truncate text-[10px] text-gray-500">{conversation.userPhone ? `WhatsApp: ${conversation.userPhone}` : conversation.userEmail || "Contact not provided"}</p><p className="truncate text-[10px] text-gray-400">{conversation.lastMessage || "No messages yet"}</p></div></div></button>)}
          {conversations.length === 0 && <p className="p-8 text-center text-sm text-gray-400">No support conversations yet.</p>}
        </div>
      </div>
      <div className={`${selected ? "flex" : "hidden md:flex"} flex-1 flex-col`}>
        {selected ? <><div className="flex items-center gap-3 border-b border-gray-100 p-4"><button onClick={() => setSelected(null)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-50 md:hidden">←</button><div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100"><User size={17} className="text-gray-400" /></div><div><p className="text-sm font-bold">{selected.userName}</p><p className="text-[10px] text-gray-500">{selected.userPhone ? `WhatsApp: ${selected.userPhone}` : selected.userEmail || "Contact not provided"}</p>{selected.userPhone && selected.userEmail && <p className="text-[10px] text-gray-400">{selected.userEmail}</p>}</div></div><div className="flex-1 space-y-3 overflow-y-auto bg-gray-50/60 p-5">{messages.map((item) => <div key={item.id} className={`flex ${item.senderRole === "buyer" ? "justify-end" : "justify-start"}`}><div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${item.senderRole === "buyer" ? "bg-green-600 text-white" : "border border-gray-100 bg-white text-gray-700"}`}><p className="whitespace-pre-wrap">{item.content}</p><p className="mt-1 text-right text-[9px] opacity-60">{time(item.timestamp)}</p></div></div>)}<div ref={endRef} /></div><form onSubmit={send} className="flex gap-2 border-t border-gray-100 p-3"><input value={message} onChange={(event) => setMessage(event.target.value)} disabled={sending} placeholder="Type a message…" className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-green-600" /><button disabled={sending || !message.trim()} className="rounded-xl bg-green-600 px-4 text-white disabled:opacity-50">{sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}</button></form></> : <div className="flex flex-1 flex-col items-center justify-center text-gray-400"><MessageCircle size={42} className="mb-3 opacity-30" /><p className="text-sm font-bold">Select a support conversation</p></div>}
      </div>
    </div>
  );
}
