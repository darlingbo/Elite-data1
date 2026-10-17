"use client";
import { useCallback, useEffect, useState } from "react";
import { normalizeGhPhone } from "@/lib/phone";
import type { BuyNetwork } from "@/lib/ed-networks";

export type CheckPhase = "idle" | "checking" | "verified" | "not_verified" | "unreachable" | "skipped" | "error";

export interface NumberCheckState {
  phase: CheckPhase;
  /** The normalised number this answer is for. */
  phone?: string;
  message?: string;
  /** Where the customer can submit a new number to be verified (set by the admin). */
  verifyUrl?: string | null;
}

/**
 * Checks the data number as soon as it is complete (10 digits).
 * MTN numbers are asked of the providers. Other networks have no list, so they pass.
 * The server checks again before any payment starts, so this is for the customer's benefit.
 */
export function useNumberCheck(rawPhone: string, network: BuyNetwork) {
  const [state, setState] = useState<NumberCheckState>({ phase: "idle" });
  const [tick, setTick] = useState(0);
  const phone = normalizeGhPhone(rawPhone);

  useEffect(() => {
    // Every setState happens inside the timer so none runs synchronously in the effect body.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (!phone) { setState({ phase: "idle" }); return; }
      if (network !== "mtn") { setState({ phase: "skipped", phone }); return; }
      setState({ phase: "checking", phone });
      try {
        const res = await fetch("/api/verify-mtn-number", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, network }),
          signal: controller.signal,
        });
        const d = (await res.json().catch(() => ({}))) as { verified?: boolean; status?: string; error?: string; verifyUrl?: string | null };
        if (controller.signal.aborted) return;
        if (res.status === 429) { setState({ phase: "error", phone, message: d.error ?? "Too many checks. Please wait a moment." }); return; }
        if (d.status === "verified") setState({ phase: "verified", phone });
        else if (d.status === "skipped") setState({ phase: "skipped", phone });
        else if (d.status === "not_verified") setState({ phase: "not_verified", phone, message: d.error, verifyUrl: d.verifyUrl ?? null });
        else if (d.status === "unreachable") setState({ phase: "unreachable", phone, message: d.error });
        else setState({ phase: "error", phone, message: d.error ?? "We could not check this number. Please try again." });
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setState({ phase: "error", phone: phone ?? undefined, message: "We could not reach the number check. Check your connection and try again." });
      }
    }, phone ? 350 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [phone, network, tick]);

  const recheck = useCallback(() => setTick((n) => n + 1), []);
  const canContinue = state.phase === "verified" || state.phase === "skipped";
  return { state, recheck, canContinue, phone };
}
