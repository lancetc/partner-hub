import { handle } from "@/server/http";
import { savedItems, search } from "@/server/search";

/** `?q=` searches what's live on the hub; `?saved=id,id` looks up saved items for the saved list. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const saved = url.searchParams.get("saved");
  return handle(({ db, user }) =>
    saved !== null ? { results: savedItems(db, user, saved.split(",").filter(Boolean)) } : { results: search(db, user, url.searchParams.get("q") ?? "") },
  );
}
