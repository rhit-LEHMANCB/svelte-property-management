## 1. Fee and charge planning (pure logic)

- [ ] 1.1 Add `src/lib/server/autopay.ts` with `autopayFeeCents(type, amountCents)` (card 2.9% + $0.30, bank 0), and make the Checkout route use it for its fee. Verify: unit tests for card, bank, rounding and the Checkout amount unchanged.
- [ ] 1.2 Add the pure planner `planAutopay({ledger, enrollments, charges, today})` returning the attempts to make (enrollment order, caps, never above the balance, pending subtracted, skip succeeded/pending/gave-up/already-tried-today, max 4 attempts, $0.50 minimum, cycle key = `ledger.dueDate`, nothing when the due date is in the future). Verify: unit tests for each scenario in the autopay spec ("Charge on the due date", "Amount cap and next tenant", "Never above the balance", "Nothing due", "Ended lease", "Minimum charge", "Retries", "Giving up", "Paid by hand meanwhile").
- [ ] 1.3 Remove "Set up auto-pay to waive this fee" from the Checkout fee line text. Verify: Checkout handler test asserts the description.

## 2. Enrollment

- [ ] 2.1 Add enrollment helpers (read, save, remove, `publicEnrollment()` without the payment method id) and the `leases/{id}/autopay/{uid}` shape. Verify: unit tests that the public shape has no method id and ordering is by `enrolledAt`.
- [ ] 2.2 Add `POST /api/autopay/setup` (Checkout setup mode, card and bank account, metadata, success URL with `{CHECKOUT_SESSION_ID}`) with the 401/403/400 rules. Verify: handler tests for each setup scenario.
- [ ] 2.3 Add `POST /api/autopay/complete` (retrieve the session, check owner, lease membership and completion, save once, keep the first `enrolledAt`). Verify: handler tests for complete, someone else's session, unfinished session, completing twice.
- [ ] 2.4 Add `PATCH` and `DELETE /api/autopay` for the caller's own enrollment. Verify: handler tests for amount change, `null`, turn off, other tenant untouched, 403/404, 401.
- [ ] 2.5 Teach `fake-stripe.mjs` the setup-mode session, session retrieval with payment method details, invoices, invoice items, finalize, pay and void, with switches for decline and processing. Verify: used by tasks 4.x and 6.1; the existing e2e specs still pass.

## 3. Tenant UI

- [ ] 3.1 `/payment` server load returns the caller's enrollments (public shape) and the latest non-succeeded charge state per lease; the page runs `complete` when `autopay_session` is in the URL and then clears it. Verify: component or load test that only the caller's enrollments are returned.
- [ ] 3.2 `/payment` shows the autopay controls per lease (set up with optional amount, method and amount display, change amount, turn off, pending or failed note), using the existing UI components and the company name "Lehman Family LLC" in any copy. Verify: `npm run check`, lint, and e2e in 6.1.

## 4. Daily job and webhook

- [ ] 4.1 Charge executor: claim record, invoice items for the allocation parts and card fee, invoice create, finalize, pay off session with the idempotency keys, outcome mapping (paid, processing, declined with void). Verify: handler tests against a mocked Stripe for paid, processing, declined, crash-after-claim reuse.
- [ ] 4.2 Add the autopay step to `runDailyJob` after late fees and before notices, record `autopayCharges` in the run summary, isolate per-lease errors. Verify: job tests for the "Charge on the due date", re-run, overlapping-run (claim exists) and "One lease fails" scenarios.
- [ ] 4.3 `chargeLateFees` skips fees while a charge on the lease is `pending`. Verify: job tests for "Pending ACH", "Pending charge fails", "Charge settles".
- [ ] 4.4 Webhook: mark the charge record `succeeded` inside the payment transaction; handle `invoice.payment_failed` (mark `failed`, void, flag the failure email). Verify: webhook tests including redelivery of both events and an invoice without autopay metadata.
- [ ] 4.5 Failure, give-up and 7-day autopay emails in `email-templates.ts` (escaped, "Lehman Family LLC"), sent with the notice claim pattern; replace the enrolled tenant's `rent-*` and `deposit-*` reminders. Verify: template unit tests and job tests for "Notice", "Others unaffected", "Sent once", "Email problems".

## 5. Admin view

- [ ] 5.1 Add enrolled tenants (method, amount) and latest pending or failed charge to the lease summary and show them in the admin lease list, read-only. Verify: unit test for the summary and a page check in e2e 6.1.

## 6. End to end and docs

- [ ] 6.1 Add `tests/e2e/specs/autopay.spec.ts` against the fake Stripe: enroll, change amount, turn off, a job run that charges and is recorded by the webhook, decline and retry email, pending blocks a late fee, admin sees the state. Verify: `npm run test:e2e` passes.
- [ ] 6.2 Update the README or docs that describe payments and the Stripe dashboard steps (ACH Direct Debit enabled, `invoice.payment_failed` on the webhook endpoint) for dev and production. Verify: the doc names both steps and no production secrets.
- [ ] 6.3 Whole-change check. Verify: `npm run lint`, `npm run check`, unit and handler tests, `npm run build` and `openspec validate add-autopay --strict` all pass.
