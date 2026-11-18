# Member profile files

Open a member profile and use **Files & signed waiver**. Staff with the existing **Edit member records** permission can choose multiple files to upload. The fixed owner retains upload access. Any signed-in staff member may view/download attachments for members in their saved business, matching member/profile read access.

New uploads preserve original bytes and filenames (with unsafe filename characters normalized for Windows/Mac downloads). Each file may be up to 20 MB; files upload one at a time. Supported images (JPEG, PNG, GIF, WebP) and PDFs have **View** and **Download** actions. View opens the default browser; Download requests the original file with its filename. Other formats, including Office documents, HEIC/TIFF, archives, SVG and HTML, remain available through Download. They are not rendered inside the privileged CERMS window.

Content type is derived from original byte signatures for browser-viewable formats, rather than trusting a selected file’s extension or supplied MIME type. Unknown formats are delivered as `application/octet-stream` with attachment disposition. Images are not resized, recompressed or stripped of metadata. PDF contents are not rewritten.

Existing member attachments and signed-waiver links remain visible through their existing read-only flow. Uploading a document does not change waiver status. No legacy files or profile arrays are rewritten/copied/deleted.

## Storage and authorization

The new `memberFiles` callable handles list, upload and temporary read links. Every action checks the authenticated UID against its existing profile, saved business, existing system and member’s business. Uploads additionally require owner/`editMembers`, including revalidation before finalizing metadata. Missing/deleted or foreign-business members are denied. Roles and profile access are never written by this flow.

New attachment metadata is server-owned beneath `system/{business}/memberFiles/{memberId}/files/{fileId}` in named **cerms**. No direct desktop Firestore or Storage writes are enabled, and existing rules/indexes remain unchanged. Listing uses a bounded timestamp/document-ID query with cursor pagination and requires no composite index.

Original objects live only in **cerms-7af24-cerms5-member-files**, a new isolated private bucket with uniform access and enforced public-access prevention. The existing CERMS 5 support identity receives only object-creator/viewer permissions on that new bucket, reusing its already-configured self-signing permission. Project IAM and existing bucket, Auth and shared Storage configurations remain unchanged. The object key includes business/member/request IDs and a SHA-256 content hash; create-only generation preconditions prevent overwrites.

An upload request reserves metadata before storing bytes and finalizes it only after verifying object metadata and current access. Stable request IDs/fingerprints make identical retries reuse the object instead of creating duplicates. In-progress/failed records do not appear as ready attachments. The dialog retains failed selections/request IDs for retry while open; refresh lists uploads whose reply was lost. Closing the profile/app ends that in-memory selection queue. No background upload, deletion or automatic migration occurs.

Read links are issued only after reauthorization and object-integrity checks, expire within five minutes, and are not stored in profiles/Firestore. A recipient holding a link can use it during that short window, so permission revocation prevents new links rather than revoking an already-issued link. Main-process IPC accepts only trusted-renderer requests and tightly scoped signed URLs for this isolated bucket; legacy bucket links retain their existing allowlist. No member file is rendered as application HTML or automatically launched as a local executable.

## Verification and deployment

Focused synthetic checks cover original bytes, filenames, read/download headers, retry idempotency, object integrity, current-business/member checks and upload permission revocation. Client/guard checks reject direct Storage writes and unrelated/long-lived file URLs. The isolated Electron flow uploads a PNG and PDF, loses the first reply, retries without duplicate storage, lists both alongside an existing attachment, exercises View/Download through the real IPC guard, and verifies member fields stay unchanged. Cloud, browser and Storage effects are intercepted; no real member uploads, downloads, emails, accounts or production test documents are used.

Typecheck and the desktop build passed. No rules/index changes were needed, so no unrelated rules/build suites were run. Scoped deployment uses `firebase.member-files.json` for only `functions:cerms-staff:memberFiles`; setup creates only the new bucket and its scoped IAM bindings. Deployment is complete and the callable is verified ACTIVE. Before/after metadata evidence is recorded in [MEMBER-FILES-DEPLOYMENT.json](MEMBER-FILES-DEPLOYMENT.json). All pre-existing functions, rules/indexes, database settings, bucket/IAM/secret policies and schedules were verified unchanged. No desktop packaging, publication or version increment is part of this update.
