# Proposal

## Why

The app's pages drifted apart as they were built: cards use three paddings, some pages are capped at `max-w-2xl` and others fill the screen, section headings sit inside cards on some pages and above them on others, the three auth cards differ, button sizes and form-action spacing vary, and ten handlers still use Svelte 4 `on:` syntax (issue #154). Validation errors only turn an input red on most forms, with no message saying what is wrong, and nested admin pages offer only a single back button. Fixing this now, before more pages land, keeps later pages consistent by default.

After the first QA pass the owner found tenant pages that still left headings and lists loose on the background, and a dashboard with one lone card. A design pass ([canvas](https://claude.ai/artifact/17RZQ1iMPo16m3Dgb8F8LT)) set the direction this change now also carries: everything in cards, a real tenant dashboard and an admin "needs attention" list.

## What Changes

- **Shared layout components** that carry the standards, so pages stop restyling cards by hand: a page body (centered, at most 1024px wide on every signed-in page), a card (one padding, optional section title inside it), an auth card (Sign in, Forgot, Reset), and a notice (tonal warning, error or info box with one padding and the right live-region role).
- **Every page moved onto them:** all 3 auth pages and 14 signed-in pages, plus the property, lease and lease-billing components. **Page widths change:** list pages (Users, Properties, Maintenance, Payment, Admin home, Dashboard) are capped and centered instead of filling the screen, and form pages grow from 672px to 1024px.
- **Breadcrumbs** on nested pages: Properties › New property; Properties › *property*; Properties › *property* › New lease / Edit lease; Payment › Success. They replace the single "back" buttons in those page headers. Top-level pages have none.
- **Inline field errors** on every form and dialog: after a submit, each invalid field gets a red outline, `aria-invalid`, and its message underneath, linked for screen readers. Errors update as the user fixes them. Errors that belong to no single field show in an error notice above the submit button. No validation rules change.
- **Buttons:** regular size for form submits and page actions, small size only in list rows and headers; every form ends with the same action row.
- **Svelte 5 events only:** the remaining `on:` handlers are replaced (including `SortablePhotos`' drag handlers and its `on:sort` event), and lint fails on any new `on:` directive.
- **Specs:** the layout standards, breadcrumbs and field errors become requirements, so later changes are reviewed against them.
- **Content in cards:** below the page header, all content sits in cards or notices, with no loose headings, paragraphs, lists or tables. An e2e check scans every signed-in page.
- **Tenant dashboard:** tiles for the balance owed (total across leases, earliest due date, "Make a payment"), autopay on or off, and open maintenance requests; a "Your lease" card per current or upcoming lease; a "Renters insurance" card (On file, Ending soon within 30 days, Expired, Missing); ended leases with a deposit in one "Past leases" card.
- **Admin home:** a "Needs attention" card counting open maintenance requests, deposits to settle and failed autopay charges (rows at 0 hidden), then the section tiles.
- **Maintenance** (tenant and admin): one requests card with Open (n) / Closed (n) tabs, still 5 per status; the tenant's "New request" form card sits beside it.
- **Card layouts from the design pass:** Payment (Balance with breakdown, Autopay, Payment history), Profile (Contact info, Profile picture, Password), Insurance (policy card and "Why we ask"), New/Edit lease (Terms, Deposit and late fees, Tenants, Lease document cards; Delete in its own card), and Users, Properties and Admin maintenance with search and table inside one card and the page action in the header.
- **Wording:** "Add" becomes "Send request", Profile's "Reset" becomes "Send reset link", "Transaction History" becomes "Payment history", "View Portal" becomes "Open the Stripe portal", and pages gain a short subtitle (address or purpose).

Out of scope: colours, theme and typography, the sidebar and app bar, dialog layout beyond field errors, new validation rules, new Firestore collections or fields, and the #138 follow-ups.

## Capabilities

### New Capabilities

- `page-layout`: the shared page structure every page follows: content width, cards and section headings, auth cards, notices, form action rows, button sizes, breadcrumbs on nested pages, and content kept in cards.
- `home-dashboards`: the tenant dashboard's summary tiles, lease and insurance cards, and the admin home's needs-attention list.

### Modified Capabilities

- `ui-accessibility`: adds requirements for accessible field-level validation errors and for the breadcrumb landmark.
- `authentication`: a rejected sign-in shows its message in the error notice above the button instead of a toast.
- `rent-payments`: an amount above the balance is shown under the amount field instead of in a toast.
- `maintenance-requests`: the open and closed lists sit in one card with Open/Closed tabs (tenant and admin).
- `user-profile`: the password reset button is labelled "Send reset link".

## Impact

- **Code:** new components in `src/lib/Components/Shell` (and a field component next to the forms); all `+page.svelte` files under `src/routes`; `PropertyForm`, `LeaseForm`, `LeaseBilling`, `PaymentDialog`, the autopay dialog, the Add user dialog and `DateInput`. Sign in and Forgot move from `export let` to `$props()`.
- **Lint:** `eslint.config.js` gains a rule that rejects Svelte 4 event directives.
- **Tests:** e2e specs that click the removed back buttons or read old markup are updated; new e2e checks cover widths, breadcrumbs and field errors; the contrast check runs on the changed pages.
- **Server:** the Forgot password action also returns which field its "valid email" error belongs to, and the Profile action reports a missing or wrong current password as an error on that field. No other server code changes.
- **Dev dependencies:** `happy-dom`, for component unit tests.
- **Server reads:** the dashboard loads the balance, autopay, open-request count and insurance status it shows (shared with the Payment page's code), and admin home counts open requests, deposits to settle and failed autopay charges. No new collections, fields or writes.
- **No changes** to Firestore data, Storage, Stripe, email, environment variables or deployment.
