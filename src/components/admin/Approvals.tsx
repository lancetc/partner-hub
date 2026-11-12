"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { AdminShell, Badge, ErrorNote } from "./ui";
import { Icon } from "../Icon";
import type { ApprovalStage } from "./TopicApproval";

/*
  Topic approvals: what's waiting on you (to review, approve for Compliance, publish, or fix), every
  topic on its way from draft to live, drafts nobody has submitted yet, and live topics due a refresh.
*/

type Topic = {
  slug: string;
  title: string;
  stage: ApprovalStage;
  stale: boolean;
  yours: boolean;
  submittedBy: string;
  submittedAt: string;
  reviewer: string;
  compliance: boolean;
  updatedAt: string;
  last: { label: string; by: string; note: string; at: string } | null;
};
type Queue = {
  role: "sme" | "compliance" | "publisher" | null;
  yours: Topic[];
  inProgress: Topic[];
  drafts: { slug: string; title: string; updatedAt: string; by: string; live: boolean }[];
  refresh: { slug: string; title: string; reviewDate: string | null; days: number | null; status: "overdue" | "due" | "ok" | null; reports: number }[];
};

const edit = (slug: string) => `/admin/lessons/${slug}/edit`;

const STAGE: Record<ApprovalStage, { label: string; tone: "neutral" | "good" | "warn" | "bad" | "info" }> = {
  draft: { label: "Draft", tone: "neutral" },
  review: { label: "In review", tone: "warn" },
  changes: { label: "Changes asked for", tone: "bad" },
  compliance: { label: "With Compliance", tone: "warn" },
  approved: { label: "Approved", tone: "good" },
  live: { label: "Live", tone: "good" },
};

/** What the signed-in person is asked to do with a topic waiting on them. */
function yourStep(t: Topic) {
  if (t.stale) return "Edited after submitting: submit it again";
  if (t.stage === "review") return "Review it, then approve or ask for changes";
  if (t.stage === "compliance") return "Approve it for Compliance, or ask for changes";
  if (t.stage === "approved") return "Publish it";
  if (t.stage === "changes") return "Make the changes asked for, then submit again";
  return "";
}

const ROLE = { sme: "subject-matter expert", compliance: "Compliance approver", publisher: "Hub owner and publisher" } as const;

