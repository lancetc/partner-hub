"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PathConfig, PathStep } from "@/content/followups";
import { stageLabel, type FollowUpStage } from "@/content/followups";
import { api, durationLabel, useApi, type Me } from "@/lib/api";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { AdminShell, Badge, btn, ErrorNote, Field, input, statusText, statusTone, timezones } from "./ui";
import { confirmAction } from "@/lib/confirm";

type FollowUpSummary = { id: string; version: number; status: string; title: string; stage: FollowUpStage; role: string | null; durationSec: number };
type Report = {
  scope: string;
  totals: Record<string, number>;
  stages: {
    step: number;
    title: string;
    scheduled: number;
    available: number;
    notified: number;
    started: number;
    completed: number;
    answered: number;
    correctFirst: number;
    correctedAfterFeedback: number;
    assisted: number;
  }[];
  concepts: { concept: string; n: number; correctFirst: number }[];
  timelines: {
    enrolmentId: number;
    learner: string;
    org: string;
    version: number;
    state: string;
    timezone: string;
    anchor: string;
    steps: {
      step: number;
      title: string;
      variant: string;
      planned: string | null;
      released: string | null;
      completed: string | null;
      cancelled: string | null;
      firstAttempt: string | null;
      afterFeedback: string | null;
      why: string;
    }[];
  }[];
};
type Detail = {
  id: string;
  version: number;
  status: string;
  paused: boolean;
  liveVersion: number | null;
  versions: { version: number; status: string }[];
  editable: boolean;
  config: PathConfig;
  steps: PathStep[];
  issues: string[];
  followUps: FollowUpSummary[];
  lessons: { slug: string; version: string; title: string; minutes: number; track: string }[];
  report: Report;
  history: { actor: string; event: string; entity: string; reason: string | null; at: string }[];
};
type Preview = { issues: string[]; anchor?: string; steps: { index: number; gap: number; status: string; at: string | null; explanation: string }[] };

const roles = ["cleaning", "gardening", "physiotherapy", "nursing", "personal-care", "coordinator"];

