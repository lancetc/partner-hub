import { body, handle } from "@/server/http";
import { draftStory } from "@/server/storyDraft";

/*
  AI writes a news item, every field filled in, for the editor (nothing is saved). `{ brief?, document?: { name, text } }`:
  a brief, and/or the words of a document dropped on New story. The browser reads the document itself (lib/documentText)
  and sends only its words, so a large Word, PowerPoint or PDF file is never uploaded (the owner, Nov 2026).
*/
const MAX_TEXT = 120_000;

export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const b = await body<{ brief?: string; document?: { name?: unknown; text?: unknown } }>(req);
    const d = b.document;
    const source =
      d && typeof d.text === "string"
        ? { kind: "text" as const, name: (typeof d.name === "string" ? d.name : "document").slice(0, 120), text: d.text.slice(0, MAX_TEXT) }
        : null;
    return draftStory(db, user, { brief: b.brief, source }, now);
  });
}
