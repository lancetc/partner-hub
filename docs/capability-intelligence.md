# Internal learning and Capability Intelligence

Built from the PRD *Internal learning and Capability Intelligence* (19 November 2026). This note records how v1 works, the decisions made, and what is left. It covers the PRD's stages 3 to 5 (the governed framework, profiles and sign-offs, the aggregate heatmap) and the identity handoff. Stages 1 and 2 were mostly already true of the Hub; the one real gap is listed first under "Not yet".

- Learners: **My Capabilities** (`/capabilities`), in the account menu and beside My Discovery.
- Managers: **My team's capabilities** (`/capabilities/team`).
- People & Culture, Partner Operations, Quality: Admin → People & progress → **Capability Insights** (`/admin/capabilities`).

## The idea

A capability profile is an **evidence view**. It says what has been recorded, never how good someone is. There is no score and no percentage. Four stages are shown side by side, each with the evidence behind it:

| Stage | What shows it | What it means |
|---|---|---|
| **Introduced** | Finishing a mapped Topic, Magazine course or page | They've been through the material |
| **Practised** | Answering a decision in a mapped Topic, course or page | They made a decision in a learning setting |
| **Demonstrated** | Passing a mapped assessment: a path quiz, or a Topic's quiz in assessment mode | The defined knowledge was shown in that assessment |
| **Verified at work** | A named person's observation against the competency's behaviours | Someone saw them do it |
| **No evidence yet** | Nothing eligible recorded | Unknown. Not a judgement |

Each kind of learning can only ever support its own stage. Finishing a course cannot show Demonstrated. Nothing but an observation can show Verified at work, including evidence recorded by hand. **Needs refresh** is a flag on evidence older than the role's refresh rule; old evidence is never removed.

Never read: private notes and journals, pulse answers, Discovery Paths, Quick review answers, community posts, time on page, scroll depth, video watch time.

## What the Hub already had, and what it lacked

- **Had:** Topics, Magazine courses and path quizzes with their own completion and attempt records (these are the evidence sources; nothing is copied into a second grade book); Magazine courses limited to an audience; `users.manager_id`; an xlsx writer; an audit log.
- **Lacked:** any idea of a job role or team; a way to set someone's manager; observations (the existing Sign-offs page only confirms a spaced-learning sequence, and only for report admins); a link between learning and skills.

## The framework

**Role → competencies → observable behaviours → what the role asks for → mapped learning.**

- A **competency** has a stable id, a plain name, a definition, the behaviours an assessor ticks, an owner, a source and a review date. Every wording is a version. Rewording an approved competency starts a new draft; the approved wording stays in use until the draft is approved, by name. A **high-risk** competency is approved by Quality.
- A **role** belongs to one population (employees, or external partners) and has versions. Each version lists competencies with the stage asked for, criticality, and an optional refresh period. One draft at a time.
- **Before a version is released** the page shows what it changes: competencies added, removed or retargeted, how many people it applies to, how much learning is mapped to each, and warnings such as "nothing approved shows Demonstrated for this yet". A role with a high-risk competency needs Quality's review first, and changing the draft sends it back to Quality. Making it active records the approver, pins each competency at the wording approved that day, and keeps the earlier version.
- **Start the pilot** adds one care coordinator role and twelve competencies as **drafts**: starter wording for People & Culture, Quality and coordinators to rewrite. Nothing shows on anyone's profile until competencies are approved and a role version is made active.

## Mapping learning to competencies

On the **Learning and evidence** tab, an author or owner searches published Topics, Magazine courses and pages, and path quizzes, and proposes that one *introduces*, *practises* or *assesses* a competency. Only what the content can actually support is offered: something with no decisions can't practise, and only a path quiz or a Topic with an assessed quiz can assess.

A mapping is **Suggested** and counts for nothing until an owner approves it by name. An assessing mapping for a high-risk competency is Quality's to approve. Approval records the version of the content looked at; when that content is republished the mapping is flagged **Content changed since it was approved** for another look. Evidence people already earned is kept, with the version they earned it against.

## My Capabilities

For each capability of the person's role: the name and definition, what the role asks for, a one-line summary ("Assessment evidence present; workplace verification pending"), the four stages with each piece of evidence (what, when, which version, who signed it), what an assessor looks for, and a **next step** that fits the actual gap: review a Topic, practise a case, take the assessed quiz, or ask to be observed. Where no approved learning can show a stage, the page says so and that it isn't the learner's to fix.

The page explains what creates a record and who can see it. **Something wrong?** sends a correction request to the framework's owner, who answers by name; the learner sees the answer. If evidence was missing it's recorded as a new item. Nothing existing is rewritten.

## Managers: observations

A manager sees the people whose manager is set to them, each person's status per capability with the evidence behind it, and **Waiting to be observed**: capabilities whose role asks for Verified at work and hasn't got it (or needs a refresh), with anyone who asked first.

