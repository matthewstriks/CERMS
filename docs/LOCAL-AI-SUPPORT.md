# CERMS Assistant

Implemented in desktop source; no desktop release was packaged or published for
this feature. There are no paid model APIs, cloud inference providers or AI keys.
A dedicated CERMS Assistant window opens from the Help icon next to Report a bug,
or from the login-page CERMS Assistant button. Bug reports/login Support stay in
their own window and work without the assistant or model.

## First use

1. Open CERMS Assistant using its Help icon. If Ollama is not running, choose **Download
   Ollama**. This opens the official Windows or Mac download page in the browser.
   The user installs and opens Ollama using its normal installer; CERMS does not
   silently install/execute a downloaded program, require an Ollama login or
   purchase a plan.
2. Return to CERMS and choose **I installed Ollama**, then **Download CERMS Assistant**.
   CERMS requests the fixed local `qwen2.5:1.5b` model from Ollama, shows progress
   and supports pausing the request and retrying. The model is approximately
   986 MB; Ollama itself needs additional disk space. See the official
   [model page and Apache 2.0 license](https://ollama.com/library/qwen2.5:1.5b).
   No model weights or runtime installer are committed to Git or included in the
   CERMS installer.
3. Ask a CERMS question. Answers run on the user's computer and can work offline
   once setup is complete. Ollama must be running. Response speed/quality depend
   on hardware and the small model; no physical-computer benchmark is claimed.
4. Expand the accompanying help articles to check the instructions. Choose
   **Finish chat**, or use the separate **Report a bug / Support** action. No ticket or
   business action is triggered by the AI itself.

Ollama stores the model in its own normal persistent model directory. CERMS app
updates do not download, modify or delete the installed model automatically.
A Check again operation detects an existing model and enables chat; repeated
setup does not re-pull an installed model. An interrupted download can reuse
Ollama's downloaded data when retried. Pause/close cancels CERMS's request;
Ollama controls its download workers and on-disk cache. Closing the assistant cancels
pending AI work and clears the conversation; it does not stop the shared Ollama
service or delete other applications' models. Linux setup is not offered.

## Documentation and local boundary

`docs/help/` contains 68 curated customer-facing process guides, bundled as raw
Markdown by `src/main/support-knowledge.ts` for the installed CERMS build. The
coverage review and article index are in [HELP-ARTICLES.md](HELP-ARTICLES.md).
Updating a guide is an ordinary source change; it does not retrain or redistribute
the model. Weighted title/keyword retrieval with plural/action normalization
selects up to three complete guides within a 6,000-character article budget.
Current-topic matches take priority over a small previous-question tie-break.
Two recent chat turns are separately limited to 600 characters each, preserving
space for complete procedures in the fixed local model context. Sources remain
available in full with readable paragraphs and numbered steps in the support
window. An unmatched question returns an explicit documentation-not-found
fallback. Responses are advisory and may be incorrect; supplied articles remain
available to read directly. Sources are the retrieved articles, not a guarantee
that every generated sentence was entailed by a citation. No web browsing,
customer-data retrieval, autonomous tools or business mutations are enabled.

Only the main process calls `http://127.0.0.1:11434/api/tags`, `/pull`, `/chat`
and the confirmed fixed-model `/delete` operation.
Endpoints/model names cannot be supplied by the renderer. Calls reject redirects,
have deadlines, response/request limits and cancellation, and permit one active
operation. Model tags identifying a remote/cloud host are refused, including a
fresh model check before each answer. No hosted fallback, paid subscription or
API-key configuration exists. Explicit model download does use the internet
through Ollama's registry, and the external installer page uses the browser.

Assistant chat/setup IPC verifies the dedicated assistant window's main frame.
Settings in the main workspace can check status (without transcript text) and
request removal through a native confirmation. Other windows, including bug
reports, cannot ask questions, download models or delete a model. Removal targets
only `qwen2.5:1.5b` on fixed loopback `/api/delete` using DELETE, never an arbitrary
path/model or shell command, and checks the tag is absent before reporting success.
It leaves Ollama/other models installed, with a warning that other apps using this
same model will need it again. Failed/canceled removal is not reported as success.
Ollama controls any shared layers/partial cache. Renderer sandbox, context
isolation, CSP, navigation policy and Firebase guards remain intact.

Chat receives only the typed question, bounded prior conversation and bundled
help articles. It never automatically receives Firebase tokens, identity/profile,
customer records, screenshots, attachments or diagnostic logs. Common credential
patterns are redacted from conversation text. Users are told not to enter private
customer details or passwords. The visible chat clears when the assistant window closes or a conversation ends.
The subsequent evaluation-email request below authorizes a durable local journal
until delivery; this supersedes the original memory-only retention design.

## Separate assistant and bug report windows

The assistant has its own bubbles, composer and in-chat thinking indicator.
Report a bug / login Support remains an independent form with its existing
screenshots, attachments, diagnostics and deliberate Send action. It does not
start/end the assistant or automatically attach transcripts. The assistant has no
bug-report sending or attachment-reading privileges. User-visible chat copy says
"Chats may be monitored for quality assurance" without displaying a private
recipient address. Finish chat/New chat/window close/application quit still queue
the full private evaluation report; those actions do not file a bug report.

The original chat needs no backend; its evaluation report uses only the dedicated
existing callable/audits, with no rules, Storage, Auth or other backend changes.
The separate pending GitHub credential setup is not activated by these changes.

## Focused verification

- `npm run typecheck`
- `npx vitest run tests/ai-support.test.ts` — synthetic model detection, fixed
  endpoints, remote-model refusal, split/incomplete download streams, reuse,
  documented answers/fallbacks and cancellation/reset.
- `npx vitest run tests/support-knowledge.test.ts` — guide coverage, all permission
  labels, representative process questions, context budget, corrected feature
  boundaries, topic changes and unknown-subject fallback.
- `node scripts/support-knowledge-smoke.mjs` — focused packaged-code integration
  in a disposable profile: bundled refund/duplicate guides in local-model prompts,
  expanded complete steps/line breaks and changed topics, with all effects mocked.
- One desktop build for `node scripts/ai-support-smoke.mjs` — mocked runtime
  setup link, model download, chat/thinking bubbles, independent bug reporting,
  wrong-window IPC denial, original-user attribution and model removal/reinstall.

All model responses/downloads, browser-opening actions and ticket delivery in
these checks are mocked. No real model was downloaded, question run against a
real LLM, account accessed, email sent, production record changed or release
published. Local model answer quality and performance remain for validation on
staff hardware after deliberate first-use setup.

## Automatic conversation evaluation emails — November 17, 2026

The user explicitly requested every finished AI conversation be emailed to
`matthew@rocmtssolutions.com`, including when the window/application closes or a
new action button is pressed. This supersedes the earlier optional-only sharing
and memory-only retention for this specific evaluation feature. The assistant
window displays its quality-assurance notice before questions are entered. Bug reports
remain independent; evaluation emails create no ticket or GitHub issue.

**Finish chat** ends and clears the current chat. New chat,
native assistant-window close and normal application quit do the same. Empty chats
produce no email. The private HTML/plain-text email includes every recorded user
question/AI answer without truncation, article titles, model/app version, computer
name, platform, client-reported start/end times, finish reason and a conversation
ID. Common credential redaction remains; email delivery works for login-page assistant use too. New conversations also
carry the staff UID/name/login-email/business snapshot captured at chat start, or
explicit signed-out state. Main-process code keeps it separate from model prompts
and captures it in the durable journal without tokens/passwords. It survives
offline retries and later account changes. Session/business changes finish the
old chat. Email labels identity as client-reported rather than independently
authenticated; older payloads remain valid and show Not recorded for user identity. An answer canceled during shutdown
is not invented: only the recorded question and completed responses are included.

A private `ai-support-email-outbox.json` under CERMS 5's per-user app-data directory
journals turns as they appear. Writes use a new owner-readable file and atomic
replacement, with a flush before acknowledging persistence. It stores pending
transcripts locally as JSON; no passwords or Firebase tokens are saved. Sealing
is persisted before clearing the draft. Successfully acknowledged transcripts
are removed locally. A recovered crash draft is sealed on next launch. Offline
sends retry with backoff while CERMS runs and on the next launch. Force quit/power
loss cannot send from a dead process; the journal provides next-launch recovery.
Normal quit allows up to eight seconds for delivery, then exits with the journal
preserved if needed. No background application/service is installed for delivery.

`emailAiSupportConversation` sends only to the fixed Matthew address through the
existing CERMS 5 support SMTP secret/service identity. It is a separate
login-capable callable with strict bounded schemas and new-conversation limits
of 10 per client-IP hint/hour and 100 globally/hour. It writes only metadata-only
`aiSupportConversationEmails/{id}` delivery audits and hashed-IP/global counters
under `aiSupportConversationEmailLimits` in named `cerms`. It does not store the
full conversation in Firestore, create public issues, upload Storage files or
modify staff/business records. Direct desktop reads/writes of these new paths
remain denied by the default-deny rules.

A stable ID/fingerprint makes already-sent retries harmless. SMTP acceptance that
cannot be confirmed is marked for review, never automatically resent; its local
pending transcript remains available for review. This avoids duplicate emails,
but ambiguous delivery needs manual inspection. A stale sending audit also returns
review rather than sending again. Device and conversation timestamps are client
reported and are labeled accordingly in the email.

Focused verification uses synthetic outbox persistence and SMTP responses plus
an isolated-profile Electron lifecycle check:

```sh
npx vitest run tests/ai-conversation-outbox.test.ts tests/ai-support.test.ts
node --test functions/ai-conversation-email.test.mjs
node scripts/ai-conversation-smoke.mjs
```

The generated server validator is rebuilt with `npm run build:ai-conversation-domain`.
Scoped deployment config: `firebase.ai-conversation.json`. Only
`functions:cerms-staff:emailAiSupportConversation` is in scope. Compatibility and
ACTIVE-state evidence is recorded in `AI-CONVERSATION-DEPLOYMENT.json` after
verification. No real test conversation email, business write or model download
is performed. Desktop packaging/version changes remain separately requested.

## Assistant refresh — November 18, 2026

Settings → CERMS Assistant offers status checks, Open CERMS Assistant and
Remove assistant download, with native cancel/confirm and a fixed local model
only. A successful removal finishes an idle chat before returning to setup.
No automatic model deletion or arbitrary model/filesystem management is exposed.
The model/runtime are not bundled or removed during normal CERMS updates.

Deploy only the backward-compatible `emailAiSupportConversation` update via
`firebase.ai-conversation.json`. Read-only before/after compatibility evidence is
recorded in `ASSISTANT-DEPLOYMENT.json`. Original-user snapshots are optional for
legacy queued payloads; existing fingerprints/retry handling are preserved.
No production test conversations/emails/accounts/model downloads/deletions are
performed, and no desktop release/version increment is authorized by this change.
