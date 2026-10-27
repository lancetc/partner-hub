import { describe, expect, it } from "vitest";
import type { LessonAttempt } from "./store";
import { mergeProgress } from "./progressSync";

/* Lesson progress between a device and the server: the newest copy wins. */

const at = (nodeId: string, savedAt?: string): LessonAttempt => ({
  version: "1",
  nodeId,
  route: [nodeId],
  answers: {},
  status: "in_progress",
  startedAt: "2026-10-01T00:00:00Z",
  previousRoutes: [],
  ...(savedAt ? { savedAt } : {}),
});

describe("progress sync", () => {
  it("takes the server's copy when it's newer, and sends this device's when it's newer", () => {
    const { merged, toPush } = mergeProgress(
      { a: at("card-2", "2026-10-26T01:00:00Z"), b: at("card-9", "2026-10-26T03:00:00Z"), c: at("card-1") },
      {
        a: { attempt: at("card-5"), savedAt: "2026-10-26T02:00:00Z" },
        b: { attempt: at("card-3"), savedAt: "2026-10-26T02:00:00Z" },
        d: { attempt: at("card-4"), savedAt: "2026-10-25T00:00:00Z" },
      },
    );
    expect(merged.a.nodeId).toBe("card-5");
    expect(merged.b.nodeId).toBe("card-9");
    expect(merged.d.nodeId).toBe("card-4");
    // Never synced before, and not on the server: send it.
    expect(toPush.sort()).toEqual(["b", "c"]);
  });
});
