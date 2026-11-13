import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { assignLearning, directory } from "@/server/people";

/** Everyone in the hub with their access and learning (superadmins only). */
export async function GET() {
  return handle(({ db, user, now }) => directory(db, user, now));
}

/** Assign a learning path or a topic to several people at once. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const b = await body<{ action: "assign"; kind: "path" | "topic"; id: string; userIds: string[]; dueDate?: string | null }>(req);
    if (b.action === "assign") return assignLearning(db, user, b, now);
    throw new HttpError(400, "Unknown action.");
  });
}
