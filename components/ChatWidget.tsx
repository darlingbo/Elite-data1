"use client";
import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  id: number;
  from: "bot" | "user";
  text: string;
  time: string;
  quickReplies?: string[];
  aiId?: string;
}

const now = () => new Date().toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" });

const ADMIN_WA = "233509794503";

const FAQ: Array<{ patterns: RegExp[]; answer: string; quickReplies?: string[] }> = [
  {
    patterns: [/hello|hi|hey|good (morning|afternoon|evening|night)|start/i],
    answer: "Hi there! Welcome to Elite Data 👋\nI'm your 24/7 assistant. How can I help you today?",
    quickReplies: ["Buy data", "Track order", "Delivery time", "Payment methods", "Become agent", "Talk to human"],
  },
  {
    patterns: [/buy|purchase|order data|get data|data bundle/i],
    answer: "You can buy data bundles for MTN, Telecel, and AirtelTigo right here on the site!\n\nJust click <b>Buy Data</b> in the menu, pick your network, choose a size, and pay securely via Paystack. 🚀",
    quickReplies: ["Delivery time", "Payment methods", "Track order", "Talk to human"],
  },
  {
    patterns: [/track|check.*order|order.*status|where.*data|ref(erence)?/i],
    answer: "To track your order, go to the <b>Track Order</b> page and enter your payment reference.\n\nYou can type your reference below and I'll look it up for you!",
    quickReplies: ["Payment methods", "Talk to human"],
  },
  {
    patterns: [/how (long|fast)|delivery time|when.*arrive|minutes|instant/i],
    answer: "Bundles are delivered <b>automatically within 1–5 minutes</b> after your payment is confirmed ⚡\n\nNo manual steps needed — it's fully automated!",
    quickReplies: ["Payment methods", "Track order", "Talk to human"],
  },
  {
    patterns: [/pay(ment)?|momo|mobile money|card|visa|paystack|how.*pay/i],
    answer: "We accept:\n• MTN MoMo\n• Telecel Cash\n• AirtelTigo Money\n• Visa / Mastercard\n\nAll payments go through <b>Paystack</b> — Ghana's most trusted payment gateway 🔒",
    quickReplies: ["Delivery time", "Track order", "Talk to human"],
  },
  {
    patterns: [/agent|refer(ral)?|earn|commission|profit|resell|partner/i],
    answer: "Become an Elite Data Agent and <b>earn 80% profit</b> on every sale made through your referral link!\n\n✅ Free to join\n✅ Your own referral link\n✅ Real-time dashboard\n\nClick <b>Become Agent</b> in the menu to apply.",
    quickReplies: ["How to apply", "Talk to human"],
  },
  {
    patterns: [/how.*apply|sign.*up.*agent|register.*agent|apply.*agent/i],
    answer: "Applying is easy:\n1. Click <b>Become Agent</b> in the navigation\n2. Fill the short form with your details\n3. We review within 24 hours\n4. Once approved, share your link and start earning!",
    quickReplies: ["Commission rates", "Talk to human"],
  },
  {
    patterns: [/commission|how much.*earn|profit.*rate|percentage/i],
    answer: "Agents earn <b>80% of every sale profit</b> made through their referral link!\n\nExample: If someone buys a GH₵10 bundle with GH₵2 profit, you earn GH₵1.60 automatically.",
    quickReplies: ["Become agent", "Talk to human"],
  },
  {
    patterns: [/refund|money back|failed.*pay|didn't arrive|not.*received/i],
    answer: "If your bundle didn't arrive after 10 minutes, please contact us immediately on WhatsApp. We resolve all delivery issues within 30 minutes and guarantee a full refund if we can't deliver 💯",
    quickReplies: ["Talk to human"],
  },
  {
    patterns: [/price|cost|how much|cheap|expensive|rate/i],
    answer: "We offer the <b>lowest data bundle prices</b> across all networks in Ghana:\n\n• MTN bundles from GH₵4\n• Telecel bundles from GH₵3.50\n• AirtelTigo bundles from GH₵3\n\nCheck the full list on our Buy Data page!",
    quickReplies: ["Buy data", "Talk to human"],
  },
  {
    patterns: [/support|help|contact|talk.*human|talk.*agent|real person|speak/i],
    answer: "Our team is available on WhatsApp 24/7 for immediate support!\n\nClick the button below to chat with us directly 👇",
    quickReplies: ["Open WhatsApp"],
  },
  {
    patterns: [/network|mtn|telecel|airteltigo|airtel/i],
    answer: "We support all 3 major networks in Ghana:\n\n📱 <b>MTN</b> — widest coverage\n📱 <b>Telecel</b> (Vodafone)\n📱 <b>AirtelTigo</b>\n\nPick any network on the Buy Data page!",
    quickReplies: ["Buy data", "Delivery time", "Talk to human"],
  },
];

const TRACK_PATTERN = /^elite-\d+$|^[a-z]{4,6}-\d{10,}$/i;

async function lookupOrder(ref: string): Promise<string> {
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(ref.trim())}`);
    const data = await res.json();
    if (data.success && data.order) {
      const o = data.order;
      const statusIcon: Record<string, string> = {
        COMPLETED: "✅", PROCESSING: "🔄", PENDING: "⏳", FAILED: "❌",
      };
      return (
        `${statusIcon[o.status] ?? "📦"} <b>Order Found</b>\n` +
        `Network: ${o.network?.toUpperCase()} ${o.bundle_size}\n` +
        `Phone: ${o.phone}\n` +
        `Amount: GH₵${Number(o.amount).toFixed(2)}\n` +
        `Status: <b>${o.status}</b>\n` +
        (o.status === "FAILED" ? "\n❗ Contact us on WhatsApp for a retry or refund." :
         o.status === "COMPLETED" ? "\n🎉 Bundle delivered successfully!" :
         "\nUsually takes 1–5 minutes. Please wait.")
      );
    }
    return "No order found for that reference. Please double-check and try again.";
  } catch {
    return "Couldn't reach our servers right now. Please try again in a moment.";
  }
}

function matchFAQ(input: string) {
  for (const faq of FAQ) {
    if (faq.patterns.some((p) => p.test(input))) return faq;
  }
  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}

let idCounter = 0;
const nextId = () => ++idCounter;

const WELCOME: Message = {
  id: nextId(),
  from: "bot",
  text: "Hi! I'm the Elite Data assistant 👋\nAsk me anything about data bundles, payments, delivery, or becoming an agent!",
  time: now(),
  quickReplies: ["Buy data", "Track order", "Delivery time", "Payment methods", "Become agent", "Talk to human"],
};

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [unread, setUnread] = useState(1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(`web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [open, messages]);

  function addBot(text: string, quickReplies?: string[]) {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      const msg: Message = { id: nextId(), from: "bot", text, time: now(), quickReplies };
      setMessages((prev) => [...prev, msg]);
      if (!open) setUnread((n) => n + 1);
    }, 800 + Math.random() * 600);
  }

  async function handleSend(text: string) {
    if (!text.trim()) return;
    const userMsg: Message = { id: nextId(), from: "user", text: text.trim(), time: now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    // Special quick replies
    if (text === "Open WhatsApp") {
      window.open(`https://wa.me/${ADMIN_WA}`, "_blank");
      addBot("Opening WhatsApp... Our team will reply shortly! 😊");
      return;
    }
    if (text === "Talk to human") {
      const summary = [...messages, userMsg].slice(-6).map(message => `${message.from}: ${message.text.replace(/<[^>]+>/g, "")}`).join("\n");
      void fetch("/api/ai/escalate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: sessionId.current, summary }) });
      addBot(
        "I have sent this conversation to our human support team. You can also open WhatsApp now:",
        ["Open WhatsApp"]
      );
      return;
    }

    // Order reference lookup
    if (TRACK_PATTERN.test(text.trim())) {
      setTyping(true);
      const result = await lookupOrder(text.trim());
      setTyping(false);
      const msg: Message = {
        id: nextId(), from: "bot", text: result, time: now(),
        quickReplies: result.includes("FAILED") ? ["Open WhatsApp"] : ["Buy data", "Talk to human"],
      };
      setMessages((prev) => [...prev, msg]);
      return;
    }

    // Use the live AI for normal conversation. Order lookups and human handoff
    // stay deterministic above so the model cannot claim that an action happened.
    setTyping(true);
    try {
      const conversation = [...messages, userMsg]
        .slice(-8)
        .map(message => ({
          role: message.from === "user" ? "user" as const : "assistant" as const,
          content: message.text.replace(/<[^>]+>/g, ""),
        }));
      const response = await fetch("/api/ai/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversation, sessionId: sessionId.current }),
      });
      const result = await response.json();
      const reply = response.ok ? String(result.reply ?? "") : String(result.error ?? "");
      setMessages(prev => [...prev, {
        id: nextId(), from: "bot", text: escapeHtml(reply || "Please contact our support team on WhatsApp."), time: now(), aiId: result.messageId,
        quickReplies: ["Track order", "Twi please", "Talk to human"],
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: nextId(), from: "bot", text: "The AI assistant is temporarily unavailable. Please contact our support team.", time: now(), quickReplies: ["Open WhatsApp"],
      }]);
    } finally {
      setTyping(false);
    }
  }

  // ─── Draggable bubble ────────────────────────────────────────────────────────
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, bx: 0, by: 0 });
  const bubbleRef = useRef<HTMLButtonElement>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragging.current = false;
    const rect = bubbleRef.current!.getBoundingClientRect();
    dragStart.current = { mx: e.clientX, my: e.clientY, bx: rect.left, by: rect.top };
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - dragStart.current.mx;
      const dy = ev.clientY - dragStart.current.my;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragging.current = true;
      const x = Math.min(Math.max(dragStart.current.bx + dx, 0), window.innerWidth - 56);
      const y = Math.min(Math.max(dragStart.current.by + dy, 0), window.innerHeight - 56);
      setPos({ x, y });
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const bubbleStyle: React.CSSProperties = pos
    ? { position: "fixed", left: pos.x, top: pos.y, bottom: "auto" }
    : { position: "fixed", bottom: 24, left: 24 };

  return (
    <>
      {/* Bubble — draggable */}
      <button
        ref={bubbleRef}
        onPointerDown={onPointerDown}
        onClick={() => { if (!dragging.current) setOpen((o) => !o); }}
        style={{ ...bubbleStyle, zIndex: 50, width: 56, height: 56, borderRadius: "50%", background: "#2563eb", color: "#fff", border: "none", cursor: "grab", boxShadow: "0 8px 32px rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none" }}
        aria-label="Chat support"
      >
        {open ? (
          <svg width={24} height={24} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg width={24} height={24} fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
          </svg>
        )}
        {!open && unread > 0 && (
          <span style={{ position: "absolute", top: -4, right: -4, width: 20, height: 20, background: "#ef4444", borderRadius: "50%", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {unread}
          </span>
        )}
      </button>

      {/* Chat window — appears above bubble */}
      {open && (
        <div className="fixed z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
          style={{ maxHeight: "70vh", bottom: pos ? "auto" : 96, left: pos ? Math.min(pos.x, window.innerWidth - 384) : 24, top: pos ? Math.max(pos.y - Math.min(window.innerHeight * 0.7, 480) - 8, 8) : "auto" }}>
          {/* Header */}
          <div className="bg-blue-600 px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-400 rounded-full flex items-center justify-center font-black text-white text-sm">E</div>
            <div className="flex-1">
              <p className="text-white font-bold text-sm leading-tight">EliteData AI Support</p>
              <p className="text-blue-200 text-xs">AI online · Human help available</p>
            </div>
            <span className="w-2.5 h-2.5 bg-green-400 rounded-full" title="Online" />
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-gray-50" style={{ maxHeight: "calc(70vh - 130px)" }}>
            {messages.map((msg) => (
              <div key={msg.id}>
                <div className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      msg.from === "user"
                        ? "bg-blue-600 text-white rounded-br-sm"
                        : "bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-sm"
                    }`}
                  >
                    {msg.from === "bot" ? (
                      <span dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, "<br/>") }} />
                    ) : (
                      msg.text
                    )}
                  </div>
                </div>
                <p className={`text-xs text-gray-400 mt-0.5 ${msg.from === "user" ? "text-right" : "text-left"} px-1`}>
                  {msg.time}
                </p>
                {msg.from === "bot" && msg.aiId && <div className="mt-1 flex gap-2 px-1"><button aria-label="Helpful answer" onClick={() => void fetch("/api/ai/feedback", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: msg.aiId, feedback: 1 }) })} className="text-xs text-gray-400 hover:text-green-600">👍 Helpful</button><button aria-label="Unhelpful answer" onClick={() => void fetch("/api/ai/feedback", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: msg.aiId, feedback: -1 }) })} className="text-xs text-gray-400 hover:text-red-600">👎</button></div>}
                {msg.quickReplies && msg.from === "bot" && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {msg.quickReplies.map((qr) => (
                      <button
                        key={qr}
                        onClick={() => handleSend(qr)}
                        className="bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-blue-200 transition-colors"
                      >
                        {qr}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="bg-white shadow-sm border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 bg-white border-t border-gray-100 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend(input)}
              placeholder="Type a message or paste your order ref..."
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            />
            <button
              onClick={() => handleSend(input)}
              disabled={!input.trim() || typing}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl w-10 flex items-center justify-center transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
