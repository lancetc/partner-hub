/* How a course attempt's outcome reads to a learner. */

export type Outcome = "not_started" | "in_progress" | "completed" | "passed" | "failed";

export const outcomeText: Record<Outcome, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  passed: "Passed",
  failed: "Failed",
};

export const outcomeTone: Record<Outcome, string> = {
  not_started: "bg-muted text-ink",
  in_progress: "bg-[#e3eefb] text-[#1d4f91]",
  completed: "bg-[#e3f4f3] text-[#0f5b5b]",
  passed: "bg-[#dff3ea] text-[#0f5b3a]",
  failed: "bg-[#fbe3e1] text-[#a12d31]",
};

export const minutes = (secs: number) => (secs < 60 ? "under a minute" : `${Math.round(secs / 60)} min`);
