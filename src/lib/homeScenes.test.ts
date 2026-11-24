import { describe, expect, it } from "vitest";
import { daypartAfter, daypartAt, daypartScript, msUntilNextDaypart } from "./homeScenes";

/* The homepage cover's picture follows the visitor's clock: day 5:00 am–4:59 pm, evening 5–8:59 pm, night 9 pm–4:59 am. */

const at = (h: number, m = 0) => new Date(2026, 10, 22, h, m);

describe("the part of the day", () => {
  it("changes at 5 am, 5 pm and 9 pm", () => {
    expect([at(4, 59), at(5), at(16, 59), at(17), at(20, 59), at(21), at(0)].map(daypartAt)).toEqual([
      "night",
      "day",
      "day",
      "evening",
      "evening",
      "night",
      "night",
    ]);
    expect([daypartAfter("day"), daypartAfter("evening"), daypartAfter("night")]).toEqual(["evening", "night", "day"]);
  });

  it("knows how long until the next one, across midnight too", () => {
    expect(msUntilNextDaypart(at(16, 30))).toBe(30 * 60_000);
    expect(msUntilNextDaypart(at(23))).toBe(6 * 3_600_000);
    expect(msUntilNextDaypart(at(3))).toBe(2 * 3_600_000);
  });

  it("is worked out the same way by the first-paint script", () => {
    for (const h of [0, 4, 5, 12, 16, 17, 20, 21, 23]) {
      const attrs: Record<string, string> = {};
      const doc = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
      const RealDate = Date;
      const FakeDate = class extends RealDate {
        getHours() {
          return h;
        }
      };
      new Function("document", "Date", daypartScript)(doc, FakeDate);
      expect(attrs["data-daypart"], `${h}:00`).toBe(daypartAt(at(h)));
      expect(attrs["data-daypart-next"]).toBe(daypartAfter(daypartAt(at(h))));
    }
  });
});
