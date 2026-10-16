# create-svelte

Everything you need to build a Svelte project, powered by [`create-svelte`](https://github.com/sveltejs/kit/tree/master/packages/create-svelte).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```bash
# create a new project in the current directory
npm create svelte@latest

# create a new project in my-app
npm create svelte@latest my-app
```

## Environment

Copy `.env.example` to `.env` and fill it in. Every variable in it is required: the app imports them
at build time, so `npm run build` and `npm run dev` fail if one is missing. Use the **dev** Firebase
project for local work, not production. Note that `FB_PRIVATE_KEY` is a JSON string, not a raw PEM;
the example shows the format.

To pull `.env` and `.env.qa` from 1Password instead, run `scripts/pull-env.sh` (needs the `op` CLI; `scripts/cloud-setup.sh` is the cloud startup script, which installs `op` but does not pull;
the vault and item names are at the top of the script). In a cloud session, set
`OP_SERVICE_ACCOUNT_TOKEN` as an environment secret for a read-only, dev-only service account;
the dev-lifecycle skill runs the pull before its preflight, since the token is not available to the setup script.

### Cloud session notes

- **Playwright browser.** The cloud container image ships its own Playwright browsers in
  `PLAYWRIGHT_BROWSERS_PATH` (`/opt/pw-browsers`) and sets `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.
  That build can be older than the one the installed `@playwright/test` needs, which makes every
  Playwright test fail at launch with "Executable doesn't exist". After `npm ci`,
  `scripts/cloud-setup.sh` checks for the required Chromium build and, only if it is missing,
  downloads it into `PLAYWRIGHT_BROWSERS_PATH` from `cdn.playwright.dev` (about 300 MB, under a
  minute). If the environment's setup script is a pasted copy of `scripts/cloud-setup.sh` rather than
  `bash scripts/cloud-setup.sh`, paste the new version in. To fix a session that started without
  it, run `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD= npx playwright install chromium`.
- **If the download is blocked.** The setup script prints a warning and carries on. Allow
  `cdn.playwright.dev` (and `playwright.download.prss.microsoft.com`, the ffmpeg fallback) under
  Network access, Allowed domains, in the environment's settings
  ([docs](https://code.claude.com/docs/en/cloud-environments#network-access)), then start a new
  session. Do not pin `@playwright/test` to the image's version or hard-code an `executablePath`
  in `playwright.config.ts`, since both would affect CI and local machines.
- **`JAVA_TOOL_OPTIONS`.** The cloud environment sets it for the network proxy, so Java prints
  "Picked up JAVA_TOOL_OPTIONS ..." on stderr and `npm run test:e2e` shows
  `⚠ Unexpected rules runtime error: Picked up JAVA_TOOL_OPTIONS ...` when the emulators start. It is
  only a warning: the emulators and rules work and the suite passes. Leave the variable set.

Node 22 is required (`.nvmrc`; run `nvm use`). `package.json` `engines.node` pins the Cloud Function runtime to the same version.

## Firebase rules and indexes

`firestore.rules`, `storage.rules` and `firestore.indexes.json` are the single source for both Firebase
projects, and the e2e emulator loads the same rules. `.firebaserc` defines the aliases `dev`
(`lehman-realty-dev`) and `prod` (`lehman-realty`) and has no default, so always pass `--project`.

- Firestore denies all client access: the app reads and writes through the Admin SDK, which ignores
  rules. Storage allows public `get` under `properties/` and `users/` (photo URLs are unsigned) and
  no writes or listing. Everything else, lease documents included, is denied; the app serves lease
  PDFs itself at `/api/lease/{id}/document` after checking who is asking.
- CI deploys them to the project in the GitHub environment's `FB_PROJECT_ID` on every push to `develop`
  and `production` (`.github/workflows/firebase-hosting-merge.yml`), before the Hosting deploy. The
  service account in `FIREBASE_SERVICE_ACCOUNT_LEHMAN_REALTY` needs at least the Firebase Rules Admin and Cloud
  Datastore Index Admin roles in each project, plus whatever else the first deploy to `develop` reports
  missing (for example Firebase Viewer for the Storage bucket lookup).
- Rules are not rolled back automatically if a later deploy step fails; restore the previous ruleset
  from the Firebase console history. A deploy never deletes indexes that exist only in the console,
  so check the console if you suspect extras.
- To deploy by hand: `npx firebase deploy --only firestore,storage --project dev` (add `--dry-run` to check).
- If someone adds an index in the console, re-export it with
  `npx firebase firestore:indexes --project dev > firestore.indexes.json`, format it with
  `npx prettier --write firestore.indexes.json` and commit the result. Run the export from Git Bash,
  because PowerShell 5.1 would write UTF-16.

## Data migrations

Changes to stored data ship as numbered files in `migrations/` (`0001-short-name.ts`) and run once
per Firebase project. The deploy workflow applies any that are pending after the rules and indexes
deploy and before Hosting, using the environment's service account; a failure stops the deploy before
the new code goes live. Each run is recorded in the `_migrations` collection.

**Writing one.** Copy `migrations/0001-leases-from-tenant-links.ts`. The default export has a `name`
that matches the file name, a `description`, `undo` steps written for a person, and `up(ctx)`.
Read with `ctx.db`, but write only through `ctx.write.set` and `ctx.write.delete`, so the dry run can
show the writes instead of making them. Make it safe to run again on data it already changed (use
fixed document ids, skip what is done), because a run that fails part way is repeated. Return a
summary object; it is stored on the record. `tests/unit/migrations.test.ts` checks every file.

**Running by hand.**

```bash
# against the emulator (the backup check is skipped)
npx firebase emulators:start --config firebase.emulators.json --only firestore --project demo-lehman-realty
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FB_PROJECT_ID=demo-lehman-realty npm run migrate -- --dry-run
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FB_PROJECT_ID=demo-lehman-realty npm run migrate

# against a real project, with a service account key
GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json FB_PROJECT_ID=lehman-realty-dev npm run migrate -- --dry-run
```

`npm run migrate -- --help` lists the options. Only one run at a time can hold the lock
(`_migrations/_lock`); a lock older than 30 minutes is taken over.

**Backups first.** The runner refuses to touch a database that has no backup schedule. Create two
in the Firebase console for the `(default)` database of each project (Firestore, Disaster recovery,
Create backup schedule): daily with 2-day retention and weekly with 8-day retention. Point-in-time
recovery stays off for now to avoid its cost; turn it on once the app holds real data. The deploy
service account (`FIREBASE_SERVICE_ACCOUNT_LEHMAN_REALTY`) needs two roles for the migrate step: one
that lists backup schedules and backups (for example Cloud Datastore Viewer) and Cloud Datastore User,
to read and write the data.

**Restore point.** Before applying a migration, the runner prints, and stores on
`_migrations/{name}`, the start time and the newest finished backup (`restorePoint`). A schedule with
no finished backup yet gives a warning and no restore point. Scheduled backups are at most daily, so
changes made between that backup and the migration are not in it.

**Rolling back.** First follow the migration's `undo` steps (also on its file); they usually remove
what it added, and the previous app version can then be redeployed. As a last resort, restore the
recorded backup. Backups restore into a new database, never in place:
`gcloud firestore databases restore --source-backup=<restorePoint.backup> --destination-database=<new-name> --project=<project>`,
then copy back the documents you need and delete the new database.

## Lease billing

What a lease owes is computed whenever it is read (`src/lib/server/billing.ts`), from its terms and
what has been recorded against it; nothing is written by a scheduled job.

- **Rent** is prorated by day: a month the lease covers only in part is charged rent × days covered
  ÷ days in the month, to the cent. The first month is due on the start date, later months on the
  1st. What a month has been paid is the sum of the `transactions` in its
  `leases/{id}/payment_history/{year}` entry (`remainingBalance` is still written, but not read
  except for old entries that have no transactions).
- **Credit** is anything recorded beyond a month's charge; it pays the oldest rent still owed.
- **Rent becomes payable** 7 days before it is due, the day of its first reminder.
- **Late fees**: a lease has `lateFee` (dollars), `graceDays` and `lateFeesFrom`. A month due on or
  after `lateFeesFrom` that was not paid in full by the end of its grace days is late. The **daily
  billing job** (below) charges its fee once by writing `leases/{id}/late_fees/{YYYY-MM}` with
  `chargedAt`; a fee is owed only from then on.
- **Deposit**: `deposit: { amount, dueDate }` on the lease; payments and the settlement are in
  `leases/{id}/deposit/ledger` (`paid`, `transactions`, `settlement`).
- **Paying**: one amount is applied to late fees, then the deposit, then the oldest rent. Checkout
  shows a line per part and the invoice metadata carries `lateFeeCents`, `depositCents`,
  `rentCents` and `feeCents`; the webhook recomputes the split when it records the payment.
- **Fees**: card payments (Checkout and autopay) add 2.9% + $0.30 (`cardFeeCents` in
  `src/lib/server/autopay.ts`); autopay from a bank account (ACH) has no fee.
- **Autopay**: each tenant on a lease can save a card or bank account and enroll with an optional
  amount cap (`leases/{id}/autopay/{uid}`). The daily job charges enrolled tenants in enrollment
  order when money is due, never more than is owed, and keeps one record per due date and tenant in
  `leases/{id}/autopay_charges/{dueDate}_{uid}` (`claimed`, `pending`, `succeeded`, `failed`,
  `gave-up`). A declined charge moves to the next tenant and is retried on the next 3 daily runs.
  While a charge is `pending` (ACH settling), the lease is not charged late fees. Stripe dashboard
  steps are in [docs/stripe-setup.md](docs/stripe-setup.md#autopay).

### Daily billing job

`POST /api/jobs/daily` (`src/lib/server/billingJob.ts`) runs once a day. Each run:

1. Charges every late month that has no fee yet. A missed day is caught up on the next run.
2. Charges autopay for leases with money due (see Autopay above).
3. Emails each tenant on the lease a late-fee notice for every fee it charged, and each autopay
   tenant a notice when their charge fails or autopay gives up.
4. Emails rent and deposit reminders 7 days before and on the due date, while the amount is unpaid.
   A tenant with autopay gets one "autopay will charge" email 7 days before instead.

It sends every email once (records in `leases/{id}/notices`). Only one run proceeds at a time (lock
in `_jobs/daily`). Each run appends a summary to `_jobs/daily/runs/{YYYY-MM-DD}`: the fees charged,
the emails sent and any errors. Check that document if fees or emails seem missing.

The route accepts `Authorization: Bearer <JOBS_SECRET>` or a signed-in admin, and answers 401 to
everyone else. To run it by hand, sign in as an admin and run
`await fetch('/api/jobs/daily', { method: 'POST' })` in the browser console.

**Setup, once per Firebase project** (until it is done, no fees are charged and no emails are sent):

1. Generate a secret (`openssl rand -hex 32`). Add it as `JOBS_SECRET` to the GitHub environment
   (`develop` or `production`) and to the 1Password `.env` item. Every `.env` needs the line, even
   empty, or the build fails. Redeploy.
2. Enable Cloud Scheduler and create the job, replacing the project, site URL and secret:

```bash
gcloud services enable cloudscheduler.googleapis.com --project=<project-id>
gcloud scheduler jobs create http daily-billing \
  --project=<project-id> --location=us-central1 \
  --schedule="0 6 * * *" --time-zone="America/Indiana/Indianapolis" \
  --uri="https://<site>/api/jobs/daily" --http-method=POST \
  --headers="Authorization=Bearer <JOBS_SECRET>" \
  --attempt-deadline=600s --max-retry-attempts=3
gcloud scheduler jobs run daily-billing --project=<project-id> --location=us-central1   # try it once
```

Migration `0003-lease-billing-terms` gave leases created before this their terms: no deposit, a 5%
late fee, 5 grace days, and late fees only for months due from the day it ran.

## Stripe

Dev and local environments use Stripe test-mode keys; only production may use a live key. The server
checks this at startup (a live key outside production fails, a test key in production logs a
warning). Setup steps for the dev sandbox, the webhooks and going live are in
[docs/stripe-setup.md](docs/stripe-setup.md).

## Testing

There are three layers. The specs in `openspec/specs/` are the test plan: each WHEN/THEN scenario of
current behavior is a test whose title names the capability and scenario. Behavior listed under a
spec's "Known Gaps", or marked "not yet implemented", is deliberately not asserted.

| Command                 | What it runs                                                                                                               | Needs                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run test:unit`     | Zod schemas and server auth helpers (Vitest)                                                                               | nothing                                                                                                                                          |
| `npm run test:handlers` | API handlers, form actions and page loads, with Firebase Admin, Stripe and Resend replaced by in-memory doubles (Vitest)   | nothing                                                                                                                                          |
| `npm test`              | Both of the above                                                                                                          | nothing                                                                                                                                          |
| `npm run test:e2e`      | Playwright smoke tests (sign-in, maintenance, property creation, payment) against the Firebase emulators and a fake Stripe | Java 21 or newer, `npx playwright install chromium` once (cloud sessions: see Cloud session notes)                                               |
| `npm run test:qa`       | Playwright specs in `tests/qa/` against the deployed dev site (used by the `dev-lifecycle` skill)                          | `QA_ADMIN_EMAIL`, `QA_ADMIN_PASSWORD`, `QA_TENANT_EMAIL`, `QA_TENANT_PASSWORD` in the environment or a gitignored `.env.qa`; optional `BASE_URL` |

`develop` is protected by the repository ruleset "Protect develop": changes go in through a pull request, and the `tests` and `build_and_preview` checks must both pass before it can be merged. This applies to everyone, repository admins included, and nobody can push to `develop` directly or delete it. In a real emergency the owner can edit or disable the ruleset under Settings, Rules. `production` keeps its own branch protection.

After a production release, the archive workflow opens a pull request into `develop` with the archived OpenSpec changes. GitHub holds the checks of a pull request opened with the built-in token until someone approves them, so the workflow approves that run itself and turns on auto-merge, and GitHub merges the pull request when `tests` and `build_and_preview` are green. If a check fails, or the approval could not be given, the pull request stays open (open it and click "Approve and run workflows" if the checks never started).

`tests/qa/` is empty until specs are added for a change; the `dev-lifecycle` skill's QA agent writes them there. The `qa` project does not record traces or video, because those would capture the typed account passwords; failure screenshots are still saved. `test-results/` and `playwright-report/` come from the end-to-end run and are not committed. After a QA run they can still hold failure screenshots and error context, so do not share them. `test:qa` uses POSIX shell syntax for its environment variable, so on Windows run it from WSL or Git Bash.

The unit and handler tests use fixture values for every `$env` variable and never touch the network.
The end-to-end tests build the app in `e2e` mode, serve it with `vite preview`, and set every variable
themselves, so a local `.env` is never used. The pull request check runs all of these in the `tests`
job.

## UI and theming

The UI is built from `@skeletonlabs/skeleton-svelte` components (Dialog, Menu, Tabs, Combobox,
Pagination, Toast, Avatar, Navigation, App Bar) on the built-in `cerberus` theme. The theme is
chosen by `data-theme` in `src/app.html` and imported in `src/app.css`. The package is a production
dependency because the server build leaves its `@zag-js` imports external.

- **Dark mode** follows the system setting. The toggle in the app bar overrides it and saves the
  choice in `localStorage` under `theme` (`src/lib/theme.ts`). An inline script in `src/app.html`
  applies it before the first paint. Without scripts, `app.css` follows `prefers-color-scheme`.
- **Dialogs and notifications** are opened imperatively: `getModalStore().trigger({ type: 'confirm',
title, body, response })` and the `successToast` / `errorToast` helpers in `src/lib/Hooks/toasts.ts`.
  `src/lib/ui/` holds these stores and the hosts that render them.
- **Lists** use `src/lib/Components/DataList/DataList.svelte`. It renders one table that becomes
  cards below the `md` breakpoint, with search, sort, paging, an empty state and loading
  placeholders. Pass `columns`, a `cell` snippet and an `empty` snippet. Put row actions in a
  `RowMenu` or in buttons next to the row's main control, never inside it. Call `refresh()` from
  `src/lib/Hooks/refresh.ts` instead of `invalidateAll()` after a change, so lists show placeholders
  while the data reloads.

`tests/e2e/specs/appearance.spec.ts` measures WCAG AA text contrast on the main pages, menus,
dialogs and toasts in light and dark mode (`tests/e2e/support/contrast.ts`; axe-core cannot read the
theme's `oklch()` colors). Run it after changing colors.

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://kit.svelte.dev/docs/adapters) for your target environment.
