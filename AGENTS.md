# EliteData — Definitive Project Rules for AI Agents

## ⚠️ CRITICAL: Next.js 16 Breaking Conventions

This project runs **Next.js 16.x** (App Router). Next.js 16 has renamed and restructured
several APIs compared to what AI training data knows. Violating these rules WILL break the build.

### Middleware file = `proxy.ts`, NOT `middleware.ts`
- Next.js 16 uses `proxy.ts` at the project root as the edge middleware file
- The exported function must be named `proxy` (not `middleware` or `default`)
- Having BOTH `middleware.ts` AND `proxy.ts` causes a **fatal build error**
- NEVER create `middleware.ts` — always put edge logic in `proxy.ts`

```ts
// ✅ CORRECT — proxy.ts
export function proxy(request: NextRequest) { ... }
export const config = { matcher: [...] };

// ❌ WRONG — never create middleware.ts
export function middleware(request: NextRequest) { ... }
```

### App Router only — no Pages Router
- All routes live under `app/` using the App Router file conventions
- No `pages/` directory exists or should be created
- Use `app/api/*/route.ts` for API routes (not `pages/api/`)
- Layouts: `app/layout.tsx` (root), no sub-layouts exist — the root layout handles everything

### Server Components by default
- Every file in `app/` is a Server Component unless it has `"use client"` at the top
- `headers()`, `cookies()` from `next/headers` are async in Next.js 16 — always `await` them
- `params` and `searchParams` in page/layout props are also async — always `await` them

---

## Actual Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.x App Router (TypeScript) |
| Database | Supabase (PostgreSQL) |
| Auth | Cookie-based admin session (`admin_session` cookie vs `ADMIN_SESSION_TOKEN` env var) |
| Payments | Paystack (inline + webhooks) |
| Styling | Tailwind CSS + inline styles (dark theme, custom design system) |
| Notifications | Telegram Bot API, SMS via MessagePilot, WhatsApp API |
| Data delivery | Inventor API (`INVENTOR_API_BASE_URL` + `INVENTOR_API_KEY`) |
| Deployment | Vercel (primary/frontend) + Render (backend/standalone fallback) |
| Edge rules | `vercel.json` for headers/redirects/crons; `proxy.ts` for per-request logic |

---

## Project: Elite Data — Ghana Data Bundle Platform

A B2C and B2B platform for selling MTN, Telecel, and AirtelTigo data bundles and
BECE/WASSCE exam vouchers in Ghana. Customers pay via Paystack (card or Mobile Money).

### Core Order Flow (CRITICAL — do not break this)
1. Customer pays via Paystack
2. Order saved to Supabase `orders` table with `status: "pending_approval"`
3. Admin receives Telegram notification with ✅ Approve / ❌ Reject inline buttons
4. Admin can ALSO approve/reject from the admin dashboard Approval Queue tab
5. On approval → Inventor API called → data delivered → customer gets SMS
6. On rejection → order marked `rejected` → customer gets SMS
7. Agent commission is credited **only at approval time**, not at order creation

### Order statuses
`pending_approval` → `processing` (approved, Inventor called) → `completed`
`pending_approval` → `rejected` (admin rejected)
`pending_approval` → `failed` (approved but Inventor API failed)
`pending` = legacy status (pre-approval-gate orders)

---

## Key Files — What They Do

### Edge & Security
- **`proxy.ts`** — Edge middleware: admin session guard, nonce-based CSP per request, sets `x-pathname` and `x-nonce` request headers. THIS IS THE ONLY MIDDLEWARE FILE.
- **`vercel.json`** — CDN-level headers (HSTS, X-Frame-Options, etc.) and cron jobs. Does NOT contain CSP (proxy.ts handles it with nonces per request).
- **`next.config.ts`** — Non-CSP security headers for Render/standalone deployment. `output: "standalone"` is required for Render.

### Database
- **`lib/supabase.ts`** — Single Supabase client using service role key (`SUPABASE_SERVICE_ROLE_KEY`). Service role bypasses RLS. Never expose this key client-side.
- The anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) IS exposed to browsers — RLS must be properly configured on all tables.

### Notifications
- **`lib/telegram.ts`** — Sends messages to admin Telegram. `sendAdminAlert(text, keyboard?)` for admin bot. `orderApprovalKeyboard(ref)` generates Approve/Reject inline buttons.
- **`lib/sms.ts`** — SMS via MessagePilot. `sendCustomerSMS(phone, message)`, `orderDeliveredSMS(...)`, `orderFailedSMS(...)`.
- **`lib/whatsapp.ts`** — WhatsApp notifications.

