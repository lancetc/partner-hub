import { handle } from "@/server/http";
import { forgetConversations, livesConversations } from "@/server/livesInProgress";

/** The signed-in reader's own memories with one character. Nobody else's, ever. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(({ db, user, now }) => ({ conversations: livesConversations(db, user, id, now) }));
}

/** Forgets one conversation (`?conversation=<id>`) or all of them with this character. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const one = new URL(req.url).searchParams.get("conversation");
  return handle(({ db, user, now }) => forgetConversations(db, user, id, one, now));
}
