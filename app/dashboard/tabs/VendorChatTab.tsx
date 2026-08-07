// app/dashboard/tabs/VendorChatTab.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { 
  collection, query, where, orderBy, onSnapshot, 
  
} from "firebase/firestore";
import { Send, Loader2, User, Phone, MoreVertical, X } from "lucide-react";
import { supportChatRequest } from "@/components/chat/chatApi";

interface Message {
  id: string;
  senderId: string;
  senderRole: "vendor" | "buyer" | "admin";
  content: string;
  timestamp: any;
  read: boolean;
}

interface Conversation {
  id: string;
  buyerId: string;
  buyerName: string;
  buyerEmail: string;
  lastMessage: string;
  lastMessageAt: any;
  unreadCount: number;
}

export default function VendorChatTab({ vendorId, storeName }: { vendorId: string; storeName: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ✅ Load conversations (real-time)
  useEffect(() => {
    if (!vendorId) return;
    
    const q = query(
      collection(db, "support_chats"),
      where("vendorId", "==", vendorId),
      orderBy("lastMessageAt", "desc")
    );
    
    const unsub = onSnapshot(q, (snapshot) => {
      const convos = snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          buyerName: data.buyerName || data.userName || "Buyer",
          buyerEmail: data.buyerEmail || data.userEmail || "",
          unreadCount: data.unreadBy?.vendor ?? data.unreadCount ?? 0,
        } as Conversation;
      });
      setConversations(convos);
    });
    
    return () => unsub();
  }, [vendorId]);

  // ✅ Load messages for selected conversation
  useEffect(() => {
    if (!selectedConversation) return;
    
    const msgRef = collection(db, "support_chats", selectedConversation.id, "messages");
    const q = query(msgRef, orderBy("timestamp", "asc"));
    
    const unsub = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ 
        id: d.id, 
        ...d.data(),
        timestamp: d.data().timestamp?.toDate?.() || new Date()
      } as Message));
      setMessages(msgs);
      
      // Mark messages as read
      if (selectedConversation.unreadCount > 0) supportChatRequest(`/api/chats/${encodeURIComponent(selectedConversation.id)}/read`).catch((error) => console.error("Failed to mark support chat read:", error));
    });
    
    return () => unsub();
  }, [selectedConversation?.id]);

  // ✅ Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ✅ Send message
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation) return;
    
    setSending(true);
    try {
      await supportChatRequest(`/api/chats/${encodeURIComponent(selectedConversation.id)}/messages`, { content: newMessage });
      
      setNewMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setSending(false);
    }
  };

  // ✅ Filter conversations
  const filteredConversations = conversations.filter(c => 
    c.buyerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.buyerEmail?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ✅ Format timestamp
  const formatTime = (ts: any) => {
    if (!ts) return "";
    const date = ts.toDate?.() || new Date(ts);
    return date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="h-[calc(100vh-200px)] bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden flex">
      
      {/* LEFT: Conversation List */}
      <div className="w-80 border-r border-gray-100 flex flex-col">
        {/* Search */}
        <div className="p-4 border-b border-gray-100">
          <input 
            type="text" 
            placeholder="Search conversations..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-green-500/20 outline-none"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedConversation(conv)}
              className={`w-full text-left p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                selectedConversation?.id === conv.id ? "bg-green-50 border-l-4 border-l-green-500" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="relative">
                  <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                    <User size={18} className="text-gray-400" />
                  </div>
                  {conv.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-sm text-gray-900 truncate">{conv.buyerName}</p>
                    <span className="text-[9px] text-gray-400 whitespace-nowrap">{formatTime(conv.lastMessageAt)}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 truncate">{conv.lastMessage || "No messages yet"}</p>
                </div>
              </div>
            </button>
          ))}
          {filteredConversations.length === 0 && (
            <div className="p-6 text-center text-gray-400 text-sm">No conversations found</div>
          )}
        </div>
      </div>

      {/* RIGHT: Chat Window */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex items-center gap-3 bg-white">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                <User size={18} className="text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm text-gray-900">{selectedConversation.buyerName}</p>
                <p className="text-[10px] text-gray-400">{selectedConversation.buyerEmail}</p>
              </div>
              <button className="p-2 hover:bg-gray-50 rounded-lg"><Phone size={18} className="text-gray-400" /></button>
              <button className="p-2 hover:bg-gray-50 rounded-lg"><MoreVertical size={18} className="text-gray-400" /></button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.senderRole === "vendor" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                    msg.senderRole === "vendor" 
                      ? "bg-green-600 text-white rounded-br-md" 
                      : "bg-white border border-gray-100 text-gray-700 rounded-bl-md"
                  }`}>
                    <p>{msg.content}</p>
                    <p className={`text-[9px] mt-1 text-right ${msg.senderRole === "vendor" ? "text-green-100" : "text-gray-400"}`}>
                      {formatTime(msg.timestamp)} {msg.senderRole === "vendor" && (msg.read ? "✓✓" : "✓")}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-3 border-t border-gray-100 bg-white flex items-center gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-green-500/20 outline-none"
                disabled={sending}
              />
              <button 
                type="submit" 
                disabled={sending || !newMessage.trim()}
                className="p-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-xl transition-all active:scale-[0.95]"
              >
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <MessageSquare size={48} className="mb-4 opacity-30" />
            <p className="font-bold text-sm">Select a conversation</p>
            <p className="text-xs mt-1">Choose a buyer to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ✅ Add missing import at top of file
import { MessageSquare } from "lucide-react";
