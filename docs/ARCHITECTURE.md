# Architecture

```
src/lib/chat/     the generic chat engine pieces ported from Lorentz (text bridge, intents, hand-over,
                  reservation policy, model routing, fact check, analytics)
src/lib/assistant/  clothing vocabulary (garments, colours, sizes) and assistant settings
src/lib/          isomorphic, pure: catalogue filter/search, price-limit parser, status
                  machine, money, regions, roles, validation (zod, Mongolian messages), loaders
src/server/
  db/             Drizzle schema (Postgres schema "store") and the pool
  auth/           sessions (hashed tokens, httpOnly cookie), scrypt passwords, page/action guards
  security/       HMAC helpers, Postgres-backed rate limits
  services/       business logic — take a ServiceContext {db, actor, now}; no Next.js imports
  queries/        read models (cached catalogue/settings, actor-scoped admin queries)
  actions/        'use server' wrappers: validate → authorise → service → cache invalidation
  assistant/      the shopping assistant (Lorentz engine adapted to clothing): understanding,
                  database answers, purchase draft, chat orders, persistence, AI mode — see ASSISTANT.md
  payments/       QPay adapter + labelled simulation
  storage/        Cloudinary signed uploads (admin photos)
  seed/           launch catalogue, content and sample orders (read once by the seed)
src/app/(store)/  storefront           src/app/admin/  (auth) login, (panel) dashboard
src/app/api/      assistant, health, QPay callback, cron
```

## Data flow

- **Catalogue pages** read `getCatalog()` / `getProductDetail()` — `'use cache'` functions tagged
  `catalog`. Every server action that changes products, stock or orders calls
  `updateTag('catalog')`, so listings never show stale availability. Pages are partially
  prerendered: the static shell is served from the CDN and per-request data streams in.
- **Live stock** on the product page is read uncached (`getVariantStock`) on every request.
- **Cart** is a Postgres row per browser (`carts.token_hash` = HMAC of a random httpOnly
  cookie). Lines store only variant + quantity; prices are always read from the catalogue.
- **Checkout** (`services/checkout.ts`) runs in one transaction: lock the cart's variants
  (`SELECT … FOR UPDATE`, stable order), re-check availability, compute prices, delivery fee and
  total from the database, write the order and immutable line snapshots, reserve stock through
  the ledger. The browser sends contact/delivery details and the total it *saw*; a mismatch
  refuses the order and shows the new total.
- **Orders** move through `lib/orders.ts` transitions only. Cancelling returns reserved stock.
  QPay: invoice created after the order transaction; in the demo the invoice is simulated and
  the payment is recorded as `simulated` — never `paid`.

- **Chat orders** go through the same order core (`createOrderInTx`) as the cart checkout, inside
  one transaction with an advisory lock per browser, after an explicit confirmation of a
  server-priced summary; `orders.idempotency_key` makes it exactly once.
- **The assistant** reads the catalogue, policies, size chart, owner FAQ and its settings fresh for
  every message (no cache), so an admin change reaches the next answer.

## Admin and the public demo

Roles: `owner`, `manager`, `staff`, `demo` (`lib/roles.ts`). Permissions are checked in every
action (`runAdminAction`) and page (`requireAdminPage`); hidden buttons are not security.
The demo role is additionally **scoped**: `orderScope()` limits orders/customers to sample data
plus the visitor's own browser (`sessions.visitor_id` = hashed visitor id), and
`demoCanTouch()` limits status changes to the visitor's own orders (checkout or chat).
`conversationScope()` / `canActOn()` do the same for chats: the demo sees sample chats and its own,
and may take over and answer only its own.

## Daily maintenance

`/api/cron/maintenance` (Vercel Cron, 03:00 Ulaanbaatar, `CRON_SECRET`) cancels visitor orders
left open > 48 h (returning stock), releases expired chat-order holds, restores the seeded shelf (counting units reserved by open
orders), anonymises visitor-entered details and deletes visitor chats after 30 days, and prunes carts,
sessions, rate-limit windows, week-old test chats and 90-day-old problem logs.
