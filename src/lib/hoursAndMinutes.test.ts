import { describe, expect, it } from "vitest";
import { hoursAndMinutes } from "./format";

describe("hoursAndMinutes", () => {
  it("shows minutes under an hour, and hours and minutes (to the nearest 5) from an hour", () => {
    expect(hoursAndMinutes(25)).toBe("25 min");
    expect(hoursAndMinutes(60)).toBe("1 hr");
    expect(hoursAndMinutes(201)).toBe("3 hr 20 min");
    expect(hoursAndMinutes(119)).toBe("2 hr");
  });
});
