"use client";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [agentMode, setAgentMode] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("agent");
      const stored = sessionStorage.getItem("agentRef");
      if (fromUrl) { sessionStorage.setItem("agentRef", fromUrl); setAgentMode(true); }
      else if (stored) setAgentMode(true);
    } catch {}
  }, []);

  return (
    <nav className={`sticky top-0 z-50 transition-all duration-200 ${scrolled ? "bg-white shadow-md" : "bg-white/95 backdrop-blur shadow-sm"}`}>
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-md shadow-blue-200 group-hover:shadow-blue-300 transition-shadow">
            <span className="text-white font-black text-sm tracking-tight">ED</span>
          </div>
          <span className="font-black text-xl tracking-tight">
            <span className="text-blue-600">Elite</span><span className="text-gray-800">Data</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1 text-sm font-medium text-gray-600">
          <Link href="/" className="px-3 py-2 rounded-lg hover:bg-gray-100 hover:text-blue-600 transition-colors">Home</Link>
          <Link href="/buy" className="px-3 py-2 rounded-lg hover:bg-gray-100 hover:text-blue-600 transition-colors">Buy Data</Link>
          <Link href="/track" className="px-3 py-2 rounded-lg hover:bg-gray-100 hover:text-blue-600 transition-colors">Track Order</Link>
          {!agentMode && (
            <Link href="/agent" className="px-3 py-2 rounded-lg hover:bg-gray-100 hover:text-blue-600 transition-colors">Become Agent</Link>
          )}
          <Link href="/buy"
            className="ml-2 bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors shadow-sm font-semibold">
            Buy Now ⚡
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 flex flex-col gap-1 text-sm font-medium text-gray-600 shadow-lg">
          <Link href="/" onClick={() => setOpen(false)} className="px-3 py-2.5 rounded-xl hover:bg-gray-50 hover:text-blue-600 transition-colors">Home</Link>
          <Link href="/buy" onClick={() => setOpen(false)} className="px-3 py-2.5 rounded-xl hover:bg-gray-50 hover:text-blue-600 transition-colors">Buy Data</Link>
          <Link href="/track" onClick={() => setOpen(false)} className="px-3 py-2.5 rounded-xl hover:bg-gray-50 hover:text-blue-600 transition-colors">Track Order</Link>
          {!agentMode && (
            <Link href="/agent" onClick={() => setOpen(false)} className="px-3 py-2.5 rounded-xl hover:bg-gray-50 hover:text-blue-600 transition-colors">Become Agent</Link>
          )}
          <Link href="/buy" onClick={() => setOpen(false)}
            className="mt-1 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-center font-semibold hover:bg-blue-700 transition-colors">
            Buy Now ⚡
          </Link>
        </div>
      )}
    </nav>
  );
}
