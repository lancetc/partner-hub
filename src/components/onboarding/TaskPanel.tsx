"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { OnboardingTask } from "@/content/onboarding";
import { commitHub, nowIso, type DocStatus, type HubState, type TaskState } from "@/lib/store";
import { formatBytes, formatDate, formatDateTime, cx } from "@/lib/format";
import { Icon } from "../Icon";

export function withTask(id: string, patch: Partial<TaskState>, event: { status: DocStatus; note?: string; actor: string }) {
  return (s: HubState): HubState => {
    const cur = s.onboarding.tasks[id] ?? { status: "not_started" as DocStatus, history: [] };
    return {
      ...s,
      onboarding: {
        ...s.onboarding,
        tasks: {
          ...s.onboarding.tasks,
          [id]: { ...cur, ...patch, status: event.status, history: [...cur.history, { ...event, at: nowIso() }] },
        },
      },
    };
  };
}

const primaryBtn =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-action px-6 font-semibold text-on-action hover:bg-action-hover disabled:opacity-45";
const secondaryBtn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-4 font-medium hover:bg-muted";

function SaveError({ text }: { text: string }) {
  return (
    <p role="alert" className="flex gap-2 rounded-2xl border border-danger/60 p-3 text-[0.95rem]">
      <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-danger" />
      {text}
    </p>
  );
}

