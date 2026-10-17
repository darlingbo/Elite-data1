"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A button that must be pressed and held for a moment before it acts.
 * Used for money and delete actions so a slip of the thumb cannot trigger them.
 * Works with touch, mouse and the keyboard (hold Space or Enter).
 */
export default function HoldButton({
  label,
  holdingLabel = "Keep holding…",
  tone = "red",
  disabled = false,
  holdMs = 1000,
  onConfirm,
}: {
  label: string;
  holdingLabel?: string;
  tone?: "red" | "green";
  disabled?: boolean;
  holdMs?: number;
  onConfirm: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const raf = useRef<number | null>(null);
  const start = useRef(0);
  const fired = useRef(false);
  const confirmRef = useRef(onConfirm);
  useEffect(() => { confirmRef.current = onConfirm; });

  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    setHolding(false);
    setProgress(0);
  }, []);

  const tickRef = useRef<() => void>(() => {});
  const tick = useCallback(() => {
    const p = Math.min(1, (performance.now() - start.current) / holdMs);
    setProgress(p);
    if (p >= 1) {
      if (!fired.current) { fired.current = true; confirmRef.current(); }
      stop();
      return;
    }
    raf.current = requestAnimationFrame(() => tickRef.current());
  }, [holdMs, stop]);
  useEffect(() => { tickRef.current = tick; }, [tick]);

  const begin = useCallback(() => {
    if (disabled || raf.current) return;
    fired.current = false;
    start.current = performance.now();
    setHolding(true);
    raf.current = requestAnimationFrame(tick);
  }, [disabled, tick]);

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  return (
    <div>
      <button
        type="button"
        className={`ad-hold ${tone}`}
        disabled={disabled}
        aria-label={`${label}. Press and hold for ${Math.round(holdMs / 1000)} second to confirm.`}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); begin(); }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
        onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); begin(); } }}
        onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") stop(); }}
        onContextMenu={(e) => e.preventDefault()}
        style={{ ["--p" as string]: `${Math.round(progress * 100)}%` }}
      >
        <span>{holding ? holdingLabel : label}</span>
      </button>
      <p className="ad-holdnote">Press and hold for {Math.round(holdMs / 1000)} second</p>
    </div>
  );
}
