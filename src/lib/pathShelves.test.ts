import { describe, expect, it } from "vitest";
import { pathForRole, pathShelves, type ShelfPath } from "./pathShelves";

/* The rows across the top of Discovery Paths. */

const path = (id: string, o: Partial<ShelfPath> = {}): ShelfPath => ({
  id,
  name: id,
  audience: "Everyone",
  minutes: 90,
  addedAt: "2026-10-01T00:00:00Z",
  popularity: 0,
  assigned: false,
  selfEnrolled: false,
  started: false,
  done: false,
  ...o,
});

describe("Discovery Paths rows", () => {
  it("lists the newest and most popular paths, leaving out ones the person already has", () => {
    const paths = [
      path("old", { addedAt: "2026-09-01T00:00:00Z", popularity: 3 }),
      path("new", { addedAt: "2026-11-01T00:00:00Z", popularity: 9 }),
      path("mid", { addedAt: "2026-10-15T00:00:00Z" }),
      path("mine", { addedAt: "2026-11-10T00:00:00Z", popularity: 50, assigned: true }),
      path("finished", { addedAt: "2026-11-09T00:00:00Z", done: true }),
      path("dipped", { addedAt: "2026-08-01T00:00:00Z", started: true }),
    ];
    const rows = pathShelves({ paths });
    expect(rows.find((r) => r.id === "new")?.paths.map((p) => p.id)).toEqual(["new", "mid", "old", "dipped"]);
    expect(rows.find((r) => r.id === "popular")?.paths.map((p) => p.id)).toEqual(["new", "old"]);
  });

  it("has a row for the person's role, matched on the path's audience wording", () => {
    expect(pathForRole("Care Coordinators", "coordinator")).toBe(true);
    expect(pathForRole("Service partners and suppliers", "partner")).toBe(true);
    expect(pathForRole("Care Coordinators", "partner")).toBe(false);
    expect(pathForRole("Everyone", "partner")).toBe(false);
    const paths = [path("a", { audience: "Care Coordinators" }), path("b", { audience: "Care Coordinators" }), path("c", { audience: "Service Partners" })];
    expect(pathShelves({ paths, audience: "coordinator" }).find((r) => r.id === "role")).toMatchObject({ title: "For care coordinators" });
    // Staff have no role row; one partner path isn't enough for a row.
    expect(pathShelves({ paths, audience: "staff" }).some((r) => r.id === "role")).toBe(false);
    expect(pathShelves({ paths, audience: "partner" }).some((r) => r.id === "role")).toBe(false);
  });

  it("collects short paths, shortest first, and leaves out rows with only one path", () => {
    const rows = pathShelves({ paths: [path("long"), path("quick", { minutes: 20 }), path("quicker", { minutes: 10 })] });
    expect(rows.find((r) => r.id === "short")?.paths.map((p) => p.id)).toEqual(["quicker", "quick"]);
    expect(pathShelves({ paths: [path("quick", { minutes: 20 }), path("long")] }).some((r) => r.id === "short")).toBe(false);
  });
});
