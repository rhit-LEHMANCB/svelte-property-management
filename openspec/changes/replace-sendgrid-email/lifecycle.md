# Lifecycle: replace-sendgrid-email

- Branch: `claude/replace-sendgrid-email`
- Stage: 2 Propose + preflight (awaiting Gate A)
- Review round: 0 of 3
- QA cycle: 0 of 3
- Started: 2026-10-07

## Interview summary
(approved: yes, 2026-10-07)

**Goal.** Replace SendGrid (free tier retired; now a one-time 60-day trial, then about $20/month) with Resend (free: 3,000/month, 100/day, 1 domain) for the password reset and welcome emails, without changing user-visible behavior.

**Scope.**
- `src/lib/server/email.ts` sends through Resend (`resend` SDK) behind a small interface (`sendEmail({to, subject, html, text})`), so the provider can be swapped again.
- Reset and welcome emails become code templates in the repo (HTML + plain text, one `link` variable, "Lehman Family Realty" styling, clean defaults written by us).
- Sender: `support@lehmanfamilyllc.com`. With Resend any address on a verified domain can send without a mailbox; if a real mailbox is preferred for replies, fall back to `chris.lehman@lehmanfamilyllc.com` (one-line constant). Note: the issue text says `lehmanfamilyrealty.com`; the user chose `lehmanfamilyllc.com`.
- Remove `@sendgrid/mail`; replace `SENDGRID_API_KEY` with `RESEND_API_KEY` in `.env.example`, `firebase-hosting-merge.yml`, `firebase-hosting-pull-request.yml`, `playwright.config.ts`, `tests/fixtures/env-private.ts`, README and openspec config text.
- Update `openspec/specs/authentication/spec.md` (reset requirement no longer names SendGrid; welcome email scenario) and `test-suite` spec wording.
- Record the decision and alternatives in `design.md`.

**Out of scope.** Other emails, a sign-in reset link (#46), atomic user create (#40), marketing email, inbound mail, bounce webhooks.

**Roles.** Unchanged: unauthenticated users request a reset (`PUT /api/signin/reset`); admins create tenants (`/api/user/add`), which sends the welcome email.

**Data.** None. The link still comes from Firebase Admin `generatePasswordResetLink` with continue URL `PUBLIC_FRONTEND_URL/`.

**Behavior and edge cases.** Link generation failure or provider failure keeps the existing 500. Resend's SDK returns `{ error }` instead of throwing, so the wrapper must turn that into a rejection. Subjects: "Reset your password" / "Welcome to Lehman Family Realty". The link is attribute-escaped in HTML.

**Security.** API key server-only (`$env/static/private`), never logged; email contains only the link. Separate keys for dev and production.

**Acceptance.**
- WHEN a reset is requested THEN the Firebase link is mailed via Resend and `{status:"email_sent"}` is returned.
- WHEN a tenant is added THEN a welcome email (different subject and body) with a set-password link is sent.
- WHEN Resend rejects or errors THEN the endpoint responds 500.
- No reference to SendGrid remains in code, config or package files.
- Real delivery to an inbox (not spam) is verified by the human from dev and production.

**Rollout (human).**
1. Create a Resend account; add and verify `lehmanfamilyllc.com` (SPF, DKIM; DMARC `p=none` if absent).
2. Create two API keys (dev, production); add `RESEND_API_KEY` to GitHub environments `develop` and `production`. Needed on `develop` before the merge deploy.
3. Send a real reset email from dev, then production; delete the SendGrid secret afterward.

**Assumptions.** `resend` SDK; sender is a constant, no env var; e2e and PR checks use a dummy key; handler tests mock the SDK; automated QA never sends real mail (e2e cannot reach the provider).

## Gate A
Approved: no
Accepted preflight gaps: none

## Preflight
| Check | Result |
| --- | --- |
| git commit and push to origin | PASS (author set; push dry-run ok) |
| gh auth, scopes repo + workflow | PASS |
| `gh pr merge` permitted in this session | UNCONFIRMED: needs user confirmation at Gate A (else run halts at stage 5) |
| Playwright config with `qa` project, browsers installed | PASS (chromium installed) |
| QA credentials (QA_ADMIN_*, QA_TENANT_*) | FAIL: none set in env and no `.env.qa` (gitignored) |
| Dev deploy workflow passing on `develop` | PASS (last 3 runs success) |
| Local checks | PARTIAL: Node 22, Java 21, `npm run test` 254/254 pass. `npm run lint` and `npm run check` fail locally for environment reasons (no `.env`, CRLF checkout on Windows); CI is authoritative |
| Secrets for this change in GitHub `develop` env | FAIL (expected): `RESEND_API_KEY` not yet added; SendGrid key still present |

## Review rounds
(none yet; one line per round: blockers, majors, fixed, rejected with reason)

## Deferred findings
(minors, nits and known gaps to turn into issues at wrap-up)

## QA report
(filled in stage 6; link to the QA evidence branch)

## Verification checklist for the human
(filled in stage 7)

## Halted
(only if the run halted: stage, reason, evidence, next step for a human)
