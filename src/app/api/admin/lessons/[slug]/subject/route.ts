import { body, handle } from "@/server/http";
import { requireReporter } from "@/server/auth";
import { setTopicSubject, topicSubjects } from "@/server/topicSubjects";

/** Set (or clear, with `subject: null`) a topic's subject. Takes effect straight away. */
export async function PUT(req: Request, ctx: RouteContext<"/api/admin/lessons/[slug]/subject">) {
  const { slug } = await ctx.params;
  return handle(async ({ db, user, now }) => setTopicSubject(db, user, slug, (await body<{ subject: string | null }>(req)).subject ?? null, now));
}

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/lessons/[slug]/subject">) {
  const { slug } = await ctx.params;
  return handle(({ db, user }) => {
    requireReporter(user);
    return { subject: topicSubjects(db)[slug] ?? null };
  });
}