export function PathBuilder({ id }: { id: string }) {
  const me = useApi<Me>("/api/me").data;
  const { data, error, reload } = useApi<Detail>(`/api/admin/paths/${id}`);
  const [config, setConfig] = useState<PathConfig | null>(null);
  const [steps, setSteps] = useState<PathStep[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [resumeInfo, setResumeInfo] = useState<string[] | null>(null);
  const [loadedVersion, setLoadedVersion] = useState<string | null>(null);

  // Take a fresh editable copy whenever the server version or status changes.
  const stamp = data ? `${data.version}:${data.status}:${data.editable}` : null;
  if (data && stamp !== loadedVersion) {
    setLoadedVersion(stamp);
    setConfig(data.config);
    setSteps(data.steps);
    setDirty(false);
  }

  const editable = Boolean(data?.editable && me?.canAuthor);
  const update = (c: Partial<PathConfig>) => {
    setConfig((cur) => (cur ? { ...cur, ...c } : cur));
    setDirty(true);
  };
  const updateSchedule = (c: Partial<PathConfig["schedule"]>) => config && update({ schedule: { ...config.schedule, ...c } });
  const updateStep = (i: number, c: Partial<PathStep>) => {
    setSteps((cur) => cur.map((s, j) => (j === i ? { ...s, ...c } : s)));
    setDirty(true);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= steps.length || from === to) return;
    setSteps((cur) => {
      const next = [...cur];
      const [s] = next.splice(from, 1);
      next.splice(to, 0, s);
      return next;
    });
    setDirty(true);
  };

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ kind: "ok", text: ok });
      reload();
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const save = () => run(() => api(`/api/admin/paths/${id}`, { method: "PUT", body: { config, steps } }).then(() => setDirty(false)), "Draft saved.");
  const action = (a: string, extra: Record<string, unknown> = {}, ok = "Done.") =>
    run(() => api(`/api/admin/paths/${id}/actions`, { body: { action: a, ...extra } }), ok);

  if (error) {
    return (
      <AdminShell title="Spaced schedule" back={{ href: "/admin/schedules", label: "Spaced schedules" }}>
        <ErrorNote text={error} />
      </AdminShell>
    );
  }
  if (!data || !config) {
    return (
      <AdminShell title="Spaced schedule" back={{ href: "/admin/schedules", label: "Spaced schedules" }}>
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );
  }

  // Short lessons can be steps too (`lesson:<slug>`), alongside short follow ups.
  const activities: FollowUpSummary[] = [
    ...data.followUps,
    ...data.lessons.map((l) => ({
      id: `lesson:${l.slug}`,
      version: 0,
      status: "approved",
      title: `${l.title} (short lesson)`,
      stage: "custom" as FollowUpStage,
      role: null,
      durationSec: l.minutes * 60,
    })),
  ];
  const fu = (fid: string) => activities.find((f) => f.id === fid);
  const gapUnit = config.schedule.unit === "calendar" ? "calendar day" : "weekday";
  const firstAnchor = config.trigger.type === "lesson_completion" ? "the base lesson is completed" : "the path is assigned";

  return (
    <AdminShell title={config.name || "Untitled path"} back={{ href: "/admin/schedules", label: "Spaced schedules" }}>
      {/* Status and lifecycle */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone(data.status)}>
          {statusText[data.status]} · version {data.version}
        </Badge>
        {data.liveVersion && data.liveVersion !== data.version && <Badge tone="good">Published v{data.liveVersion} stays live until this is published</Badge>}
        {data.paused && <Badge tone="warn">Paused</Badge>}
        {dirty && <Badge tone="warn">Unsaved changes</Badge>}
        <span className="ml-auto" />
        {me?.canAuthor && editable && (
          <>
            <button type="button" className={btn.secondary} disabled={busy || !dirty} onClick={save}>
              Save draft
            </button>
            {data.status === "draft" && (
              <button type="button" className={btn.primary} disabled={busy || dirty} onClick={() => action("submit", {}, "Submitted for review.")}>
                Submit for review
              </button>
            )}
            {data.status === "in_review" && (
              <button
                type="button"
                className={btn.primary}
                disabled={busy || dirty}
                onClick={() => action("publish", {}, "Published. New enrolments use this version; existing ones keep theirs.")}
              >
                Approve and publish
              </button>
            )}
          </>
        )}
        {me?.canAuthor && !editable && (
          <button
            type="button"
            className={btn.secondary}
            disabled={busy}
            onClick={() => action("new_draft", {}, "New draft created from the published version.")}
          >
            Edit as a new draft
          </button>
        )}
      </div>
      {dirty && data.status === "in_review" && <p className="mt-2 text-sm text-ink-muted">Saving changes returns the version to draft for another review.</p>}
      {message && (
        <div className="mt-3">
          {message.kind === "error" ? (
            <ErrorNote text={message.text} />
          ) : (
            <p role="status" className="rounded-2xl bg-tealtint p-3">
              {message.text}
            </p>
          )}
        </div>
      )}
      {editable && data.issues.length > 0 && !dirty && (
        <details className="mt-3 rounded-2xl border border-gold p-3" open={data.issues.length < 6}>
          <summary className="cursor-pointer font-semibold">
            {data.issues.length} thing{data.issues.length === 1 ? "" : "s"} to fix before publishing
          </summary>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {data.issues.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <Settings config={config} lessons={data.lessons} editable={editable} update={update} updateSchedule={updateSchedule} />

          {/* Ordered activity list with visible waits */}
          <section aria-labelledby="activities">
            <h2 id="activities" className="font-serif text-2xl font-semibold">
              Activities
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Each wait is the gap before that activity.{" "}
              {config.schedule.mode === "scheduled"
                ? "In Scheduled mode, gaps follow the previous planned release."
                : "In After completion mode, gaps start when the previous activity is finished."}
            </p>
            <ol className="mt-4 flex flex-col">
              {steps.map((s, i) => (
                <StepRow
                  key={s.key}
                  index={i}
                  step={s}
                  count={steps.length}
                  gapUnit={gapUnit}
                  anchorText={
                    i === 0
                      ? `after ${firstAnchor}`
                      : config.schedule.mode === "scheduled"
                        ? "after the previous activity is released"
                        : "after the previous activity is completed"
                  }
                  editable={editable}
                  followUp={fu(s.followUpId)}
                  followUps={activities}
                  onChange={(c) => updateStep(i, c)}
                  onMove={(to) => move(i, to)}
                  onDropFrom={(from) => move(from, i)}
                  onRemove={() => {
                    setSteps((cur) => cur.filter((_, j) => j !== i));
                    setDirty(true);
                  }}
                />
              ))}
            </ol>
            {editable && (
              <AddActivity
                followUps={data.followUps}
                objective={config.objective}
                onAdd={(fid) => {
                  setSteps((cur) => [
                    ...cur,
                    {
                      key: `s${Date.now().toString(36)}`,
                      followUpId: fid,
                      variants: {},
                      gap: 7,
                      message: "",
                      required: false,
                      completionRule: "response_and_feedback",
                    },
                  ]);
                  setDirty(true);
                }}
                onCreated={reload}
              />
            )}
          </section>

          {me?.canAuthor && data.liveVersion && (
            <Operations
              paused={data.paused}
              busy={busy}
              resumeInfo={resumeInfo}
              onPause={() => action("pause", {}, "Paused. No new releases or messages; released activities stay available.")}
              onResumePreview={async () =>
                setResumeInfo((await api<{ summary: string[] }>(`/api/admin/paths/${id}/actions`, { body: { action: "resume_preview" } })).summary)
              }
              onResume={() => {
                setResumeInfo(null);
                action("resume", {}, "Resumed.");
              }}
              onRebaseline={(reason) => action("rebaseline", { reason }, "Remaining spacing restarted from now. Logged.")}
              onWithdraw={(reason) =>
                action("withdraw", { version: data.liveVersion, reason }, "Version withdrawn. Unsent work is cancelled; completed evidence is kept.")
              }
            />
          )}

          <ReportView report={data.report} />

          {data.history.length > 0 && (
            <section aria-labelledby="history">
              <h2 id="history" className="font-serif text-2xl font-semibold">
                History
              </h2>
              <ul className="mt-3 flex flex-col gap-1 text-sm">
                {data.history.map((h, i) => (
                  <li key={i}>
                    <span className="text-ink-muted">{new Date(h.at).toLocaleString("en-AU")}</span> · {h.actor} · {h.event.replace(".", " ")}{" "}
                    {h.entity.split("@")[1] ? `v${h.entity.split("@")[1]}` : ""}
                    {h.reason && <span className="text-ink-muted"> · {h.reason}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="xl:sticky xl:top-20 xl:self-start">
          <DatePreview pathId={id} config={config} steps={steps} />
        </aside>
      </div>
    </AdminShell>
  );
}

function Settings({
  config,
  lessons,
  editable,
  update,
  updateSchedule,
}: {
  config: PathConfig;
  lessons: Detail["lessons"];
  editable: boolean;
  update: (c: Partial<PathConfig>) => void;
  updateSchedule: (c: Partial<PathConfig["schedule"]>) => void;
}) {
  const radio = (name: string, value: string, current: string, label: string, hint: string, on: () => void) => (
    <label
      key={value}
      className={cx("flex min-h-11 cursor-pointer gap-3 rounded-2xl border-2 p-3", current === value ? "border-action bg-tealtint" : "border-line")}
    >
      <input type="radio" name={name} checked={current === value} onChange={on} disabled={!editable} className="mt-1 size-4 accent-[var(--action)]" />
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-ink-muted">{hint}</span>
      </span>
    </label>
  );

  return (
    <section aria-labelledby="settings" className="rounded-3xl border border-line p-5">
      <h2 id="settings" className="font-serif text-2xl font-semibold">
        Path settings
      </h2>
      <fieldset disabled={!editable} className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">
          <input className={input} value={config.name} onChange={(e) => update({ name: e.target.value })} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <textarea className={input + " py-2"} rows={2} value={config.description} onChange={(e) => update({ description: e.target.value })} />
        </Field>
        <Field label="Content owner">
          <input className={input} value={config.owner} onChange={(e) => update({ owner: e.target.value })} />
        </Field>
        <Field label="Learning objective">
          <input className={input} value={config.objective} onChange={(e) => update({ objective: e.target.value })} />
        </Field>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-semibold">Audience</legend>
          <div className="flex flex-wrap gap-3">
            {(["partner", "coordinator"] as const).map((a) => (
              <label key={a} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.audience.includes(a)}
                  onChange={(e) => update({ audience: e.target.checked ? [...config.audience, a] : config.audience.filter((x) => x !== a) })}
                  className="size-5 accent-[var(--action)]"
                />
                {a === "partner" ? "Service partners" : "Care coordinators"}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Enrolment trigger" hint="Completing this lesson version enrols the learner. The path doesn’t assign the base lesson again.">
          <select
            className={input}
            value={config.trigger.type === "lesson_completion" ? `${config.trigger.lessonSlug}@${config.trigger.lessonVersion}` : "manual"}
            onChange={(e) => {
              if (e.target.value === "manual") return update({ trigger: { type: "manual" } });
              const [lessonSlug, lessonVersion] = e.target.value.split("@");
              update({ trigger: { type: "lesson_completion", lessonSlug, lessonVersion } });
            }}
          >
            {lessons.map((l) => (
              <option key={l.slug} value={`${l.slug}@${l.version}`}>
                Completion of “{l.title}” v{l.version}
              </option>
            ))}
            <option value="manual">Manual assignment</option>
          </select>
        </Field>

        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-1 text-sm font-semibold">Delivery mode</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {radio("mode", "scheduled", config.schedule.mode, "Scheduled", "Releases on planned dates even if an earlier activity is unfinished.", () =>
              updateSchedule({ mode: "scheduled" }),
            )}
            {radio(
              "mode",
              "after_completion",
              config.schedule.mode,
              "After completion",
              "Each activity waits for the previous one to be finished, then applies its gap.",
              () => updateSchedule({ mode: "after_completion" }),
            )}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Spacing unit</legend>
          {radio("unit", "calendar", config.schedule.unit, "Calendar days", "Local calendar dates.", () => updateSchedule({ unit: "calendar" }))}
          {radio("unit", "weekdays", config.schedule.unit, "Weekdays", "Counts Monday to Friday. Public holidays are not excluded yet.", () =>
            updateSchedule({ unit: "weekdays" }),
          )}
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Delivery days</legend>
          {radio(
            "days",
            "weekdays",
            config.schedule.deliveryDays,
            "Weekdays only",
            "A weekend release moves to Monday. Public holidays are not excluded yet.",
            () => updateSchedule({ deliveryDays: "weekdays" }),
          )}
          {radio("days", "every", config.schedule.deliveryDays, "Every day", "Weekend releases stay on the weekend.", () =>
            updateSchedule({ deliveryDays: "every" }),
          )}
        </fieldset>
        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <Field label="Local send time">
            <input type="time" className={input} value={config.schedule.sendTime} onChange={(e) => updateSchedule({ sendTime: e.target.value })} />
          </Field>
          <Field label="Window from">
            <input
              type="time"
              className={input}
              value={config.schedule.window.start}
              onChange={(e) => updateSchedule({ window: { ...config.schedule.window, start: e.target.value } })}
            />
          </Field>
          <Field label="Window to">
            <input
              type="time"
              className={input}
              value={config.schedule.window.end}
              onChange={(e) => updateSchedule({ window: { ...config.schedule.window, end: e.target.value } })}
            />
          </Field>
        </div>
        <Field label="Timezone fallback" hint="Learners’ own timezone is used, then their organisation’s, then this.">
          <select className={input} value={config.timezoneFallback} onChange={(e) => update({ timezoneFallback: e.target.value })}>
            {timezones.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Notification channel" hint="Every released activity also appears in the hub.">
          <select className={input} value={config.channel} onChange={(e) => update({ channel: e.target.value as "email" | "sms" })}>
            <option value="email">Email digest</option>
            <option value="sms">SMS (not connected yet)</option>
          </select>
        </Field>
        <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
          <input
            type="checkbox"
            checked={config.reminders.enabled}
            onChange={(e) => update({ reminders: { ...config.reminders, enabled: e.target.checked } })}
            className="size-5 accent-[var(--action)]"
          />
          <span>
            One reminder per activity, {config.reminders.afterWeekdays} weekdays after release, if it’s still unfinished. Messages are capped at one digest per
            person per day across all paths.
          </span>
        </label>
      </fieldset>
    </section>
  );
}

function StepRow({
  index,
  step,
  count,
  gapUnit,
  anchorText,
  editable,
  followUp,
  followUps,
  onChange,
  onMove,
  onDropFrom,
  onRemove,
}: {
  index: number;
  step: PathStep;
  count: number;
  gapUnit: string;
  anchorText: string;
  editable: boolean;
  followUp?: FollowUpSummary;
  followUps: FollowUpSummary[];
  onChange: (c: Partial<PathStep>) => void;
  onMove: (to: number) => void;
  onDropFrom: (from: number) => void;
  onRemove: () => void;
}) {
  const [over, setOver] = useState(false);
  const [newRole, setNewRole] = useState("gardening");
  const variantChoices = followUps.filter((f) => f.id !== step.followUpId);
  return (
    <li
      className="flex flex-col"
      onDragOver={(e) => {
        if (!editable) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const raw = e.dataTransfer.getData("text/step-index");
        if (raw !== "") onDropFrom(Number(raw));
      }}
    >
      {/* Connector with the wait before this activity */}
      <div className="flex items-stretch gap-4 pl-5">
        <span aria-hidden className="w-0.5 bg-line-strong" />
        <div className="flex flex-wrap items-center gap-2 py-3 text-sm">
          <span className="font-medium">Wait</span>
          <div className="flex items-center rounded-full border border-line-strong">
            <button
              type="button"
              disabled={!editable || step.gap <= 0}
              onClick={() => onChange({ gap: step.gap - 1 })}
              aria-label={`Shorten the wait before activity ${index + 1}`}
              className="inline-flex size-10 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40"
            >
              <Icon name="minus" className="size-4" />
            </button>
            <input
              type="number"
              min={0}
              max={365}
              value={step.gap}
              disabled={!editable}
              onChange={(e) => onChange({ gap: Math.max(0, Math.min(365, Math.floor(Number(e.target.value) || 0))) })}
              aria-label={`Wait before activity ${index + 1}, in ${gapUnit}s`}
              className="h-10 w-14 bg-transparent text-center font-semibold"
            />
            <button
              type="button"
              disabled={!editable || step.gap >= 365}
              onClick={() => onChange({ gap: step.gap + 1 })}
              aria-label={`Lengthen the wait before activity ${index + 1}`}
              className="inline-flex size-10 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40"
            >
              <Icon name="plus" className="size-4" />
            </button>
          </div>
          <span className="text-ink-muted">
            {gapUnit}
            {step.gap === 1 ? "" : "s"} {anchorText}
            {step.gap === 0 && " (available at the next delivery window)"}
          </span>
        </div>
      </div>

      <div
        draggable={editable}
        onDragStart={(e) => e.dataTransfer.setData("text/step-index", String(index))}
        className={cx("rounded-3xl border bg-surface p-4", over ? "border-action ring-2 ring-action/30" : "border-line")}
      >
        <div className="flex flex-wrap items-start gap-3">
          {editable && (
            <span className="mt-1 cursor-grab text-ink-muted" title="Drag to reorder" aria-hidden>
              ⋮⋮
            </span>
          )}
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-navy font-mulish font-bold text-white dark:bg-teal-bright dark:text-navy">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-semibold leading-snug">
              {step.stage && <Badge tone="info">{step.stage}</Badge>}
              {followUp?.title ?? "Missing activity"}
            </p>
            <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              {followUp ? stageLabel[followUp.stage] : ""} · {followUp ? durationLabel(followUp.durationSec) : ""}
              {followUp && (
                <Badge tone={statusTone(followUp.status)}>
                  {statusText[followUp.status]} v{followUp.version}
                </Badge>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {followUp && (
              <Link href={`/admin/follow-ups/${followUp.id}`} className={btn.quiet}>
                {editable ? "Edit" : "Preview"}
              </Link>
            )}
            {editable && (
              <>
                <button
                  type="button"
                  className={btn.quiet}
                  disabled={index === 0}
                  onClick={() => onMove(index - 1)}
                  aria-label={`Move activity ${index + 1} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={btn.quiet}
                  disabled={index === count - 1}
                  onClick={() => onMove(index + 1)}
                  aria-label={`Move activity ${index + 1} down`}
                >
                  ↓
                </button>
                <button type="button" className={btn.quiet} onClick={onRemove} aria-label={`Remove activity ${index + 1}`}>
                  <Icon name="close" className="size-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {step.adaptive && (
          <p className="mt-2 rounded-xl bg-muted px-3 py-2 text-sm">
            <strong>Adaptive:</strong> {step.adaptive.note ?? "Learners who missed an earlier first attempt get a different version."} Support version:{" "}
            {followUps.find((f) => f.id === step.adaptive!.ifStruggled)?.title ?? step.adaptive.ifStruggled}.
          </p>
        )}
        <fieldset disabled={!editable} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Sharing message" hint="Used in the digest and on the hub." className="sm:col-span-2">
            <input className={input} value={step.message} onChange={(e) => onChange({ message: e.target.value })} />
          </Field>
          <Field label="Activity">
            <select className={input} value={step.followUpId} onChange={(e) => onChange({ followUpId: e.target.value })}>
              {followUps
                .filter((f) => !f.role)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title} ({statusText[f.status]})
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Completion rule">
            <select className={input} value={step.completionRule} onChange={(e) => onChange({ completionRule: e.target.value as PathStep["completionRule"] })}>
              <option value="response_and_feedback">Practice: answer and view feedback</option>
              <option value="pass">Pass: needs a correct answer (first or after feedback)</option>
            </select>
          </Field>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={step.required}
                onChange={(e) => onChange({ required: e.target.checked, dueWeekdays: e.target.checked ? (step.dueWeekdays ?? 5) : undefined })}
                className="size-5 accent-[var(--action)]"
              />
              Required assignment
            </label>
            {step.required ? (
              <label className="flex items-center gap-2 text-sm">
                Due
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={step.dueWeekdays ?? 5}
                  onChange={(e) => onChange({ dueWeekdays: Math.max(1, Number(e.target.value) || 1) })}
                  className="h-10 w-16 rounded-lg border border-line-strong bg-surface text-center"
                />
                weekdays after release
              </label>
            ) : (
              <span className="text-sm text-ink-muted">Optional practice: encouraging reminders, no overdue escalation.</span>
            )}
          </div>
          <div className="sm:col-span-2">
            <p className="text-sm font-semibold">Role variants</p>
            {Object.entries(step.variants).length === 0 && <p className="text-sm text-ink-muted">Everyone gets the activity above.</p>}
            <ul className="mt-1 flex flex-col gap-1">
              {Object.entries(step.variants).map(([role, fid]) => (
                <li key={role} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone="info">{role}</Badge>
                  <select
                    className="min-h-10 rounded-lg border border-line-strong bg-surface px-2"
                    value={fid}
                    onChange={(e) => onChange({ variants: { ...step.variants, [role]: e.target.value } })}
                  >
                    {variantChoices.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.title}
                      </option>
                    ))}
                  </select>
                  {editable && (
                    <button
                      type="button"
                      className={btn.quiet}
                      onClick={() => {
                        const { [role]: _drop, ...rest } = step.variants;
                        onChange({ variants: rest });
                      }}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {editable && variantChoices.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="min-h-10 rounded-lg border border-line-strong bg-surface px-2"
                  aria-label="Role for a new variant"
                >
                  {roles
                    .filter((r) => !step.variants[r])
                    .map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                </select>
                <button
                  type="button"
                  className={btn.quiet}
                  onClick={() =>
                    onChange({ variants: { ...step.variants, [newRole]: (variantChoices.find((f) => f.role === newRole) ?? variantChoices[0]).id } })
                  }
                >
                  <Icon name="plus" className="size-4" /> Add variant
                </button>
              </div>
            )}
          </div>
        </fieldset>
      </div>
    </li>
  );
}

function AddActivity({
  followUps,
  objective,
  onAdd,
  onCreated,
}: {
  followUps: FollowUpSummary[];
  objective: string;
  onAdd: (id: string) => void;
  onCreated: () => void;
}) {
  const [pick, setPick] = useState(followUps.find((f) => !f.role)?.id ?? "");
  const [creating, setCreating] = useState(false);
  return (
    <div className="mt-4 flex flex-wrap items-end gap-2 rounded-3xl border-2 border-dashed border-line-strong p-4">
      <label className="flex min-w-52 flex-1 flex-col gap-1">
        <span className="text-sm font-semibold">Add an existing follow up</span>
        <select value={pick} onChange={(e) => setPick(e.target.value)} className={input}>
          {followUps
            .filter((f) => !f.role)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.title} ({statusText[f.status]})
              </option>
            ))}
        </select>
      </label>
      <button type="button" className={btn.secondary} onClick={() => pick && onAdd(pick)}>
        Add
      </button>
      <button
        type="button"
        className={btn.secondary}
        disabled={creating}
        onClick={async () => {
          setCreating(true);
          const { id } = await api<{ id: string }>("/api/admin/follow-ups", { body: { title: "New follow up", objective } });
          onAdd(id);
          onCreated();
          setCreating(false);
        }}
      >
        <Icon name="plus" className="size-4" /> Create a short follow up
      </button>
    </div>
  );
}

function DatePreview({ pathId, config, steps }: { pathId: string; config: PathConfig; steps: PathStep[] }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [tz, setTz] = useState(config.timezoneFallback);
  const [start, setStart] = useState(today);
  const [time, setTime] = useState("14:00");
  const [preview, setPreview] = useState<Preview | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api<Preview>(`/api/admin/paths/${pathId}/preview`, { body: { config, steps, timezone: tz, start, time } }).then(setPreview, (e: Error) =>
        setPreview({ issues: [e.message], steps: [] }),
      );
    }, 250);
    return () => clearTimeout(timer.current);
  }, [pathId, config, steps, tz, start, time]);

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    }).format(new Date(iso));

  return (
    <section aria-labelledby="preview" className="rounded-3xl bg-muted p-5">
      <h2 id="preview" className="font-serif text-xl font-semibold">
        Date preview
      </h2>
      <p className="mt-1 text-sm text-ink-muted">Uses the same scheduling function as enrolment and the worker.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Learner timezone" className="col-span-2">
          <select className={input} value={tz} onChange={(e) => setTz(e.target.value)}>
            {timezones.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label={config.trigger.type === "lesson_completion" ? "Base lesson completed" : "Assigned"}>
          <input type="date" className={input} value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="at">
          <input type="time" className={input} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      {preview?.issues.length ? (
        <div className="mt-3">
          <ErrorNote text={preview.issues.join("\n")} />
        </div>
      ) : (
        <ol className="mt-4 flex flex-col gap-3" aria-live="polite">
          {preview?.steps.map((s) => (
            <li key={s.index} className="rounded-2xl bg-surface p-3">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-navy text-xs text-white dark:bg-teal-bright dark:text-navy">
                  {s.index + 1}
                </span>
                {s.at ? fmt(s.at) : "Waiting"}
                {s.status === "estimated" && <Badge tone="warn">Estimate</Badge>}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Gap {s.gap}. {s.explanation}
              </p>
            </li>
          ))}
        </ol>
      )}
      {config.schedule.mode === "after_completion" && (
        <p className="mt-3 text-sm text-ink-muted">
          Later dates are estimates that assume each activity is finished promptly on release. Late completion moves them.
        </p>
      )}
    </section>
  );
}

function Operations({
  paused,
  busy,
  resumeInfo,
  onPause,
  onResumePreview,
  onResume,
  onRebaseline,
  onWithdraw,
}: {
  paused: boolean;
  busy: boolean;
  resumeInfo: string[] | null;
  onPause: () => void;
  onResumePreview: () => void;
  onResume: () => void;
  onRebaseline: (reason: string) => void;
  onWithdraw: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <section aria-labelledby="ops" className="rounded-3xl border border-line p-5">
      <h2 id="ops" className="font-serif text-2xl font-semibold">
        Live operations
      </h2>
      <p className="mt-1 text-sm text-ink-muted">Applies to the published version and its enrolments.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {paused ? (
          <button type="button" className={btn.secondary} disabled={busy} onClick={onResumePreview}>
            Resume…
          </button>
        ) : (
          <button type="button" className={btn.secondary} disabled={busy} onClick={onPause}>
            Pause
          </button>
        )}
      </div>
      {resumeInfo && (
        <div className="mt-3 rounded-2xl bg-muted p-4">
          <p className="font-semibold">If you resume now</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {resumeInfo.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <button type="button" className={btn.primary + " mt-3"} disabled={busy} onClick={onResume}>
            Confirm resume
          </button>
        </div>
      )}
      <Field label="Reason (required for rebaseline or withdrawal; learners see withdrawal reasons)" className="mt-4">
        <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={btn.secondary} disabled={busy || !reason.trim()} onClick={() => onRebaseline(reason)}>
          Rebaseline remaining spacing
        </button>
        <button
          type="button"
          className={btn.danger}
          disabled={busy || !reason.trim()}
          onClick={async () =>
            (await confirmAction("Unsent work is cancelled for every enrolment. Completed evidence is kept.", {
              title: "Withdraw this version?",
              confirmLabel: "Withdraw",
              danger: true,
            })) && onWithdraw(reason)
          }
        >
          Withdraw version
        </button>
      </div>
    </section>
  );
}

function ReportView({ report }: { report: Report }) {
  const pct = (a: number, n: number) => (n ? `${a} of ${n}` : "–");
  return (
    <section aria-labelledby="report">
      <h2 id="report" className="font-serif text-2xl font-semibold">
        Reporting
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Scope: {report.scope}. Measures are kept separate. First attempt accuracy shows counts with sample sizes; answers after feedback are reported
        separately. No retention score is calculated.
      </p>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <thead className="bg-muted">
            <tr>
              {["Activity", "Scheduled", "Available", "Notified", "Started", "Completed", "Correct first attempt", "Correct after feedback"].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.stages.map((s) => (
              <tr key={s.step} className="border-t border-line">
                <th scope="row" className="px-3 py-2 font-medium">
                  {s.step}. {s.title}
                </th>
                <td className="px-3 py-2">{s.scheduled}</td>
                <td className="px-3 py-2">{s.available}</td>
                <td className="px-3 py-2">{s.notified}</td>
                <td className="px-3 py-2">{s.started}</td>
                <td className="px-3 py-2">{s.completed}</td>
                <td className="px-3 py-2">{pct(s.correctFirst, s.answered)}</td>
                <td className="px-3 py-2">{s.answered - s.correctFirst ? pct(s.correctedAfterFeedback, s.answered - s.correctFirst) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {report.concepts.length > 0 && (
        <p className="mt-3 text-sm">
          <strong>By concept:</strong> {report.concepts.map((c) => `${c.concept}: ${c.correctFirst} of ${c.n} correct first time`).join(" · ")}
        </p>
      )}
      <h3 className="mt-6 font-semibold">Learner timelines</h3>
      {report.timelines.length === 0 ? (
        <p className="mt-1 text-sm text-ink-muted">No enrolments yet. Complete the base lesson as a partner to create one.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {report.timelines.map((t) => (
            <li key={t.enrolmentId}>
              <details className="rounded-2xl border border-line p-3">
                <summary className="cursor-pointer">
                  <span className="font-semibold">{t.learner}</span>{" "}
                  <span className="text-sm text-ink-muted">
                    · {t.org} · v{t.version} · {t.state} · {t.timezone}
                  </span>
                </summary>
                <ol className="mt-2 flex flex-col gap-2 text-sm">
                  {t.steps.map((s) => (
                    <li key={s.step} className="rounded-xl bg-muted p-2">
                      <p className="font-medium">
                        {s.step}. {s.title}{" "}
                        <span className="font-normal text-ink-muted">
                          {s.cancelled ? "· withdrawn" : s.completed ? "· completed" : s.released ? "· available" : s.planned ? "· scheduled" : "· waiting"}
                          {s.firstAttempt && ` · first attempt ${s.firstAttempt}`}
                          {s.afterFeedback && ` · after feedback ${s.afterFeedback}`}
                        </span>
                      </p>
                      <p className="text-ink-muted">
                        {s.released ? `Released ${new Date(s.released).toLocaleString("en-AU", { timeZone: t.timezone })} (${t.timezone})` : s.why}
                      </p>
                    </li>
                  ))}
                </ol>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
