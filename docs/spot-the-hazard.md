# Spot the Hazard: interactive room scans

A reusable Magazine block (type `hazardscan`, labelled **Spot the Hazard**) that can also be placed on a Topic card by reference, and a demo article. The learner looks around a drawn room in someone's home, flags what needs attention, says what they'd deal with first, then chooses what to do within their role. The outcome is **notice → judge priority → respond**, including talking with the older person, dignity of risk, reporting and escalation. It isn't a pixel hunt: flagging everything scores worse than a careful look.

Source: _Partner Hub: Spot the Hazard interactive room scans, PRD_ (19 November 2026). This build is the first release (PRD section 13): the 2D room scan with the three pilot scenes (section 5), variation and randomisation (6), scoring and feedback (7), authoring and governance (8), accessibility (9), privacy (10) and reporting (12). The acceptance criteria (14) are tests. **The 360-degree scene mode is out of scope**: a later phase (PRD step 4), after the 2D and list routes are proven.

In the Magazine editor: **Add a block → Practise → Spot the Hazard** (the palette has no "Interactive" group; Practise sits beside Spot the mistake).

## Key decision: rooms drawn in code, not photos

Each room is an SVG template, and each object a small drawing placed at known coordinates (`src/components/hazard/SceneArt.tsx`). A variant swaps which objects appear, how they look (a brake pedal up or down, a rug flat or curled) and where, without new images. So:

- a reviewer verifies the exact depicted object and its location against the drawing;
- a tap region can never point at something absent from the scene (tested: every object a variant names is drawn);
- scoring is deterministic, and there's no paid image generation;
- the same scene works in light and dark modes (palette variables on the wrapper), at any size, and a list route can describe exactly what's drawn.

Everyday items and personal possessions (photos, a late sister's boxes, gardening gloves, secateurs, a bowls bag) are drawn as non-hazards. The same object can be safe in one variant and a hazard in another (a walking stick by the bed or across the room; boxes along the wall or in the path), which is the judgement the PRD asks for.

## Reuse: what was reused, and why it's a new block type

- **Topic `hotspot` card and Magazine `hotspots` / `spot` blocks.** Reused their patterns: positions as percentages of the picture, each spot a real keyboard button over the image, a list of the same spots, a found/missed state. Not extended, because both put the answer in the client (a spot _is_ the answer), score nothing on the server, have no variants, roles, actions or governance, and use an uploaded photo. Spot the Hazard needs every object (hazard or not) to be a candidate, the key kept on the server, variants chosen per attempt, and a reviewer per variant. Extending `hotspot` would have changed what existing cards mean. A new type keeps it additive.
- **Budget Decision Lab (`budgetlab`)** is the template for everything around the block: the registry contract, `lib/magazine.ts` wiring, readers' copy, hard publish problems ("Publish anyway" doesn't cover them), a server module with a lazily ensured table, idempotent attempt writes, events with keys and versions and no free text, author totals suppressed under five people, and Topic placement by reference.
- **Topic placement** follows `labRef` exactly: an optional, additive `sceneRef: { guide, block, why? }` on a card, set by **Spot the Hazard on this card** on an image card (`LessonSceneField.tsx`), offering only scenes in published courses. The player renders `TopicSpotTheHazard`, which loads the published block (`?embed=1`) and renders the same component and attempt. A separate field rather than widening `labRef`, so neither feature's placements, queries or register can confuse the two.
- **Characters**: Mrs Pearce, Mr Okafor and Dot from the character library, keeping their established facts (see the pilot scenes below). Drawn out of frame, so no portrait is needed; `charactersInBlock` names the person so the scene is found from their profile.
- **Job Aids**: linked by reference with `AidSection` (`ask-before-changing-the-plan` for Mrs Pearce, `sirs-first-steps` for Mr Okafor).
- **Question Pool**: not used yet (see Not yet).

## Where things live

