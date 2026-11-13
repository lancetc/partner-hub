import { body, handle } from "@/server/http";
import { setNewsletters } from "@/server/campaigns";
import { setAllTopics, settingsForToken, userForToken } from "@/server/emailPrefs";

/**
  The email preferences page reached from the link at the bottom of an email (no sign-in: the link's
  code says who). GET: what this person gets. POST: switch a topic on or off, or every topic at once.
*/
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  return handle(({ db }) => settingsForToken(db, token));
}

/**
  Also the one-click unsubscribe that mail apps use (List-Unsubscribe-Post): a form post to the link,
  which switches off the topic that email was sent under.
*/
export async function POST(req: Request) {
  const url = new URL(req.url);
  const type = req.headers.get("content-type") ?? "";
  const fromLink = url.searchParams.get("t");
  return handle(async ({ db, now }) => {
    if (fromLink && !type.includes("json")) return setNewsletters(db, fromLink, false, now, url.searchParams.get("topic") ?? "newsletters", "one-click");
    const b = await body<{ token: string; topic?: string; subscribe?: boolean; all?: boolean }>(req);
    if (b.all) return { topics: setAllTopics(db, userForToken(db, b.token), Boolean(b.subscribe), now, "link") };
    return setNewsletters(db, b.token, Boolean(b.subscribe), now, b.topic ?? "newsletters");
  });
}