export function TaskPanel({
  task,
  state,
  status,
  blocked,
}: {
  task: OnboardingTask;
  state?: TaskState;
  status: DocStatus;
  blocked?: { reason: string };
}) {
  if (blocked) {
    return (
      <p className="flex gap-2 rounded-2xl bg-muted p-4">
        <Icon name="lock" className="mt-0.5 size-5 shrink-0 text-ink-muted" />
        <span>{blocked.reason}</span>
      </p>
    );
  }
  switch (task.kind) {
    case "profile":
    case "organisation":
      return <FieldsForm task={task} state={state} />;
    case "agreement":
      return <AgreementForm task={task} status={status} />;
    case "learning":
      return (
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/learning/${task.lessonSlug}`} className={primaryBtn}>
            {status === "verified" ? "Review lesson" : status === "draft" ? "Keep learning" : "Start lesson"}
          </Link>
          <p className="text-sm text-ink-muted">Opens the lesson. Your onboarding updates when it’s complete.</p>
        </div>
      );
    case "document":
      return <DocumentForm task={task} state={state} status={status} />;
  }
}

function FieldsForm({ task, state }: { task: OnboardingTask; state?: TaskState }) {
  const [values, setValues] = useState<Record<string, string>>(state?.fields ?? {});
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const complete = task.fields!.every((f) => values[f.id]?.trim());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving("saving");
    try {
      await commitHub(withTask(task.id, { fields: values }, { status: complete ? "received" : "draft", actor: "You" }));
      setSaving("saved");
    } catch {
      setSaving("error");
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      {task.fields!.map((f) => (
        <div key={f.id} className="flex flex-col gap-1">
          <label htmlFor={`${task.id}-${f.id}`} className="font-medium">
            {f.label}
          </label>
          <input
            id={`${task.id}-${f.id}`}
            type={f.type ?? "text"}
            autoComplete={f.autoComplete}
            value={values[f.id] ?? ""}
            onChange={(e) => {
              setValues((v) => ({ ...v, [f.id]: e.target.value }));
              setSaving("idle");
            }}
            className="min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-[1.05rem]"
          />
        </div>
      ))}
      {saving === "error" && <SaveError text="We couldn’t save. Your details are still here. Please try again." />}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={primaryBtn} disabled={saving === "saving"}>
          {saving === "saving" ? "Saving…" : complete ? "Save details" : "Save draft"}
        </button>
        {saving === "saved" && (
          <span role="status" className="flex items-center gap-1 text-sm font-medium">
            <Icon name="check" className="size-4 text-accent" /> {complete ? "Saved" : "Draft saved. Add the remaining details when you can."}
          </span>
        )}
      </div>
    </form>
  );
}

function AgreementForm({ task, status }: { task: OnboardingTask; status: DocStatus }) {
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "error">("idle");
  if (status === "received") {
    return <p className="flex items-center gap-2"><Icon name="check" className="size-5 text-accent" /> You accepted this agreement.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-48 overflow-y-auto rounded-2xl border border-line p-4 text-[0.95rem] text-ink-muted" tabIndex={0} aria-label="Agreement summary">
        <p className="font-semibold text-ink">Service partner agreement (demonstration summary)</p>
        <p className="mt-2">This placeholder stands in for the real agreement, which Trilogy’s legal and partnerships teams must provide.</p>
        <p className="mt-2">It would cover how services are arranged and confirmed, how changes are agreed, invoicing, privacy and confidentiality, and how to raise concerns.</p>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="size-5 accent-[var(--action)]" />
        I’ve read the agreement and accept it on behalf of my business
      </label>
      {saving === "error" && <SaveError text="We couldn’t record your acceptance. Please try again." />}
      <button
        type="button"
        disabled={!agreed || saving === "saving"}
        className={cx(primaryBtn, "self-start")}
        onClick={async () => {
          setSaving("saving");
          try {
            await commitHub(withTask(task.id, {}, { status: "received", actor: "You", note: "Accepted agreement (demo version 1)" }));
          } catch {
            setSaving("error");
          }
        }}
      >
        {saving === "saving" ? "Recording…" : "Accept agreement"}
      </button>
    </div>
  );
}

function DocumentForm({ task, state, status }: { task: OnboardingTask; state?: TaskState; status: DocStatus }) {
  const [file, setFile] = useState<File | null>(null);
  const [expiry, setExpiry] = useState(state?.expiry ?? "");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"idle" | "uploading" | "error">("idle");
  const [replacing, setReplacing] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  const allowed = (task.accept ?? "").split(",");
  const canEdit = replacing || ["not_started", "draft", "action_required", "expired"].includes(status);

  function choose(f: File | undefined) {
    setError(null);
    if (!f) return;
    const ext = "." + (f.name.split(".").pop() ?? "").toLowerCase();
    if (allowed.length && !allowed.includes(ext) && !(f.type === "image/jpeg" && allowed.includes(".jpg"))) {
      setError(`That file type isn’t accepted. Use ${task.acceptLabel}.`);
      return;
    }
    if (task.maxMb && f.size > task.maxMb * 1024 * 1024) {
      setError(`That file is ${formatBytes(f.size)}. The limit is ${task.maxMb} MB.`);
      return;
    }
    setFile(f);
  }

  async function submit() {
    if (!file) return;
    setUploading("uploading");
    try {
      // Prototype: only the file name and size are kept. Real uploads go to protected storage
      // and must pass file safety checks before any reviewer can open them.
      await commitHub(
        withTask(
          task.id,
          { fileName: file.name, fileSize: file.size, expiry: expiry || undefined, reason: undefined },
          { status: "received", actor: "You", note: `Submitted ${file.name}` },
        ),
      );
      setFile(null);
      setReplacing(false);
      setUploading("idle");
    } catch {
      setUploading("error");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {status === "action_required" && state?.reason && (
        <div className="rounded-2xl border-2 border-danger/70 p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="alert" className="size-5 text-danger" /> What needs fixing
          </p>
          <p className="mt-1">{state.reason}</p>
        </div>
      )}

      {(status === "received" || status === "in_review") && !replacing && (
        <div className="rounded-2xl bg-muted p-4">
          <p className="font-semibold">{status === "received" ? "We have your file." : "We’re checking your file."}</p>
          <p className="mt-1">You can keep learning while we check it. We’ll let you know if anything needs changing.</p>
          {state?.fileName && (
            <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
              <Icon name="file" className="size-4" /> {state.fileName}
              {state.fileSize ? ` · ${formatBytes(state.fileSize)}` : ""}
            </p>
          )}
        </div>
      )}

      {status === "verified" && (
        <div className="rounded-2xl bg-tealtint p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="shield" className="size-5 text-accent" /> Verified
          </p>
          {state?.expiry && <p className="mt-1">Expires {formatDate(state.expiry)}. We’ll remind you before then.</p>}
        </div>
      )}

      {canEdit ? (
        <>
          <div className="flex flex-col gap-1 text-[0.95rem]">
            <p>
              <strong>Accepted:</strong> {task.acceptLabel}
            </p>
            <p className="text-ink-muted">Make sure your name, the policy or certificate number and dates are readable.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <input ref={pick} type="file" accept={task.accept} className="sr-only" tabIndex={-1} onChange={(e) => choose(e.target.files?.[0])} aria-hidden />
            <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => choose(e.target.files?.[0])} aria-hidden />
            <button type="button" className={secondaryBtn} onClick={() => pick.current?.click()}>
              <Icon name="upload" className="size-5" /> Choose a file
            </button>
            <button type="button" className={secondaryBtn} onClick={() => camera.current?.click()}>
              <Icon name="camera" className="size-5" /> Take a photo
            </button>
          </div>

          {error && <SaveError text={error} />}

          {file && (
            <p className="flex items-center gap-2 rounded-2xl border border-line p-3 text-[0.95rem]">
              <Icon name="file" className="size-5 shrink-0 text-accent" />
              <span className="flex-1 truncate">{file.name}</span>
              <span className="text-ink-muted">{formatBytes(file.size)}</span>
            </p>
          )}

          {task.hasExpiry && (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${task.id}-expiry`} className="font-medium">
                Expiry date <span className="font-normal text-ink-muted">(if shown on the document)</span>
              </label>
              <input
                id={`${task.id}-expiry`}
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="min-h-12 w-fit rounded-xl border border-line-strong bg-surface px-3"
              />
            </div>
          )}

          {uploading === "error" && <SaveError text="The upload didn’t finish, so we haven’t received your file. Your selection is still here. Try again." />}

          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryBtn} disabled={!file || uploading === "uploading"} onClick={submit}>
              {uploading === "uploading" ? "Uploading…" : uploading === "error" ? "Try again" : "Submit for review"}
            </button>
            {replacing && (
              <button type="button" className={secondaryBtn} onClick={() => setReplacing(false)}>
                Cancel
              </button>
            )}
          </div>
        </>
      ) : (
        <button type="button" className={cx(secondaryBtn, "self-start")} onClick={() => setReplacing(true)}>
          Replace file
        </button>
      )}

      {state && state.history.length > 0 && (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer content-center font-semibold text-accent">History</summary>
          <ol className="mt-1 flex flex-col gap-1 border-l-2 border-line pl-4">
            {[...state.history].reverse().map((h, i) => (
              <li key={i}>
                <span className="font-medium">{formatDateTime(h.at)}</span> · {h.actor}: {h.note ?? h.status.replace("_", " ")}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
