/*
  What the hub tells people, and how. A notification says something has happened; an action asks for
  a response. Everything appears in the in-app Inbox; email depends on the kind:

    Critical operational change   in-app + email, acknowledgement where required   always (can't be turned off)
    Mandatory training due        in-app + scheduled reminders                     always
    Webinar and event reminders   in-app + email before the event                  email optional
    New learning and news         weekly digest email                              email optional
    Community replies             in-app; email optional                           email optional
    Game achievements             in-app only                                      no email
  No push notifications.

  The optional email topics below are what people switch on or off. Each email the hub sends belongs to
  one of them (or is essential) and goes only to people who have it on.
*/

export const EMAIL_TOPICS = [
  {
    id: "announcements",
    label: "Announcements",
    description: "News from Trilogy Care about services, systems and the way we work together. (Critical changes always come.)",
    default: true,
  },
  {
    id: "policy",
    label: "Policy and practice updates",
    description: "When a rule, rate, form or process you use changes, and what to do differently.",
    default: true,
  },
  {
    id: "news",
    label: "Weekly digest: new learning and news",
    description: "One email a week with new topics, learning paths and stories, instead of one for each.",
    default: true,
  },
  {
    id: "newsletters",
    label: "Monthly update and quarterly newsletter",
    description: "A round-up on the first Tuesday of the month, and a longer newsletter each quarter.",
    default: true,
  },
  {
    id: "learning",
    label: "Learning reminders",
    description: "Follow ups that are ready and topics you’ve enrolled in. (Mandatory training reminders always come.)",
    default: true,
  },
  {
    id: "events",
    label: "Webinar and event reminders",
    description: "An email the day before a webinar or Community session you’re going to, and new recordings.",
    default: true,
  },
  {
    id: "community",
    label: "Community replies",
    description: "An email when someone replies to your post. You’ll always see replies in your Inbox.",
    default: false,
  },
] as const;

export type EmailTopic = (typeof EMAIL_TOPICS)[number]["id"];

/** Critical operational changes: sent to everyone in the audience whatever they've chosen, and may ask them to confirm they've read it. */
export const CRITICAL = "critical" as const;
export type SendTopic = EmailTopic | typeof CRITICAL;

export const isEmailTopic = (t: unknown): t is EmailTopic => EMAIL_TOPICS.some((x) => x.id === t);
export const isSendTopic = (t: unknown): t is SendTopic => t === CRITICAL || isEmailTopic(t);
export const topicLabel = (t: SendTopic) => (t === CRITICAL ? "Critical operational change" : EMAIL_TOPICS.find((x) => x.id === t)!.label);

/** Topics an admin can send a one-off email under (newsletters have their own kinds; reminders are automatic). */
export const SENDABLE_TOPICS: SendTopic[] = [CRITICAL, "announcements", "policy", "news", "events"];

/** What everyone always gets, whatever they choose: shown in settings, locked on. */
export const ESSENTIAL = [
  { id: "critical", label: "Critical operational changes", description: "In your Inbox and by email. Some ask you to confirm you’ve read them." },
  { id: "mandatory", label: "Mandatory training due", description: "In your Inbox, with reminders before it’s due or expires." },
] as const;

/** For people's settings: what's in-app only. */
export const IN_APP_ONLY = "Game achievements and Community activity appear in your Inbox only. The hub never sends push notifications.";

/** Kept for older callers: the one-line summary of essential emails. */
export const ESSENTIAL_EMAILS = "Critical operational changes and mandatory training due. These always come, so nothing important is missed.";

export type TopicSetting = { id: EmailTopic; label: string; description: string; on: boolean };
