import { connection } from "next/server";
import { storage } from "@/server/elearning/storage";
import { contentClaims, fileResponse, typeOf } from "@/server/elearning/content";

/**
  A course's own files, on the content origin only: /api/elearning/content/<launch token>/<path in the package>.
  The token stays in the path, so the package's relative links (scripts, media, other pages) resolve here too.
*/
export async function GET(req: Request, ctx: RouteContext<"/api/elearning/content/[token]/[...path]">) {
  await connection();
  const { token, path } = await ctx.params;
  const claims = contentClaims(req, token);
  if (claims instanceof Response) return claims;
  const rel = path.map((p) => decodeURIComponent(p)).join("/");
  const data = storage.readFile(claims.version, rel);
  if (!data) return new Response("Not found", { status: 404 });
  return fileResponse(req, data, typeOf(rel), { "content-security-policy": `frame-ancestors 'self' ${claims.hub}` });
}
