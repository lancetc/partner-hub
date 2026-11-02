import { handle } from "@/server/http";
import { mergeDuplicateUploads } from "@/server/uploads";

/** Keeps one copy of each picture uploaded more than once, and points everything at it. */
export async function POST() {
  return handle(({ db, user, now }) => mergeDuplicateUploads(db, user, now));
}
