import { describe, expect, it } from "vitest";
import type { Lesson } from "@/content/lessons";
import { thumbnailFor } from "./pathThumbnail";

/* A path's thumbnail comes from its first topic: the cover photo, then the first photo on its cards. */

const photo = (src: string) => ({ src, width: 800, height: 600 });
const card = (id: string, extra: object = {}) => ({ id, type: "image", beat: 0, heading: id, body: "", visual: { kind: "none" }, ...extra });
const lesson = (nodes: object[], visual: object = {}) =>
  ({
    title: "A topic",
    start: "a",
    visual: { variant: "petals", tone: "teal", icon: "home", alt: "A house", ...visual },
    nodes: Object.fromEntries(nodes.map((n) => [(n as { id: string }).id, n])),
  }) as unknown as Lesson;
const ill = (src: string) => ({ visual: { kind: "illustration", variant: "dots", tone: "sky", icon: "chat", alt: "x", photo: photo(src) } });

describe("path thumbnails", () => {
  it("uses the topic's own cover photo first", () => {
    const l = lesson([card("a", { next: "b", ...ill("/card.jpg") }), card("b")], { photo: photo("/cover.jpg") });
    expect(thumbnailFor(l).photo?.src).toBe("/cover.jpg");
  });

  it("otherwise uses the first photo a learner would see, following the route", () => {
    // "z" comes first in the object, but the route goes a → b, so b's photo is first seen.
    const l = lesson([card("z", ill("/aside.jpg")), card("a", { next: "b" }), card("b", ill("/first.jpg"))]);
    expect(thumbnailFor(l)).toMatchObject({ photo: { src: "/first.jpg" }, variant: "petals", alt: "A house" });
  });

  it("falls back to the topic's illustration when there are no photos", () => {
    const t = thumbnailFor(lesson([card("a")]));
    expect(t.photo).toBeUndefined();
    expect(t).toMatchObject({ variant: "petals", tone: "teal", icon: "home" });
  });
});
