"use client";
import Link from "next/link";
import { useState } from "react";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-black text-sm">E</span>
          </div>
          <span className="font-black text-blue-600 text-xl tracking-tight">
            Elite<span className="text-gray-800">Data</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
          <Link href="/" className="hover:text-blue-600 transition-colors">Home</Link>
          <Link href="/buy" className="hover:text-blue-600 transition-colors">Buy Data</Link>
          <Link href="/track" className="hover:text-blue-600 transition-colors">Track Order</Link>
          <Link href="/agent" className="hover:text-blue-600 transition-colors">Become Agent</Link>
          <Link href="/buy" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            Buy Now
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
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
        <div className="md:hidden bg-white border-t px-4 py-3 flex flex-col gap-3 text-sm font-medium text-gray-600">
          <Link href="/" onClick={() => setOpen(false)} className="hover:text-blue-600">Home</Link>
          <Link href="/buy" onClick={() => setOpen(false)} className="hover:text-blue-600">Buy Data</Link>
          <Link href="/track" onClick={() => setOpen(false)} className="hover:text-blue-600">Track Order</Link>
          <Link href="/agent" onClick={() => setOpen(false)} className="hover:text-blue-600">Become Agent</Link>
          <Link href="/buy" onClick={() => setOpen(false)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-center">
            Buy Now
          </Link>
        </div>
      )}
    </nav>
  );
}
