# MANAN — fashion e-commerce demonstration

A complete online store for a **fictional** premium Mongolian fashion label, built by
[Ursgal Digital](https://ursgal-digital.vercel.app) as a portfolio demonstration. The brand,
products, prices, stock and sample orders are invented; the system is real: a Postgres
database, variant-level inventory, server-priced checkout, an admin dashboard and a shopping
assistant that answers from the database.

| | |
|---|---|
| Store | https://manan-store.vercel.app |
| Admin | https://manan-store.vercel.app/admin/login → «Демо горимоор нэвтрэх» (no password) |
| Portfolio | https://ursgal-digital.vercel.app/portfolio/fashion |

Everything customer-facing is in Mongolian; prices are integer tögrög (`219,000₮`).

## What is real and what is simulated

| Area | Status |
|---|---|
| Catalogue, 30 products, 168 colour × size variants, images | **Real** — read from Postgres on every page |
| Stock per variant, low-stock / sold-out states | **Real** — live, enforced by the database (`stock >= 0`) |
| Cart (per browser, no account) | **Real** — stored in Postgres, re-priced from the database |
| Checkout, order creation, stock reservation | **Real** — one transaction with row locks; cannot oversell |
| Order statuses, cancellation returning stock, inventory ledger | **Real** |
| Admin: products, variants, stock adjustments, orders, customers, settings | **Real** (owner account); the public demo is restricted |
| Shopping assistant | **Real** — catalogue mode (deterministic, database-only) on the live demo; AI mode (OpenAI tool calling + fact check) when a key is configured |
| QPay | **Simulated** — clearly labelled; the QPay adapter is built but the demo never takes money |
| Delivery, e-mail, SMS | **Not performed** — demo only |
| Newsletter | Stores the address; no e-mails are sent |
| Brand, products, prices, sample orders, policies | **Fictional** |

## Stack

Next.js 16.4 (App Router, Cache Components, Partial Prefetching) · React 19 · TypeScript ·
Tailwind CSS 4 · PostgreSQL (Neon) via Drizzle ORM · zod 4 · Vitest · Playwright · Vercel.
The structure follows Ursgal's cleaning-platform codebase (services take a `ServiceContext`,
server actions validate → authorize → call service).

## Local development

```bash
npm install
cp .env.example .env.local     # set SESSION_SECRET (32+ chars), ADMIN_EMAIL / ADMIN_PASSWORD
npm run db:dev                 # own terminal: local PostgreSQL; the first run migrates and seeds it
npm run dev                    # http://localhost:3200
```

Local development and tests use only the local database from `npm run db:dev` (`DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54328/manan_dev`, data in `.dev-db/`). The production database URL is set only in the Vercel project; never put it in `.env.local`.

| Command | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js on port 3200 |
| `npm run db:dev` | local development PostgreSQL (first run: migrate + seed); keep it running while you work |
| `npm run lint` · `typecheck` | ESLint (incl. React Compiler rules) · `tsc --noEmit` |
| `npm test` | unit + integration (integration starts its own throwaway Postgres — never the live DB) |
| `npm run test:e2e` | Playwright shopping-to-admin journey (`E2E_BASE_URL=https://… npm run test:e2e` for a deployed site) |
| `npm run db:migrate` · `db:seed` · `db:generate` | migrations (additive), seed (adds only what is missing), new migration from `schema.ts` |
| `npm run images:build` | download, crop and encode catalogue photos from `scripts/images/manifest.json` |
| `npm run assistant:smoke` | ask the assistant the reference questions and check every amount against the database |
| `npm run check` | lint + typecheck + tests + build |

## Accounts

- **Public demo** — `/admin/login` → «Демо горимоор нэвтрэх». A 4-hour session on the `demo`
  role: sees sample data plus orders placed from the same browser, may move *its own* orders
  through their statuses; cannot edit products, stock or settings; never sees other visitors.
- **Owner** — e-mail and password set once through `ADMIN_EMAIL` / `ADMIN_PASSWORD` when
  seeding. Never published. Change it under Admin → Тохиргоо.

## Documentation

- [docs/BRAND.md](docs/BRAND.md) — name directions, identity, voice
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — layers, caching, data flow, demo scope
- [docs/DATABASE.md](docs/DATABASE.md) — schema, invariants, inventory ledger, seed
- [docs/ASSISTANT.md](docs/ASSISTANT.md) — how the assistant stays truthful; enabling AI mode
- [docs/SECURITY.md](docs/SECURITY.md) — controls and what they protect
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Vercel, environment variables, cron, QPay activation
- [docs/IMAGE_CREDITS.md](docs/IMAGE_CREDITS.md) — every photo, photographer and licence

The brand name lives in one place: `src/lib/brand.ts`.
