import { describe, expect, it } from "vitest";
import { keyPresses, PRESSABLE, soundFor } from "./pressSound";

const el = (p: Partial<Parameters<typeof soundFor>[0]>) => ({ tag: "button", role: null, className: "", disabled: false, ...p });

describe("button sounds", () => {
  it("gives the main, filled actions a fuller press and everything else a light tick", () => {
    expect(soundFor(el({ className: "rounded-full bg-[#008282] px-5 text-white" }))).toBe("press");
    expect(soundFor(el({ className: "rounded-full bg-action text-on-action" }))).toBe("press");
    expect(soundFor(el({ className: "rounded-full border border-line-strong px-4" }))).toBe("tick");
    expect(soundFor(el({ tag: "div", role: "tab" }))).toBe("tick");
    expect(soundFor(el({ role: "switch" }))).toBe("tick");
  });

  it("only sounds for links styled as buttons, not words in a sentence", () => {
    expect(soundFor(el({ tag: "a", className: "inline-flex rounded-full bg-[#008282] px-6 text-white" }))).toBe("press");
    expect(soundFor(el({ tag: "a", className: "group flex rounded-2xl border p-4" }))).toBe("tick");
    expect(soundFor(el({ tag: "a", className: "font-semibold text-accent hover:underline" }))).toBeNull();
  });

  it("stays silent for typing and disabled controls, and ticks for checkboxes", () => {
    expect(soundFor(el({ disabled: true, className: "bg-action" }))).toBeNull();
    expect(soundFor(el({ tag: "input", inputType: "text" }))).toBeNull();
    expect(soundFor(el({ tag: "textarea" }))).toBeNull();
    expect(soundFor(el({ tag: "input", inputType: "checkbox" }))).toBe("tick");
    expect(soundFor(el({ tag: "div" }))).toBeNull();
  });

  it("ticks for disclosure summaries and menu checkboxes", () => {
    expect(soundFor(el({ tag: "summary" }))).toBe("tick");
    expect(soundFor(el({ tag: "div", role: "menuitemcheckbox" }))).toBe("tick");
    expect(soundFor(el({ tag: "div", role: "presentation" }))).toBeNull();
  });
});

describe("keys that press", () => {
  it("presses buttons with Enter or Space", () => {
    expect(keyPresses("Enter", "BUTTON")).toBe(true);
    expect(keyPresses(" ", "BUTTON")).toBe(true);
    expect(keyPresses(" ", "DIV")).toBe(true);
  });

  it("follows links with Enter only, and flips checkboxes with Space only", () => {
    expect(keyPresses("Enter", "A")).toBe(true);
    expect(keyPresses(" ", "A")).toBe(false);
    expect(keyPresses(" ", "INPUT", "checkbox")).toBe(true);
    expect(keyPresses("Enter", "INPUT", "checkbox")).toBe(false);
    expect(keyPresses(" ", "INPUT", "text")).toBe(false);
  });

  it("ignores every other key", () => {
    expect(keyPresses("a", "BUTTON")).toBe(false);
    expect(keyPresses("Tab", "BUTTON")).toBe(false);
  });
});

describe("what can be pressed", () => {
  it("covers buttons, summaries, links, checkboxes and button roles", () => {
    for (const part of ["button", "summary", "a", "input[type=checkbox]", "[role=switch]", "[role=tab]", "[role=button]"]) {
      expect(PRESSABLE.split(", ")).toContain(part);
    }
  });
});
