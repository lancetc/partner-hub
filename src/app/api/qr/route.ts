import { getDb } from "@/server/db";
import { HttpError } from "@/server/auth";
import { qrPng, qrSvg, qrTarget, type QrTarget } from "@/server/qr";

/**
  GET /api/qr?path=<id> or ?lesson=<slug>: a QR code that opens that path or lesson.
  &format=svg for print quality, &size= for the PNG width, &download=1 to save it as a file.
  Public, so the image shows in emails; it can only encode this hub's own addresses.
*/
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const target: QrTarget | null = q.get("path") ? { kind: "path", id: q.get("path")! } : q.get("lesson") ? { kind: "lesson", id: q.get("lesson")! } : null;
  try {
    if (!target) throw new HttpError(400, "Which path or topic?");
    const { url, title } = qrTarget(getDb(), target);
    const name = `qr-${
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || target.id
    }`;
    const disposition: Record<string, string> = q.has("download")
      ? { "content-disposition": `attachment; filename="${name}.${q.get("format") === "svg" ? "svg" : "png"}"` }
      : {};
    if (q.get("format") === "svg")
      return new Response(await qrSvg(url), { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=3600", ...disposition } });
    const png = await qrPng(url, Number(q.get("size")) || 512);
    return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=3600", ...disposition } });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return Response.json({ error: e instanceof Error ? e.message : "Couldn’t make the QR code." }, { status });
  }
}
