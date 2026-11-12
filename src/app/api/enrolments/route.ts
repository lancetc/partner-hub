import { body, handle } from "@/server/http";
import { enrolment, myTopicEnrolments, type EnrolAction } from "@/server/enrolments";

/** The topics the signed-in person has enrolled in themselves. */
export async function GET() {
  return handle(({ db, user }) => ({ topics: myTopicEnrolments(db, user) }));
}

/** Enrol in, or leave, a learning path or a topic: { kind: "path" | "topic", id, action: "enrol" | "leave" }. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => enrolment(db, user, await body<EnrolAction>(req), now));
}
