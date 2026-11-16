# Bug reports

CERMS 5 provides a bug icon beside the account theme controls. It opens a
trusted, separate report window with a subject, priority, description,
main-window screenshots, native file selection, and captured renderer
diagnostics.

Submission is handled by the `submitBugReport` callable. The callable verifies
the signed-in UID and saved business, uploads report artifacts to the private
`cerms-7af24-cerms5-bug-reports` bucket, and queues
`mail/cerms5-bug-{requestId}` for the Firebase Trigger Email extension. The
message is addressed to `matthew@rocmtssolutions.com`, uses the reporter's
verified email as `replyTo`, and includes seven-day signed artifact links.
Retries with the same request ID are idempotent.

The private bucket must exist before deploying the callable. Do not use the
legacy shared bucket or write directly to the `mail` collection from the
desktop client. Automated tests use synthetic requests and never upload
artifacts or send email.
