import { describe, expect, it } from "vitest";
import { homeParts, moreFor } from "./homeLayout";

/* Each role's homepage: what it keeps, and the "More on the Hub" links for what it leaves out. */

const supplier = { role: "learner", audience: "partner", canAuthor: false };
const carePartner = { role: "org_admin", audience: "partner", canAuthor: false };
const coordinator = { role: "learner", audience: "coordinator", canAuthor: false };
const staff = { role: "learner", audience: "staff", canAuthor: false };
const admin = { role: "author", audience: "staff", canAuthor: true };

describe("the homepage by role", () => {
  it("keeps the essentials for suppliers, Care Partners and Trilogy staff", () => {
    for (const v of [supplier, carePartner, staff]) {
      expect(homeParts(v)).toEqual(["practise", "favourites", "news"]);
      expect(moreFor(v).map((m) => m.label)).toEqual(["Lives in Progress", "Community and challenges"]);
    }
  });

  it("gives coordinators the people they follow and Lives in Progress too", () => {
    expect(homeParts(coordinator)).toEqual(["practise", "following", "favourites", "lives", "news"]);
    expect(moreFor(coordinator).map((m) => m.label)).toEqual(["Community and challenges"]);
  });

  it("shows authors and administrators everything, with nothing under More", () => {
    expect(homeParts(admin)).toHaveLength(6);
    expect(moreFor(admin)).toEqual([]);
  });
});
