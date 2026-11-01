# Security

| Threat | Control |
|---|---|
| Price manipulation | The browser never sends prices. Checkout recomputes line prices, delivery fee and total from the database; unknown fields are stripped by zod; a stale total refuses the order. |
| Overselling / race conditions | Variants locked `FOR UPDATE` in a stable order inside one transaction; atomic `stock = stock + delta WHERE stock + delta >= 0`; `CHECK (stock >= 0)` in the database. Tested with two concurrent buyers of the last unit. |
| Unauthorised stock or catalogue changes | Only server actions change data; every action re-checks the session and permission (`runAdminAction`); the storefront has no stock-writing path. |
| Public demo misuse | `demo` role: no catalogue/stock/settings/upload permissions; status changes only on orders from the same browser; scoped queries hide other visitors' orders and customers; 4-hour sessions; per-user admin write rate limit. |
| Personal data | Visitor details are visible only to that browser (cookie-bound, hashed visitor id) and the owner; anonymised after 30 days; phone numbers masked where lists don't need them. Sample data uses impossible `0000…` numbers. |
| Order page enumeration | Order pages need the secret link token (sha256 stored) or the placing browser; unknown → 404 with no data. |
| Credentials | scrypt password hashes; constant-time login for unknown e-mails; login rate-limited per IP and per e-mail; sessions are random tokens stored as sha256; httpOnly, Secure, SameSite=Lax cookies. No default passwords; the owner password is set once from an environment variable. |
| Secrets | Only on the server (no `NEXT_PUBLIC_` secrets); `.env*` git-ignored (the repository is public); production values stored as Vercel *sensitive* variables; live QPay credentials not deployed; the dashboard never shows keys. |
| Payments | QPay simulation by default; real QPay requires `QPAY_MODE=production` **and** `QPAY_ALLOW_LIVE_PAYMENTS=true`; sandbox mode ignores a live base URL; payment is confirmed only by QPay's `payment/check`, never by a callback body. |
| SQL injection | Drizzle parameterised queries; `LIKE` input escaped; URL filter values allow-listed. |
| Abuse / cost | Postgres-backed rate limits (login, demo entry, cart, checkout, payments, newsletter, uploads, assistant, admin writes); daily AI budget; request size limits. |
| Clickjacking & co. | `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`, `nosniff`, HSTS, strict referrer policy. |
| Indexing a fake shop | `noindex` on every page by default (`STORE_INDEXING`), admin/API/cart/checkout disallowed in robots.txt. |

Database: RLS is enabled on every table (no policies) as defence in depth — the application
connects as the table owner; any future anonymous Data API role would see nothing.
