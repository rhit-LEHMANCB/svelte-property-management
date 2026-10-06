# Tasks

## 1. Session cookie lifetime (#54)

- [x] 1.1 In `src/routes/api/signin/+server.ts` set the cookie `maxAge` in seconds, and extend the authentication handler test to assert `Max-Age` 432000; verify `npm run test:handlers` passes.

## 2. Role guard (#42)

- [x] 2.1 In `src/routes/(authenticated)/+layout.server.ts` redirect admins (303 to `/admin`) when `event.route.id` is `/(authenticated)/maintenance`, `/(authenticated)/insurance` or under `/(authenticated)/payment`; verify handler tests for each of the three routes plus `/payment/success` (admin redirected, tenant loads).
- [x] 2.2 Add `src/routes/(authenticated)/admin/+page.server.ts` that requires an admin; verify a handler test (tenant gets 401, admin loads) passes and update the Known Gaps in `openspec/specs/access-control/spec.md`.

## 3. Balance logic

- [x] 3.1 Add `src/lib/server/payments.ts` with `getMonthKey` (business time zone) and `computeBalance` (integer cents); verify unit tests cover: no payments, partial payment, carry-over across a year boundary, no `moveInMonth`, overpaid month floors at 0, month near midnight local time.

## 4. Move-in month (tenant assignment)

- [x] 4.1 Accept and validate `moveInMonth` in `POST` and add `PATCH` in `src/routes/api/property/[propertyId]/tenants/+server.ts`; verify handler tests for default, explicit, invalid (400), non-admin (401).
- [x] 4.2 Show and edit each tenant's move-in month on the property edit page's Tenants tab, and send it when adding a tenant; verify by running the app (or e2e) that adding and changing it persists.

## 5. Checkout cap and return pages (#36)

- [x] 5.1 In `create-checkout-session/payment/+server.ts` reject amounts that are not positive whole cents or exceed `computeBalance` (400, no Stripe session), round `unit_amount`, add `rentCents` and `feeCents` to the invoice metadata, and set success to `/payment/success`; verify handler tests in `tests/handlers/rent-payments.test.ts`.
- [x] 5.2 Add `payment/+page.server.ts` returning the real balance and due date, wire `payment/+page.svelte` to it (no hardcoded balance, "nothing to pay" state, client-side cap), and add `payment/success/+page.svelte`; verify with handler tests for the load and an extended e2e spec.

## 6. Webhook reliability (#37)

- [x] 6.1 In `api/stripe/webhook/+server.ts` await every write (failure returns 500), use `getMonthKey`, read rent and fee from metadata with a fallback to the "Rent" line, and store `fee` on the transaction; verify handler tests for failed write (500), unknown property (200), midnight month boundary, fee recorded, fallback line.

## 7. Stripe key-mode safety and docs (#83)

- [x] 7.1 Add the key-mode guard to `src/lib/server/stripe.ts`; verify tests: live key outside production throws without printing the key, test key in production warns, test key in dev is fine.
- [x] 7.2 Document the key and webhook setup, the dev sandbox, activating live mode and replacing test customer ids, next to `.env.example` and in the README; verify the docs match the guard's behavior.
- [x] 7.3 Update Known Gaps in `openspec/specs/rent-payments/spec.md` and `tenant-assignment` for what this change closes; verify `openspec validate --specs` passes.

## 8. Integration checks

- [x] 8.1 Verify `npm run lint`, `npm run check`, `npm run test:unit`, `npm run test:handlers`, `npm run build` and the e2e suite all pass.
