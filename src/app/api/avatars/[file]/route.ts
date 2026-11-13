import { readPicture } from "@/server/profilePictures";

/** A profile picture. Each upload has its own file name, so it can be kept by the browser for a long time. */
export async function GET(_req: Request, ctx: RouteContext<"/api/avatars/[file]">) {
  const { file } = await ctx.params;
  const data = readPicture(file);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), { headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable" } });
}
