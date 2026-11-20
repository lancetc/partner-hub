import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { deckPreview, editorAction, noteLibrary } from "@/server/notes";
import { parseNotesDeck } from "@/lib/notes";

/** The note library for editors. */
export async function GET() {
  return handle(({ db, user, now }) => noteLibrary(db, user, now));
}

/** Editors' decisions on a note (edit, review, endorse, flag, withdraw, decline), or a deck preview for the course editor. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "preview") {
      const block = parseNotesDeck((input.block ?? {}) as Record<string, unknown>, "The deck", {
        str: (v) => (typeof v === "string" ? v : ""),
        unfinished: () => undefined,
      });
      return deckPreview(db, user, block, now);
    }
    try {
      return editorAction(db, user, input, now);
    } catch (e) {
      const problems = (e as { problems?: string[] }).problems;
      if (e instanceof HttpError && problems) return Response.json({ error: e.message, problems }, { status: e.status });
      throw e;
    }
  });
}
