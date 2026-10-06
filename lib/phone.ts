export function normalizeGhPhone(raw: string): string | null {
  let d = raw.trim().replace(/[^\d+]/g, "");

  if (d.startsWith("+233")) d = "0" + d.slice(4);
  else if (d.startsWith("233") && d.length === 12) d = "0" + d.slice(3);
  else if (d.startsWith("+")) d = d.slice(1);

  return /^0[2-5]\d{8}$/.test(d) ? d : null;
}

export function detectGhProvider(raw: string): "mtn" | "telecel" | "at" | null {
  const clean = raw.trim().replace(/[^\d+]/g, "");
  const p = clean.startsWith("+233")
    ? "0" + clean.slice(4)
    : clean.startsWith("233") && clean.length === 12
      ? "0" + clean.slice(3)
      : clean;
  if (/^0(24|54|55|59|53|25)/.test(p)) return "mtn";
  if (/^0(20|50)/.test(p)) return "telecel";
  if (/^0(27|57|26|56)/.test(p)) return "at";
  return null;
}

