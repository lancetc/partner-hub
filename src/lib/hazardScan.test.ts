import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { allBlocks, BLOCK_LABELS, readGuideDoc } from "./magazine";
import {
  askedDecisions,
  buildDebrief,
  chooseVariant,
  cleanFlags,
  cleanPriority,
  decisionsFor,
  eligibleVariants,
  geometryProblems,
  hazardScanForReaders,
  hazardScanHardProblems,
  learnerVariant,
  OBJECT_KINDS,
  reviewProblems,
  roleFor,
  sceneProblems,
  scoreFindings,
  variantProblems,
  type HazardScanData,
  type ObjectKind,
  type Variant,
} from "./hazardScan";
import { readFileSync } from "node:fs";
import path from "node:path";
import { HAZARD_SCENES, NEGLECT_SIGNS, OKAFOR_TRANSFER, PEARCE_BEDROOM } from "@/content/hazardScenes";
import { SEED_CHARACTERS } from "@/content/characters";
import { DIGITAL_MEMBERS } from "@/content/digitalMembers";
import { ObjectArt, SceneArt } from "@/components/hazard/SceneArt";
import { charactersInBlock } from "./characters";
import { contractFor } from "./blockRegistry";

/*
  Spot the Hazard, the pure parts: scoring that rewards a careful look over tapping everything, action feedback judged
  apart from recognition, variant choice and coverage, geometry and the publication preflight, the readers' copy, and
  every drawn object really being drawn (PRD acceptance criteria 2 to 5, 7, 9 and 10).
*/

const TODAY = "2026-11-24";
const clone = (d: HazardScanData) => structuredClone(d);
/** A test-only approved copy: reviewed variants, current (non-placeholder) sources, and a signed release. The pilot ships unsigned. */
function approvedScene(d: HazardScanData): HazardScanData {
  const c = clone(d);
  for (const v of c.variants) {
    v.status = "approved";
    v.review = {
      reviewer: "Reviewer",
      reviewedOn: TODAY,
      objects: true,
      locations: true,
      risks: true,
      actions: true,
      sources: true,
      rendering: true,
      note: "",
    };
    for (const o of v.objects) o.key.source = o.key.category === "infection" ? "acqsc-ipc" : "acqsc-home-environment";
  }
  for (const x of c.decisions) x.source = "acqsc-home-environment";
  c.approval = { quality: "Q", policy: "P", learning: "L", approvedOn: TODAY, reviewBy: "2027-05-01", releaseReviewed: c.release };
  return c;
}
const flagsOf = (v: Variant, ids: string[]) => ids.map((id) => ({ id, reason: "" as const }));
const ids = (v: Variant, hazard: boolean) => v.objects.filter((o) => o.key.hazard === hazard).map((o) => o.id);

