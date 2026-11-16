import { readBackground } from "@/server/backgrounds";

/** An uploaded background photo. Each upload has its own file name, so the browser can keep it for a long time. */
export async function GET(_req: Request, ctx: RouteContext<"/api/backgrounds/[file]">) {
  const { file } = await ctx.params;
  const data = readBackground(file);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), { headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable" } });
}
