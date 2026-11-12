import { body, handle } from "@/server/http";
import { hostRoom } from "@/server/conversationRooms";

/** Host a Care Conversations team session: returns its room code and first card. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => hostRoom(db, user, await body<{ theme?: string }>(req), now));
}
