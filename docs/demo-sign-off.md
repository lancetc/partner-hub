# Demo sign-off

Many Magazine blocks can't be published until named reviewers sign them off, and **Publish anyway** never covers that. These include:

- the calculator labs: Cash Bridge, Next 10 Clients, Budget Lab, Suburb Growth, Missed Service, Workload Lens, Referral Journey and Hiring Runway;
- Spot the Hazard scenes;
- the 72-Hour Discharge Pivot (its placeholder sources and reviewers' sign-off; a scenario that fails its own check is never published, even under a demo sign-off);
- What Would You Do case threads;
- Red Pen;
- Spot the Signal;
- the other reviewed blocks.

A demo Hub has no real reviewers. A **demo sign-off** lets a superadmin publish such a course for a demonstration without pretending anyone reviewed it.

## Where it's on

- **On:** when `HUB_DEMO_SIGNOFF=1`, or on a local development server (`next dev`) unless `HUB_DEMO_SIGNOFF=0`.
- **Off:** everywhere else. **Leave it unset on Trilogy Care's servers.** For a hosted demo (for example Netlify), set `HUB_DEMO_SIGNOFF=1` there.

## Using it

In the Magazine editor, open **Review and publish**. On a demo Hub the publish form has a **Demo sign-off** box. A superadmin chooses **Record a demo sign-off**, then publishes as usual. **Remove the demo sign-off** puts the reviewers' gates back for the next publish.

- **It's recorded honestly.** The record names who recorded the demo sign-off and when, and the audit log has `magazine.demo_signoff` / `magazine.demo_signoff_removed`. Nothing is written into a block's own reviewer fields.
- **Learners aren't shown a notice.** Each edition published under a demo sign-off is recorded as one (`magazine_demo_editions`), so it can be found later; nothing is shown to learners.
- **Spot the Hazard works for learners.** In a demo edition, learners can be given any room variant that isn't retired, because none has been approved. Elsewhere only approved, reviewed variants on current sources are used.

## What it never skips

- A Red Pen case that looks like it holds a real identifier: a phone number, an email, a Medicare number or an address.
- A Job Aid block naming a Job Aid that isn't in the library.
- The Question Pool's approval gate, when "require approval" is on.
- The course's own review workflow, when `HUB_TOPIC_REVIEW=required`.

## Job Aids in courses

This is separate from the demo sign-off. A course can be published with a Job Aid that has no approved release yet. Learners don't see it until its first release is approved; the editor's preview shows where it will go. A withdrawn Job Aid still shows its fallback route. Before this change, placing an unapproved Job Aid stopped the whole course from publishing.

## Where it lives

| Part | Where |
|---|---|
| The switch, the records (`magazine_demo_signoffs`, `magazine_demo_editions`) and the rules | `src/server/demoSignOff.ts` |
| Skipping the reviewers' gates, and marking the edition | `publishGuide` in `src/server/magazine.ts` |
| The **Demo sign-off** box | `DemoSignOffBox` in `src/components/admin/MagazineApproval.tsx` |
| The learner banner | `Notices` in `src/components/magazine/GuideReader.tsx` |
| Spot the Hazard in a demo edition | `eligibleVariants(…, { demo })` in `src/lib/hazardScan.ts` |
| Tests | `src/server/demoSignOff.test.ts` |
