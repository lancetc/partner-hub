import { describe, expect, it } from "vitest";
import { namesIn } from "./PeopleReferences";

describe("the people a Magazine page names", () => {
  it("finds people, not the words of a title-case heading or the scheme's own terms", () => {
    expect(namesIn("What counts as stealing in Home Services.", "Ayla notices her ring is missing. Ayla tells her worker, Jon.")).toEqual(
      expect.arrayContaining(["Ayla", "Jon"]),
    );
    expect(namesIn("The Serious Incident Response Scheme sets Priority 1 and Priority 2.")).toEqual([]);
  });
});
