import { describe, expect, it } from "vitest";
import { parseVideoLink, videoLinkFor } from "./videoLinks";

describe("video links", () => {
  it("reads the common YouTube link shapes", () => {
    for (const link of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s",
      "youtu.be/dQw4w9WgXcQ",
      "https://m.youtube.com/embed/dQw4w9WgXcQ",
      "https://youtube.com/live/dQw4w9WgXcQ?si=x",
    ])
      expect(parseVideoLink(link)).toEqual({ provider: "youtube", id: "dQw4w9WgXcQ", orientation: "landscape" });
    expect(parseVideoLink("https://www.youtube.com/shorts/abcDEF12345")).toEqual({ provider: "youtube", id: "abcDEF12345", orientation: "portrait" });
  });

  it("reads Synthesia share links", () => {
    expect(parseVideoLink("https://share.synthesia.io/D17EBDC9-8f64-4630-ad37-24747e308796")).toEqual({
      provider: "synthesia",
      id: "d17ebdc9-8f64-4630-ad37-24747e308796",
    });
  });

  it("turns away anything else", () => {
    for (const link of [
      "",
      "https://vimeo.com/123",
      "https://www.youtube.com/watch?v=short",
      "https://example.com/d17ebdc9-8f64-4630-ad37-24747e308796",
      "not a link",
    ])
      expect(parseVideoLink(link)).toBeNull();
  });

  it("shows a stored video back as a link", () => {
    expect(videoLinkFor({ provider: "youtube", id: "dQw4w9WgXcQ" })).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(videoLinkFor({ provider: "youtube", id: "abcDEF12345", orientation: "portrait" })).toBe("https://www.youtube.com/shorts/abcDEF12345");
  });
});
