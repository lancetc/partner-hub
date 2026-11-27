import { connection } from "next/server";
import { getDb } from "@/server/db";
import fs from "node:fs";
import { Readable } from "node:stream";
import { readUpload, uploadOnDisk } from "@/server/uploads";

/**
  Serves an uploaded card image, video or PDF. File names are random, so they're safe to cache for good.
  Videos answer byte-range requests, which browsers need to stream and seek. PDFs open in the
  browser under their original name, sandboxed so nothing in them can run as the site.
*/
export async function GET(req: Request, ctx: RouteContext<"/api/uploads/[name]">) {
  await connection();
  const { name } = await ctx.params;
  // A video on disk is read only as far as the request needs: a long one isn't loaded whole for every range.
  const disk = uploadOnDisk(getDb(), name);
  if (disk?.mime.startsWith("video/")) return videoResponse(req, disk);
  const file = readUpload(getDb(), name);
  if (!file) return new Response("Not found", { status: 404 });
  const pdf = file.mime === "application/pdf";
  const headers: Record<string, string> = {
    "content-type": file.mime,
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes",
    ...(pdf
      ? {
          "content-disposition": `inline; filename="${file.name.replace(/[^\w .()-]/g, "") || "document.pdf"}"`,
          "content-security-policy": "sandbox",
        }
      : {}),
  };
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

const CHUNK = 4 * 1024 * 1024;

function videoResponse(req: Request, v: { file: string; size: number; mime: string }) {
  const headers: Record<string, string> = {
    "content-type": v.mime,
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes",
  };
  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  // No range asked for (a download): the whole file, streamed from disk.
  if (!range || !(range[1] || range[2])) {
    const body = Readable.toWeb(fs.createReadStream(v.file)) as ReadableStream<Uint8Array>;
    return new Response(body, { headers: { ...headers, "content-length": String(v.size) } });
  }
  let start = range[1] ? Number(range[1]) : v.size - Number(range[2]);
  let end = range[1] && range[2] ? Number(range[2]) : v.size - 1;
  start = Math.max(0, start);
  // A few megabytes at a time, whatever was asked for: the browser asks for the next piece as it plays.
  end = Math.min(v.size - 1, end, start + CHUNK - 1);
  if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${v.size}` } });
  return slice(v.file, start, end, 206, { ...headers, "content-range": `bytes ${start}-${end}/${v.size}` });
}

function slice(file: string, start: number, end: number, status: 206, headers: Record<string, string>) {
  const buf = Buffer.alloc(end - start + 1);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, buf, 0, buf.length, start);
  } finally {
    fs.closeSync(fd);
  }
  return new Response(new Uint8Array(buf), { status, headers: { ...headers, "content-length": String(buf.length) } });
}
