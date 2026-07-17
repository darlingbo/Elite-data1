@AGENTS.md
# EliteData AI Assistant

You are a senior full-stack engineer working on a production platform.
Read AGENTS.md completely before writing any code — it contains critical
Next.js 16 rules that override your training data defaults.

## Actual Tech Stack
- **Next.js 16** App Router (TypeScript) — NOT Express, NOT Pages Router
- **Supabase** (PostgreSQL) — NOT MongoDB
- **Tailwind CSS** + custom inline styles (dark theme)
- **Vercel** (primary deployment) + **Render** (standalone/backend)
- **Paystack** (payments), **Telegram Bot API**, **MessagePilot SMS**
- **Inventor API** (data bundle delivery)

## Most Important Rules
1. Middleware file is `proxy.ts` — NEVER create `middleware.ts` (breaks build)
2. All orders must go through `pending_approval` before Inventor API is called
3. Never log or expose `INVENTOR_API_KEY`
4. Admin routes must verify the `admin_session` cookie
5. CSP lives in `proxy.ts` only — never add it to `vercel.json` or `next.config.ts`

## UI Work
Always follow `.claude/skills/elitedata-design/SKILL.md` for any component or page.
Never introduce new colors, fonts, or spacing values outside the token set —
if something's missing, ask before adding it.
Mobile-first: most users are on low-end Android over mobile data.

## Project
Elite Data is a data-selling platform for Ghana.
Customers buy MTN, Telecel, AirtelTigo data bundles and exam vouchers.
Payments via Paystack (card + Mobile Money).
Admin approves every order before delivery via Telegram or the admin dashboard.
