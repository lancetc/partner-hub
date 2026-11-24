import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TrustCheckBlock } from "@/lib/magazine";
import { applyMove, buildDebrief, emptyState, playPath, trustView, type TrustState } from "@/lib/trustCheck";
import { MRS_PATEL_TRUST } from "@/content/trustCases";
import type { TrustAttemptView } from "@/server/trustCheck";
import { demoView } from "@/server/trustTool";
import { Attempt } from "./TrustCheck";
import { IssueDetail } from "../tools/TrustCheckTool";

/*
  The 28-Day Trust Check's pages, rendered as the server would send them at each stage (docs/trust-check.md): every
  decision is a labelled field, statuses are words, critical errors come first in the debrief, and nothing anywhere
  is a churn score. (Interaction in the running app is checked in the browser; these pin the markup.)
*/

const b = { id: "tc", type: "trustcheck", ...structuredClone(MRS_PATEL_TRUST) } as TrustCheckBlock;
const at = (s: TrustState, debrief = false): TrustAttemptView => ({
  attemptId: "a1",
  attemptNo: 1,
  status: debrief ? "completed" : "active",
  view: trustView(b, s),
  debrief: debrief ? buildDebrief(b, s) : null,
  attempts: 1,
  versions: { trust: "", rubric: "", engine: "", scenario: "", rules: "" },
  earlierScenario: false,
});
const render = (v: TrustAttemptView) =>
  renderToStaticMarkup(
    createElement(Attempt, { b, v, setV: () => undefined, call: async () => v, preview: true, guideId: "g", place: "magazine", onFinished: undefined }),
  );
const strong = MRS_PATEL_TRUST.paths.find((p) => p.id === "strong")!;
const openNotice = (s: TrustState) => ["s-cleans", "s-budget", "s-invoice"].reduce((x, id) => applyMove(b, x, { do: "open", signal: id }), s);

/** Every input is inside a label; every button has words; no churn score. */
function accessible(html: string) {
  const inputs = html.match(/<input[^>]*>/g) ?? [];
  for (const i of inputs) if (!/type="(checkbox|radio)"/.test(i)) expect(i).toMatch(/aria-label|id=/);
  expect(html).not.toMatch(/<button[^>]*>\s*<\/button>/);
  expect(html).not.toMatch(/churn score|probability|% chance/i);
}

describe("the learner’s pages", () => {
  it("starts with the setting, the role and the tempting shortcut, and no timer", () => {
    const html = render({ ...at(emptyState()), status: "new", view: null, attemptId: null });
    expect(html).toContain("Start the case");
    expect(html).toContain("The temptation");
    expect(html).toMatch(/no timer/);
  });

  it("shows the signal board with sources and update times, the phases as words, and a View evidence switch for phones", () => {
    const html = render(at(openNotice(emptyState())));
    accessible(html);
    expect(html).toContain("View evidence");
    expect(html).toContain("updated Fri 20 Nov, 4:10 pm");
    expect(html).toContain("What we noticed");
    expect(html).toContain("Alternative explanations");
    expect(html).toContain("Projected closing balance");
    expect(html).toMatch(/aria-current="step"/);
    expect(html).toMatch(/\(now: Is this actually a concern\?\)/);
  });

  it("shows what she said once she’s been heard, and the plan builder with its labelled fields", () => {
    // Walk only to the plan: Notice and Ask answered.
    let s = openNotice(emptyState());
    for (const step of ["facts", "alternatives", "artefact", "triage", "first-contact", "opening", "questions", "complaint", "diagnosis", "retriage"])
      s = applyMove(b, s, { do: "answer", step, options: strong.answers[step] });
    const html = render(at(s));
    accessible(html);
    expect(html).toContain("I don’t care about using every dollar");
    expect(html).toContain("Her concern, in her words");
    expect(html).toContain("Accountable owner of the main action");
    expect(html).toContain("What you’ll tell Asha about");
    expect(html).toContain("Propose the plan");
  });

  it("asks for evidence at the checkpoints, with booking and delivery records side by side", () => {
    let s = openNotice(emptyState());
    for (const step of ["facts", "alternatives", "artefact", "triage", "first-contact", "opening", "questions", "complaint", "diagnosis", "retriage"])
      s = applyMove(b, s, { do: "answer", step, options: strong.answers[step] });
    s = applyMove(b, s, { do: "plan", plan: strong.plan });
    s = applyMove(b, s, { do: "propose" });
    s = applyMove(b, s, { do: "answer", step: "tuesdays", options: ["tu-choice"] });
    const html = render(at(s));
    expect(html).toContain("Day 7: what does the record show?");
    expect(html).toContain("Booking confirmed");
    expect(html).toContain("Delivered");
  });

  it("debriefs critical errors first, with the correction and its source, and says the ending isn’t about staying", () => {
    const bad = render(
      at(
        playPath(
          b,
          MRS_PATEL_TRUST.paths.find((p) => p.id === "shortcut")!,
        ).state,
        true,
      ),
    );
    accessible(bad);
    expect(bad.indexOf("Critical errors")).toBeLessThan(bad.indexOf("How it went"));
    expect(bad).toContain("AT–HM assessment");
    expect(bad).toContain("she hasn’t agreed to share this");
    const moved = render(
      at(
        playPath(
          b,
          MRS_PATEL_TRUST.paths.find((p) => p.id === "moves")!,
        ).state,
        true,
      ),
    );
    expect(moved).toContain("A respectful, supported move to the provider she chose");
    expect(moved).toContain("Whether she stays or moves isn’t scored");
    expect(moved).toContain("Try again");
  });
});

describe("the Work Tool’s follow-up", () => {
  const owners = [{ id: "booking" as const, label: "The booking and scheduling owner" }];
  const issue = (id: string) =>
    renderToStaticMarkup(
      createElement(IssueDetail, {
        x: demoView().issues.find((x) => x.id === id)!,
        owners,
        busy: false,
        onBack: () => undefined,
        edit: () => undefined,
        onEvidence: () => undefined,
      }),
    );

  it("answers the four questions, and keeps a complaint read-only in its own system", () => {
    const html = issue("demo-b");
    for (const q of ["What do we know?", "What did the person say?", "Who owns the action?", "What happened?"]) expect(html).toContain(q);
    expect(html).toContain("DEMO-CMP-0142");
    expect(html).toMatch(/can’t close, withdraw or downgrade it/);
    expect(html).toMatch(/Resolved with person \(not yet\)/);
  });

  it("shows a safety concern first, locked to the urgent process", () => {
    const html = issue("demo-e");
    expect(html).toMatch(/A possible safety concern/);
    expect(html).toMatch(/<select[^>]*disabled/);
  });
});
