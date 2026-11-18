# Bug reports

CERMS 5 provides a bug icon beside the account theme controls. It opens a
trusted, separate report window with a subject, priority, description,
main-window screenshots, native file selection, and captured renderer
diagnostics.

Submission is handled by the `submitBugReport` callable. The callable verifies
the signed-in UID and saved business, uploads report artifacts to the private
`cerms-7af24-cerms5-bug-reports` bucket, and sends directly through a separate
CERMS 5 SMTP secret. The legacy Trigger Email extension and `(default)/mail`
are untouched. The message is addressed to `matthew@rocmtssolutions.com`, uses
the Firebase Auth token's email as `replyTo` (never the submitted display
email), and includes seven-day signed artifact links.

The dedicated `cerms5-support` service account has named-`cerms` database
access, create/read access only on the new private bucket, self-signing
permission, and access to `CERMS5_SUPPORT_SMTP`. That separate secret was
initialized from the existing CERMS 5 report transport without changing its
credentials, permissions, or the legacy mail configuration. Uniform bucket
access and public-access prevention are enabled; artifacts are immutable and
served as downloads. Nothing is uploaded to the legacy bucket.

Server-owned audits live under `system/{business}/bugReports/{uid}-{requestId}`;
the desktop cannot read or write those documents directly. The service derives
reporter identity and verifies saved business access on each request. A
per-user/business rate limit permits five new reports per hour. Retries of
identical sent reports never send another email. Preparation failures can be
retried; uncertain SMTP delivery is retained for support review and never
automatically resent. A preparing lease prevents concurrent sends. Existing
profile fields, Auth accounts and business records are not modified.

Up to five screenshots and 10 files are accepted, with an 8 MB combined decoded
limit. This keeps the complete base64 callable request within its transport
boundary. Attachments can be removed before sending. Basic bearer/JWT and
credential patterns in renderer diagnostics are redacted before audit storage.

The private bucket must exist before deploying the callable. Do not use the
legacy shared bucket or write directly to the `mail` collection from the
desktop client. Automated tests use synthetic requests and never upload
artifacts or send email. See `UPDATES-DEPLOYMENT.json` for deployed resources
and compatibility evidence. `node --test functions/bug-report.test.mjs` covers
validation, authorization, retry states, limits and immutable artifacts;
`npm run test:rules` also verifies concurrency with the real SDK in the isolated
`demo-cerms-rules` emulator. `node scripts/pos-smoke.mjs --setup-updates` covers
the trusted support window and screenshot/submission flow with mocked effects.

## Login support and download corrections — November 17, 2026

The login-page Support button opens the same trusted report window with an editable reply email and no sign-in/account creation. `submitLoginSupport` accepts only a login context with empty staff UID/business fields. It sends only to the fixed support address, marks the reply address as unverified, and writes only server-owned `supportRequests/{requestId}` and `supportRequestLimits/{hash}` in named `cerms`. Limits are three new requests/hour per reply email and client-IP hint, plus a hard global cap of 30/hour. No IP address is stored directly. Identical retries and uncertain-delivery handling match staff reports. These limits do not grant identity or business access.

Both report types now use an escaped HTML email with priority, description, reporter details, clearly labeled attachments and a separate diagnostics section, plus a plain-text fallback. New attachments retain their bytes and media types. Downloads have a safe original filename (including Unicode via RFC 5987); signed links explicitly set attachment disposition and content type, including when retrying an existing immutable object. Old already-sent links/objects are not rewritten. The same private bucket and support identity/SMTP secret are reused; legacy Storage and mail systems remain unchanged.

Focused verification: the support-service tests, the support endpoint/file-type checks and `scripts/login-support-smoke.mjs` only. The desktop is built once for packaging; unrelated suites are not run. No live test support request, Storage upload, account or email is created. Deployment evidence: `LOGIN-SUPPORT-DEPLOYMENT.json`.

## GitHub issues — prepared, credential required

New signed-in bug reports and login support requests create an issue in the public
`matthewstriks/CERMS` repository before sending the usual report email to
`matthew@rocmtssolutions.com`. Both HTML and plain-text email include the issue
link. The public issue contains the subject, description, priority, app version,
platform, Electron version, source and attachment count. Contact details, UID,
business, diagnostics, filenames and private attachment URLs are excluded.
Common email/credential patterns in public free text are redacted; users must
still avoid including customer information in descriptions. The report window
includes a public-repository disclosure for the next requested desktop release.

**Status: implemented and focused checks passed; not deployed.** The user has no
runtime GitHub credential yet. The connected chat GitHub app cannot supply one
to Firebase. Current production reporting stays email-only until setup succeeds.
No desktop release is packaged and no version is incremented.

One-time setup on the developer machine:

1. Open [GitHub fine-grained tokens](https://github.com/settings/personal-access-tokens/new).
   Name it `CERMS 5 support`, select resource owner `matthewstriks`, choose
   **Only select repositories → CERMS**, and grant repository **Issues: Read and
   write**. Leave other optional permissions off. Choose an expiration and record
   when it needs renewal. See [GitHub's token instructions](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).
2. In this project directory, run:

   ```sh
   node scripts/setup-github-issues.mjs --deploy
   ```

3. Enter the token at the hidden terminal prompt. Never paste it into chat or
   pass it as a command argument. The helper verifies the fixed repository with
   a read-only API call, stores the credential in Secret Manager, grants only the
   existing support identity access to that new secret, deploys only the two
   support callables and verifies legacy/shared resources unchanged. It does not
   create a test issue, email or upload. A noninteractive alternative is
   `--token-file=/absolute/path/to/private-file`, with file permissions `600`.
   The file is not deleted by the helper; remove it yourself after setup.

Deployment evidence is written to `GITHUB-ISSUES-DEPLOYMENT.json` only after a
successful deployment and compatibility verification. No rules/index/Auth,
legacy function, shared Storage or SMTP configuration changes are required.
The source-only configuration is `firebase.github-issues.json`. Never use a full
Firebase deployment to activate this feature.

Issue creation uses a persisted per-report marker and claim. Successful retries
reuse the saved issue. If GitHub's create response is lost, retries search the
repository's paginated issue listing (including closed issues) for that marker;
they never blindly create a second issue. An unresolved result requires review
and leaves the report unsent. A definite API rejection can be retried after the
configuration is fixed. SMTP uncertainty retains the existing review-required
behavior. There is no automated historical backfill. Token expiration or revoked
Issues permission blocks new submissions until the credential is replaced and
the two functions redeployed; do not bypass the report's saved request ID.

Focused synthetic verification only:

```sh
node --test functions/github-issues.test.mjs functions/bug-report.test.mjs
```