describe("scoring: notice, then judge priority", () => {
  const v = PEARCE_BEDROOM.variants[0];

  it("credits every hazard found, with nothing flagged in error, as strong recognition", () => {
    const f = scoreFindings(v, flagsOf(v, ids(v, true)), "heater");
    expect(f.recognition).toBe(3);
    expect(f.priority).toBe(3);
    expect(f.found.map((x) => x.id).sort()).toEqual(ids(v, true).sort());
    expect(f.missed).toEqual([]);
    expect(f.mistaken).toEqual([]);
  });

  it("never rewards tapping everything: flagging every object scores worse than a careful partial look", () => {
    for (const s of HAZARD_SCENES)
      for (const x of s.data.variants) {
        const all = scoreFindings(
          x,
          flagsOf(
            x,
            x.objects.map((o) => o.id),
          ),
          "unsure",
        );
        const top = [...x.objects].filter((o) => o.key.hazard).sort((a, b) => b.key.priority - a.key.priority)[0];
        const careful = scoreFindings(x, flagsOf(x, [top.id]), top.id);
        expect(all.indiscriminate, `${x.id}`).toBe(true);
        expect(all.recognition, `${x.id}`).toBeLessThanOrEqual(1);
        expect(careful.recognition, `${x.id}`).toBeGreaterThanOrEqual(all.recognition);
      }
  });

  it("counts a duplicate flag once, and ignores ids that aren't in the room (criterion 9)", () => {
    const flags = cleanFlags(v, [
      { id: "heater" },
      { id: "heater" },
      "heater",
      { id: "hazard-everything" },
      { id: "rug", reason: "fall" },
      { id: "rug", reason: "bogus" },
    ]);
    expect(flags).toEqual([
      { id: "heater", reason: "" },
      { id: "rug", reason: "fall" },
    ]);
    expect(cleanPriority(v, flags, "photos")).toBe("");
    expect(cleanPriority(v, flags, "rug")).toBe("rug");
    expect(cleanPriority(v, flags, "unsure")).toBe("unsure");
  });

  it("puts the most important miss first, and caps recognition when something critical is missed", () => {
    const f = scoreFindings(v, flagsOf(v, ["rug"]), "rug");
    expect(f.missed[0].id).toBe("heater");
    const ok = OKAFOR_TRANSFER.variants[0];
    const miss = scoreFindings(ok, flagsOf(ok, ["frame"]), "frame");
    expect(miss.missedCritical).toBe(true);
    expect(miss.recognition).toBeLessThanOrEqual(1);
  });

  it("judges priority on what comes first, and gives “not sure” defensible credit", () => {
    expect(scoreFindings(v, flagsOf(v, ["heater", "rug"]), "rug").priority).toBe(1);
    expect(scoreFindings(v, flagsOf(v, ["rug", "hall-light"]), "rug").priority).toBe(2);
    expect(scoreFindings(v, flagsOf(v, ["heater", "photos"]), "photos").priority).toBe(0);
    expect(scoreFindings(v, flagsOf(v, ["heater"]), "unsure").priority).toBe(1);
  });

  it("doesn’t mark a person’s belongings as hazards: flagged, they’re “not a hazard in this context”, with why (criterion 7)", () => {
    const f = scoreFindings(v, flagsOf(v, ["heater", "photos", "boxes"]), "heater");
    expect(f.mistaken.map((x) => x.id)).toEqual(["photos", "boxes"]);
    expect(f.mistaken.find((x) => x.id === "boxes")!.explain).toMatch(/late sister’s things.*aren’t clutter/);
    expect(f.found.map((x) => x.id)).toEqual(["heater"]);
  });

  it("notes when a reason doesn't fit, without marking it down", () => {
    const f = scoreFindings(v, [{ id: "heater", reason: "infection" }], "heater");
    expect(f.found[0].reasonFits).toBe(false);
    expect(scoreFindings(v, [{ id: "heater", reason: "unsure" }], "heater").found[0].reasonFits).toBe(true);
  });
});

describe("the action: respond within the role (criterion 7)", () => {
  const v = PEARCE_BEDROOM.variants[0];

  it("asks role-specific actions about the highest-priority hazards, without verdicts or feedback", () => {
    const w = askedDecisions(PEARCE_BEDROOM, v, "worker", flagsOf(v, ["heater"]));
    const c = askedDecisions(PEARCE_BEDROOM, v, "coordinator", flagsOf(v, ["heater"]));
    expect(w.map((q) => q.id)).toEqual(["cord", "light"]);
    expect(w[0].hazard).toEqual({ id: "heater", label: "Heater and its cord", found: true });
    expect(w[0].options.map((o) => o.id)).toContain("cord-ask");
    expect(c[0].options.map((o) => o.id)).toContain("cord-call");
    expect(c[0].options.map((o) => o.id)).not.toContain("cord-ask");
    expect(JSON.stringify(w)).not.toMatch(/verdict|feedback|ignores/);
  });

  it("doesn't give the answer away by order: the best response isn't always first", () => {
    const firsts = HAZARD_SCENES.flatMap((s) =>
      s.data.roles.flatMap((role) => s.data.variants.flatMap((v) => askedDecisions(s.data, v, role, []).map((q) => q.options[0].id))),
    );
    const best = new Set(HAZARD_SCENES.flatMap((s) => s.data.decisions.flatMap((d) => d.options.filter((o) => o.verdict === "best").map((o) => o.id))));
    expect(firsts.some((id) => !best.has(id))).toBe(true);
    expect(firsts.some((id) => best.has(id))).toBe(true);
  });

  it("gives someone who spotted the risk action feedback when their response ignores consent and preference", () => {
    const d = buildDebrief(PEARCE_BEDROOM, v, "worker", flagsOf(v, ["heater", "rug", "hall-light"]), "heater", { cord: "cord-remove", light: "light-ask" });
    expect(d.levels.recognition).toBe(3);
    expect(d.levels.response).toBe(0);
    const cord = d.decisions.find((x) => x.id === "cord")!;
    expect(cord.hazard.found).toBe(true);
    expect(cord.chosen!.ignores).toEqual(["consent", "preference"]);
    expect(cord.chosen!.feedback).toMatch(/her home/);
    expect(cord.best[0]).toMatch(/Tell Mrs Pearce/);
    expect(d.dims.find((x) => x.dim === "response")!.why).toMatch(/You spotted “Heater and its cord”.*doesn’t ask the person first/);
  });

  it("treats someone who missed the hazard differently from someone who found it", () => {
    const d = buildDebrief(PEARCE_BEDROOM, v, "worker", flagsOf(v, ["rug"]), "rug", { cord: "cord-ask", light: "light-ask" });
    expect(d.decisions[0].hazard.found).toBe(false);
    expect(d.levels.response).toBe(3);
    expect(d.levels.recognition).toBeLessThan(3);
    expect(d.dims.find((x) => x.dim === "response")!.why).toMatch(/You didn’t flag “Heater and its cord”/);
    expect(d.mode).toBe("practice");
    expect(d.versions).toMatchObject({ family: "pearce-bedroom-bathroom", release: "1", variant: "pearce-a", variantVersion: 1, role: "worker" });
  });
});

