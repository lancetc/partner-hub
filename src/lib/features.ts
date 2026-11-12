/*
  Features that can be switched off without deleting anything.

  Spaced learning (follow ups after a topic, their release and digest emails, and everything that
  mentions them to learners or in admin) is off. To bring it back, add this line to .env.local and
  restart the server:

    NEXT_PUBLIC_SPACED_LEARNING=on

  Saved schedules, follow ups and enrolments are kept while it's off, so it picks up where it was.
*/

export const spacedLearningOn = () => process.env.NEXT_PUBLIC_SPACED_LEARNING === "on";
