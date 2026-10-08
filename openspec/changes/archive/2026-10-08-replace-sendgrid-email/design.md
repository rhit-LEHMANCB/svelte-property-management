## Context

See proposal.md - Why. Today `src/lib/server/email.ts` builds a Firebase reset link with `adminAuth.generatePasswordResetLink` and posts it to two SendGrid dynamic templates. Only delivery and template storage change. Handler tests replace the whole email module in the global setup; `tests/handlers/email.test.ts` unmocks it and doubles `@sendgrid/mail`.

## Goals / Non-Goals

**Goals:** free-tier delivery at current volume, templates versioned in the repo, one small seam for the provider, unchanged HTTP behavior.

**Non-Goals:** queueing or retries, delivery webhooks, rich template tooling, per-environment sender addresses.

## Decisions

**Provider: Resend.** Prices were checked on 2026-10-07 from secondary sources and must be reconfirmed on resend.com/pricing at setup.

| Option | Verdict |
| --- | --- |
| Resend (free: 3,000/month, 100/day, 1 domain) | Chosen: free far above a handful per month, simple SDK, one verified domain is all that is needed. |
| SendGrid | Free tier gone; 60-day trial, then about $20/month. Rejected. |
| Brevo (free about 300/day) | Viable; free plan carries provider branding and has a heavier API. Not chosen. |
| Amazon SES | Cheapest, but AWS account, sandbox exit and more setup for little gain. Not chosen. |
| Firebase Auth built-in emails | No provider, but no separate welcome email and limited sender control. Not chosen. |
| Postmark / Mailgun | Paid or trial-limited. Not chosen. |

**Templates as code.** A new `src/lib/server/email-templates.ts` exports `renderPasswordResetEmail(link)` and `renderWelcomeEmail(link)`, each returning `{ subject, html, text }`. The link is HTML attribute-escaped. Subjects: "Reset your password" and "Welcome to Lehman Family LLC". Alternative, dashboard templates, rejected because it couples code to a provider API and drifts from the repo.

**Provider seam.** `email.ts` defines `sendEmail(message: { to, subject, html, text }): Promise<void>` implemented with the `resend` SDK (`new Resend(RESEND_API_KEY)` created lazily so tests and builds without a key do not throw at import). Resend returns `{ data, error }`; a non-null `error` is thrown so callers keep their existing rejection to 500 path. `sendPasswordResetEmail(email, isWelcomeEmail)` keeps its signature and resolves with `void`; the callers ignore the resolved value (to be verified in tasks).

**Sender.** Constant `Lehman Family LLC <support@lehmanfamilyllc.com>` (display name so mail clients do not show just "support"). Resend permits any local part on a verified domain, so no mailbox is required to send; replies need one. If the user wants a real mailbox, change the constant (fallback `chris.lehman@lehmanfamilyllc.com`).

**Secrets.** `RESEND_API_KEY` replaces `SENDGRID_API_KEY` everywhere, imported from `$env/static/private`. This is a build-time import, so the key must be present as a build environment variable in each deploy workflow (it already is for SendGrid). Dev and production use separate keys.

**Test strategy.** `tests/handlers/email.test.ts` mocks `resend` (hoisted `emails.send`) and asserts recipient, sender, subject, link in both bodies, different subjects for the two emails, rejection and `{ error }` both causing 500. A small template test covers escaping. The global module double in `tests/helpers/services.ts` and `setup.ts` stays; only comments and fixture names change.

## Risks / Trade-offs

- [Domain not verified or DNS wrong, so mail is rejected or lands in spam] → Rollout checklist before deploy; human verification of an inbox delivery from dev and production; DMARC `p=none` to start.
- [Free tier daily cap of 100 or quota change] → Volume is a handful per month; the interface makes a swap cheap.
- [`RESEND_API_KEY` missing in a GitHub environment breaks the build] → Preflight checks the secret exists in `develop` before the merge; production checklist item.
- [Wording differs from the old templates] → Clean defaults, editable in one file.
- [Provider outage returns 500 on reset and add-user] → Unchanged from today, documented in spec.

## Migration Plan

1. Human: create Resend account, verify `lehmanfamilyllc.com`, create dev and production keys.
2. Human: add `RESEND_API_KEY` to GitHub environments `develop` and `production`.
3. Merge to `develop`; verify a real reset email from the dev site.
4. Merge to `production` after the same check; remove `SENDGRID_API_KEY` secrets and cancel the SendGrid account.

Rollback: revert the merge commit and restore `SENDGRID_API_KEY` (kept until step 4).
