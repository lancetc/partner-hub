"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { incidentGuidance, type IncidentAnswers } from "@/lib/pocketPlaybook";
import type { ToolDetail } from "@/server/pocketPlaybook";
import { Icon } from "../Icon";
import { pocketEvent } from "./pocketApi";
import { RouteText } from "./PocketTool";

/*
  Tool B, Incident first steps (docs/pocket-playbook.md). "What must I do now?" comes first: safety, then the internal
  route and the incident system, then the SIRS prompts and current sources for the authorised reviewer. There is no
  text box: the incident's details belong in the Incident Management System, not here. No answer ever leads to "not
  reportable": every path ends in telling the responder. Nothing animates, and the emergency line is always on screen.
*/

type Answer = NonNullable<IncidentAnswers["danger"]>;
const CHOICES: { key: Answer; label: string }[] = [
  { key: "yes", label: "Yes" },
  { key: "no", label: "No" },
  { key: "unsure", label: "Not sure" },
];

function Choice({ value, onPick, name }: { value: Answer | null; onPick: (a: Answer) => void; name: string }) {
  return (
    <div role="group" aria-label={name} className="mt-2 flex flex-wrap gap-2">
      {CHOICES.map((c) => (
        <button
          key={c.key}
          type="button"
          aria-pressed={value === c.key}
          onClick={() => onPick(c.key)}
          className={cx(
            "min-h-12 min-w-24 rounded-full border-2 px-4 font-semibold",
            value === c.key ? "border-action bg-tealtint" : "border-line-strong bg-surface hover:bg-muted",
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

const Step = ({ n, title, children, urgent }: { n: number; title: string; children: React.ReactNode; urgent?: boolean }) => (
  <section aria-labelledby={`incident-step-${n}`} className={cx("mt-4 rounded-2xl border p-4", urgent ? "border-2 border-[#c7393e]" : "border-line")}>
    <h3 id={`incident-step-${n}`} className="flex items-center gap-2 font-semibold">
      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-bg">
        {n}
      </span>
      <span>
        <span className="sr-only">Step {n}: </span>
        {title}
      </span>
    </h3>
    <div className="mt-2">{children}</div>
  </section>
);

export function IncidentPath({
  toolId,
  place,
  incident,
  related,
}: {
  toolId: string;
  place: string;
  incident: NonNullable<ToolDetail["incident"]>;
  related: ToolDetail["related"];
}) {
  const p = incident.path;
  const [danger, setDanger] = useState<Answer | null>(null);
  const [sirsType, setSirsType] = useState<Answer | null>(null);
  const g = incidentGuidance({ danger, sirsType });
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    pocketEvent({ event: "incident_path_opened", toolId, place });
  }, [toolId, place]);
  const routeOpened = () => pocketEvent({ event: "internal_escalation_link_opened", toolId, place });
  const sourceOpened = () => pocketEvent({ event: "source_opened", toolId, place });
  const responder = incident.responder;

  return (
    <div>
      {/* Always on screen, and not colour alone: an icon, bold words and the number. */}
      <p className="flex items-start gap-2 rounded-2xl border-2 border-[#c7393e] bg-[#c7393e]/10 p-3 font-semibold">
        <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-[#c7393e] dark:text-[#ff9ea2]" />
        <span>
          If someone is in immediate danger, call{" "}
          <a href="tel:000" className="underline underline-offset-2">
            000
          </a>{" "}
          now. Then tell the incident responder.
        </span>
      </p>
      <p role="status" aria-live="polite" className="mt-3 rounded-2xl bg-tealtint p-3 font-semibold">
        {g.headline}
      </p>

      <Step n={1} title="Safety and urgent help" urgent={danger === "yes" || danger === "unsure"}>
        <p>{p.safety.question}</p>
        <Choice name="Is the person in immediate danger?" value={danger} onPick={setDanger} />
        {danger && (
          <ul className="mt-3 list-disc pl-5">
            {(danger === "no" ? p.safety.notNow : p.safety.emergency).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
      </Step>

      <Step n={2} title="Tell the incident responder now, and record it">
        <p className="rounded-xl bg-muted p-3">
          <span className="font-semibold">{responder?.label ?? "Incident responder"}:</span>{" "}
          {responder?.route ? (
            <RouteText route={responder.route} onOpen={routeOpened} />
          ) : (
            <span>route not set up yet (awaiting Quality). Until it is: tell your team lead now, and follow the incident procedure you already use.</span>
          )}
        </p>
        <ol className="mt-3 list-decimal pl-5">
          {p.internal.steps.map((s) => (
            <li key={s} className="mt-1">
              {s}
            </li>
          ))}
        </ol>
        <p className="mt-3">
          {p.internal.imsUrl ? (
            <a
              href={p.internal.imsUrl}
              target="_blank"
              rel="noreferrer"
              onClick={routeOpened}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-4 font-semibold text-on-action"
            >
              Open the Incident Management System <Icon name="external" className="size-4" />
            </a>
          ) : (
            <span className="text-sm text-ink-muted">Incident Management System link: awaiting Quality. Record it where you normally do.</span>
          )}
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          After hours: {p.internal.afterHours || "awaiting Quality. Until it’s set, use 000 for an emergency and your on-call lead."}
        </p>
      </Step>

      <Step n={3} title="Could it be a reportable (SIRS) incident?">
        <p className="text-sm text-ink-muted">{p.sirs.intro}</p>
        <p className="mt-2 font-semibold">{p.sirs.alleged}</p>
        <ul className="mt-2 flex flex-col gap-2">
          {p.sirs.types.map((t) => (
            <li key={t.id} className="rounded-xl border border-line p-2">
              <span className="font-semibold">{t.label}.</span> {t.prompt}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm">{p.sirs.homeServices}</p>
        <p className="mt-3 font-semibold">Does any of these fit, or might it?</p>
        <Choice name="Does any of these fit, or might it?" value={sirsType} onPick={setSirsType} />
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted p-3 font-semibold">
          <Icon name="flag" className="mt-0.5 size-4 shrink-0" />
          <span>{g.sirsNote}</span>
        </p>
      </Step>

      <Step n={4} title="Priority and notification: for the authorised reviewer">
        <ul className="flex flex-col gap-2">
          <li>{p.priority.p1}</li>
          <li>{p.priority.p2}</li>
          <li>{p.priority.awareness}</li>
        </ul>
        <p className="mt-2 font-semibold">{p.priority.decider}</p>
        <p className="mt-1 text-sm">{p.priority.notInternal}</p>
      </Step>

      <Step n={5} title="Follow through">
        <ul className="list-disc pl-5">
          {p.followThrough.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </Step>

      <section aria-labelledby="incident-sources" className="mt-4">
        <h3 id="incident-sources" className="font-semibold">
          Sources and process
        </h3>
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {p.links.map((l) => (
            <li key={l.label}>
              {l.href ? (
                <a
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={sourceOpened}
                  className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2"
                >
                  {l.label}
                </a>
              ) : (
                <span className="font-semibold">{l.label}</span>
              )}
              {l.section && <span className="text-ink-muted"> · {l.section}</span>}
            </li>
          ))}
          {related.map((r) => (
            <li key={r.id}>
              <Link href={r.href} className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2">
                Job Aid: {r.title}
              </Link>
              {r.state === "unavailable" && <span className="text-ink-muted"> · not yet released: it shows its fallback route</span>}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-ink-muted">
          This tool doesn’t report an incident, notify the Commission or decide reportability, and it keeps nothing you choose here. If a link fails, the steps
          above still stand: escalate now.
        </p>
      </section>
    </div>
  );
}
