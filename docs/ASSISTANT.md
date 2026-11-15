# Shopping assistant

MANAN's assistant is the Lorentz commerce chatbot (Ursgal's flagship, `github-v1/eyebrow` at
`69e4110`) adapted to a clothing store. The conversation engine pattern, the Mongolian language
bridge, hand-over, the safe order confirmation, model routing and the fact check come from
Lorentz; everything that knows about clothes — colour × size variants, sizes, the purchase steps,
MANAN's checkout and admin — is MANAN's own. **The database is the only source of facts**: there
is no product list, price or stock number in any prompt or rule file.

## What it does

- Understands Mongolian in Cyrillic, Latin letters (`har hoodie L razmer bga yu`), glued and
  informal spellings (`unehedve`, `bnuu`, `худи`), Cyrillic size letters (`Л размер`) and simple English.
- Answers from the live catalogue: products, categories, collections, prices (including per-size
  prices such as XXL), colours, sizes, **exact colour × size stock**, material, care, fit, the
  size chart, delivery, returns, exchange, payment, ordering and order status.
- Never confuses product stock with variant stock, black with navy, or M with L. When the asked
  variant is sold out it says so and offers the in-stock alternatives (same colour in other sizes,
  same size in other colours).
- Keeps context: the product page that is open, the product being discussed, the colour and size
  already chosen ("Хар өнгө байгаа юу?" → "L размер?" checks black L), numbered lists ("2",
  "эхнийх нь", "2 L размер байгаа юу?").
- Recommends and searches by type, price limit, colour, size, season and audience; compares products.
- Never invents garment facts: material/care/fit are quoted as published; a missing fact is said
  to be missing. Size advice shows the owner's size chart and the product's fit — it never picks a
  size from height and weight.
- Helps buy: puts the exact variant in the cart (button or "сагсанд нэм"), or takes the order in
  the chat after an explicit confirmation (below).
- Hands over to a person on request, complaint, payment claim or a failed chat order.

## Layout

| Layer | Module | Origin |
| --- | --- | --- |
| Mongolian text bridge (Latin → Cyrillic, glued words, slang, phonetic matching) | `lib/chat/text.ts` | Lorentz `textNorm.ts`, cosmetics words removed |
| Intents: hand-over triggers, yes/no, purchase, greetings, numbered picks, quantity, phone, name | `lib/chat/intents.ts` | Lorentz `turn.ts`, `purchase.ts`, `handoffDetection.ts`, `greetingPhrases.ts` |
| Hand-over reasons, auto hand-back rule | `lib/chat/handover.ts` | Lorentz `handler.ts`, `types.ts` |
| Reservation policy (hold, per-customer cap, per-item cap) | `lib/chat/reservation.ts` | Lorentz `reservationPolicy.ts` |
| Model routing, price table, budget | `lib/chat/models.ts` | Lorentz `aiUsage.ts` |
| Owner FAQ matching | `lib/chat/knowledge.ts` | Lorentz `knowledge.ts` |
| Reply fact check (amounts, counts, links, phones, e-mails, payment/order claims) | `lib/chat/verify.ts` | Lorentz `productReplyVerification.ts` |
| Analytics aggregation | `lib/chat/analytics.ts` | Lorentz `analytics.ts` |
| **Clothing vocabulary**: garments, colours (head-word hues), sizes | `lib/assistant/fashion.ts` | MANAN |
| What a message asks, which products it names | `server/assistant/understand.ts` | MANAN |
| Deterministic answers from the database | `server/assistant/answers.ts` | MANAN |
| Purchase intent and the chat order draft | `server/assistant/purchase.ts` | Lorentz flow, MANAN steps |
| Chat order → checkout core | `server/assistant/chat-order.ts` | Lorentz `placeOrder.ts` pattern |
| Variant claim check for model replies | `server/assistant/variant-claims.ts` | MANAN |
| Turn pipeline (pure) | `server/assistant/turn.ts` | Lorentz layer order |
| Persistence: lease, dedup, takeover, hand-overs, budget, logs | `server/assistant/handler.ts` | Lorentz `handler.ts` |
| AI mode (tool calling) | `server/assistant/llm.ts` | MANAN prompt and tools, Lorentz strategy |

Lorentz modules that stayed out (Meta/Messenger delivery, webhook dedup, Uudam-specific travel
parts, observability sinks, Prisma adapters) have no use in a website-only Next.js/Drizzle store.

## Turn order (`turn.ts`)

0. Hand-over triggers: payment claim → complaint → request for a person / frustration.
1. Purchase layer: an active chat-order draft, or purchase intent.
2. Orders: number + phone (status only, phone must match), this browser's orders, tracking help.
3. Thanks / greeting / bare yes-no.
4. The owner's FAQ (verbatim), then policies (delivery time, delivery, returns, exchange,
   payment, ordering, change order, contact, size chart).
5. Product answers (deterministic): named, picked by number, or in focus.
6. Search / browse with filters.
7. AI writer behind the fact check — open questions, recommendations, phrasing the rules missed.
8. Honest fallback: "not in our data", what can be asked, and (when repeated) the way to a person.

## AI mode and the model strategy