describe("variation and selection (criteria 5 and 6)", () => {
  it("prefers a variant the learner hasn't seen, repeatably, and says so when every room has been seen", () => {
    const pool = PEARCE_BEDROOM.variants;
    const a = chooseVariant(pool, [], "seed-1")!;
    expect(chooseVariant(pool, [], "seed-1")!.variant.id).toBe(a.variant.id);
    expect(a.repeat).toBe(false);
    const b = chooseVariant(pool, [a.variant.id], "seed-2")!;
    expect(b.variant.id).not.toBe(a.variant.id);
    const seen = pool.map((v) => v.id);
    const c = chooseVariant(pool, seen, "seed-3")!;
    expect(c.repeat).toBe(true);
    expect(c.variant.id).not.toBe(seen.at(-1));
    expect(chooseVariant([], [], "x")).toBeNull();
  });

  it("only offers approved, reviewed variants on current sources, for the learner's role", () => {
    expect(eligibleVariants(PEARCE_BEDROOM, "worker", TODAY)).toEqual([]);
    const ok = approvedScene(PEARCE_BEDROOM);
    expect(eligibleVariants(ok, "worker", TODAY).map((v) => v.id)).toEqual(["pearce-a", "pearce-b", "pearce-c"]);
    ok.variants[1].roles = ["coordinator"];
    expect(eligibleVariants(ok, "worker", TODAY).map((v) => v.id)).toEqual(["pearce-a", "pearce-c"]);
    // A source past its review date takes the variants citing it out of selection.
    expect(eligibleVariants(ok, "worker", "2027-07-01")).toEqual([]);
    expect(roleFor(ok, "partner")).toBe("worker");
    expect(roleFor(ok, "staff")).toBe("coordinator");
    expect(roleFor(approvedScene(OKAFOR_TRANSFER), "coordinator")).toBe("worker");
  });

  it("draws every object a variant names, so no hotspot can point at something absent (criterion 5)", () => {
    for (const s of HAZARD_SCENES)
      for (const v of s.data.variants) {
        const html = renderToStaticMarkup(createElement(SceneArt, { room: s.data.room, dim: v.dim, objects: v.objects, label: v.id }));
        for (const o of v.objects) expect(html, `${v.id}/${o.id}`).toContain(`data-object="${o.id}"`);
      }
    for (const k of Object.keys(OBJECT_KINDS) as ObjectKind[])
      for (const look of OBJECT_KINDS[k].looks)
        expect(renderToStaticMarkup(createElement("svg", null, createElement(ObjectArt, { kind: k, look }))).length, `${k}/${look}`).toBeGreaterThan(40);
  });
});

