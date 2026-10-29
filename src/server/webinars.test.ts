import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { setWebinarsPage, webinarsPage, WEBINARS_PAGE_DEFAULT } from "./webinars";

/* The Webinars page's own heading and introduction, edited in admin. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const now = new Date("2026-10-29T04:00:00Z");

describe("the Webinars page text", () => {
  it("starts with the default and saves an author's changes", () => {
    expect(webinarsPage(db)).toEqual(WEBINARS_PAGE_DEFAULT);
    setWebinarsPage(db, userById(db, "jordan")!, { heading: "  Recorded sessions ", intro: "Catch up any time." }, now);
    expect(webinarsPage(db)).toEqual({ heading: "Recorded sessions", intro: "Catch up any time." });
  });

  it("needs a heading, and is for learning authors only", () => {
    expect(() => setWebinarsPage(db, userById(db, "jordan")!, { heading: " ", intro: "" }, now)).toThrow(/heading/);
    expect(() => setWebinarsPage(db, userById(db, "sam")!, { heading: "Mine", intro: "" }, now)).toThrow(/learning authors/);
  });
});
