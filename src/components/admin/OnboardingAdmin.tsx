"use client";

import { AdminShell } from "./ui";
import { CoursesTab } from "./OnboardingCourses";

/*
  Onboarding, for the people who run it (docs/onboarding.md): the starting courses, set for each of the four roles under
  By role, with work-specific courses, people and reports beside them. The setup screens (review queue, progress,
  requirements and starting-point checks) aren't shown (the owner, Nov 2026); their code is kept for when setup
  requirements are released.
*/
export function OnboardingAdmin() {
  return (
    <AdminShell title="Onboarding">
      <CoursesTab />
    </AdminShell>
  );
}
