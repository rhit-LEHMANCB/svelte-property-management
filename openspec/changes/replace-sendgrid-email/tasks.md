## 1. Templates and provider

- [ ] 1.1 Add `src/lib/server/email-templates.ts` with `renderPasswordResetEmail(link)` and `renderWelcomeEmail(link)` returning `{ subject, html, text }` (link attribute-escaped, present in both bodies). Verify: new `tests/unit` test covers subjects differ, link in html and text, and a link containing `"` or `&` is escaped.
- [ ] 1.2 Swap dependency: `npm uninstall @sendgrid/mail`, `npm install resend`. Verify: `package.json` and lockfile list `resend` and no `@sendgrid/mail`.
- [ ] 1.3 Rewrite `src/lib/server/email.ts`: lazy Resend client from `RESEND_API_KEY`, `sendEmail({to, subject, html, text})` from `support@lehmanfamilyllc.com` that throws when Resend returns `error`, and `sendPasswordResetEmail(email, isWelcomeEmail)` keeping its signature. Verify: `npm run check` passes and `grep -ri sendgrid src` is empty.
- [ ] 1.4 In `src/routes/api/user/add/+server.ts`, catch and log rejection of the unawaited welcome email so it is not an unhandled rejection. Verify: handler test where the email double rejects still returns `New User Created`.

## 2. Config and secrets

- [ ] 2.1 Replace `SENDGRID_API_KEY` with `RESEND_API_KEY` in `.env.example`, `.github/workflows/firebase-hosting-merge.yml`, `.github/workflows/firebase-hosting-pull-request.yml`, `playwright.config.ts` (dummy `re_e2e`), `tests/fixtures/env-private.ts` (dummy `re_test`). Verify: `grep -ri sendgrid` outside `openspec/changes/archive` and this change shows only intended history.
- [ ] 2.2 Update `README.md`, `openspec/config.yaml` context line, comments in `tests/helpers/*.ts` and `tests/e2e/specs/profile.spec.ts`, and `tests/handlers/authentication.test.ts` message to say email provider / Resend. Verify: grep above clean.

## 3. Tests

- [ ] 3.1 Rewrite `tests/handlers/email.test.ts` against a hoisted `resend` mock: recipient, sender, subject, link in html and text, different subjects for reset vs welcome, link generation failure sends nothing and gives 500, thrown error and `{ error }` result each give 500, success gives `email_sent`. Verify: `npm run test:handlers` passes.
- [ ] 3.2 Run the full local gate. Verify: `npm run lint`, `npm run check`, unit and handler test scripts, `npm run build` all pass.

## 4. Specs

- [ ] 4.1 Run `openspec validate replace-sendgrid-email --strict`. Verify: exits 0. (The delta specs are synced to `openspec/specs` automatically on archive.)

## Workflow follow-up
- Human rollout before production: verify `lehmanfamilyllc.com` in Resend (SPF, DKIM, DMARC), add `RESEND_API_KEY` to GitHub environments `develop` and `production`, send a real reset email from each site, then delete `SENDGRID_API_KEY` and cancel the SendGrid account.