Lorentz's approved strategy: rules first for exact facts, the model for open questions, every
model reply verified. The model is chosen in Admin → AI чатбот → Чатботын тохиргоо from an
allow-list (`gpt-4.1-mini` default — same held-out accuracy as gpt-4.1 at about a fifth of the cost
in Lorentz's comparison; `gpt-4.1`; `gpt-4o-mini`), else `OPENAI_MODEL_ASSISTANT` when it has a
known price, else `gpt-4.1-mini`.

- The system prompt is MANAN's own (clothing, variant exactness, no invented garment facts, never
  claim an order or payment) and carries only the conversation memory — no catalogue.
- Tools: `search_products`, `get_product`, `check_stock`, `compare_products`, `get_policy`,
  `get_size_guide`, `list_categories`; the first step must call a tool.
- The fact check rejects amounts not returned this turn, stock counts not from `check_stock`,
  links to pages that do not exist or leave the site, unknown phones/e-mails, claims that an order
  was created or paid, percentages, and any line whose colour × size availability or count differs
  from the database. One corrective retry; then the rules answer instead, and the rejection is
  logged under Admin → Асуудал, алдаа.
- **Without `OPENAI_API_KEY` the assistant runs in catalogue mode** (everything above except
  step 7). No key from another business is used. To enable AI mode, create a project key with a
  monthly limit for this store only and add it as a sensitive Vercel variable:
  `vercel env add OPENAI_API_KEY production --sensitive`.

## Chat orders

Steps: product → exact colour and size (sold-out → alternatives) → quantity → server-priced offer
(with the cart button) → «энд захиалъя» → name and phone → delivery method and address → full
summary (items, delivery fee, total, QPay simulation, payment window) → **«тийм»** → the order.

- Created through `createOrderInTx`, the same core as the cart checkout: variant rows locked,
  stock re-checked, prices and delivery fee from the database, line snapshots, stock reserved in
  the ledger. One order system.
- Exactly once: `orders.idempotency_key` (unique) = `chat:<conversation>:<draft>`; a repeated or
  concurrent «тийм» returns the existing order. A price change between summary and confirmation
  shows the new total first; a sold-out variant refuses the order.
- Reservation policy (owner-editable): the order holds stock for 60 minutes unpaid, one unpaid chat
  order per browser at a time, at most 5 units of one option. Expired holds are released (cancel +
  restock, once) by the next chat order of that browser, the assistant's minute sweep and the daily cron.
- Payment: QPay only, on the order page; in the demo it is the labelled simulation and is recorded
  as `simulated` — never `paid`. The assistant never says anything is paid.
- The admin's test chat gets simulated orders (`TEST-…`): nothing is created, no stock moves.

## Hand-over

A request for a person, a complaint, a payment claim or a failed chat order opens a hand-over
(`chat_handovers`) with the reason and what the chat established: products discussed, the chosen
colour/size, purchase intent and draft step, the last customer messages, name and phone if given.
The assistant keeps answering until a person **takes the chat over**; then it is silent, customer
messages wait for staff, and the widget shows staff replies (it polls with back-off only while a
person is involved). Staff hand the chat back explicitly; after `handoverAutoResumeHours` (24 by
default) of staff silence it returns on its own. A reply that was being written by the model when
a person took over is not published.

## Admin → AI чатбот

Тойм (status, mode, today's spend, attention list, funnel) · Яриа (transcripts, context, take over /
reply / hand back, notes) · Харилцагчийн асуулт (unanswered, not in the catalogue, sold-out demand) ·
Ажилтанд шилжүүлэх (queue) · Мэдлэг (what the assistant reads; owner FAQ — products and policies
stay in their own admin pages) · Чатботын тохиргоо · Шинжилгээ · AI хэрэглээ, зардал · Үйл явдлын
түүх · Асуудал, алдаа · Чатбот турших. The public demo sees sample chats and its own browser's,
may take over and answer only its own, and cannot change settings or knowledge.

## Abuse and cost controls

Same-origin JSON only, 8 KB body limit, 1,200 characters per message. Per hashed IP: 12 messages /
5 min, 60 / day, 240 polls / hour; one turn at a time per conversation (lease); retried sends are
deduplicated by the browser's message id. AI spend is estimated per call in `ai_usage` (model,
tokens, cost, source); over the owner's daily budget (default `AI_DAILY_BUDGET_USD` = $1; 0 turns AI
off) the assistant answers from its rules until the next Ulaanbaatar day.

## Evaluation

`tests/eval/mongolian-cases.ts` — 102 conversations (Cyrillic, Latin, informal, context, hand-over,
ordering) run through the real handler on a fresh seeded database; all must pass in `npm test`.
The engine was tuned against it, so the honest number is the **held-out** set
(`tests/eval/heldout-cases.ts`, 30 conversations written afterwards and run once without tuning):
see `docs/assistant/EVAL.md` and `docs/assistant/EVAL_HELDOUT.md`.

```bash
ASSISTANT_EVAL_REPORT=1 ASSISTANT_EVAL_HELDOUT=1 npx vitest run tests/integration/assistant-eval.test.ts
```

`npm run assistant:smoke` asks the reference questions through the real pipeline (as an admin test
chat) and checks every amount against the database.
