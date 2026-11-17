# eLearning (SCORM)

Imported SCORM courses, such as Articulate Rise 360 and Storyline 360 exports, delivered and tracked in the Partner Hub. This page covers **Phase 1: the core player**. Phase 2 adds Hub integration, and Phase 3 adds SCORM 2004 verification and compliance features. The full requirements are in the eLearning PRD.

## What Phase 1 does

- **Import.** An author uploads a SCORM ZIP at **Admin › eLearning**.
  - The ZIP is checked as it's unpacked: paths, links, file types, sizes and compression ratio.
  - `imsmanifest.xml` is read to find the standard, edition, title, identifier and launch file. The launch file comes from the manifest, never assumed to be `index.html` or `story.html`.
  - The original ZIP and its files are kept privately.
  - Refused uploads are listed with the reason.
- **Preview and publish.** A new course is a draft. Authors preview it; preview attempts are kept apart from learner records and run with `credit: no-credit`. Publishing makes it available at `/elearning`.
- **Launch.** Opening a course starts or resumes the learner's attempt.
  - A finished attempt (completed, passed or failed, and not suspended) isn't reopened. Launching again starts a new attempt, and earlier attempts are kept.
  - "Start again" begins a new attempt on purpose.
- **Tracking.** Everything the course commits is kept:
  - completion and success, stored separately
  - score (raw, min, max, scaled)
  - bookmark (location)
  - resume data (`suspend_data`), never cut short
  - interactions
  - time spent, added from session time when the course finishes a session
- **Resume.** Relaunching restores the saved state before the course starts:
  - `entry` is `resume`
  - `total_time` is the running total
  - the bookmark, resume data and score are restored
- **Player.** It has a breadcrumb, a status indicator outside the course frame, a save indicator, **Exit course** (which asks the course to finish, then waits for the save), **New window**, and clear finished and error states.

## How it fits together

```
Hub page (Hub origin)                     Content origin (separate)
/elearning/<course>                       /api/elearning/shell/<launch token>
 ├─ status, Exit, save queue  ◄─postMessage─┤  scorm-again runtime as window.API / API_1484_11
 └─ POST /api/elearning/attempts/<id>       └─ iframe: /api/elearning/content/<token>/<launch file>
    (learner's sign-in)                            (the course finds the API in its parent)
```

