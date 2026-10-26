import { body, handle } from "@/server/http";
import { assignableUsers, catalogueInfo, createLearningPath, listLearningPaths, type PathInput } from "@/server/learningPaths";

export async function GET() {
  return handle(({ db, user }) => ({
    paths: listLearningPaths(db, user),
    people: assignableUsers(db, user),
    catalogue: catalogueInfo(),
  }));
}

export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => createLearningPath(db, user, await body<PathInput>(req), now));
}
