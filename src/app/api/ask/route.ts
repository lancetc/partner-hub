import { body, handle } from "@/server/http";
import { askAnswer, prepareAsk } from "@/server/askTrilogy";

/**
  Ask Trilogy: `{ question }`. Streams back one JSON event per line: what was found (sources, the best
  topic and card, the most relevant passage), then the written answer if Claude is connected, then done.
*/
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const prepared = prepareAsk(db, user, await body(req), now);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for await (const event of askAnswer(prepared)) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        controller.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
  });
}
