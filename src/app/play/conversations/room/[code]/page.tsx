import { Suspense } from "react";
import type { Metadata } from "next";
import { Room } from "@/components/conversations/Room";

export const metadata: Metadata = { title: "Care Conversations session", robots: { index: false } };

export default function ConversationRoomPage({ params }: PageProps<"/play/conversations/room/[code]">) {
  return (
    <Suspense fallback={<p className="px-4 pt-10 text-center text-ink-muted">Joining the session…</p>}>
      <RoomFor params={params} />
    </Suspense>
  );
}

/** The session the code in the address belongs to. */
async function RoomFor({ params }: Pick<PageProps<"/play/conversations/room/[code]">, "params">) {
  const { code } = await params;
  return <Room code={code.toUpperCase()} />;
}
