# Tasks

## 1. Shared components

- [x] 1.1 Add `PageBody`, `Card`, `AuthCard`, `Notice` and `FormActions` to `src/lib/Components/Shell` (design decisions 1–4 and 10). Verify with component unit tests that `Notice` sets `role="alert"` for errors and `role="status"` otherwise, and that `Card` renders its title as the first child.
- [x] 1.2 Add `Breadcrumbs` and an optional `breadcrumbs` prop on `PageHeader` (decision 11). Verify with a unit test: the landmark is named "Breadcrumb", the items are in an `ol`, every crumb but the last is a link, and the last has `aria-current="page"`.
- [x] 1.3 Add `Field` and the errors-after-submit gate in `src/lib/forms/errorsAfterSubmit.ts` (decisions 5–6), plus `formProblem` for form-level messages. Verify with unit tests that `Field` sets `aria-invalid` and `aria-describedby` only when errors are given, and that the gate shows no errors until `markSubmitted`, then follows them (and starts open for a form the server already answered).
- [x] 1.4 Add the optional `validate` to prompt modals in `src/lib/ui` (decision 9). Verify with a unit test of the prompt check (`promptProblem`) and, in 5.2, an e2e check that a failing `validate` keeps the dialog open with the message under the input.

## 2. Lint rule for Svelte 4 events

- [x] 2.1 Replace the remaining `on:` handlers in `DateInput`, Sign in, Reset, Profile, Payment and `SortablePhotos` (with its `on:sort` event and slot props) with Svelte 5 forms, and move Sign in, Forgot, Profile, Insurance, Payment, Payment success and `PropertyForm` from `export let` to `$props()`. Verify with `grep -rnE 'on:[a-z]+' src --include=*.svelte` (no directives) and the existing e2e tests for those pages.
- [x] 2.2 Add the `no-restricted-syntax` rule for `SvelteDirective[kind="EventHandler"]` to `eslint.config.js`, with a unit test that lints an `on:click` fixture and expects the error (decision 12). Verify that `npm run lint` passes on the repo.

## 3. Auth pages

- [x] 3.1 Move Sign in, Forgot and Reset onto `AuthCard`, `Field`, `Notice` and `FormActions`. Map Forgot's invalid-email error to the email field so it renders without scripts, keep Sign in errors form-level, and add `novalidate` and the submitted flag to Reset. Verify that the existing auth e2e specs pass, and add e2e checks:
  - the three cards have equal width and padding;
  - Forgot shows its email error under the field with JavaScript disabled;
  - a wrong Sign in password shows an alert notice above the button.

## 4. Tenant pages

- [x] 4.1 Move the dashboard, Profile, Insurance, Maintenance, Payment and Payment success onto `PageBody`, `Card`, `Notice` and `FormActions`, with each section heading inside its card. Verify that the existing e2e specs for these pages pass.
- [x] 4.2 Wrap every field on Profile, Insurance and Maintenance in `Field`, with `novalidate` and the submitted flag. Move `PaymentDialog`'s amount message into `Field`, and the autopay amount check into the prompt's `validate`. Verify with e2e:
  - empty Profile first name: an outline and message under the field, which clear on typing;
  - empty Insurance policy number: `aria-invalid` and `aria-describedby`;
  - a payment amount over the balance shows under the field;
  - nothing is red before the first submit.
- [x] 4.3 Add the Payment › Success breadcrumbs. Verify with an e2e check of the trail and its link.

## 5. Admin pages

- [x] 5.1 Move Admin home, Users, Properties, Maintenance, Add property, Property edit, New lease and Edit lease onto `PageBody`, `Card`, `Notice` and `FormActions`, along with `PropertyForm`, `LeaseForm` and `LeaseBilling`. Use `btn-sm` only in rows and headers. Verify that the existing admin e2e specs pass.
- [x] 5.2 Wrap every field in `PropertyForm` and `LeaseForm` in `Field`, replacing `LeaseForm`'s inline messages, with the submitted flag. Move the Add user email check into the prompt's `validate`. Verify with e2e:
  - New lease shows no errors before submit;
  - submitting with no rent shows the message under Rent;
  - an invalid Add user email keeps the dialog open with the message under the input.
