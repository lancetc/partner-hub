# Live SOP playbooks

> Since 21 November 2026 a playbook is the Hub’s **Job Aid**: learners find them in **Work Tools** (`/tools`) and save them to **Favourites**, and the library is called **Job Aids**. Everything below still holds. What was added is in [job-aids.md](job-aids.md).

A playbook is a short, role-specific set of steps taken from an approved procedure (SOP). It appears in Magazine courses and on its own Resources page. It always shows the current approved release, and there's always a route to urgent help.

It's built from four parts:

- **A Magazine block** (type `playbook`, "Live SOP playbook") that places a snippet by reference.
- **The Resources pages:** `/resources/playbooks` lists the playbooks for the reader's role, with their Shift Wallet first. Each one opens at `/resources/playbooks/[id]`.
- **Ask a Lead / Flag a policy gap,** on every card.
- **The playbook library** (Admin, then Playbooks, at `/admin/playbooks`). Owners manage snippets, releases, source records, the contact directory and questions here.

A playbook helps someone find the right approved step. It isn't the procedure itself, an incident report, or clinical advice.

## What readers see

The same card appears wherever a snippet is placed.

- **The heading:** title, purpose, who it's for, and the risk class (operational, sensitive or safety-critical).
- **The release line:** "Approved · effective [date] · owner [team] · release [n]".
- **Urgent help:** a button on safety-critical cards and on any card showing its fallback. It shows "If someone is in immediate danger, call 000", then the escalation contact for the reader's role. There's no form in front of it.
- **Updated since you last viewed:** shown when a newer release was approved since the reader's last view, with each release's change summary.
- **I've read this release:** shown when the owner asks for acknowledgement. It records that the reader read the release, nothing more.
- **The steps,** grouped as **Do now** (outlined), **Then** and **If this is different**. Each step has:
  - an optional **Why this matters**;
  - **Ask about this step**;
  - a tick box that's only a reading aid on the screen. It records nothing, and the card says so.
- **Contacts for your role,** from the managed contact directory.
- **The footer:**
  - **Open full approved SOP** shows the source section, its system, owner and version, if the reader's role may see it. Otherwise it says the reader is seeing an approved excerpt.
  - **Save to Shift Wallet** saves a reference, never a copy.
  - **Flag a policy gap / Ask a lead.**
- **Questions about this playbook,** with labelled replies.
- **An uncontrolled-copy notice:** printed or exported copies are uncontrolled.

**When a procedure is unavailable,** the steps are replaced by "Procedure temporarily unavailable". The card shows the reason (if withdrawn), the approved fallback text, and the fallback contacts for the reader's role. This happens when the snippet is withdrawn, has no approved release, or is safety-critical and past its review date.

An operational snippet past its review date still shows, with "Due for review".

## Ask a Lead / Flag a policy gap

The form asks for:

- which step (or the whole procedure);
- the issue: unclear, source out of date, situation not covered, or "I need a lead to answer";
- the question, in general terms.

It reminds the reader to leave out names, addresses, clinical observations, visit dates and incident IDs. Questions already answered on that step are shown first, with "This answers it". A preview shows exactly what will be shared and who will see it.

What happens next depends on the question:

- **Urgent** (the reader ticks "something happening now, a specific person, or a possible incident", or the text sounds urgent): the form is replaced by the urgent route. Nothing is posted or stored. The card says asking here doesn't report an incident.
- **Might identify someone** (a name with an honorific, a date, a case or incident number with a digit, "my client", or an identifier pattern shared with Red Pen): the question is held as **Awaiting privacy review**. Only leads and the asker see it, and the asker is told so.
- **Otherwise:** it's posted to the snippet's questions, which everyone who can see the playbook can read.

In the last two cases the snippet's leads are alerted in the Hub inbox; if a snippet has no leads, every learning author is. Each send carries an idempotency key, so a retry never posts twice.

**Replies are labelled:**

- **Peer suggestion:** from anyone who isn't a lead.
- **Lead response:** from a learning author.
- **Policy-owner approved guidance:** an author chooses this explicitly.

