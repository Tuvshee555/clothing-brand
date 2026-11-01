# Deployment

Vercel project **`manan-store`** (team `tuvshinsaihans-projects`), connected to
`github.com/Tuvshee555/clothing-brand` — every push to `main` deploys to production.
Region `iad1` (close to the Neon database in `us-east-2`). Production URL:
https://manan-store.vercel.app

## Environment variables (production)

| Name | Notes |
|---|---|
| `DATABASE_URL` | Neon pooled connection string (sensitive) |
| `SESSION_SECRET` | 32+ random characters (sensitive); keys visitor/IP hashes |
| `CRON_SECRET` | protects `/api/cron/maintenance` (sensitive) |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER` | admin photo uploads (owner only) |
| `QPAY_MODE` | `mock` — the labelled simulation |
| `STORE_INDEXING` | `noindex` |
| `AI_DAILY_BUDGET_USD` | `1` |
| `OPENAI_API_KEY` | *not set* — see docs/ASSISTANT.md |

`APP_URL` is optional; on Vercel the app uses `VERCEL_PROJECT_PRODUCTION_URL`.

## Database changes

```bash
npm run db:generate        # after editing src/server/db/schema.ts
npm run db:migrate         # applies to DATABASE_URL (create a Neon branch first if destructive)
npm run db:seed            # adds anything missing; never overwrites
```

## Activating real QPay (a real shop, not this demo)

Set `QPAY_USERNAME`, `QPAY_PASSWORD`, `QPAY_INVOICE_CODE`, then either `QPAY_MODE=sandbox`
(merchant-sandbox.qpay.mn) or `QPAY_MODE=production` together with
`QPAY_ALLOW_LIVE_PAYMENTS=true`. The callback URL is `/api/payments/qpay/callback?order=…`.

## Verify after deploying

```bash
curl https://manan-store.vercel.app/api/health          # {"ok":true,"db":"up"}
E2E_BASE_URL=https://manan-store.vercel.app npm run test:e2e
```