- [x] 5.3 Add breadcrumbs to Add property, Property edit, New lease and Edit lease, remove their back buttons, and update `leases.spec.ts` and `data-integrity.spec.ts` to use the breadcrumb links. Verify with an e2e check that Edit lease reads Properties › *title* › Edit lease and both links go to the right pages.

## 6. Layout checks and specs

- [x] 6.1 Add `tests/e2e/specs/page-layout.spec.ts`. Verify that it passes. It checks:
  - every signed-in page's content is at most 1024px and centered at 1600px wide;
  - Users and Profile share a left edge;
  - no page scrolls horizontally at 360px in light or dark mode;
  - card padding matches across the dashboard, admin home, Profile and Maintenance;
  - a 60-character property title in breadcrumbs does not overflow at 360px.
- [x] 6.2 Extend the contrast e2e check to cover a page with visible field errors and a breadcrumb trail, in both modes. Verify that it passes.
- [x] 6.3 Run `npm run lint`, `npm run check`, `npm test`, `npm run test:e2e` and `npm run build`. Verify that all pass, and run `openspec validate make-ui-consistent --strict`.

## 7. Shared summaries

- [x] 7.1 Move the per-lease balance and autopay logic from `payment/+page.server.ts` into `src/lib/server/tenantSummary.ts` and call it from Payment. Verify that the payment handler and e2e specs still pass unchanged.
- [x] 7.2 Add the dashboard's open-request count and insurance status (On file, Ending soon, Expired, Missing) to `tenantSummary.ts`. Verify with unit tests for each insurance status boundary (31, 30 and 0 days, past, none) and a handler test that another tenant's leases and requests never count.
- [x] 7.3 Add `adminAttention()` to `src/lib/server/leases.ts`. Verify with handler tests: open requests counted, a settled deposit not counted, a `gave-up` charge counted, a succeeded one not, and a tenant gets the existing 401 from `/admin` with no counts.

## 8. Tenant pages from the design pass

- [x] 8.1 Rebuild the dashboard: summary tiles, "Your lease" cards, the "Renters insurance" card and the "Past leases" card. Verify with e2e: tile values for the seeded tenant, insurance states, and the no-lease notice.
- [x] 8.2 Maintenance: "New request" form card beside a "Your requests" card with Open/Closed tabs; button "Send request". Verify by updating `maintenance.spec.ts` and adding an e2e test that switches tabs by keyboard.
- [x] 8.3 Payment (Balance, Autopay, Payment history cards; "Open the Stripe portal"), Profile (Contact info, Profile picture, Password with "Send reset link") and Insurance (policy and "Why we ask" cards), with subtitles. Verify by updating the specs that click "Reset" and "View Portal" and running the profile, payment, autopay and app-platform e2e specs.

## 9. Admin pages from the design pass

- [x] 9.1 Admin home with the "Needs attention" card and the section tiles. Verify with an e2e test on seeded data (rows shown, a zero row hidden, the all-clear message).
- [x] 9.2 Users, Properties and Admin maintenance: search and table inside one card, page action in the header; Admin maintenance gets Open/Closed tabs. Verify that the list-browsing, maintenance and data-integrity e2e specs pass.
- [x] 9.3 New and Edit lease: Terms, Deposit and late fees, Tenants and Lease document cards, Delete in its own card. Verify that the leases and lease-billing e2e specs pass.

## 10. Layout check and full run

- [x] 10.1 Add the no-loose-content check to `page-layout.spec.ts` for every signed-in page, for admin and tenant. Verify that it passes, and that it fails on a probe heading placed on the page background.
- [x] 10.2 Extend the contrast scan to the new dashboard and admin home in both modes. Verify that it passes.
- [x] 10.3 Run `npm run lint`, `npm run check`, `npm test`, `npm run test:e2e`, `npm run build` and `openspec validate make-ui-consistent --strict`. Verify that all pass.


## 11. Owner feedback during QA cycle 2

- [x] 11.1 Remove the dashboard's "Your lease at ... starts on" notice, which repeated the upcoming lease card and the tiles; keep the no-property warning. Verify with the home-pages unit test, the access-control handler tests and the data-integrity e2e upcoming-lease test.
