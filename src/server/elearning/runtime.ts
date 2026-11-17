import type { Standard } from "./manifest";

/*
  The SCORM data a package reports, read on the server. Saves arrive as flat key-value pairs
  ({"cmi.core.lesson_status": "completed", ...}). This module checks them, pulls out what the Hub
  tracks, works out the Hub outcome, and builds what to hand back when an attempt resumes. Pure.

  The Hub outcome (documented rule, tested in runtime.test.ts):
  - SCORM 1.2 has one status. "passed" is passed, "failed" is failed (and finished), "completed" is
    completed; "incomplete", "browsed" or nothing yet is in progress.
  - SCORM 2004 reports completion and success separately, and both are kept. A success status of
    "passed" or "failed" decides pass or fail; otherwise "completed" is completed; anything else is in progress.
  - Achievements stick: once an attempt has passed (or completed), a later save can't take that away,
    because packages sometimes report "incomplete" again when reopened for review. The time each was
    first reached is kept. A failed attempt can still go on to pass.
*/

export type Flat = Record<string, string>;
export type Outcome = "not_started" | "in_progress" | "completed" | "passed" | "failed";

export class RuntimeError extends Error {}

/** Largest save accepted, in characters of JSON: well beyond any real course's data model. */
export const MAX_SAVE_CHARS = 4 * 1024 * 1024;
const MAX_KEYS = 20_000;
/** The spec's limits for resume data. Packages that need more are rejected by the runtime in the browser first. */
export const SUSPEND_LIMIT: Record<Standard, number> = { scorm12: 4096, scorm2004: 64000 };
const MAX_VALUE = 64000;

const KEY = /^(cmi|adl)\.[A-Za-z0-9_.]{1,200}$/;
const LESSON_STATUS = ["passed", "completed", "failed", "incomplete", "browsed", "not attempted"];
const COMPLETION = ["completed", "incomplete", "not attempted", "unknown"];
const SUCCESS = ["passed", "failed", "unknown"];
const EXIT_12 = ["", "time-out", "suspend", "logout"];
const EXIT_2004 = ["", "time-out", "suspend", "logout", "normal"];

/** "0012:03:04.5" (SCORM 1.2) to seconds. */
export function seconds12(v: string | undefined) {
  const m = /^(\d{2,4}):([0-5]\d):([0-5]\d)(\.\d{1,2})?$/.exec(v ?? "");
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4] ?? 0) : 0;
}

/** ISO 8601 durations such as "PT1H2M3.5S" or "P1DT2H" (SCORM 2004) to seconds. */
export function seconds2004(v: string | undefined) {
  const m = /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(v ?? "");
  if (!m || v === "P" || v === "PT") return 0;
  const [, y, mo, d, h, mi, s] = m.map((x) => Number(x ?? 0));
  return y * 31_536_000 + mo * 2_592_000 + d * 86_400 + h * 3600 + mi * 60 + s;
}

/** Seconds as the package expects total_time. */
export function formatTotal(standard: Standard, total: number) {
  const secs = Math.max(0, Math.floor(total));
  if (standard === "scorm2004") return `PT${Math.floor(secs / 3600)}H${Math.floor((secs % 3600) / 60)}M${secs % 60}S`;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(Math.floor(secs / 3600)).padStart(4, "0")}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;
}

/**
  Checks a save before it's kept. The browser-side runtime already enforces the data model; this is the
  server refusing anything it shouldn't store, whatever the page sent. Values are never cut short:
  a save that breaks a limit is refused as a whole.
*/
export function validateSave(standard: Standard, data: unknown): Flat {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new RuntimeError("The save isn’t SCORM data.");
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length > MAX_KEYS) throw new RuntimeError("The save has too many values.");
  const out: Flat = {};
  for (const [k, v] of entries) {
    if (!KEY.test(k)) throw new RuntimeError(`“${k.slice(0, 80)}” isn’t a SCORM data model element.`);
    if (v === null || v === undefined) continue;
    if (typeof v === "object") throw new RuntimeError(`“${k}” should be a single value.`);
    const s = String(v);
    const limit = k.endsWith("suspend_data") ? SUSPEND_LIMIT[standard] : MAX_VALUE;
    if (s.length > limit) throw new RuntimeError(`“${k}” is longer than the ${standard === "scorm12" ? "SCORM 1.2" : "SCORM 2004"} limit of ${limit} characters.`);
    out[k] = s;
  }
  const check = (key: string, allowed: string[]) => {
    if (key in out && !allowed.includes(out[key])) throw new RuntimeError(`“${out[key]}” isn’t a valid value for ${key}.`);
  };
  if (standard === "scorm12") {
    check("cmi.core.lesson_status", LESSON_STATUS);
    check("cmi.core.exit", EXIT_12);
  } else {
    check("cmi.completion_status", COMPLETION);
    check("cmi.success_status", SUCCESS);
    check("cmi.exit", EXIT_2004);
  }
  for (const key of ["raw", "min", "max", "scaled"].map((p) => (standard === "scorm12" ? `cmi.core.score.${p}` : `cmi.score.${p}`))) {
    if (key in out && out[key] !== "" && !Number.isFinite(Number(out[key]))) throw new RuntimeError(`${key} should be a number.`);
  }
  if (standard === "scorm2004" && out["cmi.score.scaled"] && Math.abs(Number(out["cmi.score.scaled"])) > 1) throw new RuntimeError("cmi.score.scaled must be between -1 and 1.");
  return out;
}

