# Live Call Pocket Playbook

Built from the PRD *Partner Hub: Live Call Pocket Playbook and Co-Contribution Quick-Calc* (21 November 2026), section 19: the smallest end-to-end slice. It extends Job Aids, Work Tools and Favourites ([job-aids.md](job-aids.md)); it isn't a second library or a second saved list. Everything in it is a **pilot draft, awaiting its owners**, and says so on every surface.

Learners: the **Favourites** control in the header (and the Favourites cell in the phone bar) opens the **Companion Drawer**. The tools also have their own pages: `/tools/contribution-quick-calc`, `/tools/incident-first-steps` and `/tools/golden-scripts`, listed at the top of Work Tools. Owners: **Administration → Content → Pocket Playbook** (`/admin/pocket-playbook`).

## Where it differs from the PRD

**There is no Work Tools item in the header.** The PRD asks for a labelled Work Tools control. The owner removed the Work Tools header item ("it's covered by Favourites"; `headerItems` in `src/components/nav.ts` and its test), so it wasn't added back to the header or the phone bar. Instead the existing **Favourites** control opens one drawer with **Pinned for this work**, **Recent**, **Search Work Tools** and **Favourites**. A pinned tool is still two activations away from any page: Favourites, then the tool. The full Favourites list is **All Favourites** inside the drawer, so the list page itself is now two activations away, while the person's saved items are shown in the drawer after one.

Other differences:

- **Recent tools come from the person's own use events**, not a new history table.
- **Pin order lives in the Favourite's existing `pinned` column** (1 is first, 0 is unpinned), so the Favourites page's own Pin is the same preference.
- **No "Confirmed" path is built.** The state exists, but nothing can produce it until an approved, read-only record integration does.
- **No Compare choices view**, no Magazine or Topic placement of the new tools yet (they open from the drawer, search, home, Favourites and their pages), and no authoring screens for rule sets, the incident path or scripts: they are reviewed data in `src/content/`, with versions.

## The Companion Drawer

- A native modal dialog. Focus moves to its heading when it opens, stays inside while it's open, and goes back to the control that opened it on close (Escape, the close button or the backdrop). The page behind keeps its scroll position.
- On a phone, a full-height sheet that respects the safe areas. From tablet width, a drawer on the right, 30rem wide.
- **Pinned for this work**: the person's pins in their order, with **Arrange** (move up, move down, unpin). Unpinning keeps the Favourite.
- **Recent**: tools and Job Aids they opened lately, without the pinned ones, nothing withdrawn and nothing their role can't open.
- **Live call tools**, **All Work Tools**, then **Favourites** (the last few saved items) and **All Favourites**.
- **Search Work Tools**: everyday task words ("gardener contribution", "daughter wants budget", "bruise", "missed visit", "price not confirmed"). Results are grouped: **Work tools** (each says *Approved tool* or its draft status), **Your saved highlights** (with a freshness warning if the guidance changed or was superseded), and **Learning examples**. Nothing found gives **No reliable result**, the incident route, and **Report missing guidance**.
- **One tool open at a time**, with **Back to tools**. A compact strip stays in view while scrolling: status, version and owner. Under it: effective, reviewed and next review dates, the source, **Report an issue**, and what the owner still has to supply.
- Closing the drawer unmounts the tool: anything typed into it is gone.

**Pin to dashboard** and **Save to Favourites** are on each tool. Pinning saves it to Favourites first if it isn't saved. The first pin says where pinned tools appear. Pinned tools show on the **Hub home** under **Your pinned tools** (up to six, with Arrange and View all Work Tools) and at the top of the drawer. A tool updated since it was pinned says **Updated since you pinned this** until it's opened. A withdrawn tool shows **Unavailable** everywhere and, when opened, only why and the route to use instead.

## Tool A: Contribution Quick-Calc

Three separate views: **Contribution estimate**, **Interim funding** and **Rate not yet notified**.

