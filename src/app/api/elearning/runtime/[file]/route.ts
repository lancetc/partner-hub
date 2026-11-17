import fs from "node:fs";
import path from "node:path";
import { connection } from "next/server";

/**
  The SCORM runtime (scorm-again) the player shell loads: one build for SCORM 1.2, one for SCORM 2004.
  Served from the content origin alongside the shell; it holds no Hub data.
*/
const FILES: Record<string, string> = { "scorm12.js": "scorm12.min.js", "scorm2004.js": "scorm2004.min.js" };

export async function GET(_req: Request, ctx: RouteContext<"/api/elearning/runtime/[file]">) {
  await connection();
  const { file } = await ctx.params;
  const name = FILES[file];
  if (!name) return new Response("Not found", { status: 404 });
  const data = fs.readFileSync(path.join(process.cwd(), "node_modules", "scorm-again", "dist", name));
  return new Response(new Uint8Array(data), {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" },
  });
}