const num = (v: string | undefined) => (v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** What the Hub tracks from a save. */
export function tracked(standard: Standard, d: Flat) {
  if (standard === "scorm12") {
    const status = d["cmi.core.lesson_status"] ?? "";
    return {
      completion: ["completed", "passed", "failed"].includes(status) ? "completed" : status ? "incomplete" : null,
      success: status === "passed" ? "passed" : status === "failed" ? "failed" : status ? "unknown" : null,
      score: { raw: num(d["cmi.core.score.raw"]), min: num(d["cmi.core.score.min"]), max: num(d["cmi.core.score.max"]), scaled: null as number | null },
      location: d["cmi.core.lesson_location"] ?? null,
      exit: d["cmi.core.exit"] ?? "",
      sessionSeconds: seconds12(d["cmi.core.session_time"]),
    };
  }
  return {
    completion: d["cmi.completion_status"] ?? null,
    success: d["cmi.success_status"] ?? null,
    score: { raw: num(d["cmi.score.raw"]), min: num(d["cmi.score.min"]), max: num(d["cmi.score.max"]), scaled: num(d["cmi.score.scaled"]) },
    location: d["cmi.location"] ?? null,
    exit: d["cmi.exit"] ?? "",
    sessionSeconds: seconds2004(d["cmi.session_time"]),
  };
}

/** The outcome after a save, given what the attempt had already achieved. See the rule at the top. */
export function outcomeAfter(t: { completion: string | null; success: string | null }, before: { passedAt: string | null; completedAt: string | null }): Outcome {
  if (before.passedAt || t.success === "passed") return "passed";
  if (t.success === "failed") return "failed";
  if (before.completedAt || t.completion === "completed") return "completed";
  return "in_progress";
}

/** Values a resumed attempt gets back. Write-only elements (SCORM 1.2 interactions, times) are left out. */
export function restorable(standard: Standard, d: Flat): Flat {
  const keep =
    standard === "scorm12"
      ? /^cmi\.(core\.(lesson_location|lesson_status|score\.(raw|min|max))|suspend_data|objectives\.\d+\.(id|status|score\.(raw|min|max))|student_preference\.(audio|language|speed|text))$/
      : /^cmi\.(location|completion_status|success_status|progress_measure|score\.(raw|min|max|scaled)|suspend_data|objectives\.\d+\.(id|success_status|completion_status|progress_measure|description|score\.(raw|min|max|scaled))|learner_preference\.(audio_level|language|delivery_speed|audio_captioning)|interactions\.\d+\.(id|type|timestamp|weighting|learner_response|result|latency|description|objectives\.\d+\.id|correct_responses\.\d+\.pattern))$/;
  // Count elements ("_count") are rebuilt by the runtime from the rows themselves.
  return Object.fromEntries(Object.entries(d).filter(([k]) => keep.test(k)));
}

/** Everything a launch hands the runtime before the package starts: who, how, and any saved state. */
export function startingData(
  standard: Standard,
  o: { learnerId: string; learnerName: string; saved: Flat | null; totalSeconds: number; preview: boolean },
): Flat {
  const resume = Boolean(o.saved && Object.keys(o.saved).length);
  const base: Flat =
    standard === "scorm12"
      ? {
          "cmi.core.student_id": o.learnerId,
          "cmi.core.student_name": o.learnerName,
          "cmi.core.credit": o.preview ? "no-credit" : "credit",
          "cmi.core.lesson_mode": "normal",
          "cmi.core.entry": resume ? "resume" : "ab-initio",
          "cmi.core.total_time": formatTotal(standard, o.totalSeconds),
        }
      : {
          "cmi.learner_id": o.learnerId,
          "cmi.learner_name": o.learnerName,
          "cmi.credit": o.preview ? "no-credit" : "credit",
          "cmi.mode": "normal",
          "cmi.entry": resume ? "resume" : "ab-initio",
          "cmi.total_time": formatTotal(standard, o.totalSeconds),
        };
  return { ...base, ...(o.saved ? restorable(standard, o.saved) : {}) };
}

/** SCORM 1.2 shows names as "Last, First". */
export const scormName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}` : name.trim();
};
