import { describe, expect, it } from "vitest";
import { isLanguage, languageName, LANGUAGES } from "./languages";

/* Languages people can read the hub in through Google Translate. */

describe("languages", () => {
  it("only accepts the listed languages", () => {
    expect(isLanguage("vi")).toBe(true);
    expect(isLanguage("zh-CN")).toBe(true);
    expect(isLanguage("xx")).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
  });

  it("names each language in its own words too", () => {
    expect(languageName("vi")).toBe("Tiếng Việt (Vietnamese)");
    expect(languageName("en")).toBe("English");
    expect(languageName("unknown")).toBe("English");
    expect(new Set(LANGUAGES.map((l) => l.code)).size).toBe(LANGUAGES.length);
  });
});
