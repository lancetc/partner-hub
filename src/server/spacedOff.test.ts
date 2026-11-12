import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { recordLessonCompletion } from "./learning";
import { useClassicExtraTime } from "./testFixtures";
import { runWorker } from "./worker";
import { zonedToUtc } from "@/lib/schedule";

/* Spaced learning switched off (lib/features): finishing a spaced topic enrols nobody, and the worker releases nothing. */

const lesson = { slug: "a-little-extra-time", version: "1.0-demo" };
const bne = (y: number, m: number, d: number, t: string) => zonedToUtc({ y, m, d }, t, "Australia/Brisbane");

let dir: string;
let db: Db;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-test-"));
  db = openDb(path.join(dir, "hub.sqlite"));
  useClassicExtraTime(db);
});
afterEach(() => {
  process.env.NEXT_PUBLIC_SPACED_LEARNING = "on";
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

describe("spaced learning switched off", () => {
  it("enrols nobody when a spaced topic is finished, and tells the learner about no follow ups", () => {
    process.env.NEXT_PUBLIC_SPACED_LEARNING = "off";
    const done = recordLessonCompletion(db, userById(db, "sam")!, lesson, bne(2026, 10, 22, "14:00"));
    expect(done.followUps).toEqual([]);
    expect(count("SELECT COUNT(*) AS n FROM enrolments")).toBe(0);
  });

  it("stops releases and digests for people already enrolled, and picks up again when switched back on", async () => {
    // Enrolled while it was on.
    recordLessonCompletion(db, userById(db, "sam")!, lesson, bne(2026, 10, 22, "14:00"));
    expect(count("SELECT COUNT(*) AS n FROM step_instances")).toBe(4);

    process.env.NEXT_PUBLIC_SPACED_LEARNING = "off";
    const later = bne(2027, 3, 1, "09:00");
    const off = await runWorker(db, later);
    expect(off).toMatchObject({ released: 0, digests: 0 });
    expect(count("SELECT COUNT(*) AS n FROM step_instances WHERE released_at IS NOT NULL")).toBe(0);

    process.env.NEXT_PUBLIC_SPACED_LEARNING = "on";
    const on = await runWorker(db, later);
    expect(on.released).toBeGreaterThan(0);
  });
});
