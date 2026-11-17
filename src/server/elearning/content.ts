import "server-only";
import { getDb } from "../db";
import { now } from "../clock";
import { contentOriginFor, readLaunchToken, type LaunchClaims } from "./launchToken";

/*
  Shared by the routes that run on the content origin (the player shell, the course's files and the
  runtime script). Each checks the launch token and that the request really came to the content origin:
  course files are never served from the Hub's own origin, where their scripts could reach the Hub.
*/

/**
  The origin the browser asked for. Next's req.url names the server's own host (localhost in development)
  whatever address was used, so the Host header (or a proxy's X-Forwarded-Host) decides.
*/
export function requestOrigin(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host") || url.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function contentClaims(req: Request, token: string): LaunchClaims | Response {
  const db = getDb();
  const claims = readLaunchToken(db, token, now(db));
  if (!claims) return new Response("This course link has expired. Close it and open the course again from the Hub.", { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
  const expected = contentOriginFor(claims.hub);
  if (!expected || requestOrigin(req) !== expected) return new Response("Not found", { status: 404 });
  return claims;
}

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  xsd: "application/xml; charset=utf-8",
  dtd: "application/xml-dtd",
  txt: "text/plain; charset=utf-8",
  vtt: "text/vtt; charset=utf-8",
  srt: "text/plain; charset=utf-8",
  map: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  bmp: "image/bmp",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  pdf: "application/pdf",
  swf: "application/x-shockwave-flash",
};

export const typeOf = (path: string) => TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

/** A file, answering byte-range requests (video and audio need them to stream and seek). */
export function fileResponse(req: Request, data: Buffer, type: string, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    "content-type": type,
    "x-content-type-options": "nosniff",
    "cache-control": "private, max-age=3600",
    "accept-ranges": "bytes",
    // Course files are only shown inside the player shell, itself inside the Hub page (every frame up the
    // chain is checked, so the caller adds the Hub's origin).
    "content-security-policy": "frame-ancestors 'self'",
    "referrer-policy": "no-referrer",
    ...extra,
  };
  const size = data.length;
  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new Response(new Uint8Array(data.subarray(start, end + 1)), { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  return new Response(new Uint8Array(data), { headers: { ...headers, "content-length": String(size) } });
}