- **Runtime.** It uses [scorm-again](https://github.com/jcputney/scorm-again) (MIT, v3.5.0), running in the player shell beside the course. Every SCORM call is answered at once from state restored before the course starts; Storyline reads its resume data immediately after Initialize.
  - The shell plugs in a custom commit service (`httpService`). Each commit sends the whole data model, flattened (`{"cmi.core.lesson_status": "passed", …}`), to the Hub page by `postMessage`, sent only to the Hub's origin.
  - The Hub page saves it with the learner's own sign-in. Course content never sees Hub cookies or tokens.
- **Saving** (`src/components/elearning/CoursePlayer.tsx`, `server/elearning/service.ts`).
  - Saves happen when the course calls Commit, LMSCommit, Terminate or LMSFinish, not on every API call.
  - Each commit carries a save number that counts from 1 in each launch. The server ignores a number it has already seen, so retries are safe.
  - Only the newest unsent commit is kept, because it holds everything. It's retried with backoff while offline, and sent with `sendBeacon` if the page closes with one still waiting. Unload is a backstop, not the main path.
  - Only the newest launch of an attempt can save. An older tab gets a clear "opened again somewhere else" message instead of overwriting newer progress.
- **The outcome rule** (`server/elearning/runtime.ts`, tested in `elearning.test.ts`):
  - **SCORM 1.2:** `passed` is passed, `failed` is failed (and finished), and `completed` is completed. `incomplete`, `browsed` or nothing yet is in progress.
  - **SCORM 2004:** completion and success are kept separately. A success status of `passed` or `failed` decides the result. Otherwise `completed` is completed, and anything else is in progress.
  - **Achievements stick.** Once passed or completed, a later save can't undo it, because courses sometimes report `incomplete` when reopened for review. A failed attempt can still go on to pass.
  - Opening or closing the player never completes anything.

## Security

- **Packages are untrusted** (`server/elearning/unzip.ts`).
  - Refused: absolute paths, `..`, backslashes, control characters, symbolic links, encrypted entries, duplicate names, executables and server scripts.
  - Limits: 20,000 files, 300 MB per file, 1 GB unpacked, 500 MB per upload, and a 200:1 compression ratio for large files.
  - Nothing is kept from a refused package.
- **Separate content origin** (`server/elearning/launchToken.ts`, `content.ts`).
  - Course files and the shell are served only on the content origin, and only with a signed launch token: HMAC-SHA256, valid for 12 hours, naming one attempt, its version, the launch session and the Hub origin.
  - The routes check the origin the browser actually asked for (the `Host` header), so course files are never served from the Hub's own origin.
  - Files are read only from inside their version's folder.
  - The shell may only be framed by the Hub, and course files only by the shell and the Hub (`frame-ancestors`). The shell runs only its own scripts (nonce CSP).
- **Saving goes through the Hub API.**
  - The server checks that the attempt belongs to the signed-in learner, that it's still open, and that the session and save number are right.
  - It validates every element name and value against the SCORM version: status and exit vocabularies, numeric scores, scaled score in −1..1, `suspend_data` limits of 4,096 (1.2) and 64,000 (2004) characters, and overall size.
  - A save that breaks a limit is refused whole, never cut short.
- **Audit trail.** Imports, refusals, publishing, attempt starts and resumes, outcome changes and refused saves are recorded in `scorm_audit_events`.
- **Inherent to SCORM:** the course reports its own result from the learner's browser, so a determined learner could fake a pass. The Hub records exactly what was reported, and from which attempt and version. For compliance, a SCORM completion shouldn't be the only evidence.

## Running it on this computer

- In development the Hub runs at `http://localhost:3000`, and course content is served from `http://127.0.0.1:3000`. Browsers treat those as different origins.
- Where the Hub is hosted, set `HUB_CONTENT_ORIGIN` to a separate subdomain (for example `https://content.hub.example`) that reaches the same app.
- Package files live in `data/elearning` (or `HUB_ELEARNING_DIR`), behind `server/elearning/storage.ts`, so they can move to object storage.
- Optionally, set `HUB_ELEARNING_SECRET` (32 characters or more). Otherwise a secret is generated and kept in the database.
- **Test course.** `src/server/elearning/__fixtures__/scorm12-demo` is a small hand-written SCORM 1.2 course, used by the tests: three pages with a bookmark and resume data, then a check that passes or fails with a score. Zip its contents and upload it to try the player. It isn't an Articulate course.

## Verified in Phase 1

Automated tests (`src/server/elearning/elearning.test.ts`, 19 tests):

- **Manifest reading:** SCORM 1.2, and SCORM 2004 2nd, 3rd and 4th edition labels; `xml:base` and launch parameters; a namespace fallback; refusals (not SCORM, missing launch file, external launch, escaping the package); warnings for multiple SCOs and for sequencing.
- **Safe unpacking:** folder structure kept; escaping and absolute paths, backslashes, executables, links, zip bombs, the file-count and per-file limits, and non-ZIPs all refused.
- **Runtime rules:** both time formats, save validation without truncation, the outcome rule (including "completed but failed" and achievements sticking), and what's restored on resume.
- **The service, end to end:**
  - import as a draft
  - a course zipped again inside one folder
  - refusals recorded, with nothing left behind
  - learners can't open drafts
  - launch, save, a duplicate save ignored, another learner refused, an older session refused, an invalid value refused
  - suspend and resume, with the bookmark, resume data and total time restored
  - a fail recorded as a fail, then a retake recorded as a new, passed attempt with the history kept
  - previews kept apart from learner records
  - tokens expiring and resisting forgery
  - files never read from outside a version

In the browser, with the test course (`localhost` Hub, `127.0.0.1` content):

- Upload, then the course shows as a draft with the launch file from the manifest. Publish, then Start.
- The course found the SCORM API through the frames: learner "Lee, Jordan", `entry: ab-initio`.
- Paging saved progress ("Progress saved", In progress).
- **Exit course** returned to the list as In progress, and the database held the bookmark (page 3) and resume data (`p2,p3`).
- Resume reopened on page 3 with `entry: resume` and the resume data.
- A wrong answer was recorded as **Failed, 0/100** and the attempt ended.
- "Start a new attempt" then a right answer was recorded as **Passed, 100/100**, with attempt 1 kept as failed.
- The content origin served the shell (200), refused it on the Hub origin (404), refused path traversal (404) and refused a bad token (403).

## Not yet verified, or not yet built

- **Real Articulate exports (Rise 360 and Storyline 360) haven't been tested.** None were available. The PRD rightly requires them before claiming support. Upload them at **Admin › eLearning**, as SCORM 1.2 first.
- **SCORM 2004** runs on the same runtime, and its manifests and data are handled, but it hasn't been tested with real packages in the browser. Sequencing isn't applied, and only the first SCO of a multi-SCO package is launched (the import warns about both). That's Phase 3.
- **Not built yet:**
  - Phase 2: the catalogue, assignments, learning paths, reports and certificates
  - Phase 3: versioning (uploading a replacement), expiry and refreshers, admin overrides
- **Hosting:** real use needs permanent file storage and a permanent database, plus a separate content subdomain. The current Netlify demo has neither. There, courses can't be uploaded (read-only disk), and launching gives a clear "needs a separate content address" message.
- **Not yet tested:** multiple tabs at the same time and lost connectivity, beyond what the automated tests and the code cover; mobile layouts; and the 500-concurrent-learner performance target, which depends on the production database.
