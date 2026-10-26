import type { DocStatus } from "@/lib/store";
import type { OnboardingTask } from "@/content/onboarding";
import { Icon, type IconName } from "../Icon";
import { cx } from "@/lib/format";

type Look = { text: string; icon: IconName; className: string };

const docLook: Record<DocStatus, Look> = {
  not_started: { text: "Not started", icon: "plus", className: "border-line-strong text-ink-muted" },
  draft: { text: "Draft", icon: "doc", className: "border-line-strong text-ink" },
  received: { text: "Received", icon: "check", className: "border-navy-medium/40 bg-muted text-ink dark:border-line-strong" },
  in_review: { text: "In review", icon: "clock", className: "border-gold bg-gold/15 text-ink" },
  action_required: { text: "Action required", icon: "alert", className: "border-danger bg-danger/10 text-ink" },
  verified: { text: "Verified", icon: "shield", className: "border-action bg-tealtint text-ink" },
  expired: { text: "Expired", icon: "alert", className: "border-danger bg-danger/10 text-ink" },
  not_required: { text: "Not required", icon: "minus", className: "border-line text-ink-muted" },
};

export function statusLook(task: OnboardingTask, status: DocStatus): Look {
  if (task.kind === "document") return docLook[status];
  if (task.kind === "learning") {
    if (status === "verified") return { text: "Completed", icon: "check", className: docLook.verified.className };
    if (status === "draft") return { text: "In progress", icon: "play", className: docLook.draft.className };
    return docLook.not_started;
  }
  if (status === "received") {
    return { text: task.kind === "agreement" ? "Accepted" : "Saved", icon: "check", className: docLook.verified.className };
  }
  return docLook[status];
}

export function StatusPill({ task, status }: { task: OnboardingTask; status: DocStatus }) {
  const look = statusLook(task, status);
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mulish text-xs font-bold", look.className)}>
      <Icon name={look.icon} className="size-3.5" />
      {look.text}
    </span>
  );
}
