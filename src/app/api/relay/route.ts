import { body, handle } from "@/server/http";
import { prepareAsk, recordRelayEvent, relayAnswer, relayLink } from "@/server/relay";

/**
  Ava Relay for learners (docs/ava-relay.md). `{ action: "link", slug, revisionId, pageId, mode, fresh? }` makes
  the conversation ready. `{ action: "ask", sessionId, pageId, mode, text, key }` answers a question as one JSON
  event per line: the learner's turn, then the finished and checked turn (or an error).
  `{ action: "event", … }` records an engagement event. An author's preview sends `preview` instead of a session.
*/
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "link") return relayLink(db, user, input, now);
    if (input.action === "event") return recordRelayEvent(db, user, input, now);
    // Leaving the page cancels the request, and with it the model's answer.
    const prepared = prepareAsk(db, user, input, now, req.signal);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of relayAnswer(db, prepared)) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The reader has gone: there is no one to tell.
        }
        try {
          controller.close();
        } catch {
          // Already closed by the cancel.
        }
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
  });
}