### Payments
- **`app/api/orders/create/route.ts`** — Main order creation. Validates payment with Paystack, saves order as `pending_approval`, sends Telegram approval notification.
- **`app/api/webhooks/paystack/route.ts`** — Paystack webhook handler. Also saves orders as `pending_approval`.
- **`app/api/vouchers/create/route.ts`** — Voucher order creation. Same `pending_approval` flow.

### Admin
- **`app/api/telegram/webhook/route.ts`** — Handles Telegram bot commands and inline button callbacks (approve_order, reject_order). Verifies `WEBHOOK_SECRET` header AND `from.id === ADMIN_CHAT_ID`.
- **`app/api/admin/orders/approve/route.ts`** — REST endpoint for admin dashboard to approve/reject orders. Checks `admin_session` cookie. Takes `{ references: string[], action: "approve" | "reject" }`.
- **`app/api/admin/stats/route.ts`** — Returns all dashboard stats. Requires admin cookie.
- **`app/admin/page.tsx`** — Admin dashboard (client component, ~2500 lines). Has Sidebar, OrdersView, AgentsView, etc. Contains an "Approval Queue" tab for approving/rejecting pending_approval orders.

### Agent System
- Agents have types: `"standard"` (commission on sales) or `"custom_price"` (set their own prices)
- Custom price agents with `plan: "free"` use wallet balance deducted at approval time
- Agent commissions are stored in `commission_balance` and withdrawn on request

---

## Supabase Tables (Key Ones)

| Table | Purpose | RLS |
|---|---|---|
| `orders` | All orders | Enabled — service role for server, restricted for anon |
| `bundle_prices` | MTN/Telecel/AT bundle prices | Enabled — public SELECT only |
| `mashup_bundles` | Mashup bundle prices | Enabled — public SELECT only |
| `agents` | Agent accounts | Enabled |
| `custom_tier_prices` | Per-agent custom prices | Enabled |
| `agent_bundle_prices` | Agent-specific bundle prices | Enabled |
| `system_settings` | Key-value settings (helpline_enabled, etc.) | Enabled |

---

## Environment Variables (Never hardcode, never log)

```
NEXT_PUBLIC_SUPABASE_URL          — Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY     — Supabase anon key (public, browser-safe)
SUPABASE_SERVICE_ROLE_KEY         — Supabase service role (server-only, bypasses RLS)
ADMIN_SESSION_TOKEN               — Admin login password / session cookie value
TELEGRAM_ADMIN_BOT_TOKEN          — Bot token for admin notifications
TELEGRAM_ADMIN_CHAT_ID            — Admin's Telegram user ID (used to verify button clicks)
TELEGRAM_WEBHOOK_SECRET           — Secret token Telegram includes in webhook POST headers
PAYSTACK_SECRET_KEY               — Paystack secret (server-only)
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY   — Paystack public key (browser-safe)
INVENTOR_API_KEY                  — Inventor data API key (server-only, NEVER log or echo)
INVENTOR_API_BASE_URL             — Inventor API base URL
SITE_URL                          — https://elitedata1.com
```

---

## Coding Rules (Non-Negotiable)

1. **Never break the approval gate** — all orders MUST go through `pending_approval` before the Inventor API is called. Do not reintroduce direct delivery.
2. **Never log or echo `INVENTOR_API_KEY`** — treat it like a password.
3. **Admin API routes must check the cookie** — call `isAdmin()` at the top of every admin route.
4. **Telegram webhook must verify both** — `WEBHOOK_SECRET` header AND `from.id === ADMIN_CHAT_ID` before acting on any callback.
5. **`proxy.ts` sets CSP** — never add `Content-Security-Policy` to `vercel.json` or `next.config.ts` (it would duplicate the nonce-based header and break the site).
6. **Service role key stays server-side** — it is used in `lib/supabase.ts` which is only ever imported by server components and API routes. Never import it from a client component.
7. **Run `npx tsc --noEmit` before every commit** — zero TypeScript errors required.
8. **Test the build with `npm run build`** — the Supabase URL error is expected locally (env vars not in `.env.local`); what matters is no compilation errors.
