import { body, handle } from "@/server/http";
import { answer, prepareChat } from "@/server/topicChat";

/**
  Ask the topic assistant: `{ slug, messages: [{ role, text }], preview? }`. The answer streams back
  as one JSON event per line (sources, then text as it's written, then done or error).
*/
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const prepared = prepareChat(db, user, await body(req), now);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for await (const event of answer(prepared)) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        controller.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
  });
}
