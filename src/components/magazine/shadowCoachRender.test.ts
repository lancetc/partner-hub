import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ShadowCoachBlock } from "@/lib/magazine";
import { applyMove, buildDebrief, emptyState, shadowView, type AvailMap, type Move, type ShadowState } from "@/lib/shadowCoach";
import { MAYA_SHADOW } from "@/content/shadowCoachCases";
import type { ShadowAttemptView } from "@/server/shadowCoach";
import { openDb } from "@/server/db";
import { userById } from "@/server/auth";
import { toolHome, type ShadowToolHome } from "@/server/shadowCoachTool";
import { Attempt } from "./ShadowCoach";
import { HireCard } from "../tools/First100DaysTool";

/*
  First 100 Days: Shadow & Coach, rendered as the server would send it at each step (docs/shadow-and-coach.md): every
  line is a button and every choice a labelled field (keyboard and screen reader, criterion 12); statuses are words;
  a critical gap shows its correction first; the workbench card has no score or rank. (Interaction in the running app
  is checked in the browser; these pin the markup.)
*/

const b = { id: "sc", type: "shadowcoach", ...structuredClone(MAYA_SHADOW) } as ShadowCoachBlock;
const avail: AvailMap = Object.fromEntries(
  b.scenarios.flatMap((sc) => sc.suggestions.filter((x) => x.ref).map((x) => [x.id, { status: "current", title: x.label, version: "v1", href: "/x" }])),
);
const at = (s: ShadowState, debrief = false): ShadowAttemptView => ({
  attemptId: "a1",
  attemptNo: 1,
  scenario: s.scenario,
  status: debrief ? "completed" : "active",
  view: debrief ? null : shadowView(b, s, { avail }),
  debrief: debrief ? buildDebrief(b, s) : null,
  attempts: 1,
  versions: { shadow: "", rubric: "", engine: "", scenario: "", rules: "" },
  earlierScenario: false,
});
const render = (v: ShadowAttemptView) =>
  renderToStaticMarkup(
    createElement(Attempt, {
      b,
      v,
      setV: () => undefined,
      call: async () => v,
      preview: true,
      guideId: "g",
      place: "magazine",
      onBack: () => undefined,
      onFinished: undefined,
    }),
  );
const play = (moves: Move[]) => moves.reduce((s, m) => applyMove(b, s, m, { avail }), emptyState("contribution-call"));
const opened: Move[] = [
  { do: "view", artefact: "call" },
  { do: "view", artefact: "note" },
  { do: "view", artefact: "qa" },
  { do: "mark", key: "c3", kind: "assumption", cls: "act_now", cause: "both", why: "An invented rate." },
  { do: "inspected" },
];

/** Every field has a name: an aria-label, or it sits inside a label element. Every button has words. No ranking. */
function accessible(html: string) {
  for (const m of html.matchAll(/<(input|select|textarea)[^>]*>/g)) {
    if (/aria-label=/.test(m[0])) continue;
    const before = html.slice(0, m.index);
    expect(before.lastIndexOf("<label"), m[0]).toBeGreaterThan(before.lastIndexOf("</label>"));
  }
  expect(html).not.toMatch(/<button[^>]*>\s*<\/button>/);
  expect(html).not.toMatch(/rank|leaderboard|performance score/i);
}

describe("the learner’s steps", () => {
  it("inspect: each line is a button, with marks shown in words", () => {
    const html = render(at(play(opened.slice(0, 4))));
    accessible(html);
    expect(html).toMatch(/I think it’s about 20 per cent/);
    expect(html).toMatch(/\[Marked: Act now\]/);
    expect(html).toMatch(/Something missing after this line\?/);
    expect(html).toMatch(/View source/);
  });

  it("first actions: a critical gap shows its correction and the missing route before anything else", () => {
    const html = render(at(play([...opened, { do: "act", now: ["a-lesson"], later: [] }])));
    accessible(html);
    expect(html).toMatch(/role="alert"/);
    expect(html).toMatch(/Correct the advice first/);
    expect(html).toMatch(/Correct the advice with Mrs Lin today/);
  });

  it("coach, plan and the second sample are labelled fields, and the plan shows each item’s availability", () => {
    const coach = play([...opened, { do: "act", now: ["a-source", "a-correct", "a-nurse"], later: ["a-coach"] }]);
    const h1 = render(at(coach));
    accessible(h1);
    expect(h1).toMatch(/How do you open the conversation\?/);
    const plan = play([
      ...opened,
      { do: "act", now: ["a-source", "a-correct", "a-nurse"], later: ["a-coach"] },
      { do: "coach", text: "In the call I heard you say 20 per cent. Where did you check it? I’ll sit in on your next call." },
      { do: "pushback", option: "p-source" },
      { do: "coached" },
    ]);
    const h2 = render(at(plan));
    accessible(h2);
    expect(h2).toMatch(/Share it with her \(simulated\)/);
    expect(h2).toMatch(/Current · v1/);
  });

  it("the debrief puts a critical error first, in words", () => {
    const s = play([...opened, { do: "act", now: ["a-lesson"], later: [] }]);
    const html = render(
      at(
        {
          ...s,
          actionsOk: true,
          coached: true,
          assigned: [],
          followViewed: true,
          followMarks: { "e-category": "verified" },
          decision: { outcome: "extend", scope: "", reviewer: "" },
        },
        true,
      ),
    );
    expect(html.indexOf("A critical error comes first")).toBeGreaterThan(-1);
    expect(html.indexOf("A critical error comes first")).toBeLessThan(html.indexOf("Evidence recognition"));
    expect(html).toMatch(/of 3: /);
  });
});

describe("the workbench card", () => {
  it("shows evidence and outstanding checks, labelled fields, and no score or rank", () => {
    const db = openDb(":memory:");
    const home = toolHome(db, userById(db, "casey")!, new Date("2026-11-24T00:00:00Z")) as ShadowToolHome;
    const h = home.demo.hires[0];
    const html = renderToStaticMarkup(createElement(HireCard, { home, h, st: home.hireStates[h.id], edit: () => undefined }));
    accessible(html);
    expect(html).toMatch(/Evidence and outstanding checks/);
    expect(html).toMatch(/\((seen|outstanding)\)/);
    expect(html).not.toMatch(/score|%/i);
  });
});
