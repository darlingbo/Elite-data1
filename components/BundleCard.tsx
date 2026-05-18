"use client";
import { Bundle, networkConfig } from "@/lib/bundles";

interface Props {
  bundle: Bundle;
  onBuy: (bundle: Bundle) => void;
}

export default function BundleCard({ bundle, onBuy }: Props) {
  const net = networkConfig[bundle.network];

  return (
    <div className={`relative bg-white border-2 rounded-2xl p-5 flex flex-col gap-3 hover:shadow-lg transition-all hover:-translate-y-0.5 ${bundle.popular ? net.borderColor : "border-gray-200"}`}>
      {bundle.popular && (
        <span className={`absolute -top-3 left-1/2 -translate-x-1/2 ${net.bgColor} text-white text-xs font-bold px-3 py-0.5 rounded-full`}>
          Popular
        </span>
      )}

      {/* Network badge */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${net.bgLight} ${net.textColor}`}>
          {net.name}
        </span>
        <span className="text-xs text-gray-400">{bundle.validity}</span>
      </div>

      {/* Size */}
      <div>
        <p className="text-3xl font-black text-gray-800">{bundle.size}</p>
        <p className="text-xs text-gray-500 mt-0.5">Data Bundle</p>
      </div>

      {/* Price */}
      <div className="mt-auto">
        <p className={`text-2xl font-black ${net.textColor}`}>GH₵ {bundle.price.toFixed(2)}</p>
        <button
          onClick={() => onBuy(bundle)}
          className={`w-full mt-3 ${net.bgColor} hover:opacity-90 text-white font-bold py-2.5 rounded-xl transition-opacity text-sm`}
        >
          Buy Now
        </button>
      </div>
    </div>
  );
}
