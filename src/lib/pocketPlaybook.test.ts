import { describe, expect, it } from "vitest";
import { GOLDEN_SCRIPTS, INCIDENT_PATH, POCKET_TOOLS } from "@/content/pocketPlaybook";
import { SEED_SNIPPETS } from "@/content/playbooks";
import { AID_EVENTS } from "./playbook";
import {
  incidentGuidance,
  incidentPathProblems,
  placeholders,
  POCKET_CLIENT_EVENTS,
  POCKET_EVENTS,
  scriptCopyText,
  scriptProblems,
  taskScore,
  type IncidentAnswers,
} from "./pocketPlaybook";

/* The Pocket Playbook's pure rules: the incident path, Golden Scripts, task search and the event list. */

describe("the incident first-steps path", () => {
  it("always escalates internally, and never says “not reportable”, whatever is answered", () => {
    const answers = [null, "yes", "no", "unsure"] as const;
    for (const danger of answers)
      for (const sirsType of answers) {
        const g = incidentGuidance({ danger, sirsType } as IncidentAnswers);
        expect(g.escalate).toBe(true);
        expect(`${g.headline} ${g.sirsNote}`).not.toMatch(/not (sirs[- ])?reportable|no need to (report|escalate)/i);
        expect(`${g.headline} ${g.sirsNote}`).toMatch(/responder|Escalate/);
      }
  });

  it("puts the emergency route first when someone is in danger, or the coordinator isn't sure", () => {
    expect(incidentGuidance({ danger: "yes" }).first).toBe("emergency");
    expect(incidentGuidance({ danger: "unsure" }).first).toBe("emergency");
    expect(incidentGuidance({ danger: "no" }).first).toBe("internal");
    expect(incidentGuidance({ sirsType: "no" }).sirsNote).toMatch(/every incident is managed/i);
  });

  it("starts with safety, then the internal route, then SIRS prompts and sources, and builds on the existing Job Aid", () => {
    expect(INCIDENT_PATH.safety.emergency[0]).toMatch(/000/);
    expect(INCIDENT_PATH.internal.contactKey).toBe("incident-responder");
    expect(INCIDENT_PATH.sirs.types).toHaveLength(8);
    expect(INCIDENT_PATH.sirs.alleged).toMatch(/Don’t wait for proof/);
    expect(INCIDENT_PATH.priority.p1).toMatch(/24 hours/);
    expect(INCIDENT_PATH.priority.p2).toMatch(/30 days/);
    expect(INCIDENT_PATH.priority.notInternal).toMatch(/never a reason to delay/);
    // Builds on sirs-first-steps and links it; the same directory contact, not a second one.
    const aid = SEED_SNIPPETS.find((s) => s.id === INCIDENT_PATH.relatedAid)!;
    expect(aid.data.contactKeys).toContain(INCIDENT_PATH.internal.contactKey);
    expect(POCKET_TOOLS.find((t) => t.id === "incident-first-steps")!.relatedAids).toContain("sirs-first-steps");
  });

  it("can't be released until Quality supplies the IMS link and after-hours route, and requires the escalation contact", () => {
    const problems = incidentPathProblems(INCIDENT_PATH);
    expect(problems.join(" ")).toMatch(/Incident Management System link/);
    expect(problems.join(" ")).toMatch(/after-hours/);
    const noContact = incidentPathProblems({ ...INCIDENT_PATH, internal: { ...INCIDENT_PATH.internal, contactKey: "" } });
    expect(noContact.join(" ")).toMatch(/internal escalation contact/);
    const complete = incidentPathProblems({
      ...INCIDENT_PATH,
      internal: { ...INCIDENT_PATH.internal, imsUrl: "https://ims.example.test", afterHours: "After-hours line" },
    });
    expect(complete).toEqual([]);
  });
});

describe("Golden Scripts", () => {
  it("are the four pilot scripts, each a draft version 1, unapproved", () => {
    expect(GOLDEN_SCRIPTS.map((s) => s.id)).toEqual(["contractor-no-show", "contribution-question", "family-asks-to-decide", "possible-incident"]);
    for (const s of GOLDEN_SCRIPTS) {
      expect([s.version, s.status], s.id).toEqual([1, "draft"]);
      expect(scriptProblems(s), s.id).toEqual([]);
    }
  });

  it("declares every fact slot it uses, and copies with the placeholders and the verify cue, never a client's details", () => {
    const s = GOLDEN_SCRIPTS.find((x) => x.id === "contractor-no-show")!;
    expect(placeholders(s.opening)).toEqual(["agreed time"]);
    const copied = scriptCopyText(s);
    expect(copied).toContain("[agreed time]");
    expect(copied).toMatch(/Verify before use/);
    expect(scriptProblems({ ...s, opening: `${s.opening} Ask for [name].` }).join(" ")).toMatch(/isn’t a declared fact slot/);
    expect(scriptProblems({ ...s, opening: "It’s not reportable, so don’t worry. I’ll call by [agreed time]." }).join(" ")).toMatch(
      /promise or a determination/,
    );
  });

  it("the incident script defers to the incident path and never classifies", () => {
    const s = GOLDEN_SCRIPTS.find((x) => x.id === "possible-incident")!;
    expect(s.related.map((r) => r.id)).toEqual(["incident-first-steps", "sirs-first-steps"]);
    expect(s.guardrail).toMatch(/Don’t say it is or isn’t SIRS-reportable/);
  });
});

describe("task search by everyday words", () => {
  const tool = (id: string) => POCKET_TOOLS.find((t) => t.id === id)!;
  const script = (id: string) => {
    const s = GOLDEN_SCRIPTS.find((x) => x.id === id)!;
    return { title: s.trigger, tags: s.tags, task: s.intent };
  };
  it("finds the PRD's task phrases", () => {
    expect(taskScore("gardener contribution", tool("contribution-quick-calc"))).toBeGreaterThan(0);
    expect(taskScore("price not confirmed", tool("contribution-quick-calc"))).toBeGreaterThan(0);
    expect(taskScore("bruise", tool("incident-first-steps"))).toBeGreaterThan(0);
    expect(taskScore("missed visit", script("contractor-no-show"))).toBeGreaterThan(0);
    expect(taskScore("daughter wants budget", script("family-asks-to-decide"))).toBeGreaterThan(0);
  });
  it("doesn't match on nothing, or on unrelated words", () => {
    expect(taskScore("", tool("incident-first-steps"))).toBe(0);
    expect(taskScore("bruise", tool("contribution-quick-calc"))).toBe(0);
    expect(taskScore("annual leave roster", tool("golden-scripts"))).toBe(0);
  });
});

describe("tools and events", () => {
  it("every tool has an owner, a reviewer, a source, a fallback and what it awaits, and is a draft", () => {
    for (const t of POCKET_TOOLS) {
      expect(t.owner && t.reviewer && t.awaiting && t.fallback.text, t.id).toBeTruthy();
      expect(t.sources.length, t.id).toBeGreaterThan(0);
      expect(t.status, t.id).toBe("draft");
    }
    expect(POCKET_TOOLS.find((t) => t.id === "contribution-quick-calc")!.audiences).not.toContain("partner");
  });
  it("records the PRD's events in the Job Aids event table, pins only from the server", () => {
    for (const e of POCKET_EVENTS) expect(AID_EVENTS as readonly string[]).toContain(e);
    expect(POCKET_CLIENT_EVENTS).not.toContain("tool_pinned");
    expect(POCKET_CLIENT_EVENTS).toContain("search_no_result");
  });
});
