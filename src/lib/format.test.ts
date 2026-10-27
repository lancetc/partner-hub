import { describe, expect, it } from "vitest";
import { formatDate, formatDuration } from "./format";

describe("formatDate", () => {
  it("shows a calendar date as that day, in and out of daylight saving", () => {
    expect(formatDate("2026-10-01")).toBe("1 Oct 2026");
    expect(formatDate("2026-06-15")).toBe("15 June 2026");
    expect(formatDate("2026-12-25")).toBe("25 Dec 2026");
  });
  it("shows a moment in Sydney time", () => {
    expect(formatDate("2026-10-25T14:30:00Z")).toBe("26 Oct 2026");
  });
});

describe("formatDuration", () => {
  it("keeps short times in minutes and rounds longer ones to the half hour", () => {
    expect(formatDuration(1)).toBe("1 minute");
    expect(formatDuration(17)).toBe("17 minutes");
    expect(formatDuration(58)).toBe("About 1 hour");
    expect(formatDuration(80)).toBe("About 1½ hours");
    expect(formatDuration(120)).toBe("About 2 hours");
    expect(formatDuration(383)).toBe("About 6½ hours");
  });
});
