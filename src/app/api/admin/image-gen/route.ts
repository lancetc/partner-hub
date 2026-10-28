import { body, handle } from "@/server/http";
import { checkGeneration, imageGenOptions, startGeneration } from "@/server/imageGen";

/** The image models on offer, or `?id=` to check on a picture being made. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  return handle(({ db, user, now }) => (id ? checkGeneration(db, user, id, now) : imageGenOptions(user)));
}

/** Start a picture: `{ prompt, model, aspect, resolution?, quality?, houseStyle?, lesson? }`. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => startGeneration(db, user, await body(req), now));
}
