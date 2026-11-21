"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { INTERPRETATIONS } from "@/lib/living";
import { LEARNING_DECISIONS, REVIEW_DECISIONS, RISK, THEME_STATUS } from "@/lib/problemDesk";
import type { SignalList } from "@/server/signalRoom";
import { AdminShell, Badge, btn, ErrorNote } from "../ui";
import { Icon } from "../../Icon";
import { box, dateText, riskTone, statusTone } from "../problems/problemUi";

/*
  The Signal Room (docs/living-cases.md): each verified theme from the Problem desk, read as evidence over time.
  A place to look and decide. Recording signals, the diagnosis and the response is done on the Problem desk.
*/
export function SignalRoom() {
  const loaded = useApi<SignalList>("/api/admin/signal-room");
  if (loaded.error)
    return (
      <AdminShell title="Signal Room">
        <ErrorNote text={loaded.error} />
      </AdminShell>
    );
  const d = loaded.data;
  return (
    <AdminShell title="Signal Room">
      <p className="max-w-3xl text-ink-muted">
        One theme at a time, from the signals that raised it to what was decided, what learners did and what happened to the work measure. Four things are kept
        apart here and never added together: reach, practice, assessment and work. Nothing on these pages says one caused another.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/admin/problems" className={btn.secondary}>
          <Icon name="target" className="size-4" /> Problem desk
        </Link>
        <a href="/api/admin/problems/export" className={btn.secondary}>
          <Icon name="file" className="size-4" /> Export the register to Excel
        </a>
      </div>
      {!d ? (
        <p className="mt-6 text-ink-muted">Loading…</p>
      ) : (
        <>
          {!d.verified.length && (
            <p className={`${box} mt-6`}>
              No theme has been checked yet. The Signal Room shows a theme once someone has ticked “I’ve checked this grouping” on the Problem desk.
            </p>
          )}
          <ul className="mt-6 flex flex-col gap-3">
            {d.verified.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/signal-room/${t.id}`} className={`${box} block transition hover:ring-1 hover:ring-action`}>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-serif text-xl font-semibold">{t.title}</span>
                    {t.sample && <Badge tone="warn">Sample data</Badge>}
                    <Badge tone={riskTone(t.risk)}>{RISK[t.risk]}</Badge>
                    <Badge tone={statusTone(t.status)}>{THEME_STATUS[t.status]}</Badge>
                  </span>
                  <span className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <span>
                      <span className="font-semibold tabular-nums">{t.counts.cases}</span> unique {t.counts.cases === 1 ? "case" : "cases"},{" "}
                      <span className="font-semibold tabular-nums">{t.counts.contactEvents}</span> {t.counts.contactEvents === 1 ? "contact" : "contacts"}
                    </span>
                    <span>
                      <span className="font-semibold tabular-nums">{t.counts.repeatContacts}</span> repeat{" "}
                      {t.counts.repeatContacts === 1 ? "contact" : "contacts"}
                      {t.counts.parties > 0 && (
                        <>
                          , <span className="font-semibold tabular-nums">{t.counts.parties}</span> affected {t.counts.parties === 1 ? "party" : "parties"}
                        </>
                      )}
                    </span>
                    <span className="text-ink-muted">
                      {t.decision === "approved"
                        ? `Decided: ${t.learning ? LEARNING_DECISIONS[t.learning] : "no learning decision"}`
                        : "No approved decision yet"}
                      {t.returns > 0 && ` · ${t.returns} return ${t.returns === 1 ? "episode" : "episodes"}`}
                    </span>
                    <span className="text-ink-muted">{t.hasWork ? t.measure || "A work measure" : "No linked work measure yet"}</span>
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                    <span>Owner: {t.owner || "not named"}</span>
                    {t.reviewOn && (
                      <span className={t.overdue ? "font-semibold text-ink" : ""}>
                        Review {t.overdue ? "was due" : "due"} {dateText(t.reviewOn)}
                      </span>
                    )}
                    {t.latest ? (
                      <span>
                        Last review {dateText(t.latest.on)}: {REVIEW_DECISIONS[t.latest.decision]}
                        {t.latest.interpretation && ` (${INTERPRETATIONS[t.latest.interpretation]})`}
                      </span>
                    ) : (
                      <span>Not reviewed yet</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {d.unverified > 0 && (
            <p className="mt-4 text-sm text-ink-muted">
              {d.unverified} more {d.unverified === 1 ? "theme is a grouping" : "themes are groupings"} nobody has checked yet.{" "}
              {d.unverified === 1 ? "It’s" : "They’re"} on the{" "}
              <Link href="/admin/problems" className="font-semibold text-accent underline underline-offset-2">
                Problem desk
              </Link>
              .
            </p>
          )}
        </>
      )}
    </AdminShell>
  );
}
