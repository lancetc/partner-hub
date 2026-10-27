import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { giphyForCard, giphyMedia, searchGiphy } from "./giphy";

/* GIPHY GIFs: searched (G rated), then kept on the card as GIPHY's still frame and MP4, with the creator's credit. */

const media = (name: string) => `https://media2.giphy.com/media/abc123/${name}?cid=x&rid=${name}&ct=g`;
const gif = {
  id: "abc123",
  url: "https://giphy.com/gifs/thank-you-abc123",
  title: "Thank You GIF by Sesame Street",
  alt_text: "",
  username: "sesamestreet",
  user: { display_name: "Sesame Street", profile_url: "https://giphy.com/sesamestreet/" },
  images: {
    fixed_width: { url: media("200w.gif"), webp: media("200w.webp"), width: "200", height: "150" },
    fixed_width_still: { url: media("200w_s.gif"), width: "200", height: "150" },
    original: { url: media("giphy.gif"), mp4: media("giphy.mp4"), width: "480", height: "360" },
    original_still: { url: media("giphy_s.gif"), width: "480", height: "360" },
  },
};

let db: Db;
const fetches: string[] = [];
beforeEach(() => {
  db = openDb(":memory:");
  process.env.GIPHY_API_KEY = "test-key";
  fetches.length = 0;
  vi.stubGlobal("fetch", async (url: string | URL) => {
    const u = String(url);
    fetches.push(u);
    if (u.startsWith("https://api.giphy.com/v1/gifs/search")) return Response.json({ data: [gif], pagination: { total_count: 30, count: 24, offset: 0 } });
    if (u.startsWith("https://api.giphy.com/v1/gifs/trending")) return Response.json({ data: [gif], pagination: { total_count: 1, count: 1, offset: 0 } });
    if (u.startsWith("https://api.giphy.com/v1/gifs/abc123")) return Response.json({ data: gif });
    return new Response("not found", { status: 404 });
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("GIPHY", () => {
  it("keeps only GIPHY media addresses, without tracking parameters", () => {
    expect(giphyMedia(media("giphy.mp4"))).toBe("https://media2.giphy.com/media/abc123/giphy.mp4");
    expect(giphyMedia("https://evil.example/giphy.mp4")).toBeNull();
    expect(giphyMedia("http://media.giphy.com/x.gif")).toBeNull();
    expect(giphyMedia(undefined)).toBeNull();
  });

  it("searches G-rated GIFs for authors only", async () => {
    const r = await searchGiphy(userById(db, "jordan")!, { query: "thank you", page: 1 });
    expect(fetches[0]).toContain("rating=g");
    expect(fetches[0]).toContain("q=thank+you");
    expect(r.gifs[0]).toMatchObject({ id: "abc123", alt: "Thank You", credit: { name: "Sesame Street", source: "GIPHY" } });
    expect(r.gifs[0].thumb).toBe("https://media2.giphy.com/media/abc123/200w.webp");
    expect(r.more).toBe(true);
    await expect(searchGiphy(userById(db, "sam")!, { query: "x", page: 1 })).rejects.toThrow();
  });

  it("shows what's trending before a search", async () => {
    const r = await searchGiphy(userById(db, "jordan")!, { query: "", page: 1 });
    expect(fetches[0]).toContain("/trending");
    expect(r.more).toBe(false);
  });

  it("returns a GIF's still frame and MP4 for a card", async () => {
    const r = await giphyForCard(userById(db, "jordan")!, "abc123");
    expect(r).toEqual({
      src: "https://media2.giphy.com/media/abc123/giphy_s.gif",
      width: 480,
      height: 360,
      alt: "Thank You",
      credit: { name: "Sesame Street", url: "https://giphy.com/sesamestreet/", source: "GIPHY", page: gif.url },
      animated: { mp4: "https://media2.giphy.com/media/abc123/giphy.mp4" },
    });
    await expect(giphyForCard(userById(db, "jordan")!, "../x")).rejects.toThrow("Which GIF?");
  });

  it("says when it isn't connected", async () => {
    delete process.env.GIPHY_API_KEY;
    await expect(searchGiphy(userById(db, "jordan")!, { query: "x", page: 1 })).rejects.toThrow("GIPHY_API_KEY");
  });
});
