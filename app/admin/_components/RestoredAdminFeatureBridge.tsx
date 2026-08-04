"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const AiHubView = dynamic(() => import("./AiHubView"), { ssr: false });
const ResultCheckerAdmin = dynamic(() => import("./ResultCheckerAdmin"), { ssr: false });

type RestoredView = "ai" | "results" | null;

export default function RestoredAdminFeatureBridge() {
  const [view, setView] = useState<RestoredView>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button) return;
      const label = (button.textContent ?? "").trim().toLowerCase();
      if (label.includes("ai assistant")) setView("ai");
      if (label.includes("result checks")) setView("results");
      if (label === "dashboard" || label.includes("sign out")) setView(null);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  if (!view) return null;

  return (
    <section
      className="fixed inset-y-0 right-0 z-[45] overflow-y-auto bg-[#070b14] pt-16 md:left-60"
      aria-label={view === "ai" ? "AI Assistant" : "Result Checker Requests"}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-[#070b14]/95 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-400">Elite Data Admin</p>
          <h2 className="text-lg font-black text-white">{view === "ai" ? "AI Assistant" : "Result Checker Requests"}</h2>
        </div>
        <button
          type="button"
          onClick={() => setView(null)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800"
        >
          Close
        </button>
      </div>
      <div className="px-3 py-4 sm:px-6">
        {view === "ai" ? <AiHubView /> : <ResultCheckerAdmin />}
      </div>
    </section>
  );
}
