# Onboarding: Your setup

Built from the PRD *Partner Hub onboarding* (19 November 2026). This note records how v1 works, the decisions made, and what is left. It covers the PRD's delivery stages 2 to 4: the wizard and returnable task list, the review queue and activation rules, the starting-point check with its handoff, and organisation-level tasks.

- Everyone: **Your setup** (`/onboarding`, in the account menu). Once active it's titled **Your profile and requirements**.
- People & Culture, Partner Operations, Quality: Admin → People & progress → **Onboarding** (`/admin/onboarding`).

## What was there before

`/onboarding` was a welcome wizard kept only in the browser (name, picture, "your work", a sample topic), with a prototype document checklist that was never switched on. Nothing was stored on the server, so it didn't follow a person to another device and nobody could review anything. There were no invitations, no user creation, and no private file store: authors' uploads are served publicly.

**Nothing changes until requirements are released.** With no requirements matrix in force, `/onboarding` shows that same welcome. Once one is released, the page becomes Your setup, and the sample-topic welcome is still offered at the bottom.

## The model

Four things are kept apart: a **task's status**, a **document's review**, **learning completion**, and whether the **account is active**.

**The requirements matrix** is one list of tasks, not a wizard per audience. Each task has:

| Field | Meaning |
|---|---|
| Kind | Confirm your details · Read and acknowledge · Provide a document · Check your starting point · First learning |
| For | Staff, care coordinators, Care Partners and suppliers; none ticked means everyone |
| Required to start | Optional tasks never block |
| Done once by the organisation | For a document or acknowledgement an organisation provides for all its people |
| Reviewed by Quality | For a document; otherwise the population's owner reviews it |
| Renew every (months) | For a document |

