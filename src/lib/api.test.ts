import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

/* The Hub's JSON helper: a refusal keeps the server's message, its status, and the exact reasons when it gives them. */

const reply = (status: number, body: unknown) => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));

afterEach(() => vi.restoreAllMocks());

describe("a refused request", () => {
  it("keeps the reasons the server listed, so a page can show what to fix", async () => {
    reply(400, { error: "A Hiring Runway lab needs its sign-off.", problems: ["Record the content owner and the date.", 3] });
    await expect(api("/x", { body: {} })).rejects.toMatchObject({
      message: "A Hiring Runway lab needs its sign-off.",
      status: 400,
      problems: ["Record the content owner and the date."],
    });
  });

  it("has no reasons when the server gave none", async () => {
    reply(403, { error: "Not yours." });
    const err = (await api("/x").catch((e: unknown) => e)) as Error & { problems?: string[] };
    expect(err).toMatchObject({ message: "Not yours.", status: 403 });
    expect(err.problems).toBeUndefined();
  });
});