| Part                                                                                              | File                                                                                               |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Model, scoring, selection, geometry, preflight, readers' copy, parsing (pure)                     | `src/lib/hazardScan.ts`                                                                            |
| **Sources** every rationale and action rests on, with status and review date (for Quality review) | `src/lib/hazardSources.ts`                                                                         |
| The three pilot scene families                                                                    | `src/content/hazardScenes.ts`                                                                      |
| Room templates and object drawings                                                                | `src/components/hazard/SceneArt.tsx`                                                               |
| Attempts, events, totals, placements                                                              | `src/server/hazardScan.ts` (table `hazardscan_attempts`, created by `ensureHazardScanTables`)      |
| Learner API (`?embed=1` for a Topic card, `?stats=1` for authors)                                 | `src/app/api/magazine/[id]/hazardscan/route.ts`                                                    |
| Every live scene, its reviewers and sources (`?source=` to trace one), for authors and Quality    | `src/app/api/admin/hazard-scenes/route.ts`                                                         |
| Learner view, the editor's local preview, and `TopicSpotTheHazard`                                | `src/components/magazine/SpotTheHazard.tsx`                                                        |
| Editor                                                                                            | `src/components/admin/MagazineHazardScanEdit.tsx`                                                  |
| Topic card field                                                                                  | `src/components/admin/LessonSceneField.tsx`; `sceneRef` on a card in `src/content/lessons.ts`      |
| Demo article                                                                                      | `spotTheHazard` in `src/content/magazineDemos.ts` (key `spot-the-hazard`)                          |
| Tests                                                                                             | `src/lib/hazardScan.test.ts`, `src/server/hazardScan.test.ts`, `src/content/magazineDemos.test.ts` |

Wired in the usual places: `lib/blockRegistry.ts` (its activity contract, action "notice"), `lib/magazine.ts` (type, label, parse, minutes), `lib/characters.ts`, `server/magazine.ts` (readers' copy, activity list, publish preflight), `MagazineEditor.tsx` (palette, icon, hint, new block from Mrs Pearce's scene), `MagazineInteractiveEdit.tsx`, `InteractiveBlocks.tsx`, `LessonEditor.tsx`, `LessonPlayer.tsx`.

## The model (PRD section 11's entities, as one block)

