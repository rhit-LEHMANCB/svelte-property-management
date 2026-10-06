# Design

## Context

See proposal.md for motivation. Current state that shapes the approach:
- `payment_history/{year}` holds one map per month name (`January`...) with `remainingBalance` and `transactions[]`. A month with no entry means nothing has been paid and nothing has been recorded.
- Properties carry `rent` but no due day. Junctions (`{tenantId}_{propertyId}`) carry only `tenantId` and `propertyId`.
- The tenant layout load (`(authenticated)/+layout.server.ts`) already resolves the tenant's property; admins get a layout with no `userProperty`.
- Handler tests run against an in-memory Firestore fake; the payment flow also has an e2e spec with a local Stripe fake.

## Goals / Non-Goals

**Goals:**
- One server-side function decides what a tenant owes; the payment page and the checkout endpoint both use it, so the displayed balance and the enforced cap cannot disagree.
- Every webhook failure that retrying can fix returns 500.

**Non-Goals:**
- Auto-pay, receipts, late fees, partial-month proration, credits for overpayment.
- De-duplicating webhook deliveries (deferred finding).
- Moving to a newer Stripe API version.

## Decisions

**Balance calculation lives in `src/lib/server/payments.ts` as pure functions.** `getMonthKey(date)` returns `{ year, month, monthName }` in the business time zone (`America/Indiana/Indianapolis`, via `Intl.DateTimeFormat`, not server locale). `computeBalance({ rent, moveInMonth, histories, now })` walks months from `moveInMonth` (or only the current month when absent) through the current month. For each month it adds `max(0, remainingBalance)` when an entry exists, else `rent`. It returns `{ balanceCents, dueDate }`; due date is the 1st of the current month when this month still has a remainder, else the 1st of the oldest unpaid month. All arithmetic is in integer cents. *Alternative:* store a running balance document that the webhook updates. Rejected: a second source of truth that can drift; computing from `payment_history` needs no migration.

**`remainingBalance` entries are trusted as-is.** A month's entry was initialised as `rent - amount` when its first payment arrived, so a later change to rent does not rewrite closed months. *Trade-off:* a rent change mid-month leaves that month at the old rent.

**Role guard by route id in the existing layout load.** The authenticated layout checks `event.route.id` against the tenant-only prefixes and, for admins, throws `redirect(303, '/admin')`. *Alternative:* a `(tenant)` route group, which moves files and touches every import. Rejected as churn; a prefix list is one place to keep. `/admin` gets a small `+page.server.ts` calling `getAdminUserDataOrError`.

**Move-in month on the junction, in business-time-zone `YYYY-MM`.** `POST` accepts an optional `moveInMonth` (default: current business month), a new `PATCH` updates it, and both validate with `^\d{4}-(0[1-9]|1[0-2])$`. The Tenants tab shows a month input per tenant. Existing junctions have no field and are read as "current month only"; no backfill script, so no one is charged for months nobody confirmed.

**Webhook reads rent and fee from invoice metadata.** Checkout's `invoice_data.metadata` gets `rentCents` and `feeCents` next to `propertyID`; the webhook uses them and falls back to the line described "Rent" for invoices created before this change. *Why:* the invoice's own metadata is under our control, while per-line metadata on invoices from Checkout is not reliably carried through. Writes are awaited and errors propagate as 500; an unknown property is logged and acknowledged 200, because retrying cannot fix it.

**Checkout caps against the same function.** The endpoint loads the junction, property and the year documents from `moveInMonth` onward, computes the balance, and returns 400 when `amountCents > balanceCents` or the amount is not a positive whole number of cents. `unit_amount` uses the rounded cents.

**Key-mode guard in `stripe.ts`.** At module load: `sk_live_`/`rk_live_` with `PUBLIC_FB_PROJECT_ID === 'lehman-realty-dev'` or any non-production id throws; a test key in production logs `console.warn`. "Production" is defined as: not the dev project (`lehman-realty-dev`) and not a test/emulator project id (the e2e and handler fixtures use their own ids). The message never includes the key.

## Risks / Trade-offs

- [A tenant starts two checkouts before the first webhook lands and pays more than owed] → known limit of checking balance at session creation; Stripe sessions are not reserved. Noted as a deferred finding.
- [A wrong `moveInMonth` makes a tenant owe too much] → admins can edit it; the default is the current month; carry-over only counts months from the stored value.
- [Production's test key means the guard can never prove production is live] → warn-only until the account is activated; revisit then.
- [Admins redirected from `/maintenance` etc. hides a broken link in admin nav] → admin nav does not link there (access-control spec); the redirect only catches typed URLs.
- [Timezone change in the future] → constant lives in one place.

## Migration Plan

No data migration. Deploy to dev, QA, then production. Existing tenants show current-month-only balances until an admin sets `moveInMonth`. Rollback: revert the PR; the extra `moveInMonth` and `fee` fields are ignored by the old code.
