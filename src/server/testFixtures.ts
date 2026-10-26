import type { Db } from "./db";
import { classicPathSteps } from "@/content/followups";

/** Swaps A little extra time back to single-question follow ups, so engine tests can exercise that activity type. */
export function useClassicExtraTime(db: Db) {
  const steps = classicPathSteps.map((s) => ({ ...s, pinned: { default: 1, variants: Object.fromEntries(Object.keys(s.variants).map((r) => [r, 1])) } }));
  db.prepare("UPDATE path_versions SET steps = ? WHERE path_id = 'path-extra-time' AND status = 'published'").run(JSON.stringify(steps));
}
