---
name: elitedata-design
description: EliteData1 design system. Use whenever building or editing any UI, component, or page in this project.
---

# EliteData Design System

Load this before writing any UI. Follow it exactly — no new colors, fonts, or spacing values outside these tokens.

---

## Color Tokens

### Dark theme (pages, admin, agent dashboard)
```
BG:       #0d1117   (page background — buy page)
BG_NAV:   #0d1b2e   (nav, drawers — slightly blue-tinted)
CARD:     #161b22   (card surfaces on dark pages)
BORDER:   #21262d   (card borders)
BORDER2:  #1e3a5f   (nav/drawer borders — blue-tinted)
TEXT:     #e6edf3   (primary text on dark)
MUTED:    #8b949e   (secondary text on dark)
```

### Light theme (checkout modal, refund forms)
Checkout flow deliberately uses white for trust and clarity. Do not switch it dark.
```
CARD:   #ffffff
BORDER: #e5e7eb  (gray-200)
TEXT:   #111827  (gray-900)
MUTED:  #6b7280  (gray-500)
```

### Network brand colors
These are the canonical tokens — use BOTH the hex (for inline styles) and the Tailwind class (for className).
| Network    | Hex     | bg class      | text class      | border class       | light bg        |
|------------|---------|---------------|-----------------|--------------------|-----------------|
| MTN        | #FFC220 | bg-yellow-400 | text-yellow-600 | border-yellow-400  | bg-yellow-50    |
| Telecel    | #E8001D | bg-red-500    | text-red-600    | border-red-500     | bg-red-50       |
| AirtelTigo | #E4002B | bg-rose-600   | text-rose-600   | border-rose-500    | bg-rose-50      |
| Mashup     | #8b5cf6 | bg-purple-500 | text-purple-600 | border-purple-500  | bg-purple-50    |

⚠️ **Known inconsistency**: The buy page `NETS` array uses `#3b82f6` (blue) for AirtelTigo network pill — this is wrong. The canonical AirtelTigo color is rose/red. Fix it to `#E4002B` / `bg-rose-600` if you touch that file.

### Accent / action colors
```
Primary CTA:  #2563eb  (blue-600)   — main buttons
Yellow CTA:   #fbbf24  (yellow-400) — nav "Buy Data" button, high-visibility CTA
Success:      #22c55e  (green-500)
Warning:      #f59e0b  (amber-500)
Error:        #ef4444  (red-500)
```

---

## Typography

**Font stack**: `Arial, Helvetica, sans-serif` — set in `globals.css`. Use this, not `system-ui`.  
⚠️ The buy page uses `system-ui,sans-serif` inline — that is a bug. Standardize to Arial.

| Role             | Classes                              |
|------------------|--------------------------------------|
| Page heading     | `text-2xl font-black`                |
| Section heading  | `text-xl font-black`                 |
| Bundle size      | `text-3xl font-black leading-none`   |
| Price            | `text-xl font-black {net.textColor}` |
| Body             | `text-sm`                            |
| Label            | `text-xs font-semibold text-gray-600`|
| Micro label      | `text-[10px] font-black`             |
| Muted / caption  | `text-xs text-gray-400`              |

`font-black` (900) is the brand's bold weight — use it for prices, sizes, and headings. Never `font-bold` on a price.

---

## Spacing & Shape

- **Border radius**: `rounded-xl` (inputs, small buttons), `rounded-2xl` (cards, modals), `rounded-full` (badges, chips, avatars)
- **Card padding**: `p-4` (compact), `p-6` (standard modal section)
- **Form spacing**: `space-y-4` between fields
- **Gap between chips/badges**: `gap-1.5` or `gap-2`
- **Section spacing**: `space-y-3` inside cards

---

## Canonical Components

### Dark page card (buy page, admin)
```tsx
<div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 16, padding: 16 }}>
  ...
</div>
```

### Bundle card (light, on dark background)
```tsx
<div className="relative bg-white border-2 rounded-2xl p-4 flex flex-col gap-2 hover:shadow-lg transition-all hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer border-gray-100">
  ...
</div>
```
Popular bundle: replace `border-gray-100` with `{net.borderColor}`.  
Best value: replace with `border-emerald-400`.

