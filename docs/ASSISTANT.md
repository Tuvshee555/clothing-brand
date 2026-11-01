# Shopping assistant

The assistant answers questions about products, colours, sizes, stock, prices, delivery,
returns, exchanges, payment and ordering — **only from the database**. There is no product list
in any prompt.

## Database tools (`src/server/assistant/tools.ts`)

`search_products` (query, category, colour, size, price range, in-stock, audience, tag, sort) ·
`get_product` · `check_stock` (exact live counts per colour/size) · `compare_products` ·
`get_policy` (delivery incl. fees from `shipping_methods`, returns, exchange, ordering,
payment, privacy) · `list_categories`. Each request loads the catalogue fresh (no cache).

## Two modes

1. **Catalogue mode** (live demo default) — a deterministic Mongolian understanding layer
   (`lib/assistant-parse.ts`: price limits like «200,000₮-өөс доош», sizes, colours, intents)
   composes answers directly from tool results. It cannot invent anything.
2. **AI mode** — enabled when `OPENAI_API_KEY` is set (model `OPENAI_MODEL_ASSISTANT`,
   default `gpt-4.1-mini`). OpenAI tool calling over the same tools:
   - the first step **must** call a tool (`tool_choice: required`);
   - after the answer, a **fact check** rejects any ₮ amount or stock count that did not come
     from this turn's tool results, and any link to a product that does not exist; one
     corrective retry, then the answer falls back to catalogue mode;
   - links are normalised to the store's own relative paths.

`npm run assistant:smoke` asks the reference questions through the real pipeline and checks
every amount against the database.

## Abuse and cost controls

Same-origin JSON only, 24 KB body limit, 1,200 characters per message, 10 messages of history.
Rate limits per hashed IP: 12 messages / 5 min, 60 / day. AI spending is logged in
`store.ai_usage`; when the day's estimated spend reaches `AI_DAILY_BUDGET_USD` (default 1) the
assistant switches to catalogue mode until the next day (Ulaanbaatar time).

## Enabling AI mode on the live demo

The only OpenAI key found on the development machine belongs to the Uudam production chatbot,
so it was **not** deployed (a public endpoint must not be able to exhaust a client's credits).
To enable AI mode: create a dedicated project key with a monthly limit, then

```bash
vercel env add OPENAI_API_KEY production --sensitive
vercel deploy --prod
```

AI mode was verified locally with 15 answers (≈ $0.016 of usage).