A reply that might identify someone is refused. A reply about an earlier release is marked "About an earlier release: check the steps above". The card notes that answers are guidance, not the procedure.

**Question states:** Awaiting privacy review, Posted, Answered (after a lead or policy reply), Policy update pending, Resolved, or Not posted (declined, with a note to the asker). The asker can close their own question as answered.

## The rules it keeps

- **One release everywhere.** A block stores only the snippet's id. Every placement, the Resources page and a Wallet save resolve to the same current approved release for the reader's role. Approving a release, or withdrawing the snippet, reaches every placement at once.
- **Nothing shows until it's approved.** A release needs:
  - one to nine steps;
  - no phone numbers in the steps (contacts come from the directory);
  - an effective date and a future review date;
  - the policy owner's approval;
  - for safety-critical snippets, Clinical and Quality co-approval and a "Do now" step;
  - fallback text;
  - every contact it uses configured for every audience it's shown to;
  - a binding to the current source section.
- **A source change never changes the steps by itself.** Editing a source section creates a new source version. Owners and leads see "the source has changed", and the library shows a line diff. Readers keep the approved release. A release can't be approved against an out-of-date or missing source section.
- **Withdrawal is immediate** and needs a reason. It's audited, and so is restoring.
- **Role limits:** a snippet is only resolved for its audiences. The full source section shows only to roles the source record is shared with. Pending source changes show only to leads.
- **Courses:** a course can't be published with a playbook block whose snippet has no approved release or is withdrawn. "Publish anyway" doesn't cover this. A playbook is reference material, so it never holds up finishing a page.
- **Audit:** releases (with sign-offs, source version and a checksum of the steps), withdrawals, restores, source edits, contact edits and question decisions.

## The playbook library (`/admin/playbooks`)

For learning authors.

- **Questions waiting for privacy review** appear first. A lead can **Post it** or **Decline** it with a note to the asker.
- **Each snippet** shows its risk, owner, release state, placements and badges: Current, Review due, Showing fallback, Source changed, Source unmapped, Open questions.
- **Opening a snippet** shows:
  - **Where it stands:** withdraw everywhere or restore, view as a reader, the courses it's placed in, and the release history.
  - **The source change,** with a diff.
  - **Snippet settings:** title, role label, purpose, risk, owning team, audiences, source record and section, fallback text and contacts, and the contacts shown on the card.
  - **The release editor:** steps (kind, action and why; reorder, add or remove), change summary, effective and review dates, acknowledgement, and the owner, Clinical and Quality sign-offs. Then **Save draft**, **Submit for approval**, and **Approve and release**, with what's still missing listed.
  - **Questions:** reply as lead or as approved guidance, mark a policy update pending, or resolve.
- **New playbook snippet,** **Source records** (edit a section to create a new version), and the **Contact directory** (routes per audience).

## Built-in content

Two seed snippets start in review, unapproved, so nothing shows to readers until an owner signs them off:

- **Suspected SIRS Priority 1: first steps** (safety-critical). It keeps the worker's internal notification ("as soon as possible") separate from the provider's Commission notification for Priority 1 (within 24 hours of becoming aware). The authorised provider team makes the classification and any notification.
- **Correcting a rejected supplier invoice** (operational).

Their source records are **placeholder Hub policy records.** The two directory contacts (designated incident responder, finance support) start with no routes, so neither release can be approved until the real routes are entered.

## What isn't built yet

- **Real source documents:** the source adapter is the Hub's own versioned policy record, not the canonical SOP repository. Before publishing the SIRS example, replace its text with the current Trilogy Care incident SOP.
- **Community threads:** Community is device-local in the Hub, so questions live with the snippet rather than as a tagged Community thread.
- **Topics:** playbooks can't be placed in Topics yet.
- **Shift Wallet:** there's no separate Wallet page; the saved list is at the top of `/resources/playbooks`.
- **Expiry alerts:** a safety-critical snippet past its review date falls back for readers, but the owner isn't sent an alert; the library shows it as "Showing fallback".
- **Search and exports:** playbooks aren't in site search, and there's no export.
- **Reporting:** no response-time or gap reporting.