### Primary button
```tsx
<button className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors text-sm">
  Pay GH₵X.XX via Paystack
</button>
```

### Network buy button (inside bundle card)
```tsx
<button className={`w-full ${net.bgColor} hover:opacity-90 active:opacity-75 text-white font-bold py-2 rounded-xl transition-opacity text-xs`}>
  Buy Now ⚡
</button>
```

### Yellow CTA (nav / high-visibility)
```tsx
<button className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-black text-sm px-4 py-1.5 rounded-xl transition-colors">
  Buy Data ⚡
</button>
```

### Text input (light form)
```tsx
<input
  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
/>
```

### Badge / network pill
```tsx
<span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${net.bgLight} ${net.textColor}`}>
  MTN
</span>
```

### Status banner (inline alert)
```tsx
// Error
<div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">{message}</div>

// Warning
<div className="bg-amber-50 border border-amber-300 text-amber-800 text-sm px-3 py-2 rounded-lg">{message}</div>

// Info
<div className="bg-blue-50 border border-blue-100 text-blue-700 text-xs px-3 py-2 rounded-xl">{message}</div>

// Success
<div className="bg-green-50 border border-green-100 text-green-700 font-semibold text-sm px-3 py-2 rounded-xl">{message}</div>
```

### Modal wrapper
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
    ...
  </div>
</div>
```

### Loading spinner
```tsx
<div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
```

### Nav (sticky, dark)
```tsx
<nav className="sticky top-0 z-40 bg-[#0d1b2e]/95 backdrop-blur border-b border-[#1e3a5f]/60 h-14 flex items-center px-4 gap-3">
```

---

## Page Structure Pattern (dark pages)

```tsx
const D = { bg: "#0d1117", card: "#161b22", border: "#21262d", text: "#e6edf3", muted: "#8b949e" };

<div style={{ background: D.bg, minHeight: "100vh", color: D.text, fontFamily: "Arial, Helvetica, sans-serif" }}>
  ...
</div>
```

---

## Network Selector (pill tabs)
```tsx
<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
  {NETS.map(n => (
    <button
      key={n.id}
      onClick={() => setActiveNet(n.id)}
      style={{
        background: activeNet === n.id ? n.color : "transparent",
        color: activeNet === n.id ? n.text : D.muted,
        border: `2px solid ${activeNet === n.id ? n.color : D.border}`,
        borderRadius: 9999, padding: "6px 18px", fontWeight: 700, fontSize: 14,
        cursor: "pointer", transition: "all 0.15s",
      }}
    >
      {n.label}
    </button>
  ))}
</div>
```

---

## Mobile-First Rules

Most EliteData customers are on low-end Android devices over mobile data. This shapes every decision:

1. **Minimum tap target**: 44×44 px — never smaller for interactive elements
2. **Touch feedback**: always include `active:scale-[0.98]` or `active:opacity-75` on tappable cards
3. **Bundle grid**: `grid-cols-2` on mobile, `grid-cols-3` on `md:` — never 1-col (wastes space) or 4-col (too small)
4. **Font size**: never smaller than `text-xs` (12px) for readable content; `text-[10px]` only for micro-labels (badges, timestamps)
5. **No hover-only states**: always pair `hover:` with a touch-accessible `active:` equivalent
6. **Modal scroll**: modals must have `max-h-[90vh] overflow-y-auto` — keyboards push content up on mobile
7. **Form inputs**: `py-2.5` minimum padding — `py-2` is too tight on mobile keyboards

---

## What NOT to do

- No new font families — Arial only
- No gradients except the nav drawer (`bg-linear-to-b from-[#0d1b2e] to-[#080f1e]`)
- No box shadows on dark cards — use border instead
- No purple/violet except for Mashup network identity
- Do not flip the checkout modal to dark — it stays white for trust
- Do not use `font-bold` (700) on prices or bundle sizes — always `font-black` (900)