Recording an observation: tick each behaviour seen, the date, and a sentence or two on what was seen (with a reminder not to name a client). **Sign off** needs every behaviour ticked. **Needs more practice** records why and shows nothing as verified. A later observation supersedes the earlier one, which is kept. An observation can be **withdrawn** with a reason by the person who made it or the framework's owner; it stays on record as withdrawn. The audit log holds who, what and the decision, not the words.

Only the person's manager, or the owner of their population, can observe them. Never themselves.

## Capability Insights

- **Coverage**: for one role, rows are competencies and columns are "Everyone in this role" and each team. A cell gives the denominator and the distribution in words and patterns, not just colour: "2 of 5 at what the role asks for · 2 verified at work · 1 demonstrated · 2 no evidence yet". It shows the population, framework version, when it was read, how many people in the population have no role (so aren't counted), and observations waiting. **No approved way to show this yet** marks a competency whose "no evidence yet" is a gap in assessment coverage, not in skills.
- A role belongs to one population, so employees and partners are never added together.
- **Small groups**: someone with aggregate access only gets cells of fewer than five people hidden, and no names. The population's owner can open the people behind a row and one person's evidence; opening a person's record is logged. The threshold is the `capability_min_cohort` setting.
- **Export (.xlsx)**: Read me (definitions, version, snapshot time, exclusions), the role matrix and the heatmap. **With individual evidence** is a separate choice for the population's owner and is audited by itself.
- **People**: set each person's role, team, start date and manager, or paste rows from HR or onboarding. Each row is matched to one Hub user by id or email; anything that doesn't match (no such person, duplicate, unknown role or manager, wrong population) is reported back and left alone. This is the PRD's handoff contract in its simplest form.
- **Corrections** and **Access**.

## Who can see and do what

Nobody has capability access by default. A superadmin grants it on the Access tab.

| Access | Can |
|---|---|
| **People & Culture** | Own the employee framework and roles; see employees' records; answer their corrections |
| **Growth / Partner Operations** | The same for external partners and coordinators |
| **Quality** (also the Hub's compliance reviewers) | Approve high-risk competencies, their assessment mappings and roles that include them; see aggregates |
| **Aggregate insights** | The heatmap only, small groups hidden, no names |
| Authors | Read the framework and propose mappings. No people |
| A manager | Their own reports' records, and observing them |
| Everyone | Their own profile |
| Superadmin | Everything, including granting access. All of it is logged |

Owning one population shows nothing of the other. Someone outside a person's remit gets "not available", the same as if the person didn't exist.

## Data

`cap_access`, `cap_competencies`, `cap_competency_versions`, `cap_roles`, `cap_role_versions`, `cap_people`, `cap_mappings`, `cap_observations`, `cap_asks`, `cap_records`, `cap_corrections` (`CAPABILITY_SCHEMA` in `server/db.ts`, created on first use). Profiles are **derived on every read** from the Hub's own records plus these tables, so there is no stored snapshot to go stale; every status carries the role version and competency version it was read against.

## Not yet

- **Topics are not audience-restricted.** A Magazine course can be Internal (Trilogy Care staff), Partner or Shared through its audience, and that is enforced. A Topic can be opened by any signed-in user, and uploaded media is served to anyone with the link. So **internal-only learning must be a Magazine course for now.** Capability records and reports are restricted, by URL and by API. Closing this is the main piece of the PRD's stage 1 still open.
- **Question-level mapping and version-pinned attempts.** Evidence maps at the level of a whole assessment. A path quiz attempt doesn't record which question versions it used, so "the attempt used the required question versions" can't be checked yet. This is the same gap noted for the Question Pool.
- **An "Align to capabilities" panel inside the Topic and Magazine editors.** Mapping is done from Capability Insights.
- **AI-suggested mappings.** The Suggested → Approved workflow and an "AI" source label are there; nothing generates suggestions yet.
- **Outcome correlation** (stage 6): no metric definitions or dashboards. The PRD says this should wait for clean metric data and an approved definition.
- **Imported (SCORM) completions** as evidence, a **partner-specific capability view**, **development goals**, and **CASE** exchange.
- **A real HRIS or onboarding integration.** The handoff is a paste of rows; there is no scheduled sync or deprovisioning.
- **Notifications**: a manager isn't told when someone asks to be observed; it shows at the top of their queue.
- **Retention rules** for capability records, and a **privacy review** before any use in decisions about a person. v1 makes no automated decisions and shows no ranking.

## Not verified here

- Checked on throwaway data on the running Hub (pilot framework, one coordinator, mappings, an observation, the heatmap and export), then cleared. No real framework exists yet.
- The starter competencies are placeholder wording. They need People & Culture, Quality and coordinators to rewrite and approve them.
- Screen reader behaviour was checked by structure (labels, table headers, pressed and live regions), not with a screen reader.
- The export was checked for its sheets and that it downloads; it wasn't opened in Excel here.
