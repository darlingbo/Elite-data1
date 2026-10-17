"use client";
import { useEffect } from "react";
import { applyStoredTheme } from "@/components/ThemeToggle";

/**
 * Applies the visitor's saved light/dark choice on every public page. The theme button lives in
 * the top menu, which is hidden on the buy, checkout and track screens, so without this those
 * screens always came up dark even when the visitor had chosen light.
 */
export default function ThemeBoot() {
  useEffect(() => { applyStoredTheme(); }, []);
  return null;
}