It is edited as a draft, **previewed for each audience**, and released by name. Earlier versions are kept. **Releasing never resets anyone**: a task keeps its id, so what people have done for it stands. For each *new* task the owner chooses whether it also applies to people who are already active. If it does, they get that one task (and read "Renewal required" until it's approved), not the wizard again.

What a person has to do is worked out on every read from the matrix and who they are **now**. It is never a cached tick from their first visit.

## Your setup

**First visit: a wizard.** Welcome (the role and organisation the Hub has for them, how many tasks, roughly how long), then one task at a time, then Review and start. Back, Continue and **Save and leave** on every step. Each task saves as it's finished and the step they're on is stored on the server, so another device picks up in the same place.

**Every visit after: a list**, in four sections: **Your next action**, **Waiting for review**, **Completed**, **Optional for later**. Each card shows its status in words, the time it takes, who reviews it, the reason if it was sent back, its end date, when it last changed, and a reference to quote when asking for help. An Inbox notification links straight to its task.

| Status | What the person is told |
|---|---|
| Not started | You can begin this task. |
| In progress | Your work is saved; continue when you're ready. |
| Submitted | It's being reviewed. There's nothing you need to do. |
| Needs action | Something needs correcting. See the reason and resubmit. |
| Complete | This requirement is satisfied. |
| Due to renew | It's still valid, but it's coming up for renewal (30 days out). |
| Expired | This no longer satisfies the requirement. |

A task that's with a reviewer is never listed under the person's next action, and the page says whose move it is: theirs, a reviewer's, or their organisation's.

**The tasks**

- **Confirm your details**: the name the Hub uses, and their role and organisation shown read-only. **This isn't my role or organisation** sends a request to the population's owner. It changes nothing by itself: nobody can give themselves a different audience.
- **Read and acknowledge**: done on acknowledging. If the statement is reworded later, everyone is asked again.
- **Provide a document**: PDF, JPG, PNG or WebP up to 10 MB, checked by its actual content, not its name. Uploading and **Submit for review** are separate steps. A file that's with a reviewer can't be swapped underneath them. **Replacing an approved document starts a renewal**, and the earlier approval keeps counting until it runs out or the new one is decided.
- **Check your starting point**: see below.
- **First learning**: a Topic or Magazine course, done when it's completed in the usual way. Nothing here records a completion.

**Start using the Hub** appears only when every required task is approved. Submitted isn't approved.

## Documents are private

Setup documents go to their own folder (`data/onboarding`), not the public uploads. A document is served only to the person it's about, their organisation's administrators (for an organisation's document), and the people who review it. Everyone else gets "not available". It's sent `private, no-store`. A reviewer opening one is audited. Events and audit rows never hold a file name, an answer or a reason.

## Organisations

A task marked **done once by the organisation** has one record per organisation. Its administrator (the Hub's `org_admin`) uploads and submits it; one approval covers everyone in that organisation and nobody outside it. Members see its status and that it isn't theirs to do.

An administrator also sees **where each of their people is up to** (state, how many required tasks are done, whose move it is). They can't open a person's documents or see their starting-point answers.

## Reviewers

Admin → Onboarding has four tabs.

- **Review queue**: submitted documents, oldest first, with age, a reference, and whether it's a resubmission. **Approve** (optionally with the document's own end date; otherwise the task's renewal period applies) or **Ask for a correction** with a specific reason the person sees. A submission someone else has already decided is refused, not overwritten. The person gets an Inbox notification that links to the task and carries no document details. "This isn't my role or organisation" requests are answered here too.
- **Progress**: for each population, how many people are at each state, and separately how many are waiting on a reviewer, on the person, or on their organisation, so a review backlog doesn't read as people not finishing. Median days from starting to active. Tasks sent back most often. A filterable, paged list of people showing what each is waiting for, and **Make an exception**.
- **Requirements**: the matrix, as above.
- **Starting-point checks**.

**Who reviews what** follows Capability Intelligence's access: People & Culture for employees, Growth / Partner Operations for partners and their organisations, Quality for documents marked for it, and superadmins for everything. One population's owner can't see the other's queue, funnel or documents.

**An exception** lets someone start before everything is approved. It needs a reason, records who granted it, and must end within three months. When it ends, the requirement is still outstanding.

## Check your starting point

A short set of **approved, versioned Question Pool items** for an audience, taken before assigned learning begins.

- The owner picks 3 to 10 approved questions and can tag each to a competency. Only an approved version can be chosen, and the set is **published by name**. If a question later stops being approved, the instrument is flagged and that question is simply not asked.
- The learner sees the intro ("This is not a pass or fail…"), two optional prompts (what they'd like help with; how confident they feel), then the questions one at a time. **I'm not sure** is offered on every question. Questions are sent without their answers.
- **The first answer is the record.** It's taken before any feedback and can't be changed by answering again. Nothing is revealed until every question is answered.
- The result is **"Start with these"**: the Topic or course each missed or unsure question comes from, with why, plus the reviewed guidance per question. **There is no score or percentage anywhere.**
- Finishing it is what completes the task. How it was answered **cannot** hold up activation, isn't a quiz pass, records no completion, waives no training, and shows nothing on a capability profile.
- People part-way through keep the version they started. Each response keeps the question version asked.
- The owner sees how each question was answered as **totals**, and only once five people have finished. An organisation's administrator sees nothing of it.
- **Handoff to Capability Intelligence**: `baselineSignals()` gives, per tagged competency, how many were asked and how they were answered, with the date and instrument version. It is labelled a baseline and is never evidence.

## Access

`accessFor(db, user)` is the one place that says whether someone may use the Hub in full: every required task approved for who they are now, or a current exception. See "Not yet" for what it isn't wired to.

## Data

`onb_configs`, `onb_instances`, `onb_tasks`, `onb_documents`, `onb_requests`, `onb_overrides`, `onb_instruments`, `onb_attempts`, `onb_responses`, `onb_events` (`ONBOARDING_SCHEMA` in `server/db.ts`, created on first use). Every task row carries the matrix version it was done under.

## Not yet

- **The gate isn't enforced on any feature.** The Hub shows who is and isn't active and whose move it is, but nothing is blocked for someone who hasn't finished, and new users aren't sent to setup automatically. This is deliberate for now: turning on a block would lock out everyone already using the Hub the moment a matrix was released. `accessFor()` is where to hook it.
- **Invitations and user creation.** Sign-in is still the demo, and there's no invite flow, so "who invited you" isn't shown.
- **HRIS, CRM and document-service integrations.** Role and organisation come from the Hub's own user record. Documents are stored by the Hub, not an external secured service, and there is **no malware scanning**.
- **Email.** Review outcomes go to the Inbox only. No invitation, activation or expiry emails, and no reminders.
- **Renewal prompts.** An approval nearing its end shows as "Due to renew" when the person looks; nothing tells them.
- **Later comparison** against the baseline (a comparable second set, and learning-gain reports).
- **The baseline shown inside Capability Insights or My Capabilities.** The handoff function exists; no page displays it yet.
- **Conditional tasks** (one depending on an earlier answer), **a person in more than one organisation**, **merging duplicate accounts**, **suspended and closed** states.
- **Scale.** The review queue and people list are paged, but the progress figures work each person's state out on request. That's fine for hundreds; at 11,000 to 20,000 it needs a stored summary. Nothing here has been load tested.
- **Bulk review actions** and assigning a submission to a named reviewer.

## Not verified here

- Checked on throwaway data on the running Hub (a five-task matrix, a document through correction and approval, activation, a published check taken by a coordinator), then cleared along with the test files. No requirements are released, so the live page is unchanged.
- Screen reader behaviour was checked by structure (labels, live regions, a described step indicator), not with a screen reader.
- Images were accepted by type in tests using a PDF; real JPG, PNG and WebP uploads weren't tried in the browser.
