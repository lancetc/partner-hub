import { connection } from "next/server";
import { getDb } from "@/server/db";
import { readUpload } from "@/server/uploads";

/**
  Serves an uploaded card image or video. File names are random, so they're safe to cache for good.
  Videos answer byte-range requests, which browsers need to stream and seek.
*/
export async function GET(req: Request, ctx: RouteContext<"/api/uploads/[name]">) {
  await connection();
  const { name } = await ctx.params;
  const file = readUpload(getDb(), name);
  if (!file) return new Response("Not found", { status: 404 });
  const headers = { "content-type": file.mime, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "accept-ranges": "bytes" };
  const size = file.body.length;
  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new Response(new Uint8Array(file.body.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
    });
  }
  return new Response(new Uint8Array(file.body), { headers: { ...headers, "content-length": String(size) } });
}
