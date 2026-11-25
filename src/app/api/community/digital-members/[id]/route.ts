import { handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { digitalMember } from "@/server/digitalMembers";
import { hasStory } from "@/server/livesInProgress";

/** One Digital Member's profile, for the modal that opens from a card. `lives`: they have a Lives in Progress story out. */
export async function GET(_req: Request, { params }: RouteContext<"/api/community/digital-members/[id]">) {
  const { id } = await params;
  return handle(({ db, user, now }) => {
    const m = digitalMember(db, user, id, now);
    if (!m) throw new HttpError(404, "That digital member isn’t here.");
    return { ...m, lives: hasStory(db, id, now) };
  });
}
