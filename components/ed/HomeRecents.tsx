"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { readRecents, spacedPhone, writeDraft, type RecentNumber } from "@/lib/client/order-draft";
import { parseNetwork } from "@/lib/ed-networks";

/** Numbers this phone bought for before. One tap goes straight to the number step. */
export default function HomeRecents() {
  const router = useRouter();
  const [recents, setRecents] = useState<RecentNumber[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setRecents(readRecents().slice(0, 4)), 0);
    return () => clearTimeout(t);
  }, []);

  if (recents.length === 0) return null;

  function go(r: RecentNumber) {
    const network = parseNetwork(r.network);
    writeDraft({ network, recipient: r.phone });
    router.push(`/buy/number?network=${network}`);
  }

  return (
    <div className="ed-chips" role="group" aria-label="Buy again for a recent number">
      <span className="ed-muted" style={{ fontSize: 12 }}>Buy again</span>
      {recents.map((r) => (
        <button key={r.phone} type="button" className="ed-chip" onClick={() => go(r)}>
          {r.label !== r.phone ? `${r.label} ` : ""}{spacedPhone(r.phone)}
        </button>
      ))}
    </div>
  );
}
