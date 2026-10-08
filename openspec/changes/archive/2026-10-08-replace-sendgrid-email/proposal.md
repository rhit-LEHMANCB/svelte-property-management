## Why

All outgoing email goes through SendGrid, whose free tier is now a one-time 60-day trial followed by a paid plan (about $20/month). When the trial or key stops working, password reset and tenant welcome emails fail with a 500 and new tenants cannot set a password. Volume is a handful of transactional emails per month, so a free tier elsewhere is enough. Resolves #90.

## What Changes

- Send the password reset and welcome emails through Resend instead of SendGrid, from `support@lehmanfamilyllc.com`.
- Move the two email bodies out of SendGrid dynamic templates into code templates in the repo (HTML and plain text), keeping the single `link` variable.
- Put delivery behind a small provider-agnostic interface so the provider can be swapped again.
- Treat a provider error as a failure (Resend returns `{ error }` rather than throwing) so the existing 500 behavior is kept.
- Replace the `SENDGRID_API_KEY` secret with `RESEND_API_KEY` in `.env.example`, both Firebase hosting workflows, the Playwright config and test fixtures.
- **BREAKING (operational):** `RESEND_API_KEY` must exist in the GitHub `develop` and `production` environments, and `lehmanfamilyllc.com` must be verified in Resend, before the deploy that carries this change.
- Remove `@sendgrid/mail`; add `resend`.
- Record the provider decision and alternatives in `design.md`.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `authentication`: the reset request is emailed through the delivery provider, the tenant welcome email is specified, and provider failure is a 500.
- `test-suite`: the handler tests double the email provider instead of SendGrid.

## Impact

- Code: `src/lib/server/email.ts` (new provider and templates); callers `src/routes/api/signin/reset/+server.ts` and `src/routes/api/user/add/+server.ts` are unchanged.
- Tests: `tests/handlers/email.test.ts`, `tests/helpers/services.ts`, `tests/helpers/setup.ts`, `tests/fixtures/env-private.ts`, the comment in `tests/e2e/specs/profile.spec.ts`.
- Config: `.env.example`, `.github/workflows/firebase-hosting-merge.yml`, `.github/workflows/firebase-hosting-pull-request.yml`, `playwright.config.ts`, `package.json`, `package-lock.json`, `README.md`, `openspec/config.yaml`.
- External: Resend account, DNS records (SPF, DKIM, DMARC) for `lehmanfamilyllc.com`, two API keys.
- Out of scope: other emails, a reset link on `/signin` (#46), atomic user creation (#40), bounce handling.
