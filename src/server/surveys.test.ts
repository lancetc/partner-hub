import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { recordLessonCompletion } from "./learning";
import { createSurvey, pendingSurveys, setSurveyLinks, skipSurvey, submitSurvey, surveyCsv, surveyResults, updateSurvey } from "./surveys";

/* Surveys asked when someone finishes a learning path (the module) or a single lesson. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  // Treat the demo surveys as attached long ago, so test completions count.
  db.prepare("UPDATE survey_links SET linked_at = '2000-01-01T00:00:00Z'").run();
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-10-22T04:00:00Z");
const finish = (who: string, slug: string, at = now) => recordLessonCompletion(db, u(who), { slug, version: "1" }, at);
const pending = (who: string, lesson?: string) => pendingSurveys(db, u(who), lesson).map((p) => `${p.survey.id}@${p.target.id}`);
const welcome = { type: "path" as const, id: "lp-welcome" };
const good = { useful: 5, clear: 4, confident: 4, apply: "Agree", better: "More examples." };

describe("when surveys are asked", () => {
  it("asks the lesson survey when that lesson is finished", () => {
    expect(pending("sam")).toEqual([]);
    finish("sam", "legislative-framework");
    expect(pending("sam", "legislative-framework")).toEqual(["sv-lesson-check-in@legislative-framework"]);
  });

  it("asks the module survey only once every lesson in the path is done, path first", () => {
    finish("sam", "our-mission-and-model");
    expect(pending("sam")).toEqual([]);
    finish("sam", "legislative-framework");
    expect(pending("sam", "legislative-framework")).toEqual(["sv-module-feedback@lp-welcome", "sv-lesson-check-in@legislative-framework"]);
    // Not assigned the path, so no module survey.
    finish("casey", "our-mission-and-model");
    finish("casey", "legislative-framework");
    expect(pending("casey")).toEqual(["sv-lesson-check-in@legislative-framework"]);
  });

  it("doesn't survey people about work finished before the survey was attached", () => {
    finish("sam", "noticing-a-change", new Date("2026-10-01T00:00:00Z"));
    const { id } = createSurvey(db, u("jordan"), { template: "blank" }, now);
    setSurveyLinks(db, u("jordan"), id, [{ type: "lesson", id: "noticing-a-change" }], now);
    expect(pending("sam")).toEqual([]);
    finish("ash", "noticing-a-change", new Date("2026-10-23T00:00:00Z"));
    expect(pending("ash")).toEqual([`${id}@noticing-a-change`]);
  });
});

describe("answering", () => {
  beforeEach(() => {
    finish("sam", "our-mission-and-model");
    finish("sam", "legislative-framework");
  });

  it("stores anonymous answers without a name, and only once", () => {
    submitSurvey(db, u("sam"), "sv-module-feedback", welcome, good, now);
    const row = db.prepare("SELECT user_id, org_id FROM survey_responses WHERE target_id = 'lp-welcome' ORDER BY id DESC").get() as {
      user_id: string | null;
      org_id: string;
    };
    expect(row).toEqual({ user_id: null, org_id: "taylor-cleaning" });
    expect(() => submitSurvey(db, u("sam"), "sv-module-feedback", welcome, good, now)).toThrow(/isn’t waiting/);
  });

  it("keeps names on a named survey", () => {
    submitSurvey(db, u("sam"), "sv-lesson-check-in", { type: "lesson", id: "legislative-framework" }, { clear: 3 }, now);
    expect((db.prepare("SELECT user_id FROM survey_responses WHERE survey_id = 'sv-lesson-check-in'").get() as { user_id: string }).user_id).toBe("sam");
  });

  it("checks required and out-of-range answers", () => {
    expect(() => submitSurvey(db, u("sam"), "sv-module-feedback", welcome, { ...good, useful: undefined }, now)).toThrow(/Please answer/);
    expect(() => submitSurvey(db, u("sam"), "sv-module-feedback", welcome, { ...good, useful: 9 }, now)).toThrow(/1 to 5/);
    expect(() => submitSurvey(db, u("sam"), "sv-module-feedback", welcome, { ...good, apply: "Maybe" }, now)).toThrow(/Choose an option/);
  });

  it("lets people skip optional surveys but not required ones", () => {
    skipSurvey(db, u("sam"), "sv-lesson-check-in", { type: "lesson", id: "legislative-framework" }, now);
    expect(pending("sam")).toEqual(["sv-module-feedback@lp-welcome"]);
    db.prepare("UPDATE surveys SET required = 1 WHERE id = 'sv-module-feedback'").run();
    expect(() => skipSurvey(db, u("sam"), "sv-module-feedback", welcome, now)).toThrow(/required/);
  });
});

describe("results", () => {
  it("averages scores, lists comments and scopes organisation admins to their own people", () => {
    const all = surveyResults(db, u("jordan"), "sv-module-feedback");
    expect(all.total).toBe(6);
    expect(all.questions.find((q) => q.id === "useful")!.average).toBe(4.3);
    const better = all.questions.find((q) => q.id === "better")!;
    expect("comments" in better && better.comments.length === 4 && better.comments.every((c) => c.name === null)).toBe(true);
    const casey = surveyResults(db, u("casey"), "sv-module-feedback");
    expect(casey.total).toBe(2);
    expect(() => surveyResults(db, u("sam"), "sv-module-feedback")).toThrow(/access/);
  });

  it("exports CSV without a person column for anonymous surveys", () => {
    const { body } = surveyCsv(db, u("jordan"), "sv-module-feedback");
    expect(body.split("\n")[0]).toBe(
      "Submitted,Where,Organisation,How useful was this for your work?,How clear was the content?,How confident do you feel putting this into practice?,I’ll do something differently because of this.,What would make it better?",
    );
    expect(body.split("\n")).toHaveLength(7);
  });
});

describe("building surveys", () => {
  it("only lets authors build, and moves a place from one survey to another", () => {
    expect(() => createSurvey(db, u("casey"), { template: "module" }, now)).toThrow(/learning authors/);
    const { id } = createSurvey(db, u("jordan"), { template: "module", name: "Onboarding feedback" }, now);
    setSurveyLinks(db, u("jordan"), id, [{ type: "path", id: "lp-partner-onboarding" }], now);
    const where = (sid: string) =>
      (db.prepare("SELECT target_id FROM survey_links WHERE survey_id = ? ORDER BY target_id").all(sid) as { target_id: string }[]).map((r) => r.target_id);
    expect(where(id)).toEqual(["lp-partner-onboarding"]);
    expect(where("sv-module-feedback")).toEqual(["lp-welcome"]);
  });

  it("won't make an answered anonymous survey named", () => {
    expect(() =>
      updateSurvey(
        db,
        u("jordan"),
        "sv-module-feedback",
        { name: "Module feedback", anonymous: false, questions: [{ id: "q", type: "text", prompt: "Hi", required: false }] },
        now,
      ),
    ).toThrow(/stay anonymous/);
  });
});