export function Approvals() {
  const { data, error } = useApi<Queue>("/api/admin/approvals");
  return (
    <AdminShell title="Approvals">
      <p className="max-w-3xl text-ink-muted">
        Every topic is reviewed by a person before learners see it. The author submits a draft to a subject-matter expert, who approves it or asks for
        changes. Compliance-sensitive topics also need Compliance. The Hub owner then publishes it.
        {data?.role && ` You’re signed in as a ${ROLE[data.role]}.`}
      </p>
      <ol className="mt-4 flex flex-wrap gap-x-2 gap-y-2 text-sm" aria-label="The approval steps">
        {["Draft", "Submit for review", "AI pre-review (coming later)", "Human review", "Approve", "Publish", "Monitor and refresh"].map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={i === 2 ? "rounded-full border border-dashed border-line-strong px-3 py-1 text-ink-muted" : "rounded-full bg-muted px-3 py-1 font-medium"}>
              {i + 1}. {s}
            </span>
            {i < 6 && <Icon name="arrow-right" className="size-3.5 text-ink-muted" />}
          </li>
        ))}
      </ol>
      {error && (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      )}
      {!data ? (
        <p className="mt-6 text-ink-muted">Loading…</p>
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          <section aria-labelledby="yours">
            <h2 id="yours" className="font-serif text-2xl font-semibold">
              Waiting on you {data.yours.length > 0 && <Badge tone="warn">{data.yours.length}</Badge>}
            </h2>
            {data.yours.length === 0 ? (
              <p className="mt-2 text-ink-muted">Nothing needs you right now.</p>
            ) : (
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {data.yours.map((t) => (
                  <li key={t.slug}>
                    <Link href={edit(t.slug)} className="flex h-full flex-col gap-2 rounded-2xl border-2 border-action/40 bg-surface p-4 hover:border-action">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge tone={t.stale ? "neutral" : STAGE[t.stage].tone}>{t.stale ? "Edited since submitted" : STAGE[t.stage].label}</Badge>
                        {t.compliance && <Badge tone="info">Compliance-sensitive</Badge>}
                      </span>
                      <span className="font-serif text-lg font-semibold">{t.title}</span>
                      <span className="flex items-center gap-1.5 font-semibold text-accent">
                        {yourStep(t)} <Icon name="arrow-right" className="size-4" />
                      </span>
                      {t.last?.note && (
                        <span className="rounded-xl bg-muted px-3 py-2 text-sm">
                          <span className="font-semibold">{t.last.by}:</span> {t.last.note}
                        </span>
                      )}
                      <span className="text-xs text-ink-muted">
                        Submitted by {t.submittedBy} on {formatDate(t.submittedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="progress">
            <h2 id="progress" className="font-serif text-2xl font-semibold">
              On the way to learners
            </h2>
            {data.inProgress.length === 0 ? (
              <p className="mt-2 text-ink-muted">No topics are in review.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-2xl border border-line">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="bg-muted text-xs uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Topic</th>
                      <th className="px-4 py-2.5 font-semibold">Stage</th>
                      <th className="px-4 py-2.5 font-semibold">Reviewer</th>
                      <th className="px-4 py-2.5 font-semibold">Latest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.inProgress.map((t) => (
                      <tr key={t.slug} className="border-t border-line">
                        <td className="px-4 py-3">
                          <Link href={edit(t.slug)} className="font-semibold hover:underline">
                            {t.title}
                          </Link>
                          <span className="block text-xs text-ink-muted">by {t.submittedBy}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex flex-wrap gap-1">
                            <Badge tone={t.stale ? "neutral" : STAGE[t.stage].tone}>{t.stale ? "Edited since submitted" : STAGE[t.stage].label}</Badge>
                            {t.compliance && <Badge tone="info">Compliance</Badge>}
                          </span>
                        </td>
                        <td className="px-4 py-3">{t.reviewer}</td>
                        <td className="px-4 py-3 text-ink-muted">{t.last ? `${t.last.label}, ${formatDateTime(t.last.at)}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {data.drafts.length > 0 && (
            <section aria-labelledby="drafts">
              <h2 id="drafts" className="font-serif text-2xl font-semibold">
                Drafts not submitted yet
              </h2>
              <p className="mt-1 text-ink-muted">Saved changes that haven’t gone to a reviewer. Learners don’t see them.</p>
              <ul className="mt-3 flex flex-col divide-y divide-line rounded-2xl border border-line">
                {data.drafts.map((d) => (
                  <li key={d.slug}>
                    <Link href={edit(d.slug)} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted">
                      <span className="min-w-0 flex-1 font-semibold">{d.title}</span>
                      <Badge tone="neutral">{d.live ? "Changes to a live topic" : "New topic"}</Badge>
                      <span className="text-sm text-ink-muted">
                        Saved by {d.by}, {formatDateTime(d.updatedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="refresh">
            <h2 id="refresh" className="font-serif text-2xl font-semibold">
              Monitor and refresh
            </h2>
            <p className="mt-1 max-w-3xl text-ink-muted">
              Live topics with a review date coming up or passed, or open learner reports. Policy changes and Community discussions will show here once they’re
              connected. For card and fact checks, see{" "}
              <Link href="/admin/content-review" className="font-semibold text-accent hover:underline">
                Content review
              </Link>
              .
            </p>
            {data.refresh.length === 0 ? (
              <p className="mt-3 text-ink-muted">Every live topic is up to date.</p>
            ) : (
              <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.refresh.map((r) => (
                  <li key={r.slug}>
                    <Link href={edit(r.slug)} className="flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-4 hover:border-action">
                      <span className="font-semibold">{r.title}</span>
                      <span className="flex flex-wrap gap-2">
                        {r.status === "overdue" && <Badge tone="bad">Review overdue since {formatDate(r.reviewDate!)}</Badge>}
                        {r.status === "due" && <Badge tone="warn">Review due {formatDate(r.reviewDate!)}</Badge>}
                        {r.reports > 0 && (
                          <Badge tone="info">
                            {r.reports} learner {r.reports === 1 ? "report" : "reports"}
                          </Badge>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </AdminShell>
  );
}