| PRD entity       | Here                                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scene_family`   | The block: `familyId`, title, roles, room, objective, person, care-plan facts, task, areas, rules                                                                 |
| `scene_release`  | `release` and the block's `approval` (Quality, policy owner, learning reviewer, dates, `releaseReviewed`), frozen in each published Magazine edition              |
| `scene_variant`  | `variants[]`: id, `version`, roles, dim, status (draft, in review, approved, retired), objects, and its own `review`                                              |
| `scene_item`     | `objects[]`: neutral id, stable `concept`, drawing (`kind`, `look`), centre and tap region in percentages, area, neutral label and description, and the `key`     |
| (actions)        | `decisions[]`: by hazard concept, role-specific options with a verdict, what each leaves out, feedback and a source                                               |
| `scene_attempt`  | a `hazardscan_attempts` row: learner, edition, block, attempt number, family, release, variant id, version and hash, scorer and scene versions, role, seed, place |
| `scene_response` | the row's state (flags with reasons, priority, routes used, chosen actions, items reported unclear), findings and debrief, kept as given                          |

The answer key on each object: hazard or safe, category (trip or fall, equipment, infection control, other), priority (3 deal with it first, 2 this visit, 1 worth raising), weight (importance, not size), critical (only where approved policy supports it), the exact depicted feature (for the reviewer), the explanation (why it matters here, or why it isn't a hazard here) and the source.

## The learner's path

1. **Set the scene**: the task, the role they're playing, the person, what the care plan says, and that it's the person's home. Practice, a drawn fictional room, no timer.
2. **Scan the room**: the picture (every object a button; zoom by buttons, scrolling when zoomed) or **List the room** (by area, each object with its neutral description). Flag, give an optional reason (trip or fall, equipment, infection control, other, not sure), remove. "Selection added/removed" is announced with the count. Tapping empty space says so and points to the objects and the list. Then **which would you deal with first?** (or "I'm not sure"), and **Submit findings**. Saved as they go, so a refresh resumes.
3. **What you found**: Found, Worth another look (the most important first), Not a hazard in this context, each with why; what comes first; and the marks on the picture (shape and word, not colour). "This seemed unclear" sends an item id to the content owner.
4. **What would you do next?**: one or two approved, role-specific actions about the room's top-priority hazards, asked whether or not the learner found them (and saying which). Options are in a fixed order that isn't the authored one, so the best isn't always first.
5. **Debrief**: the three dimensions in words (no percentage), What you noticed, What you missed, What you would do (with what a response leaves out and a stronger one), Why it matters, Review the scene (every item, including why the safe ones are safe), the Job Aid, the sources, the versions, and **Try another room**.

The server enforces the order. Completion is recorded once the debrief is on screen, as a **visual practice completion** (`signal: visual_practice_completed`), never a pass.

## Scoring and feedback (`hazard-scorer-1`)

- **Recognition**: each hazard's weight once, however it was flagged (picture or list; duplicates count once), less one point per safe item flagged. Flagging half the safe items or more ("indiscriminate"), or missing a critical hazard, caps it at Partly. Tested: flagging everything never scores better than flagging the top hazard alone.
- **Priority**: the learner's first pick. The room's top priority is Strong; the top of what they found (with something more urgent missed) is Appropriate; a lower hazard, or "not sure", is Partly; a safe item is Not yet.
- **Response**: each chosen option's verdict (best, acceptable, unsafe), the weakest one counting. Judged apart from recognition: someone who spots the cord but would remove it without asking gets action feedback naming consent and preference; someone who missed it is told so first.
- A reason that doesn't fit the category is noted, never marked down.
- Levels are kept for reporting; learners see words. Every attempt keeps its variant, version, hash, scorer and scene versions and the debrief as given; a later edit or republish never changes it.

## Variation and selection

- At the start of an attempt the server takes the approved variants this learner can be given (their role, a complete review, current sources, sound geometry) and picks one from a repeatable seed (user, course, edition, block, attempt number), **preferring one they haven't seen** on this block in any edition. If every room has been seen it avoids the last one and the attempt says it's a repeat. It never claims endless variety: the editor shows, per role, how many approved rooms there are and when a retry repeats.
- The variant and the actions for the learner's role are frozen on the attempt. A resent start, submit or retry returns what's there.
- Role: Care Partners play the care partner or support worker; a partner whose service role is cleaning, gardening or maintenance plays the supplier worker where a scene offers it; coordinators and Trilogy Care staff play the coordinator; otherwise the scene's first role.
- Picture and list routes use the same frozen item set and scoring, so the routes are equivalent by construction.

## Authoring and governance

The editor is the PRD's guided workflow in five tabs:

1. **Purpose**: title, objective, family id and release, format (practice; assessed is shown but can't publish), roles, room, person, care-plan facts, task, areas, the rules (hazards per variant, safe items, top-priority hazards, action questions), reasons on or off, why it matters, Job Aids.
2. **Scene and items**: each variant drawn live with its regions outlined (solid hazards, dashed safe items) and labelled. Choose an object to edit its drawing and look, place (or **Place it on the picture**), size, tap region, neutral name and description, and its answer key. Problems show as you go: overlap, off the edge, too small for a phone, missing explanation, a description that gives the answer away, no action for a role. Add, duplicate, reorder variants.
3. **Actions**: per hazard concept, the question, source and role-specific responses with verdict, what each leaves out and feedback.
4. **Review and publish**: each variant's named reviewer, date and six checks (object, location, risk, actions, sources, tested as a learner on desktop, phone and list), status (Approved is disabled until everything passes), coverage by role, the release sign-off, sources with their status, and the publication preflight. A disabled **AI assistance** stub explains what it will and won't do.
5. **Results and placements**: where it's live, and totals by variant and item.

**Changing an approved variant** (or an action it asks) sends it back to draft as a new version, reviewed again; attempts already made keep theirs.

**Publication preflight** (`hazardScanHardProblems`, which "Publish anyway" can't waive) blocks publishing unless: the scene is set; at least **two** approved variants; every approved variant passes its checks (objects drawn, every hazard with its depicted feature, explanation, category, priority and a current, non-placeholder source; every safe item explained; neutral descriptions; areas; geometry; an approved best action for every role about the top hazard and any critical one) and its named reviewer recorded every check; every role has at least one approved room; practice mode; and the release is signed off for **this** release, with the review date not passed.

Use the editor's **Preview** (desktop and phone) to play any variant that isn't retired, in any role, with the picture or the list. The preview computes locally and stores nothing.

## Accessibility (PRD section 9)

- **List the room**: by area, each object with a non-leading description of what's visible; the same flags, priority, actions and feedback.
- Every object is a labelled button with its description, in list order (area, then left to right); visible focus; pressed state and flag number on the marker; a tray to change reasons and remove flags.
- Focus moves to each step's heading after the learner acts. "Flagged" and "removed" are announced with the count.
- Tap regions at least 8% × 12% of the scene: about 25 × 25 pixels on a 375-pixel phone, before zoom. Controls are at least 44 pixels tall. Zoom by buttons, never pinch or drag; no timer; no sound; no motion.
- Markers carry a number or a word and a shape, never colour alone; thicker rings with `prefers-contrast: more`.
- The debrief is a structured list. Objects are revealed only after submission.

## Privacy, media and security (PRD section 10)

- Drawn, fictional rooms only: no real home, photograph, camera or location. Nothing is uploaded and nothing is sent to an AI service.
- Readers get the block without variants, actions or debrief. The attempt API sends the frozen room's drawing data and neutral descriptions, with no key, concept or rationale, until findings are submitted. Scoring uses the server's frozen copy; unknown ids are dropped and duplicates count once.
- Events carry ids, counts, levels, versions, role, route and place (`magazine` or `topic:<slug>`), with an idempotency key: never free text (there's none to type) and never a location.
- Totals for authors show item and action breakdowns only with five or more people on a variant.

## Reporting (PRD section 12)

- `GET /api/magazine/[id]/hazardscan?stats=1` (authors): attempts, people, submitted, completed, retries, repeats, picture/list/both routes; per variant and version: found / missed / flagged-in-error per item, items reported unclear, action choices and level spread (five or more people).
- `GET /api/admin/hazard-scenes` (authors and Quality): every published scene with its Magazine and Topic placements, release, approved variants and reviewers, approved rooms per role, and sources with their status. `?source=<id>` lists only the scenes resting on that source, to trace a policy change to every live placement.
- Withdrawing: set a source's status to `review-required` or `withdrawn` (or let its review date pass) in `lib/hazardSources.ts`, or retire variants and republish. Variants citing it leave selection at once (a new attempt gets "being reviewed", 410), publishing is held, and historical attempts stay intact.

## The pilot scenes (PRD section 5)

All three are **in review**: no variant is approved, no reviewer named, the sign-off empty. Several items cite **placeholder** Hub policy records on purpose, so no variant can be approved until Quality supplies the current Trilogy Care procedure. Hazards, priorities and actions are design examples for review.

| Scene                                                   | Roles                     | Variants                                                                                                                                                                      | Actions                        |
| ------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Mrs Pearce: from the bedroom to the bathroom** (home) | Care partner, coordinator | A: heater cord across her way, curled rug, dim hallway. B: boxes in the agreed path, stick out of reach, worn backless slippers. C: cord, stick out of reach, rucked bath mat | Cord, boxes, stick, light      |
| **Mr Okafor: before he gets up** (home, care equipment) | Care partner              | A: bed brake off (critical), walking frame missing a tip. B: cracked commode armrest, curled bedside mat                                                                      | Brake, commode, frame tip, mat |
| **Dot's kitchen at lunchtime** (infection prevention)   | Care partner, coordinator | A: used gloves and mask on the bench, puddle by the sink. B: used gloves and mask on the table, raw chicken and salad on one board                                            | PPE, spill, chopping board     |

Character facts kept: Mrs Pearce's late sister's boxes and the agreement that she chooses what moves (new here: a walking stick); Mr Okafor, found on the floor by his bed (new here: since then a hired bed, commode and walking frame); Dot's roses, bowls on Thursdays, osteoarthritis, and Lena. The PRD's "residential bedroom before transfer" is set in Mr Okafor's home, since Trilogy Care supports people at home. The PRD's oxygen-tube example isn't used: none of these characters is on home oxygen, and a heater cord across the route teaches the same judgement.

The demo article **Look before you help: spot the hazard** (Notice pattern) has all three, a checklist and a journal. Created as a draft by `scripts/seed-magazine-demos.ts`.

## Checked

- **Tests** (all pass): `src/lib/hazardScan.test.ts` (20), `src/server/hazardScan.test.ts` (14), the demo article and registry tests. They cover each acceptance criterion: adding the block and reading it back (1); flagging, revising, reasons, priority, action and item-specific feedback with sources and Job Aids (2); the list route's same items and neutral descriptions, phone-sized regions (3); incomplete variants failing preflight, the reviewer and every check required (4); retries choosing unseen rooms, repeats declared, every object drawn (5); freezing, resuming, and a republish never changing an old result (6); action feedback when a found risk gets a response that ignores consent or preference, and belongings not marked hazardous (7); assessed mode refused, practice never logging a pass (8); forged ids and duplicates earning nothing, readers' copy without the key (9); only reviewed variants on current sources selectable (10); route recorded per attempt (11); placements traced by source, results by variant, withdrawal by source status with old attempts intact (12). Also: flagging everything never scores well; the best action isn't always listed first; nothing else in the database is written.
- **On the running server** (a throwaway signed "ZZ Test" course, deleted afterwards): publish; as a partner and as the author, start, save, list route, findings, the reveal, coordinator and worker actions, debrief, completion, retry to an unseen room across editions, author totals, placements, a 403 for non-authors. At 375 pixels: no horizontal scroll, controls at least 44 pixels, focus moving to each step heading, announcements.
- **The drawings**, every variant rendered in light and dark with regions outlined.

## Not yet

- **360-degree scenes** (PRD step 4): out of scope.
- **Assessed checks and the Question Pool** (PRD step 2): the mode exists but can't be published; a `visual_scene_scan` item type, pass rules, and Excel answer-key export are for the Question Pool build.
- **AI author assistance** (PRD step 3): a disabled stub only.
- **Uploaded images**: only drawn rooms. Photos (with rights, crop and polygon tools, scanning and metadata stripping) would come with a reviewed media pipeline.
- **The editor and its preview weren't checked by eye**: the Browser pane's background tab never hydrated the admin editor (the same for existing courses). It type-checks and lints, and the learner component it previews was checked live.
- **A register sheet** in the Problem desk export, an admin dashboard for the totals, and load-failure or misaligned-tap instrumentation (there are no media loads to fail).
- **Languages** other than English.

## For owners to decide (PRD section 15)

| Decision                    | Built as the PRD recommends                                                                                                                                                                                  | Owner                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| First context               | Support at Home bedroom-to-bathroom route (Mrs Pearce); the equipment scene limited to care partners, set at home                                                                                            | Learning + Operations           |
| First release media         | Drawn, fictional 2D rooms with several variants each                                                                                                                                                         | Learning + Quality              |
| Hazard and action authority | The placeholder records in `lib/hazardSources.ts` must be replaced with current Trilogy Care procedures; every rationale, priority, "critical" mark and action needs Quality, Clinical and Operations review | Quality / Clinical / Operations |
| Scoring                     | Formative practice only; no assessed mode until an owner approves a pass rule and it's in the Question Pool                                                                                                  | Learning + Quality              |
| Randomisation               | Server selection among approved variants, unseen first, repeats declared, at least two approved per scene                                                                                                    | Product + Engineering           |
| 360 view                    | Later, after the 2D and list routes pass testing with users                                                                                                                                                  | Product + Accessibility         |

Also for the owners: whether a Care Partner should play the coordinator in some scenes, the scoring thresholds (weights, the "indiscriminate" cap), and whether Mr Okafor's and Mrs Pearce's new details (equipment, walking stick) can join their character canon.