- **Inputs**: the approved service (from a list; a category is never worked out from free text), the service date, the agreed price and unit, the quantity, where the price came from, the rate status (confirmed, agreed interim, pending, transitioned, needs review), the rate, and any hardship, exemption or lifetime-cap status. Each input is labelled "Entered by you".
- **Ephemeral**: the values are held only in the component's memory. Nothing goes into storage, the address, Favourites or an event. **Clear everything** and closing remove them.
- **States**: *Estimate from entered values* when everything needed is there; otherwise *Needs verification*, naming each missing fact and showing no figure. A pending rate, a quote that isn't the agreed price, a transitioned or needs-review rate, any special status, a rate outside the reviewed range, or a date no rule set covers all give Needs verification. **Manual input never gives Confirmed.**
- **Arithmetic**: units × agreed unit price, rounded once to the cent; × the rate, rounded once (half up) per line; the rest is shown as paid from Support at Home funding. Clinical Supports have no contribution.
- **What to say** is shown filled in, on screen only. **Copy** copies the same words with [placeholders], never the figures.
- **Interim funding** explains an allocation while waiting (only the notified amount is spendable; the rest isn't backdated, and no date is promised). **Rate not yet notified** explains an interim contribution arrangement and the later reconciliation, and who follows up. Neither is called "bridging".

**The rule sets** (`src/content/quickCalcRules.ts`) are reviewed, dated data: rule set 1 for services from 1 November 2025 to 30 September 2026, rule set 2 from 1 October 2026, when personal care moves to Clinical Supports. The category rows reuse the Hub's existing dated table (`lib/sahRules`, used by While You Wait), so the two can't disagree. The rate ranges (used only to catch a mistyped rate, never shown as example rates), the rounding rule and the interim funding share are marked **placeholder: awaiting Finance approval**, and both rule sets are *Awaiting Finance approval*. Each result records the rule set it ran on.

## Tool B: Incident first steps

It builds on the existing Job Aid **Suspected SIRS Priority 1: first steps** (`sirs-first-steps`) and links it, and uses the same directory contact (`incident-responder`).

1. **Safety and urgent help**: "Is the person in immediate danger…?" Yes or Not sure puts 000 first.
2. **Tell the incident responder now, and record it**: the directory route for the person's role, the Incident Management System link and the after-hours route. Until Quality supplies them, each says "awaiting Quality" and gives the interim route. There is no text box: the incident's details belong in the incident system.
3. **Could it be a reportable (SIRS) incident?**: the eight types as prompts, home-services scope, and "alleged or suspected counts".
4. **Priority and notification, for the authorised reviewer**: Priority 1 (24 hours) and 2 (30 days) from provider awareness, who decides, and that these never delay the internal step.
5. **Follow through.** Then the Commission sources (the decision support tool marked supplementary, as the Commission says it's being updated), and the Job Aid.

The 000 line is always on screen, with an icon and bold words, not colour alone. **No answer leads to "not reportable"**: every path ends in telling the responder. The path can't be released until the IMS link and after-hours route are supplied (`incidentPathProblems`).

## Tool C: Golden Scripts

A versioned format (`GoldenScriptVersion` in `src/lib/pocketPlaybook.ts`): trigger, tags, intent, opening with [fact slots], declared slots with hints, "check before saying this", the guardrail, the next step, related tools and Job Aids, owner, reviewer, source, audience, review date and origin. A script can't be released with an undeclared or unused placeholder, a missing check or guardrail, or an opening that promises an outcome or classifies an incident (`scriptProblems`).

The four PRD pilot scripts are seeded as **draft, version 1, unapproved**: a contractor didn't arrive; a contribution question; a family member wants to decide; a possible incident. **Copy** puts the opening on the clipboard with its placeholders and "Verify before use", never a client's details. Nothing typed is saved.

## Use events, Admin and the export

Events go in the Job Aids event table (`aid_events`), with the same idempotency rule: `work_tools_opened`, `tool_pinned`, `tool_unpinned`, `tool_opened`, `calculator_estimate_run`, `calculator_needs_verification`, `funding_view_opened`, `interim_contribution_view_opened`, `incident_path_opened`, `internal_escalation_link_opened`, `script_opened`, `script_copied`, `source_opened`, `tool_outdated_seen`, `search_no_result` and `tool_issue_reported`. Each holds the person, their role, the tool, script or Job Aid id, its version (the rule set, for a calculator result), where it was opened from and a key. **The API reads nothing else**: no figure, search phrase, filled-in script or incident detail can reach the table. An issue report is a fixed choice, never free text.

**Admin → Pocket Playbook** shows source health (status, owner, reviewer, dates, what's awaited, what blocks release, pins left on an older version, withdraw and restore, the review decision) and use in a date range (reach with its denominator, opens by place, people who came back, calculator states by rule set, interim views, incident path and internal-route opens, script opens and copies, searches with no answer). Fewer than ten people is marked. No one's pins, figures or searches are shown.

The **Excel decision register** (Problem desk export) has a new **Pocket Playbook** sheet: theme, tool and version, family, status, audience, owner, reviewer, sources, dates, what's awaited, eligible audience, people, opens, returns, pin counts, estimate and needs-verification counts, internal-route opens, issues, searches with no answer, the operational measure (not linked yet) and the review decision. No personal pins, highlights, rates, searches or incidents.

## Where things live

| What | Where |
|---|---|
| Tool format, events, task search, incident guidance, script checks | `src/lib/pocketPlaybook.ts` |
| Quick-Calc types and arithmetic | `src/lib/quickCalc.ts` |
| Rule sets | `src/content/quickCalcRules.ts` |
| Tools, incident path, scripts | `src/content/pocketPlaybook.ts` |
| Tool registry and withdrawal state (`pocket_tool_status`) | `src/server/pocketTools.ts` |
| Drawer, pins, search, events, report, owner actions | `src/server/pocketPlaybook.ts` |
| Pin order and events on the one Favourites list | `setFavouritePinned` in `src/server/favourites.ts` |
| Drawer and tools | `src/components/pocket/` |
| The Favourites control (now opens the drawer) | `src/components/favourites/FavouritesNav.tsx`; the drawer is mounted in `Header.tsx` |
| Pages | `src/app/tools/contribution-quick-calc`, `incident-first-steps`, `golden-scripts`; `src/app/admin/pocket-playbook` |
| API | `/api/pocket`, `/api/admin/pocket` |
| Tests | `src/lib/quickCalc.test.ts`, `src/lib/pocketPlaybook.test.ts`, `src/server/pocketPlaybook.test.ts` |

## What was checked

- **Tests**: 43 new (1,852 in all, all passing; types clean in `src/`, lint clean on every touched file). Rule fixtures: dated rule sets with no gaps, agreement with `lib/sahRules`, personal care before and after 1 October 2026, a date before Support at Home, a pending rate, an agreed interim rate, transitioned and special statuses, a quote, a rate out of range, line-level rounding (including half-cent cases), and over 2,000 input combinations never giving Confirmed or a figure with Needs verification. Interim funding and interim contribution kept apart. The incident path never saying "not reportable" for any answer. The four scripts. Task search. Server: pin and unpin keeping the Favourite, double pins and saves making one row and one event, reorder of the person's own pins only, restricted titles kept out of a Care Partner's drawer, drawer search and site search, saved highlights searched for their owner only, withdrawal leaving the drawer, search and home at once, recent tools, events dropping figures and search words and counting a resend once, the update-since-pinned notice, and the report's counts with no names in it.
- **In the browser** (signed in as the localhost demo account, in a background tab of my own; the pin and every event I made were removed afterwards):
  - Desktop: the Favourites control opened a right-hand drawer with focus on its heading; Dot's fictional gardening case ($67.45 an hour, 1.5 hours, 17.5%) gave *Estimate from entered values*, $17.71, with each line's source; nothing was in local or session storage or the address; the stored events held the state and rule set only. Pinning Incident first steps from the drawer showed the first-pin note, moved it to Pinned and onto the Hub home; Back to tools returned focus to it; "daughter wants budget" found the family script, which opened inside the drawer; Escape closed it and focus returned to the Favourites control. The Admin page showed source health and use.
  - Phone (375 × 812): the Favourites cell in the phone bar opened a full-screen sheet; no sideways scroll; every control at least 44 px tall; the sticky strip one line (37 px); closing returned focus to the cell and kept the page's scroll position; Quick-Calc inputs were gone after closing. The incident path put 000 first on "Yes" and, on "No" to the SIRS prompts, still said to tell the responder. A nonsense search showed No reliable result with the incident route.
- **Found and fixed on the way**: the status strip was 237 px tall on a phone when sticky (now one line, the rest scrolls); some links were 16 to 32 px tall (now 44); the "what to say" for a missing fact read a whole sentence aloud (now its short name); "Approved tools" headed a list of drafts (now "Work tools", each with its status).

## Not checked, and limits

- **Screenshots and a fronted tab**: the background tab never fires animation frames, so streamed parts of a page didn't finish drawing on their own; I released them by hand to test. The drawer itself now uses timers rather than animation frames for focus, so it doesn't depend on them.
- **Copy to clipboard** wasn't exercised in the browser (a background tab can't write to it); the copied text is covered by tests.
- **A real phone, a screen reader, dark mode and mobile zoom.**
- **Offline**: nothing is cached for offline use, and nothing claims it.
- **The Excel sheet** wasn't opened in Excel; it uses the tested export.
- **The `.next/types/validator.ts` errors** in a full type-check are for routes another change deleted (`/open`, `/review`, `/api/public-link`), not this work.

## Decisions awaiting Trilogy Care (PRD section 17)

| Owner | Decision for release |
|---|---|
| Finance / Support at Home | The authoritative participant-rate source and agreed-price source; the rounding rule (placeholder: half up, per line, to the cent); the effective-dated category map (including the services added here: gardening, home maintenance, transport, respite, allied health); the rate ranges used to catch typos; grandfathered (no-worse-off) and interim contribution treatment; the interim funding view and its 60% wording; the exact explanations; the Finance escalation contact (the directory's `finance-support` route is empty); approval of rule sets 1 and 2. |
| Quality / incident | The immediate and after-hours contacts (the `incident-responder` route is empty); the Incident Management System link; the internal recording and escalation steps; who decides SIRS reportability and priority; the wording of the eight prompts and the Priority 1/2 text; the review cadence; the withdrawal trigger; approval of the `sirs-first-steps` Job Aid release it links to. |
| Operations | The first Golden Script set (the four pilots are drafts); permitted wording; callback ownership ("call you back by [agreed time]"); how coordinators use the drawer during calls; whether the Favourites control opening the drawer suits the floor. |
| Privacy / security / IT | Role access (the Quick-Calc and scripts are coordinators and staff; the incident path also Care Partners); whether any read-only Portal context is approved, which is what "Confirmed" would need; logging and retention of `aid_events`; the ephemeral input controls; search-query protection (the phrase is answered and not stored; a no-result search is a count); failure behaviour. |
| Content governance | Source owners; version publication and the emergency correction process (withdraw and restore are built); role restrictions; placement rules for Magazine and Topics (not built for these tools); the review interval. |
| Partner Enablement | The owner's decision to open the drawer from Favourites rather than a Work Tools header item; the pilot audience; evaluation dates; the separately owned operational measure each tool answers to. |