describe("geometry and the publication preflight (criteria 3, 4 and 10)", () => {
  it("keeps every pilot tap region on the scene, phone-sized and apart from the others", () => {
    for (const s of HAZARD_SCENES) for (const v of s.data.variants) expect(geometryProblems(v), v.id).toEqual([]);
    const v = clone(PEARCE_BEDROOM).variants[0];
    v.objects[1].x = v.objects[0].x;
    v.objects[1].y = v.objects[0].y;
    v.objects[2].hit = { w: 4, h: 4 };
    v.objects[3].x = 99;
    const p = geometryProblems(v).join(" ");
    expect(p).toMatch(/overlap/);
    expect(p).toMatch(/too small for a phone/);
    expect(p).toMatch(/off the edge/);
  });

  it("fails an incomplete variant: no depicted feature, explanation, source, description, area or action", () => {
    const d = approvedScene(PEARCE_BEDROOM);
    expect(variantProblems(d, d.variants[0], TODAY)).toEqual([]);
    const v = d.variants[0];
    const cord = v.objects.find((o) => o.id === "heater")!;
    cord.key.feature = "";
    cord.key.source = "";
    v.objects[0].description = "";
    v.objects[1].area = "";
    v.objects[2].key.explain = "";
    v.objects[3].description = "A hazard on the floor.";
    d.decisions = d.decisions.filter((x) => x.concept !== "cord");
    const p = variantProblems(d, v, TODAY).join(" ");
    for (const m of [
      /exactly what is depicted/,
      /needs its source/,
      /description for the list/,
      /where it is in the room/,
      /needs its explanation/,
      /gives the answer away/,
      /no action for a care partner/,
    ])
      expect(p).toMatch(m);
  });

  it("holds an approved variant without a named reviewer and every check, and a placeholder source", () => {
    const d = approvedScene(PEARCE_BEDROOM);
    d.variants[0].review.reviewer = "";
    d.variants[0].review.rendering = false;
    expect(reviewProblems(d.variants[0]).join(" ")).toMatch(/named reviewer.*Tested as a learner/i);
    expect(hazardScanHardProblems(d, TODAY).join(" ")).toMatch(/marked approved, but: Record the named reviewer/);
    const p = clone(PEARCE_BEDROOM);
    expect(variantProblems(p, p.variants[0], TODAY).join(" ")).toMatch(/placeholder policy record/);
  });

  it("publishes only with enough approved variants, current sources, a release sign-off and practice mode", () => {
    const d = approvedScene(PEARCE_BEDROOM);
    expect(hazardScanHardProblems(d, TODAY)).toEqual([]);
    expect(hazardScanHardProblems(PEARCE_BEDROOM, TODAY).join(" ")).toMatch(/at least 2 approved variants.*record Quality/);
    expect(hazardScanHardProblems({ ...d, mode: "assessed" }, TODAY).join(" ")).toMatch(/Question Pool placement/);
    expect(hazardScanHardProblems({ ...d, release: "2" }, TODAY).join(" ")).toMatch(/Review required/);
    const one = clone(d);
    one.variants = one.variants.slice(0, 1);
    expect(hazardScanHardProblems(one, TODAY).join(" ")).toMatch(/at least 2 approved variants/);
  });
});

describe("what the learner's browser gets (criterion 9)", () => {
  it("gives readers no variant, action or debrief, and the room without its answer key", () => {
    const r = hazardScanForReaders(PEARCE_BEDROOM);
    expect([r.variants, r.decisions, r.debrief]).toEqual([[], [], ""]);
    const lv = learnerVariant(PEARCE_BEDROOM, PEARCE_BEDROOM.variants[0]);
    const json = JSON.stringify(lv);
    expect(json).not.toMatch(/"key"|"hazard"|"explain"|"priority"|"concept"|"feature"/);
    // The same objects for the picture and the list, in list order: by area, then left to right.
    expect(lv.objects.map((o) => o.area)).toEqual(["bed", "bed", "floor", "floor", "floor", "window", "hallway", "hallway", "bathroom"]);
    expect(lv.objects.every((o) => o.label && o.description)).toBe(true);
  });
});

