import { body, handle } from "@/server/http";
import { requireAuthor } from "@/server/auth";
import { presenters, savePresenter } from "@/server/introPresenters";

/** Presenter profiles for Topic introductions. */
export async function GET() {
  return handle(({ db, user }) => {
    requireAuthor(user);
    return { presenters: presenters(db) };
  });
}

/** Adds a presenter, or changes one (with its id). */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => ({ presenter: savePresenter(db, user, await body<Record<string, unknown>>(req), now) }));
}
