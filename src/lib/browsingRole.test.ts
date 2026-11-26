import { describe, expect, it } from "vitest";
import { browsingRole, GUIDE_ROLES } from "./magazine";

/* The role filters start on the reader's own role, named as the demo profiles are. */

describe("the starting browsing role", () => {
  it("is each demo profile's own role, and none for administrators", () => {
    expect(browsingRole({ audience: "partner", role: "learner" })).toBe("partner"); // Sam, Supplier
    expect(browsingRole({ audience: "coordinator", role: "learner" })).toBe("coordinator"); // Riley, Care Coordinator
    expect(browsingRole({ audience: "partner", role: "org_admin" })).toBe("owner"); // Casey, Care Partner
    expect(browsingRole({ audience: "staff", role: "learner" })).toBe("staff"); // Avery, Trilogy staff
    expect(browsingRole({ audience: "staff", role: "author", canAuthor: true })).toBeNull(); // the administrator sees everything
  });

  it("names the roles as the demo profiles are", () => {
    expect(GUIDE_ROLES.map((r) => r.label)).toEqual(["Suppliers", "Care Coordinators", "Care Partners", "Trilogy Care staff"]);
  });
});
