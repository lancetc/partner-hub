import { describe, expect, it } from "vitest";
import { headerItems, inLearn, isActive, isActiveInBar, learnItems, navItems, workToolsItem } from "./nav";

describe("the main menu", () => {
  it("keeps the top bar short: News, Community and Resources, with the ways to learn under Learn", () => {
    // The phone bar: News, (Learn), Community, Resources, then Favourites pinned at the end. Nothing more fits.
    expect(navItems.map((i) => i.label)).toEqual(["News", "Community", "Resources"]);
    expect(learnItems.map((i) => i.label)).toEqual(["Topics", "Discovery Paths", "Magazine", "Play", "Challenges", "My Discovery"]);
    expect(learnItems.every((i) => i.description)).toBe(true);
  });

  it("leaves Work Tools out of the menus (Favourites covers it), lighting up Resources on its pages", () => {
    // After Learn: the logo is News.
    expect(headerItems.map((i) => i.label)).toEqual(["Community", "Resources"]);
    expect(workToolsItem).toMatchObject({ href: "/tools", short: "Tools", icon: "clipboard" });
    expect(navItems.some((i) => i.href === "/tools")).toBe(false);
    for (const path of ["/tools", "/tools/invoice-rate-check", "/tools/caseload-margin"]) {
      expect(isActive(path, "/tools"), path).toBe(true);
      // Work Tools lives in Resources, so Resources is lit up in the header and the phone bar.
      expect(isActiveInBar(path, "/resources"), path).toBe(true);
      expect(inLearn(path), path).toBe(false);
    }
    expect(isActiveInBar("/community", "/resources")).toBe(false);
    expect(isActiveInBar("/webinars", "/resources")).toBe(true);
  });

  it("marks Learn as current on any of its pages, and not elsewhere", () => {
    for (const path of ["/topics", "/paths/abc", "/magazine", "/elearning/x", "/play", "/explorer", "/challenges", "/challenge/ch-1", "/discovery"])
      expect(inLearn(path), path).toBe(true);
    for (const path of ["/", "/community", "/resources", "/webinars", "/journey"]) expect(inLearn(path), path).toBe(false);
  });

  it("puts a challenge under Challenges, not Resources", () => {
    expect(isActive("/challenge/ch-1", "/challenges")).toBe(true);
    expect(isActive("/challenge/ch-1", "/resources")).toBe(false);
    expect(isActive("/webinars", "/resources")).toBe(true);
  });

  it("tells My Discovery apart from the set learning paths", () => {
    expect(isActive("/discovery", "/discovery")).toBe(true);
    expect(isActive("/discovery", "/paths")).toBe(false);
  });
});
