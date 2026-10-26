/* Video links an author can paste onto a card: Synthesia share links and YouTube links. */

export type VideoLink = { provider: "synthesia" | "youtube"; id: string; orientation?: "portrait" | "landscape" };

const SYNTHESIA = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** Works out which video a pasted link points to, or null if it isn't one we can play. */
export function parseVideoLink(raw: string): VideoLink | null {
  const text = raw.trim();
  if (!text) return null;
  let url: URL | null = null;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    url = null;
  }
  const host = url?.hostname.replace(/^(www|m|music)\./, "") ?? "";
  if (url && (host === "youtube.com" || host === "youtube-nocookie.com" || host === "youtu.be")) {
    const parts = url.pathname.split("/").filter(Boolean);
    let id: string | undefined;
    if (host === "youtu.be") id = parts[0];
    else if (parts[0] === "watch") id = url.searchParams.get("v") ?? undefined;
    else if (["shorts", "embed", "live", "v"].includes(parts[0])) id = parts[1];
    if (!id || !YT_ID.test(id)) return null;
    return { provider: "youtube", id, orientation: parts[0] === "shorts" ? "portrait" : "landscape" };
  }
  if (!url || host.endsWith("synthesia.io")) {
    const id = text.match(SYNTHESIA)?.[0];
    if (id) return { provider: "synthesia", id: id.toLowerCase() };
  }
  return null;
}

/** The link to show back to the author for a stored video. */
export const videoLinkFor = (v: { provider: "synthesia" | "youtube"; id: string; orientation?: string }) =>
  v.provider === "youtube" ? (v.orientation === "portrait" ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`) : `https://share.synthesia.io/${v.id}`;
