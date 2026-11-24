import { describe, expect, it } from "vitest";
import { titleFromFileName } from "./imageNames";

/* Tidied titles for the image library: readable when the file name says something, empty when it doesn't. */

describe("a title from a file name", () => {
  it("turns a story prompt into a readable title", () => {
    expect(titleFromFileName("magnific__image-prompt-meet-dot-a-good-outcomewarm-natura__36714.webp")).toMatch(/^Meet Dot: a good outcome/);
    expect(titleFromFileName("magnific_here-take-fifty-dollars-for-your-trouble_DoOmk4jpcl.webp")).toBe("Here take fifty dollars for your trouble");
    expect(titleFromFileName("magnific_a-natural-photorealistic-image-of-mr-haddad_WDlwqWWcXe.webp")).toBe("Mr haddad");
  });

  it("keeps a plain name, without its extension or separators", () => {
    expect(titleFromFileName("Gardener Checking His Phone Outdoors.webp")).toBe("Gardener Checking His Phone Outdoors");
    expect(titleFromFileName("aged-care-employee-day.webp")).toBe("Aged care employee day");
  });

  it("names a character portrait for what it is", () => {
    expect(titleFromFileName("AI OpenAI – Head-and-shoulders portrait photograph of a fictional person for.webp")).toBe("Portrait of a fictional person");
  });

  it("reads a Pexels photo's description from its page", () => {
    expect(
      titleFromFileName("Pexels 33524619 – Gonzalo 8a.webp", { page: "https://www.pexels.com/photo/engaged-students-in-classroom-setting-33524619/" }),
    ).toBe("Engaged students in classroom setting");
    expect(titleFromFileName("Pexels 33524619 – Gonzalo 8a.webp")).toBe("");
  });

  it("is empty when the name says nothing about the picture", () => {
    for (const name of [
      "d339e83e-7367-43e7-979b-6aa169ad4ab8-cropped.webp",
      "1717741960635.webp",
      "ae1cbf7cd8dc546ca9bad599c34adbd6.webp",
      "Picture1.webp",
      "test.webp",
      "magnific__photorealistic-australian-documentarystyle-photogr__26222.webp",
      "magnific__photorealistic-cinematic-editorial-lifestyle-photo__61721.webp",
    ])
      expect(titleFromFileName(name), name).toBe("");
  });
});
