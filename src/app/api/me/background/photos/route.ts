import { handle } from "@/server/http";
import { backgroundPhotos } from "@/server/backgrounds";

/** Stock photos for your background: the built-in set, or a Pexels search with ?q= (and &page=). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  return handle(() => backgroundPhotos({ query: url.searchParams.get("q") ?? "", page: Number(url.searchParams.get("page") ?? 1) }));
}
