import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 pt-12 pb-6">
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-black text-sm">E</span>
              </div>
              <span className="font-black text-white text-xl tracking-tight">
                Elite<span className="text-blue-400">Data</span>
              </span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed max-w-xs">
              Ghana&apos;s trusted platform for cheap and instant data bundles. MTN, Telecel and AirtelTigo bundles delivered in minutes.
            </p>
            <div className="mt-4 text-xs text-gray-500">
              <p>Mon – Sat: 6:00am – 11:59pm</p>
              <p>Sunday: 7:00am – 11:30pm</p>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm uppercase tracking-wider">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/" className="hover:text-blue-400 transition-colors">Home</Link></li>
              <li><Link href="/buy" className="hover:text-blue-400 transition-colors">Buy Data</Link></li>
              <li><Link href="/track" className="hover:text-blue-400 transition-colors">Track Order</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm uppercase tracking-wider">Support</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="https://wa.me/233000000000" target="_blank" rel="noreferrer" className="hover:text-blue-400 transition-colors">
                  WhatsApp Support
                </a>
              </li>
              <li><Link href="/track" className="hover:text-blue-400 transition-colors">Track My Order</Link></li>
              <li><span className="text-gray-500">elitedata@gmail.com</span></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-6 flex flex-col md:flex-row justify-between items-center gap-2 text-xs text-gray-500">
          <p>© {new Date().getFullYear()} Elite Data. All rights reserved.</p>
          <p>Powered by Paystack &amp; secured payments</p>
        </div>
      </div>
    </footer>
  );
}
