import { describe, expect, it } from "vitest";
import { soundFor } from "./pressSound";

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
});