describe("Mrs Vella’s unit: signs of possible neglect (ALIS 3.3)", () => {
  const d = NEGLECT_SIGNS;

  it("is a practice scene family for workers and coordinators, two variants, in review and unsigned", () => {
    expect(HAZARD_SCENES.find((s) => s.id === "neglect")!.data).toBe(d);
    expect([d.familyId, d.mode, d.roles]).toEqual(["home-neglect-signs", "practice", ["worker", "coordinator"]]);
    expect(d.variants.map((v) => [v.id, v.status, v.review.reviewer])).toEqual([
      ["vella-winter", "review", ""],
      ["vella-summer", "review", ""],
    ]);
    expect(Object.values(d.approval).every((x) => x === "")).toBe(true);
    expect(sceneProblems(d)).toEqual([]);
    // Complete apart from its sources, which Quality must confirm before anything can be approved.
    for (const v of d.variants) expect(variantProblems(d, v, TODAY).filter((p) => !/its source is review required/.test(p))).toEqual([]);
  });

  it("uses a person who isn't in the character library or the module", () => {
    const names = [...SEED_CHARACTERS.flatMap((c) => [c.name, ...c.aliases]), ...DIGITAL_MEMBERS.map((m) => m.id)].join(" ");
    expect(names).not.toMatch(/Vella|Pip\b/);
    // The module names her only where it places her scene.
    const part3 = readFileSync(path.join(process.cwd(), "src/content/alis/part3.ts"), "utf8").replace(/kind: "hazard",[\s\S]*?sceneId: "neglect",/, "");
    expect(part3).not.toMatch(/\bVella\b|\bPip\b/);
  });

  it("tells signs of neglect from her own choices: books, her cat, a simple meal and an unmade bed are never hazards", () => {
    for (const v of d.variants)
      for (const id of ["books", "cat", "meal", "photos"]) expect(v.objects.find((o) => o.id === id)!.key.hazard, `${v.id}/${id}`).toBe(false);
    const winter = d.variants[0];
    expect(winter.objects.find((o) => o.id === "bed")!.key.hazard).toBe(false);
    const f = scoreFindings(winter, flagsOf(winter, ["blister-pack", "climate", "fridge", "pendant", "books", "cat"]), "blister-pack");
    expect(f.mistaken.map((x) => x.id)).toEqual(["books", "cat"]);
    expect(f.mistaken[1].explain).toMatch(/part of her life/);
    expect(f.priority).toBe(3);
  });

  it("asks actions that put her safety first, escalate, record facts and never decide the priority for the learner", () => {
    const asked = (role: "worker" | "coordinator", v: Variant) => decisionsFor(d, v, role);
    expect(asked("worker", d.variants[0]).map((x) => x.decision.id)).toEqual(["meds", "climate"]);
    expect(asked("worker", d.variants[1]).map((x) => x.decision.id)).toEqual(["climate", "bed"]);
    for (const x of d.decisions) {
      const best = x.options.filter((o) => o.verdict === "best");
      for (const role of ["worker", "coordinator"] as const)
        expect(
          best.some((o) => o.roles.includes(role)),
          `${x.id}/${role}`,
        ).toBe(true);
      for (const o of best) {
        expect(o.text, o.id).toMatch(/check|safe|comfortable|skin/i);
        expect(o.text, o.id).toMatch(/coordinator|incident responder/i);
        expect(o.text, o.id).toMatch(/record/i);
        expect(o.text, o.id).not.toMatch(/Priority [12]/);
      }
      expect(x.source).toBe("tc-incidents");
    }
    // Confronting, investigating, or recording a conclusion is never the best response.
    const all = d.decisions.flatMap((x) => x.options);
    expect(all.find((o) => o.id === "meds-ring")).toMatchObject({ verdict: "unsafe", ignores: ["scope", "safety"] });
    expect(all.find((o) => o.id === "meds-note")).toMatchObject({ verdict: "unsafe", ignores: ["facts"] });
    expect(all.find((o) => o.id === "meds-p1")).toMatchObject({ verdict: "unsafe", ignores: ["safety"] });
    expect(d.jobAids.map((a) => a.snippetId)).toEqual(["sirs-first-steps"]);
    const db = buildDebrief(d, d.variants[0], "worker", flagsOf(d.variants[0], ["blister-pack"]), "blister-pack", {
      meds: "meds-note",
      climate: "climate-comfort",
    });
    expect(db.dims.find((x) => x.dim === "response")!.why).toMatch(/records a conclusion or blame/);
  });
});

describe("the block in the Magazine (criterion 1)", () => {
  it("is a Magazine block with a registry contract, reads back from stored JSON, and names its character", () => {
    expect(BLOCK_LABELS.hazardscan).toBe("Spot the Hazard");
    expect(contractFor("hazardscan")).toMatchObject({ action: "notice", evidence: "practised" });
    const doc = {
      schema: 2,
      pages: [
        {
          id: "p1",
          title: "P",
          purpose: "",
          template: "notice",
          kind: "content",
          required: true,
          allActivities: false,
          sections: [{ id: "s1", title: "S", blocks: [{ id: "hz", type: "hazardscan", ...PEARCE_BEDROOM }] }],
        },
      ],
    };
    expect(allBlocks(readGuideDoc(doc as never))[0]).toEqual({ id: "hz", type: "hazardscan", ...PEARCE_BEDROOM });
    expect(charactersInBlock({ type: "hazardscan", ...PEARCE_BEDROOM }).map((p) => p.name)).toEqual(["Mrs Pearce"]);
    expect(PEARCE_BEDROOM.person.about).toMatch(/late sister’s things.*chooses what moves/);
  });
});
