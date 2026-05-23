"use client";
import { Bundle, networkConfig } from "@/lib/bundles";

interface Props {
  bundle: Bundle;
  onBuy: (bundle: Bundle) => void;
  isBestValue?: boolean;
}

export default function BundleCard({ bundle, onBuy, isBestValue }: Props) {
  const net = networkConfig[bundle.network];

  const hasBadge = isBestValue || bundle.popular;

  return (
    <div
      className={`relative bg-white border-2 rounded-2xl p-4 flex flex-col gap-2 hover:shadow-lg transition-all hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer ${
        isBestValue
          ? "border-emerald-400"
          : bundle.popular
          ? net.borderColor
          : "border-gray-100"
      }`}
      onClick={() => onBuy(bundle)}
    >
      {hasBadge && (
        <span
          className={`absolute -top-2.5 left-1/2 -translate-x-1/2 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full whitespace-nowrap ${
            isBestValue ? "bg-emerald-500" : net.bgColor
          }`}
        >
          {isBestValue ? "🏆 Best Value" : "Popular"}
        </span>
      )}

      {/* Network badge + validity */}
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${net.bgLight} ${net.textColor}`}>
          {net.name}
        </span>
        <span className="text-[10px] text-gray-400 font-medium">{bundle.validity}</span>
      </div>

      {/* Size */}
      <div className="py-1">
        <p className="text-3xl font-black text-gray-800 leading-none">{bundle.size}</p>
      </div>

      {/* Price + button */}
      <div className="mt-auto">
        <p className={`text-xl font-black ${net.textColor} mb-2`}>GH₵{bundle.price.toFixed(2)}</p>
        <button
          onClick={(e) => { e.stopPropagation(); onBuy(bundle); }}
          className={`w-full ${net.bgColor} hover:opacity-90 active:opacity-75 text-white font-bold py-2 rounded-xl transition-opacity text-xs`}
        >
          Buy Now ⚡
        </button>
      </div>
    </div>
  );
}
