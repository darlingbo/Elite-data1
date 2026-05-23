"use client";
import { useState, useEffect, useCallback } from "react";


const PACKAGES = [
  { id: "starter",  label: "Starter",  images: 5,  price: 5,  color: "#3b82f6", popular: false },
  { id: "standard", label: "Standard", images: 15, price: 12, color: "#8b5cf6", popular: true },
  { id: "pro",      label: "Pro",      images: 35, price: 25, color: "#10b981", popular: false },
];

const PLATFORM_FEE_RATE = 0.02;
const TOKEN_KEY = "elite_ai_token";

function usePaystackReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.PaystackPop) { setReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.async = true;
    s.onload = () => setReady(true);
    document.body.appendChild(s);
  }, []);
  return ready;
}

export default function AiImagesPage() {
  const [token, setToken] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [genError, setGenError] = useState("");
  const [buying, setBuying] = useState(false);
  const [buyEmail, setBuyEmail] = useState("");
  const [selectedPkg, setSelectedPkg] = useState(PACKAGES[1]);
  const [buyError, setBuyError] = useState("");
  const paystackReady = usePaystackReady();

  const loadCredits = useCallback(async (t: string) => {
    const res = await fetch(`/api/ai/credits?token=${t}`);
    const data = await res.json();
    if (data.credits !== undefined) setCredits(data.credits);
    else { localStorage.removeItem(TOKEN_KEY); setToken(null); setCredits(null); }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) { setToken(saved); loadCredits(saved); }
  }, [loadCredits]);

  function handleBuy() {
    setBuyError("");
    if (!buyEmail.trim() || !buyEmail.includes("@")) return setBuyError("Enter a valid email.");
    if (!paystackReady) return setBuyError("Payment loading, try again.");
    const key = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
    if (!key) return setBuyError("Paystack key missing.");

    const total = parseFloat((selectedPkg.price * (1 + PLATFORM_FEE_RATE)).toFixed(2));
    setBuying(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (window as any).PaystackPop.setup({
        key, email: buyEmail,
        amount: Math.round(total * 100),
        currency: "GHS",
        ref: `elite-ai-${Date.now()}`,
        callback: (response: { reference: string }) => {
          fetch("/api/ai/credits", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ packageId: selectedPkg.id, paystackRef: response.reference, email: buyEmail }),
          })
            .then((r) => r.json())
            .then((data) => {
              setBuying(false);
              if (data.token) {
                localStorage.setItem(TOKEN_KEY, data.token);
                setToken(data.token);
                setCredits(data.credits);
              } else setBuyError(data.error ?? "Purchase failed.");
            })
            .catch(() => { setBuying(false); setBuyError("Network error. Contact support."); });
        },
        onClose: () => setBuying(false),
      });
      handler.openIframe();
    } catch (err) {
      setBuying(false);
      setBuyError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleGenerate() {
    if (!token || !prompt.trim()) return;
    setGenError("");
    setGenerating(true);
    const res = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, prompt }),
    });
    const data = await res.json();
    setGenerating(false);
    if (data.imageUrl) {
      setImages((prev) => [data.imageUrl, ...prev]);
      setCredits(data.creditsRemaining);
      setPrompt("");
    } else {
      setGenError(data.error ?? "Something went wrong.");
      if (data.creditsRemaining !== undefined) setCredits(data.creditsRemaining);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center mx-auto mb-4 text-3xl shadow-lg">
          🎨
        </div>
        <h1 className="text-3xl font-black text-gray-800 mb-2">AI Image Generator</h1>
        <p className="text-gray-500 max-w-md mx-auto">Describe any image and our AI creates it instantly. Perfect for logos, artwork, social media, and more.</p>
      </div>

      {!token ? (
        /* ── Buy credits ── */
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5">
            <h2 className="text-lg font-black text-gray-800 mb-1">Buy Image Credits</h2>
            <p className="text-gray-400 text-sm mb-5">Pay once, generate images instantly. Credits valid for 30 days.</p>

            <div className="grid grid-cols-3 gap-3 mb-5">
              {PACKAGES.map((pkg) => (
                <button key={pkg.id} onClick={() => setSelectedPkg(pkg)}
                  className="relative rounded-xl p-4 border-2 text-center transition-all"
                  style={{ borderColor: selectedPkg.id === pkg.id ? pkg.color : "#e5e7eb", background: selectedPkg.id === pkg.id ? `${pkg.color}10` : "#fff" }}>
                  {pkg.popular && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-black px-2 py-0.5 rounded-full text-white whitespace-nowrap" style={{ background: pkg.color }}>Most Popular</span>
                  )}
                  <p className="font-black text-gray-800 text-sm">{pkg.label}</p>
                  <p className="text-2xl font-black mt-1" style={{ color: pkg.color }}>{pkg.images}</p>
                  <p className="text-xs text-gray-400">images</p>
                  <p className="font-bold text-gray-700 mt-2 text-sm">GH₵{pkg.price}</p>
                </button>
              ))}
            </div>

            {buyError && <p className="text-red-500 text-sm mb-3">{buyError}</p>}

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Email Address</label>
              <input type="email" placeholder="e.g. kwame@gmail.com" value={buyEmail} onChange={(e) => setBuyEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>

            <div className="bg-gray-50 rounded-xl p-3 mb-4 flex justify-between text-sm">
              <span className="text-gray-500">{selectedPkg.images} images · 30 days validity</span>
              <span className="font-black text-gray-800">GH₵{(selectedPkg.price * (1 + PLATFORM_FEE_RATE)).toFixed(2)}</span>
            </div>

            <button onClick={handleBuy} disabled={buying || !paystackReady}
              className="w-full py-3 rounded-xl font-bold text-white text-sm transition-all disabled:opacity-60"
              style={{ background: `linear-gradient(90deg,#8b5cf6,#3b82f6)` }}>
              {buying ? "Processing…" : !paystackReady ? "Loading…" : `Buy ${selectedPkg.images} Images — GH₵${(selectedPkg.price * (1 + PLATFORM_FEE_RATE)).toFixed(2)}`}
            </button>

            <p className="text-center text-xs text-gray-400 mt-3">Secured by Paystack · No subscription</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="font-semibold text-gray-700 mb-3 text-sm">What can you create?</p>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-500">
              {["Product photos", "Social media posts", "Logo concepts", "Posters & flyers", "Portraits & avatars", "Any creative idea"].map((t) => (
                <div key={t} className="flex items-center gap-2"><span className="text-purple-500">✦</span>{t}</div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ── Generator ── */
        <div className="space-y-5">
          {/* Credits bar */}
          <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-lg">🎨</div>
              <div>
                <p className="text-xs text-gray-400">Credits Remaining</p>
                <p className="font-black text-gray-800 text-lg">{credits ?? "…"} images</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { localStorage.removeItem(TOKEN_KEY); setToken(null); setCredits(null); setImages([]); }}
                className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg border border-gray-200 transition-colors">
                Switch account
              </button>
              <button onClick={() => { localStorage.removeItem(TOKEN_KEY); setToken(null); setCredits(null); setImages([]); }}
                className="text-xs font-bold text-purple-600 hover:text-purple-700 px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 transition-colors">
                + Buy more
              </button>
            </div>
          </div>

          {/* Prompt input */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <label className="block text-xs font-semibold text-gray-600 mb-2">Describe your image</label>
            <textarea rows={3} placeholder="e.g. A professional logo for a Ghana data company, modern blue design on white background, 4K quality"
              value={prompt} onChange={(e) => setPrompt(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />

            {genError && <p className="text-red-500 text-sm mt-2">{genError}</p>}

            <button onClick={handleGenerate} disabled={generating || !prompt.trim() || (credits ?? 0) <= 0}
              className="mt-3 w-full py-3 rounded-xl font-bold text-white text-sm transition-all disabled:opacity-60"
              style={{ background: "linear-gradient(90deg,#8b5cf6,#3b82f6)" }}>
              {generating ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  Creating your image… (15–30 sec)
                </span>
              ) : (credits ?? 0) <= 0 ? "No credits left — buy more above" : "✨ Generate Image (1 credit)"}
            </button>
          </div>

          {/* Generated images */}
          {images.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-3">Your Generated Images</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {images.map((url, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                    <img src={url} alt={`Generated ${i + 1}`} className="w-full aspect-square object-cover" />
                    <div className="p-3 flex justify-between items-center">
                      <p className="text-xs text-gray-400">1024 × 1024 · DALL-E 3</p>
                      <a href={url} download={`elite-ai-image-${i + 1}.png`} target="_blank" rel="noreferrer"
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                        ↓ Download
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {images.length === 0 && !generating && (
            <div className="text-center py-16 text-gray-300">
              <p className="text-5xl mb-3">🖼️</p>
              <p className="text-gray-400 font-medium">Your generated images will appear here</p>
              <p className="text-sm text-gray-300 mt-1">Each image takes about 15–30 seconds</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
