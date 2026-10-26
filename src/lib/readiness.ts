import { onboardingTasks, type OnboardingTask } from "@/content/onboarding";
import type { DocStatus, HubState } from "./store";

/*
  Explainable readiness (PRD section 9). In production this is calculated on the server from
  the confirmed requirement matrix; the client calculation here is for the prototype only.
*/

export type Owner = "you" | "us" | "done";
export type ReadinessState = "setup" | "checks" | "action" | "ready";

export const readinessLabel: Record<ReadinessState, string> = {
  setup: "Setup in progress",
  checks: "Checks in progress",
  action: "Action needed",
  ready: "Ready to deliver services",
};

export function applicableTasks(hub: HubState) {
  return onboardingTasks.filter((t) => {
    if (!t.appliesTo?.services) return true;
    return t.appliesTo.services.some((s) => hub.onboarding.services.includes(s));
  });
}

export function taskStatus(task: OnboardingTask, hub: HubState): DocStatus {
  if (task.kind === "learning" && task.lessonSlug) {
    const attempt = hub.lessons[task.lessonSlug];
    return attempt?.status === "completed" ? "verified" : attempt ? "draft" : "not_started";
  }
  return hub.onboarding.tasks[task.id]?.status ?? "not_started";
}

/** Who holds the next action. A task waiting on a reviewer is never counted as the applicant's work. */
export function taskOwner(task: OnboardingTask, status: DocStatus): Owner {
  if (status === "verified" || status === "not_required") return "done";
  if (task.kind !== "document") return status === "received" ? "done" : "you";
  if (status === "received" || status === "in_review") return "us";
  return "you";
}

export function blockedBy(task: OnboardingTask, hub: HubState) {
  if (!task.dependsOn) return undefined;
  const dep = onboardingTasks.find((t) => t.id === task.dependsOn!.id)!;
  return taskOwner(dep, taskStatus(dep, hub)) === "done" ? undefined : task.dependsOn;
}

export function computeReadiness(hub: HubState) {
  const tasks = applicableTasks(hub);
  const rows = tasks.map((t) => {
    const status = taskStatus(t, hub);
    return { task: t, status, owner: taskOwner(t, status) };
  });
  const required = rows.filter((r) => r.task.requiredForReadiness);
  const needsFix = required.filter((r) => r.status === "action_required" || r.status === "expired");
  const withYou = required.filter((r) => r.owner === "you");
  const withUs = required.filter((r) => r.owner === "us");

  let state: ReadinessState = "ready";
  if (needsFix.length) state = "action";
  else if (withYou.length) state = "setup";
  else if (withUs.length) state = "checks";

  return {
    state,
    label: readinessLabel[state],
    rows,
    requiredCount: required.length,
    doneCount: required.filter((r) => r.owner === "done").length,
    remainingForYou: withYou.length,
    waitingOnUs: withUs.length,
    needsFix,
  };
}
