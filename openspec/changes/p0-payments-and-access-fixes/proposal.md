# Proposal

## Why

Five P0 issues put money, security or access at risk: the payment page shows a hardcoded $1,000 balance and lets a tenant charge any amount (#36), the Stripe webhook can lose payments silently and mis-file them by month (#37), the session cookie lives 13.7 years in the browser (#54), admins crash on tenant-only pages (#42), and Stripe test and live setups are unclear (#83). Fixing them together keeps one QA pass on the payment flow.

## What Changes

- **#54:** the session cookie's `maxAge` is 5 days (seconds, not milliseconds).
- **#42:** admins opening `/maintenance`, `/insurance`, `/payment` (and `/payment/success`) are redirected to `/admin`; `/admin` gets its own server-side admin check.
- **#37:** every webhook write is awaited (a failed write returns 500 so Stripe retries); the transaction fee is recorded on the transaction; the month is chosen in the business time zone (America/Indiana/Indianapolis); the rent amount no longer depends on the literal line description.
- **#36:** the payment page shows the real balance and due date from `payment_history`; the server rejects any payment above the total owed (400); Stripe success and cancel return to real pages (a new `/payment/success` confirmation page); `amount * 100` is rounded.
- **Move-in month (new data):** `junction_user_property` documents gain `moveInMonth` (`YYYY-MM`), set when an admin assigns a tenant and editable afterwards, so unpaid past months carry over into the balance.
- **#83:** a startup guard refuses a live Stripe key outside production and warns (does not stop) when production uses a test key; the key and webhook setup is documented next to `.env.example`.
- No **BREAKING** changes. Existing tenants have no `moveInMonth` and count only the current month until an admin sets one.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `rent-payments`: real balance and due date, server-side payment cap, confirmation page, webhook reliability and fee recording, Stripe key-mode safety.
- `access-control`: tenant-only routes redirect admins; `/admin` is enforced on the server.
- `authentication`: the session cookie's browser lifetime matches its 5-day validity.
- `tenant-assignment`: a tenant's move-in month is stored and editable.

## Impact

- Code: `src/routes/api/signin`, `src/routes/(authenticated)` layout, `payment` page (new load, new `success` page), `admin` page, `api/stripe/*`, `api/property/[propertyId]/tenants`, the property edit page's Tenants tab, `src/lib/server/stripe.ts`, a new `src/lib/server/payments.ts`.
- Data: `moveInMonth` on junctions; optional `fee` on `payment_history` transactions. No migration script.
- Rollout: no new secrets. Human tasks (not part of this change): separate Stripe sandbox for dev, activating the Stripe account for live mode, and replacing test customer ids at that point. Production payments are test payments until then.
- Tests: handler tests for each endpoint and load, unit tests for the balance calculation, an e2e extension for the payment page.
