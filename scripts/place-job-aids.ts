/*
  Places Job Aids (Work Tools) in the Magazine courses they belong to, in each course's DRAFT. What learners read is
  untouched until an author publishes. A Job Aid block shows nothing to learners, and the course can't be published,
  until the aid's release is approved in Admin → Job Aids (docs/job-aids.md). Idempotent: a section that already
  holds the aid is left alone. Run with:

    npx vite-node --config vitest.config.ts scripts/place-job-aids.ts          (shows what it would do)
    npx vite-node --config vitest.config.ts scripts/place-job-aids.ts --write  (does it)
*/
import path from "node:path";
import { openDb } from "@/server/db";
import { userById } from "@/server/auth";
import { authorGuide, saveGuideDraft } from "@/server/magazine";
import { rid } from "@/server/magazineDraft";
import type { Block } from "@/lib/magazine";

const write = process.argv.includes("--write");
const db = openDb(path.join(process.cwd(), "data", "hub.sqlite"));
const author = userById(db, "jordan")!;
const now = new Date();

type Placement = {
  guide: string;
  section: string;
  snippetId: string;
  why: string;
  /** Put it just after the first block of this type in the section; otherwise before any closing action or journal, else at the end. */
  after?: Block["type"];
};

const PLACEMENTS: Placement[] = [
  {
    guide: "mag-1463a200736b", // Invoices that get paid first time
    section: "Before you send it",
    snippetId: "rejected-supplier-invoice",
    why: "If an invoice still comes back, this is how to correct it and send it again.",
  },
  {
    guide: "mag-5de8043699a7", // Your first steps as a brokered partner
    section: "Getting paid",
    snippetId: "rejected-supplier-invoice",
    why: "When a payment is held up by a rejected invoice, start here.",
  },
  {
    guide: "mag-dcbe24e988c8", // Contractor Induction
    section: "Serious incidents and the SIRS",
    snippetId: "sirs-first-steps",
    why: "The first steps if you suspect a Priority 1 incident, to keep with you on shift.",
    after: "accordion",
  },
  {
    guide: "mag-dcbe24e988c8",
    section: "From booking to payment",
    snippetId: "rejected-supplier-invoice",
    why: "If one of your invoices is rejected, this is how to correct it.",
    after: "process",
  },
  {
    guide: "mag-0233544823a0", // “Could you just help me into the shower?”
    section: "If someone is hurt",
    snippetId: "sirs-first-steps",
    why: "If someone is hurt or at risk, these are the first steps.",
  },
  {
    guide: "mag-873839760a45", // Leila’s Monday
    section: "Take it into your week",
    snippetId: "ask-before-changing-the-plan",
    why: "When a family member raises a worry, talk with the client before anything in the plan changes.",
    after: "checklist",
  },
  {
    guide: "mag-873839760a45",
    section: "Take it into your week",
    snippetId: "invoice-rate-check",
    why: "Before you approve a supplier invoice, check the rate and the service against what was agreed.",
    after: "checklist",
  },
];

const CLOSERS = new Set<string>(["action", "journal", "reflect", "confidence"]);

const byGuide = new Map<string, Placement[]>();
for (const p of PLACEMENTS) byGuide.set(p.guide, [...(byGuide.get(p.guide) ?? []), p]);

for (const [guideId, places] of byGuide) {
  const g = authorGuide(db, author, guideId);
  const doc = structuredClone(g.doc);
  let added = 0;
  for (const p of places) {
    const section = doc.pages.flatMap((pg) => pg.sections).find((s) => s.title === p.section);
    if (!section) {
      console.log(`✗ ${g.title}: no section “${p.section}” in the draft`);
      continue;
    }
    if (section.blocks.some((b) => b.type === "playbook" && b.snippetId === p.snippetId)) {
      console.log(`= ${g.title} / ${p.section}: already has ${p.snippetId}`);
      continue;
    }
    const block = { id: rid("playbook"), type: "playbook", snippetId: p.snippetId, why: p.why } as Block;
    // After the named block (and any Job Aid already placed after it), else before the closing action, else at the end.
    let at = section.blocks.length;
    const anchor = p.after ? section.blocks.findIndex((b) => b.type === p.after) : -1;
    if (anchor >= 0) {
      at = anchor + 1;
      while (section.blocks[at]?.type === "playbook") at++;
    } else {
      const closer = section.blocks.findIndex((b) => CLOSERS.has(b.type));
      if (closer >= 0) at = closer;
    }
    section.blocks.splice(at, 0, block);
    added++;
    console.log(`+ ${g.title} / ${p.section}: ${p.snippetId} at position ${at + 1} of ${section.blocks.length} [${section.blocks.map((b) => b.type).join(", ")}]`);
  }
  if (added && write) {
    saveGuideDraft(db, author, guideId, { doc, basedOn: g.savedAt ?? undefined }, now);
    console.log(`  saved draft of “${g.title}” (${g.status}; learners still read the published version)`);
  }
}
if (!write) console.log("\nNothing saved. Run again with --write to place them.");
