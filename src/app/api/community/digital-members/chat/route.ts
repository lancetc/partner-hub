import { body, handle } from "@/server/http";
import { memberChatReply, memberChatStatus, prepareMemberChat } from "@/server/memberChat";

/** Whether this person can chat with the Digital Members now, and their limits. */
export async function GET() {
  return handle(({ db, user, now }) => memberChatStatus(db, user, now));
}

/**
  `{ memberId, messages: [{ role, text }] }`: the member's reply, one JSON event per line as it's written, then
  `{ type: "done" }` (or `{ type: "error", message }`). Leaving the page cancels the request, and the reply with it.
*/
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    // Lives in Progress adds the episode being looked at, a conversation id for its memory, and "start fresh".
    const input = await body<{ memberId?: unknown; messages?: unknown; episodeId?: unknown; conversationId?: unknown; fresh?: unknown; preview?: unknown; mode?: unknown }>(req);
    const prepared = prepareMemberChat(db, user, input, now, req.signal);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of memberChatReply(prepared)) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
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
