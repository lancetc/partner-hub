import { body, handle } from "@/server/http";
import { requireAuthor, requireReporter } from "@/server/auth";
import { audit } from "@/server/db";
import type { FollowUpContent } from "@/content/followups";

export async function GET() {
  return handle(({ db, user }) => {
    requireReporter(user);
    const rows = db.prepare("SELECT f.content FROM follow_ups f WHERE version = (SELECT MAX(version) FROM follow_ups g WHERE g.id = f.id) ORDER BY id").all() as { content: string }[];
    return { followUps: rows.map((r) => JSON.parse(r.content) as FollowUpContent) };
  });
}

/** Creates an empty short follow up from the standard three card structure. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    requireAuthor(user);
    const { title, objective } = await body<{ title?: string; objective?: string }>(req);
    const id = `fu-${now.getTime().toString(36)}`;
    const content: FollowUpContent = {
      id,
      version: 1,
      status: "draft",
      title: title?.trim() || "New follow up",
      stage: "custom",
      concept: "",
      objective: objective ?? "",
      durationSec: 60,
      question: {
        label: "Follow up",
        heading: "",
        body: "",
        prompt: "",
        visual: { kind: "illustration", variant: "rings", tone: "teal", icon: "spark", alt: "" },
        options: [
          { id: "a", label: "", correct: true, feedback: "" },
          { id: "b", label: "", correct: false, feedback: "" },
        ],
      },
      explain: { heading: "", body: "" },
      takeaway: { action: "" },
      sources: [],
      draftWording: true,
    };
    db.prepare("INSERT INTO follow_ups VALUES (?, 1, 'draft', ?, ?, ?)").run(id, JSON.stringify(content), now.toISOString(), user.id);
    audit(db, { actor: user.id, event: "follow_up.created", entity: `follow_up:${id}`, at: now });
    return { id };
  });
}
