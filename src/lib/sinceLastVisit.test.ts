import { describe, expect, it } from "vitest";
import { sinceLastVisit, type VisitItem } from "./sinceLastVisit";

const now = new Date("2026-11-13T00:00:00Z");
const item = (p: Partial<VisitItem>): VisitItem => ({
  kind: "update",
  category: "News",
  priority: "normal",
  title: "Something",
  at: "2026-11-12T00:00:00Z",
  dueAt: null,
  done: false,
  ...p,
});

describe("since your last visit", () => {
  it("says nothing when nothing has changed", () => {
    expect(sinceLastVisit([item({ at: "2026-11-01T00:00:00Z" })], "2026-11-10T00:00:00Z", now)).toBeNull();
  });

  it("leads with the important update, then replies, webinars and reading, and what's due soon", () => {
    const text = sinceLastVisit(
      [
        item({ kind: "action", category: "Acknowledgement required", priority: "critical", title: "Updated invoicing guidance" }),
        item({ kind: "activity", category: "Community", title: "Priya replied" }),
        item({ kind: "activity", category: "Community", title: "Tom replied" }),
        item({ category: "Webinar", title: "Tomorrow: Support at Home" }),
        item({
          kind: "action",
          category: "Mandatory learning",
          priority: "high",
          title: "SIRS refresher due",
          dueAt: "2026-11-20T00:00:00Z",
          at: "2026-10-01T00:00:00Z",
        }),
      ],
      "2026-11-10T00:00:00Z",
      now,
    );
    expect(text).toEqual({
      lead: "Since your last visit",
      text: "One important update, “Updated invoicing guidance”, two new Community replies for you and a webinar coming up, “Tomorrow: Support at Home”. SIRS refresher is due soon.",
    });
  });

  it("says Coming up when the only thing to say is what's due soon, and leaves starting courses out", () => {
    const due = item({
      kind: "action",
      category: "Acknowledgement required",
      title: "Updated invoicing guidance",
      dueAt: "2026-11-20T00:00:00Z",
      at: "2026-10-01T00:00:00Z",
    });
    expect(sinceLastVisit([due], "2026-11-10T00:00:00Z", now)).toEqual({ lead: "Coming up", text: "Updated invoicing guidance is due soon." });
    const start = item({
      kind: "action",
      category: "Getting started",
      priority: "high",
      title: "Start here: Your first client journey",
      dueAt: "2026-11-20T00:00:00Z",
    });
    expect(sinceLastVisit([start], "2026-11-10T00:00:00Z", now)).toBeNull();
    expect(sinceLastVisit([start], null, now)).toBeNull();
  });

  it("on a first visit, lists what's waiting", () => {
    expect(sinceLastVisit([item({ category: "New learning" }), item({ category: "News" })], null, now)).toEqual({
      lead: "Here’s what’s waiting",
      text: "Two new things to read or learn.",
    });
  });
});
