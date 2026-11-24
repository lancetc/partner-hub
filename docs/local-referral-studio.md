# Local Referral Studio

Built from the PRD _Partner Hub: Local Referral Studio_ (21 November 2026), section 19's build request: a working fictional text roleplay for a GP practice manager and a hospital social worker, an explicit referral-stage model, evidence-based coaching and centrally managed claims, then stage-specific, co-branded draft assets with version and approval controls. Live referral data and email sending are out of the first release.

Two places:

- **The Work Tool**, `/tools/referral-studio`: **Practise a conversation**, **Create an approved one-pager**, and **Saved drafts and notes**. Only for the business owner and the people they authorise (`plannerAccess`, the same rule as Plan my business and the Contractor Network Builder). It's on the Work Tools page for them, found by "GP referral pitch", "hospital referral", "local one-pager" and "objection practice".
- **The Magazine block**, `referralstudio`: **Add a block → Simulate → Local Referral Studio**. The same practice, on the course's own copy of the scenarios. The debrief links to the Work Tool for people who may use it, and to the Referral Journey Calculator.

Nothing in either contacts a GP or hospital, creates a referral, enrols anyone or sends a message.

## What's reused, and what isn't

| PRD concept                     | Reused from                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The roleplay engine             | The Tough Family Call's engine (`lib/familyCall`): intents, beats, revelations, the server-side state the model can't change, `takeTurn`, `interpret` (hedges included), `proposalIssues` and `callerLineProblems` for the bounded caller, the scripted fallback, text and voice through the same turn, fixtures (`playFixture`), the authored-criteria rubric (`familyResult`), `cuesNow`, `caseFile`, `openCheck`, `endCall`, `cleanNote` |
| Model adapters                  | `askForJson` (Claude) and `openaiJson` (OpenAI), injected so tests use a fake                                                                                                                                                                                                                                                                                                                                                               |
| The referral-stage model        | `lib/referralJourney` (`STAGES`, `READY`, `EVENTS`, `SOURCES`, `referral-stages-1`), which that file held for the Studio                                                                                                                                                                                                                                                                                                                    |
| The Referral Journey Calculator | Linked from the debrief, not copied                                                                                                                                                                                                                                                                                                                                                                                                         |
| Business access                 | `plannerAccess` (`server/caseloadPlanner.ts`)                                                                                                                                                                                                                                                                                                                                                                                               |
| Job Aids and Favourites         | A **Local Referral Conversation** seed in `content/playbooks.ts` (unapproved), and pitch cards saved to Favourites as a `tool` favourite (`referral-card:<id>`)                                                                                                                                                                                                                                                                             |
| Marketing rules                 | The Partnering topic **Marketing Your Partnership** (Partnerships' draft, Oct 2026): how to describe the partnership, “never promise free”, and that anything mentioning Trilogy Care needs Marketing's approval                                                                                                                                                                                                                            |
| Print                           | The Hub's `growth-sheet` print rule (Print or save as PDF, A4)                                                                                                                                                                                                                                                                                                                                                                              |
| The register sheet              | A "Local Referral Studio" sheet in the Problem desk export                                                                                                                                                                                                                                                                                                                                                                                  |

It is **not** a third roleplay engine. A referrer scenario is compiled into a family-engine block (`engineOf`): the variant's answer about the stage, the call to action as a move or an unsafe move by stage, and the claim register's "do not generate" phrases as risk intents.

## Where things live

| Part                                                                                                                                                                                                                                                                 | File                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage next steps, personas, the five dimensions, the claim register's types and standing, the personal-details guard, scenario parsing, `engineOf`, turns, the scorecard and debrief, the referrer prompt, the block's parse, readers' copy, case check and sign-off | `src/lib/referralStudio.ts`                                                                                                                                                                                                              |
| The outreach kit: fields, checks, approval status, `buildKit`, saved-asset standing, the three measurement layers                                                                                                                                                    | `src/lib/referralKit.ts`                                                                                                                                                                                                                 |
| The claim register seed, the two scenarios, the block's starting copy and the kit template                                                                                                                                                                           | `src/content/referralStudio.ts`                                                                                                                                                                                                          |
| The register and template with Admin's status changes (audited)                                                                                                                                                                                                      | `src/server/referralClaims.ts`                                                                                                                                                                                                           |
| Attempts, turns, retention, the kit's saves and events, pitch cards, relationship notes, Admin aggregates, the Excel export and the Problem desk sheet                                                                                                               | `src/server/referralStudio.ts`                                                                                                                                                                                                           |
| APIs                                                                                                                                                                                                                                                                 | `src/app/api/tools/referral-studio`, `src/app/api/magazine/[id]/referral-studio`, `src/app/api/admin/referral-studio`                                                                                                                    |
| Pages                                                                                                                                                                                                                                                                | `/tools/referral-studio`, `/admin/referral-studio`                                                                                                                                                                                       |
| Screens                                                                                                                                                                                                                                                              | `src/components/referral/ReferralPractice.tsx` (shared), `OutreachKit.tsx`, `practiceDriver.ts` (server or the editor's local preview), `src/components/tools/ReferralStudioTool.tsx`, `src/components/magazine/ReferralStudioBlock.tsx` |
| Editor and Admin                                                                                                                                                                                                                                                     | `src/components/admin/MagazineReferralStudioEdit.tsx`, `src/components/admin/ReferralStudioAdmin.tsx`                                                                                                                                    |
| Demo article                                                                                                                                                                                                                                                         | `referralStudio` in `src/content/magazineDemos.ts` (key `referral-studio`)                                                                                                                                                               |
| Tests                                                                                                                                                                                                                                                                | `src/lib/referralStudio.test.ts`, `src/server/referralStudio.test.ts`, `src/components/referral/referralRender.test.ts`, `src/content/magazineDemos.test.ts`                                                                             |

## The stage model

The learner chooses the older person's stage before talking ("Unknown" is a valid choice). Each scenario offers some stages, and each **variant** sets what the referrer says when asked, and the referrer's **actual** stage, which can differ from the one chosen (the GP practice manager's "she has a package" turns out to be approved and waiting). The proposed next step and boundary come from `STAGE_NEXT`:

- **Unknown:** ask first. Never a provider sign-up pitch.
- **Needs assessment:** the My Aged Care route, with consent. An introduction isn't an assessment.
- **Approved, waiting:** explain the wait honestly. No provider moves anyone up the queue.
- **Allocated, choosing:** the approved services and intake process, an introduction with consent, no guaranteed start.
- **Receiving care, considering a change:** choice, transfer or support plan review through the approved process.
- **Urgent discharge:** the hospital's process and the reviewed escalation route; a handoff checklist, not a sales sheet.

A provider call to action counts as a good move only where the referrer's actual stage is allocated or changing; otherwise it's an unsafe move. The kit's call to action follows the stage too, and only "allocated" carries a provider-ready close (tested).

## The claim register

Nine claims, each with exact wording, public qualifiers, a usage note (never printed), what must never be generated, the phrases that show it, the referrer's challenge, the source, the owner and its status (`draft`, `approved`, `expired`, `withdrawn`). A claim is **current** only when approved, signed, effective and before its review date.

All nine are **draft** in the seed. Owners record a status in **Admin → Local Referral Studio** (approving needs the approver, the date, the effective date and a review date; every change is audited). A withdrawn or expired claim:

- blocks publishing a block that depends on it;
- blocks an approved export, and drops its line from any new kit, naming it instead;
- marks every saved asset and pinned pitch card that used it "Marked for review", with a replacement offered;
- in practice, shows "check with the owner" instead of its wording.

## The practice

1. **Choose** a goal, a referrer and a stage. Keep my words, or an unsaved practice (the words go when the next one starts, or after a day).
2. **Talk**, typed. The referrer's opening, then a reply at a time. On a phone: the referrer, the stage and a large reply box first; evidence and cues on a second tab. On a desktop: the conversation beside a narrow evidence panel (the stage guide, what you can say about speed and sign-on, the escalation route, and the claim register's wording). Ctrl+Enter sends. The **60-second timer** is a coaching aid: off until asked for, with pause, restart and off, and it never ends anything.
3. **Real personal details are refused** before anything sees them: a long number, a date, an email, an identifier word, a titled name or a street address. Nothing of the reply is stored, sent or logged; only `details_refused`.
4. **Close**: the referrer's concern, the older person's choice and consent, what's confirmed, what's still unknown, the next step, who owns it and the next contact, plus next steps to choose.
5. **Debrief**:
   - **Ready to use**, **A critical claim to fix: try again**, or **Worth another go**, with the score as a learning aid.
   - **Critical claims first**: the exact phrase, why it matters, the approved wording to say instead with its standing, the usage note, the source and the owner.
   - The stage you started from and what the referrer said, and the next step it calls for.
   - The **five dimensions**, 0 to 3, each with its criteria and the learner's own evidence phrases: Pathway fit, Listening and referrer value, Model and claim accuracy, Person-centred choice and consent, Practical close.
   - A suggested revision, the transcript, **Try again**, **Practise another**, **Make the one-pager for this stage** (Work Tool), and **Delete**.

The PRD's dimensions are read off the family engine's five: accuracy → Pathway fit, communication → Listening, boundaries → Model and claim accuracy, agency → Choice and consent, followThrough → Practical close.

Feedback never says a service is confirmed (the case check refuses an ending that does).

## The bounded referrer

Off by default. The Work Tool runs the reviewed script (`TOOL_CALLER`), and a block runs it unless an author switches it on. When it runs, the model gets the compiled scenario and the learner's words as data, and only proposes intent ids, quoted evidence and a line. Unknown ids refuse the proposal; a line that reveals the stage before it's asked, adds a number, claims a permission or sounds like staff is refused; either way the scripted reply is used, the turn is kept, the learner is told, and `caller_fallback_used` is logged with the reason. **No model has been run**: every model path is tested with an injected fake.

## The outreach kit

From one template, `local-outreach@1`, all locked text from the template and the register:

- **A co-branded one-pager**: title with the service area, who it may help (by stage), which step comes next, how Trilogy Care works, what to expect, sign-on, clinical decisions (hospital and nurse audiences), what to do next (by stage; a handoff checklist for an urgent discharge), contact, and a footer with the relationship, the template version and date, and "isn't endorsed by any GP practice or hospital". Print or save as PDF (A4); the same sheet is the mobile preview.
- **A pitch card**: the opening, the persona's likely objection, the approved answer and the next step. Save and pin to Favourites.
- **Three email drafts**: after a meeting, a useful follow-up, a later check-in, with placeholders that stay until filled, and a review checklist (accuracy, permission, sender identity, consent and unsubscribe, no patient details or endorsements, an approved channel).

Only these can change: the referrer type, the stage, the service area (from a verified list), the contact route (from an approved list), a one-sentence introduction, a reviewed example, and the email placeholders. Anything else sent is dropped. The free fields are refused if they carry an unapproved claim, an endorsement or logo, a link, or personal details.

It's **"Draft — review required"** until the template (brand/marketing, Partnerships, the referral pathway owner, Quality, Privacy) and every claim it uses are approved and current. Printing or copying saves the draft once and records `asset_downloaded` or `asset_copied`: never "sent", an introduction or a referral.

**Relationship notes** are by hand and have no free text: the date, the kind of organisation, the area, the draft used, the broad question theme, the next follow-up and its owner. They're relationship activity, never an introduction.

## Measures, kept apart

| Layer                 | What                                                                                                                           | Where                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Practice              | Attempts, people, critical claim flags on first attempts, dimension means (first and repeat), objections by referrer and month | Admin, the export, the Problem desk sheet                                 |
| Approved material use | Generated, approved at generation, printed, copied, pitch cards saved, relationship notes                                      | Admin, the export                                                         |
| Referral pathway      | Authorised introduction, suitable pathway, agreement, first service                                                            | **Not connected**: shown as such, never filled from practice or downloads |

Under five people, practice measures are suppressed. There's no ranking or leaderboard. The Excel export has the PRD's six sheets, each row with its date range, scope, metric, numerator, denominator, source, data quality and extraction time; it's for authors only and audited.

Events go to `referral_studio_events` with a key, pseudonymous ids and versions: `referral_studio_opened`, `roleplay_started`, `stage_selected`, `pitch_submitted`, `objection_answered`, `critical_claim_flagged`, `details_refused`, `caller_fallback_used`, `feedback_viewed`, `roleplay_completed`, `roleplay_retried`, `asset_draft_generated`, `asset_approved_for_use`, `asset_downloaded`, `asset_copied`, `pitch_card_saved`, `relationship_activity_recorded`. **No typed words are in any event** (tested).

## Privacy

- Practice is private to the person, even within their business. Drafts, pitch cards and notes belong to the business and are read only within it.
- The transcript, close note and quoted words stay for the retention days (30), or until the next practice for an unsaved one, then they're removed; the levels stay. The learner can delete a practice.
- Authors see aggregates only.

## Publishing

**The scenario check** (`studioCaseProblems`, never waived): every claim a risk points at is in the register; every critical risk has its approved correction; every move can be shown by an intent; each dimension has two or more criteria; a defensible ending, and a last ending with no conditions; no ending that says a service is confirmed; and every fixture plays to its expected ending.

**The sign-off** (`studioSignOffProblems`, inside the demo sign-off wrapper): the content owner, the referral pathway owner, Partnerships/Marketing, Quality/clinical governance and Privacy, the date, a review date, and the scenario versions they reviewed; each critical flag approved; no withdrawn or expired claim; the privacy notice; and the author's decision on the selection rationale.

The editor shows the case check, the claims and the sign-off as you type, and **Test a line** plays one reply on the reviewed script. AI suggestions while authoring are a disabled stub.

## Checked

- **Tests**: the engine and kit (`lib/referralStudio.test.ts`), the server (`server/referralStudio.test.ts`), the screens' markup (`components/referral/referralRender.test.ts`) and the demo article. The full suite passes.
- **In a background browser tab**, as the demo business owner, on the reviewed script (no AI call): the Work Tools card; at 375 px, choosing the hospital social worker at "Unknown", a refused Medicare number, a stage question, a same-day-care promise, the evidence tab, the close and the debrief with its critical claims; the kit's field checks blocking export, saving a draft, pinning a pitch card (and seeing it in Favourites as a draft), copying an email, and a relationship note; no horizontal scroll and no control under 44 px. At 1280 px, the GP practice manager's assumed stage, the conversation beside the evidence panel, and keyboard sending. The Admin page as an author.
- **By API**: the throwaway "ZZ Test referral studio" course's block, played as a learner without Work Tool access (archived afterwards, its attempts removed).

## Not yet

- **Voice.** Text and voice share the turn pipeline and scoring (tested), but there's no microphone in the Studio's screens yet; voice stays behind its flag until speech services and data handling are approved.
- **Three more personas** (pharmacist, community nurse or allied health, retirement village manager) are in the persona library but not authored as scenarios.
- **Topics and Challenges.** The block is Magazine-only.
- **The Referral Journey Calculator's "Local Referral Studio" placeholder** isn't wired to the Work Tool yet.
- **A form editor** for scenarios: JSON edits with the live check, for now.
- **The bounded referrer's evaluation set** against the real model.
- **CRM, a landing page or QR, and any email sending**: out of v1 by design.
- **Not checked in the browser**: the Magazine reader and the editor's preview didn't finish loading in a background tab (a known quirk), so they were checked by API and by rendered markup instead; printing to PDF; a screen reader.
