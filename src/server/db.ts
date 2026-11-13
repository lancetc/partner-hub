import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { seedFollowUps, seedPath, seedSequencePath, type PathStep } from "@/content/followups";
import { demoSurveys } from "@/content/surveys";
import { syncPublishedLessons } from "./lessonRegistry";
import { syncStories } from "./storyRegistry";

/*
  Local relational store for the prototype server (Node's built-in SQLite).
  Production would use the agreed managed database; the schema maps onto the records in
  the follow ups brief: path versions and steps, enrolments, step instances, attempts,
  notification outbox and audit events.
*/

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, timezone TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  role TEXT NOT NULL CHECK (role IN ('learner','org_admin','author')),
  audience TEXT NOT NULL CHECK (audience IN ('partner','coordinator','staff')),
  service_role TEXT, timezone TEXT
);
CREATE TABLE IF NOT EXISTS follow_ups (
  id TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL,
  content TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT,
  PRIMARY KEY (id, version)
);
CREATE TABLE IF NOT EXISTS paths (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL, created_by TEXT
);
CREATE TABLE IF NOT EXISTS path_versions (
  path_id TEXT NOT NULL REFERENCES paths(id), version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','in_review','published','superseded','withdrawn')),
  config TEXT NOT NULL, steps TEXT NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  submitted_by TEXT, published_at TEXT, published_by TEXT, withdrawn_reason TEXT,
  PRIMARY KEY (path_id, version)
);
CREATE TABLE IF NOT EXISTS lesson_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id),
  lesson_slug TEXT NOT NULL, lesson_version TEXT NOT NULL, completed_at TEXT NOT NULL,
  UNIQUE (user_id, lesson_slug, lesson_version)
);
CREATE TABLE IF NOT EXISTS enrolments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id), org_id TEXT NOT NULL REFERENCES orgs(id),
  path_id TEXT NOT NULL, path_version INTEGER NOT NULL,
  trigger_occurrence TEXT NOT NULL, anchor TEXT NOT NULL, timezone TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active','paused','completed','withdrawn')),
  paused_at TEXT, created_at TEXT NOT NULL,
  UNIQUE (user_id, path_id, path_version, trigger_occurrence)
);
CREATE TABLE IF NOT EXISTS step_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enrolment_id INTEGER NOT NULL REFERENCES enrolments(id),
  step_index INTEGER NOT NULL, step_key TEXT NOT NULL,
  follow_up_id TEXT NOT NULL, follow_up_version INTEGER NOT NULL,
  planned_release TEXT, released_at TEXT, notified_at TEXT, reminded_at TEXT,
  started_at TEXT, feedback_viewed_at TEXT, completed_at TEXT, cancelled_at TEXT,
  required INTEGER NOT NULL DEFAULT 0, due_at TEXT,
  progress TEXT,
  UNIQUE (enrolment_id, step_index)
);
CREATE INDEX IF NOT EXISTS release_queue ON step_instances (planned_release) WHERE released_at IS NULL AND cancelled_at IS NULL;
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  step_instance_id INTEGER NOT NULL UNIQUE REFERENCES step_instances(id),
  question_id TEXT NOT NULL, follow_up_version INTEGER NOT NULL, concept TEXT NOT NULL,
  initial_response TEXT NOT NULL, initial_correct INTEGER NOT NULL, initial_at TEXT NOT NULL,
  feedback_shown_at TEXT,
  corrected_response TEXT, corrected_correct INTEGER, corrected_at TEXT,
  assisted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL, channel TEXT NOT NULL, local_date TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  items TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','sending','accepted','delivered','failed','unknown','not_configured','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0, provider_ref TEXT, last_error TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (user_id, channel, local_date, kind)
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, event TEXT NOT NULL,
  entity TEXT NOT NULL, previous TEXT, next TEXT, reason TEXT, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lesson_settings (
  slug TEXT PRIMARY KEY, spaced INTEGER NOT NULL DEFAULT 0, path_id TEXT,
  updated_at TEXT, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS generated_lessons (
  slug TEXT PRIMARY KEY, master_slug TEXT NOT NULL, stage TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','approved')),
  content TEXT NOT NULL, model TEXT, created_at TEXT NOT NULL, created_by TEXT,
  approved_at TEXT, approved_by TEXT
);
CREATE TABLE IF NOT EXISTS learning_paths (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', audience TEXT NOT NULL DEFAULT '',
  in_order INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS learning_path_lessons (
  path_id TEXT NOT NULL REFERENCES learning_paths(id), position INTEGER NOT NULL, lesson_slug TEXT NOT NULL,
  PRIMARY KEY (path_id, position)
);
-- Chapters group a path's lessons (topics), like "01 Your Team". A stage is an optional heading over chapters.
CREATE TABLE IF NOT EXISTS learning_path_chapters (
  path_id TEXT NOT NULL REFERENCES learning_paths(id), id TEXT NOT NULL, position INTEGER NOT NULL,
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', stage TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (path_id, id)
);
CREATE TABLE IF NOT EXISTS learning_path_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path_id TEXT NOT NULL REFERENCES learning_paths(id), user_id TEXT NOT NULL REFERENCES users(id),
  due_date TEXT, assigned_by TEXT NOT NULL, assigned_at TEXT NOT NULL,
  UNIQUE (path_id, user_id)
);
-- Topics someone has enrolled in themselves, so they show on their Learning page and in reports.
CREATE TABLE IF NOT EXISTS topic_enrolments (
  user_id TEXT NOT NULL REFERENCES users(id), lesson_slug TEXT NOT NULL, enrolled_at TEXT NOT NULL,
  PRIMARY KEY (user_id, lesson_slug)
);
-- The compliance register: one row per topic on it, with its settings (JSON, see lib/complianceRegister).
CREATE TABLE IF NOT EXISTS compliance_register (
  lesson_slug TEXT PRIMARY KEY, settings TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
-- A pass of a path's upfront quiz that covers a register topic needing approval: the topic only
-- counts as complete once the competency owner approves it.
CREATE TABLE IF NOT EXISTS compliance_testouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id), lesson_slug TEXT NOT NULL, path_id TEXT NOT NULL, attempt_id INTEGER NOT NULL,
  score INTEGER NOT NULL, total INTEGER NOT NULL, lesson_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  requested_at TEXT NOT NULL, decided_by TEXT, decided_at TEXT, note TEXT NOT NULL DEFAULT '',
  UNIQUE (user_id, lesson_slug, attempt_id)
);
-- Reminders already queued for a register topic: each stage ("due", "expired") once per training cycle.
CREATE TABLE IF NOT EXISTS compliance_reminders (
  user_id TEXT NOT NULL REFERENCES users(id), lesson_slug TEXT NOT NULL, stage TEXT NOT NULL, expires_at TEXT NOT NULL, queued_at TEXT NOT NULL,
  PRIMARY KEY (user_id, lesson_slug, stage, expires_at)
);
-- Upfront quiz attempts: someone tests out of a learning path. Questions (JSON) are drawn from the
-- path's topic quick checks when the attempt starts; a cleared attempt (an admin allowed another try) no longer counts.
CREATE TABLE IF NOT EXISTS path_quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path_id TEXT NOT NULL REFERENCES learning_paths(id), user_id TEXT NOT NULL REFERENCES users(id),
  questions TEXT NOT NULL, answers TEXT, score INTEGER, total INTEGER NOT NULL, pass_mark INTEGER NOT NULL, passed INTEGER,
  started_at TEXT NOT NULL, submitted_at TEXT, cleared_at TEXT, cleared_by TEXT
);
CREATE TABLE IF NOT EXISTS surveys (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  anonymous INTEGER NOT NULL DEFAULT 1, required INTEGER NOT NULL DEFAULT 0,
  questions TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
-- Where a survey appears: when someone finishes a learning path, or a single lesson. One survey per place.
CREATE TABLE IF NOT EXISTS survey_links (
  survey_id TEXT NOT NULL REFERENCES surveys(id), target_type TEXT NOT NULL CHECK (target_type IN ('path','lesson')), target_id TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  PRIMARY KEY (target_type, target_id)
);
-- Who has answered or skipped, so nobody is asked twice. Kept apart from answers so anonymous answers stay anonymous.
CREATE TABLE IF NOT EXISTS survey_status (
  survey_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), target_type TEXT NOT NULL, target_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('submitted','skipped')), at TEXT NOT NULL,
  PRIMARY KEY (survey_id, user_id, target_type, target_id)
);
CREATE TABLE IF NOT EXISTS survey_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT, survey_id TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL,
  org_id TEXT NOT NULL, user_id TEXT, answers TEXT NOT NULL, submitted_at TEXT NOT NULL
);
-- A manager's confirmation that someone is applying a spaced lesson at work, after its last follow up.
CREATE TABLE IF NOT EXISTS signoffs (
  enrolment_id INTEGER PRIMARY KEY REFERENCES enrolments(id), user_id TEXT NOT NULL REFERENCES users(id),
  lesson_slug TEXT NOT NULL, outcome TEXT NOT NULL CHECK (outcome IN ('confirmed','support')), note TEXT NOT NULL DEFAULT '',
  decided_by TEXT NOT NULL, decided_at TEXT NOT NULL
);
-- Images authors upload for lesson cards. Files live in data/uploads and are served by /api/uploads.
CREATE TABLE IF NOT EXISTS uploads (
  filename TEXT PRIMARY KEY, original_name TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL,
  width INTEGER NOT NULL, height INTEGER NOT NULL, uploaded_by TEXT NOT NULL, uploaded_at TEXT NOT NULL
);
-- One vote per person per poll card. People can change their vote.
CREATE TABLE IF NOT EXISTS poll_votes (
  lesson_slug TEXT NOT NULL, card_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
  option_id TEXT NOT NULL, voted_at TEXT NOT NULL,
  PRIMARY KEY (lesson_slug, card_id, user_id)
);
-- Lessons written or edited in the lesson editor. draft is the latest save; published is what
-- learners see (null until first published). Lessons from the content files appear here once edited.
CREATE TABLE IF NOT EXISTS authored_lessons (
  slug TEXT PRIMARY KEY, draft TEXT NOT NULL, published TEXT,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT
);
-- Each topic's subject, for browsing the Learning page (kept apart from content, so no publish is needed).
CREATE TABLE IF NOT EXISTS topic_subjects (slug TEXT PRIMARY KEY, subject TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL);
-- News stories edited in admin. A row replaces the story of the same slug in the content file (or adds a new one).
-- status: draft (not shown) or published; deleted_at hides it.
CREATE TABLE IF NOT EXISTS authored_stories (
  slug TEXT PRIMARY KEY, data TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
  published_at TEXT, deleted_at TEXT
);
-- Comments on individual lesson cards (when the author turns them on for that card).
CREATE TABLE IF NOT EXISTS card_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_slug TEXT NOT NULL, card_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
  text TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  hidden_at TEXT, hidden_by TEXT, pinned_at TEXT, pinned_by TEXT
);
CREATE INDEX IF NOT EXISTS card_comments_card ON card_comments (lesson_slug, card_id);
-- Review links: a private link that lets someone outside the hub (a subject expert, say) read a
-- lesson's latest draft and comment on its cards. One active link per lesson; switching it off
-- stops it working for everyone.
CREATE TABLE IF NOT EXISTS review_links (
  token TEXT PRIMARY KEY, lesson_slug TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT, revoked_by TEXT
);
CREATE INDEX IF NOT EXISTS review_links_lesson ON review_links (lesson_slug);
-- A review link for a whole learning path: one address that lists the path's topics, each opening
-- through its own topic review link, so comments land with the topic.
CREATE TABLE IF NOT EXISTS path_review_links (
  token TEXT PRIMARY KEY, path_id TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT, revoked_by TEXT
);
CREATE INDEX IF NOT EXISTS path_review_links_path ON path_review_links (path_id);
-- A learning path anyone can open without signing in, e.g. from a QR code given to clients.
CREATE TABLE IF NOT EXISTS public_path_links (
  token TEXT PRIMARY KEY, path_id TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT, revoked_by TEXT
);
CREATE INDEX IF NOT EXISTS public_path_links_path ON public_path_links (path_id);
-- A single topic anyone can open without signing in, from its QR code (server/publicTopics).
CREATE TABLE IF NOT EXISTS public_topic_links (
  token TEXT PRIMARY KEY, lesson_slug TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT, revoked_by TEXT
);
CREATE INDEX IF NOT EXISTS public_topic_links_slug ON public_topic_links (lesson_slug);
-- Anonymous counts from a public topic link: opened, finished. Nothing about the person.
CREATE TABLE IF NOT EXISTS public_topic_events (token TEXT NOT NULL, lesson_slug TEXT NOT NULL, kind TEXT NOT NULL, at TEXT NOT NULL);
-- Anonymous counts from public links: opened, a topic finished, the whole path finished. Nothing about the person.
CREATE TABLE IF NOT EXISTS public_path_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, path_id TEXT NOT NULL, token TEXT NOT NULL,
  kind TEXT NOT NULL, lesson_slug TEXT, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS public_path_events_path ON public_path_events (path_id, kind);
-- People who joined a review with their name and email. id is a secret kept in their browser.
CREATE TABLE IF NOT EXISTS reviewers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT
);
-- Review comments on lesson cards, from reviewers or authors. A reply has a parent; resolving is
-- on the first comment of a thread. card_hash is the card as it was, to show when it has changed since.
CREATE TABLE IF NOT EXISTS review_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_slug TEXT NOT NULL, card_id TEXT NOT NULL, parent_id INTEGER REFERENCES review_comments(id),
  reviewer_id TEXT REFERENCES reviewers(id), user_id TEXT REFERENCES users(id),
  text TEXT NOT NULL, card_hash TEXT NOT NULL, card_heading TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, resolved_at TEXT, resolved_by TEXT, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS review_comments_lesson ON review_comments (lesson_slug);
-- AI presenter videos (ElevenLabs voice + portrait, lip-synced): the script they were made from,
-- the voice's word timings for captions, and the uploaded video.
CREATE TABLE IF NOT EXISTS avatar_videos (
  id TEXT PRIMARY KEY, lesson_slug TEXT NOT NULL, card_id TEXT NOT NULL, script_hash TEXT NOT NULL, script TEXT NOT NULL,
  portrait TEXT NOT NULL, captions TEXT, status TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  finished_at TEXT, video_src TEXT, error TEXT
);
-- AI pictures made through ElevenLabs: the prompt and settings, and the upload it became.
CREATE TABLE IF NOT EXISTS image_generations (
  id TEXT PRIMARY KEY, lesson_slug TEXT, model TEXT NOT NULL, prompt TEXT NOT NULL, settings TEXT NOT NULL,
  status TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, finished_at TEXT,
  upload_src TEXT, width INTEGER, height INTEGER, error TEXT
);
-- Lessons translated for people who read the hub in another language. One row per lesson and
-- language; source_hash ties it to the lesson text it was made from, so edits trigger a new one.
CREATE TABLE IF NOT EXISTS lesson_translations (
  slug TEXT NOT NULL, lang TEXT NOT NULL, source_hash TEXT NOT NULL,
  status TEXT NOT NULL, content TEXT, provider TEXT, error TEXT, updated_at TEXT NOT NULL,
  PRIMARY KEY (slug, lang)
);
-- Saves sent from a device's offline outbox carry a unique key. The first response is kept, so a
-- resend (after a dropped connection) gets the same answer instead of being recorded twice.
CREATE TABLE IF NOT EXISTS idempotency (
  key TEXT NOT NULL, user_id TEXT NOT NULL, status INTEGER NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (key, user_id)
);
-- Where each person is up to in each lesson, so progress follows them between devices.
CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id TEXT NOT NULL, slug TEXT NOT NULL, attempt TEXT NOT NULL, saved_at TEXT NOT NULL,
  PRIMARY KEY (user_id, slug)
);
-- Every published version of a lesson, kept so changes can be compared and rolled back.
CREATE TABLE IF NOT EXISTS lesson_versions (
  slug TEXT NOT NULL, version TEXT NOT NULL, content TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'minor', published_by TEXT NOT NULL, published_at TEXT NOT NULL,
  PRIMARY KEY (slug, version)
);
-- Shared facts (rates, dates, numbers) used in lesson text as {{key}}: change once, every lesson updates.
CREATE TABLE IF NOT EXISTS facts (
  key TEXT PRIMARY KEY, label TEXT NOT NULL, value TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
  source_title TEXT, source_url TEXT, owner TEXT NOT NULL DEFAULT '', check_by TEXT,
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);
-- Learners flagging something on a card that looks wrong or out of date.
CREATE TABLE IF NOT EXISTS content_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_slug TEXT NOT NULL, card_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
  text TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  resolved_by TEXT, resolved_at TEXT, resolution TEXT
);
-- Which content reminders have gone out, so each is sent once per stage.
CREATE TABLE IF NOT EXISTS content_reminders (
  item_key TEXT NOT NULL, stage TEXT NOT NULL, sent_at TEXT NOT NULL,
  PRIMARY KEY (item_key, stage)
);
-- Confidence ratings: one 1-5 star rating per person per rating card. People can change it.
CREATE TABLE IF NOT EXISTS rating_votes (
  lesson_slug TEXT NOT NULL, card_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5), rated_at TEXT NOT NULL,
  PRIMARY KEY (lesson_slug, card_id, user_id)
);
-- Insight walls: one post per person per wall card; others' posts show only after you post.
CREATE TABLE IF NOT EXISTS wall_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_slug TEXT NOT NULL, card_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
  text TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  hidden_at TEXT, hidden_by TEXT,
  UNIQUE (lesson_slug, card_id, user_id)
);
CREATE TABLE IF NOT EXISTS wall_likes (
  post_id INTEGER NOT NULL REFERENCES wall_posts(id), user_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (post_id, user_id)
);
-- Email campaigns (EDM): the monthly update and quarterly newsletter.
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('monthly','quarterly','one_off')),
  name TEXT NOT NULL, subject TEXT NOT NULL, preheader TEXT NOT NULL DEFAULT '',
  blocks TEXT NOT NULL, audience TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','scheduled','sending','sent','cancelled')),
  send_at TEXT, sent_at TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_deliveries (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id), user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL, provider_ref TEXT, error TEXT, at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, user_id)
);
-- Marketing email preferences. Everyone can unsubscribe from newsletters with one click.
CREATE TABLE IF NOT EXISTS email_prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id), token TEXT NOT NULL UNIQUE,
  newsletters INTEGER NOT NULL DEFAULT 1, changed_at TEXT
);
-- Recorded webinars, and who has watched them.
CREATE TABLE IF NOT EXISTS webinars (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', presenter TEXT NOT NULL DEFAULT '',
  recorded_on TEXT NOT NULL, minutes INTEGER NOT NULL DEFAULT 0, video TEXT NOT NULL, thumbnail TEXT,
  audience TEXT NOT NULL, topics TEXT NOT NULL, transcript TEXT NOT NULL DEFAULT '', resources TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','published')), created_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS webinar_views (
  webinar_id TEXT NOT NULL REFERENCES webinars(id), user_id TEXT NOT NULL REFERENCES users(id),
  watched_at TEXT NOT NULL, PRIMARY KEY (webinar_id, user_id)
);
-- Challenge Mode: multi-day competitions built from topics, one mission a day.
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, tagline TEXT NOT NULL DEFAULT '', story TEXT NOT NULL DEFAULT '',
  starts_on TEXT NOT NULL, unlock_time TEXT NOT NULL DEFAULT '08:00', reminder_time TEXT NOT NULL DEFAULT '15:00',
  timezone TEXT NOT NULL DEFAULT 'Australia/Brisbane', points TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','published')), archived INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT
);
CREATE TABLE IF NOT EXISTS challenge_missions (
  challenge_id TEXT NOT NULL REFERENCES challenges(id), day INTEGER NOT NULL, lesson_slug TEXT NOT NULL,
  beat TEXT NOT NULL DEFAULT '', PRIMARY KEY (challenge_id, day)
);
CREATE TABLE IF NOT EXISTS challenge_teams (
  challenge_id TEXT NOT NULL REFERENCES challenges(id), id TEXT NOT NULL, name TEXT NOT NULL, colour TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (challenge_id, id)
);
CREATE TABLE IF NOT EXISTS challenge_members (
  challenge_id TEXT NOT NULL REFERENCES challenges(id), user_id TEXT NOT NULL REFERENCES users(id), team_id TEXT NOT NULL,
  hide_name INTEGER NOT NULL DEFAULT 0, emails INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (challenge_id, user_id)
);
-- Each member's first answer to each decision and question, kept the first time it's saved.
CREATE TABLE IF NOT EXISTS challenge_answers (
  challenge_id TEXT NOT NULL REFERENCES challenges(id), user_id TEXT NOT NULL REFERENCES users(id), day INTEGER NOT NULL,
  key TEXT NOT NULL, right INTEGER NOT NULL, pick TEXT, at TEXT NOT NULL, PRIMARY KEY (challenge_id, user_id, key)
);
CREATE TABLE IF NOT EXISTS worker_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, clock TEXT NOT NULL,
  released INTEGER NOT NULL, digests INTEGER NOT NULL, dispatched INTEGER NOT NULL, note TEXT
);
-- A topic on its way to being published: in review, with changes asked for, waiting on Compliance,
-- or approved. draft_hash is the saved draft that was submitted (see server/topicApproval).
CREATE TABLE IF NOT EXISTS topic_approvals (
  slug TEXT PRIMARY KEY, stage TEXT NOT NULL CHECK (stage IN ('review','changes','compliance','approved')),
  draft_hash TEXT NOT NULL, reviewer_id TEXT NOT NULL REFERENCES users(id), compliance INTEGER NOT NULL DEFAULT 0,
  submitted_by TEXT NOT NULL REFERENCES users(id), submitted_at TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
);
-- Every step a topic took: submitted, changes asked for, approved, published, withdrawn.
CREATE TABLE IF NOT EXISTS topic_approval_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL REFERENCES users(id),
  note TEXT NOT NULL DEFAULT '', version TEXT, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS topic_approval_events_slug ON topic_approval_events (slug, at);
-- The in-app Inbox (server/notifications): actions to take, updates and activity. The source stops
-- the same thing being added twice (a campaign, a due date). Acknowledgements keep when and which version.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('action','update','activity')), category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('critical','high','normal')),
  title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', href TEXT, due_at TEXT,
  ack_required INTEGER NOT NULL DEFAULT 0, ack_version TEXT, source TEXT NOT NULL,
  created_at TEXT NOT NULL, read_at TEXT, acked_at TEXT, done_at TEXT,
  UNIQUE (user_id, source)
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications (user_id, created_at);
-- Which email topics each person gets (lib/emailTopics). No row means the topic's default.
CREATE TABLE IF NOT EXISTS email_topic_prefs (
  user_id TEXT NOT NULL REFERENCES users(id), topic TEXT NOT NULL, subscribed INTEGER NOT NULL, changed_at TEXT NOT NULL, via TEXT NOT NULL,
  PRIMARY KEY (user_id, topic)
);
-- A Care Conversations team session: the host moves through a shuffled deck and everyone who joins with
-- the code sees the same card (see server/conversationRooms).
CREATE TABLE IF NOT EXISTS conversation_rooms (
  code TEXT PRIMARY KEY, host_id TEXT NOT NULL REFERENCES users(id), theme TEXT NOT NULL, seed INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0, flipped INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, ended_at TEXT
);
`;

export const demoOrgs = [
  { id: "trilogy", name: "Trilogy Care", timezone: "Australia/Brisbane" },
  { id: "taylor-cleaning", name: "Taylor Cleaning (demo)", timezone: "Australia/Brisbane" },
  { id: "greenway-gardens", name: "Greenway Gardens (demo)", timezone: "Australia/Sydney" },
  { id: "northside-coord", name: "Northside Coordination (demo)", timezone: "Australia/Sydney" },
];

export const demoUsers = [
  {
    id: "sam",
    name: "Sam Taylor",
    email: "sam@example.test",
    org_id: "taylor-cleaning",
    role: "learner",
    audience: "partner",
    service_role: "cleaning",
    timezone: "Australia/Brisbane",
    label: "Cleaning partner · Brisbane",
  },
  {
    id: "ash",
    name: "Ash Nguyen",
    email: "ash@example.test",
    org_id: "greenway-gardens",
    role: "learner",
    audience: "partner",
    service_role: "gardening",
    timezone: "Australia/Sydney",
    label: "Gardening partner · Sydney",
  },
  {
    id: "riley",
    name: "Riley Morgan",
    email: "riley@example.test",
    org_id: "northside-coord",
    role: "learner",
    audience: "coordinator",
    service_role: "coordinator",
    timezone: null,
    label: "External coordinator · Sydney",
  },
  {
    id: "casey",
    name: "Casey Taylor",
    email: "casey@example.test",
    org_id: "taylor-cleaning",
    role: "org_admin",
    audience: "partner",
    service_role: null,
    timezone: "Australia/Brisbane",
    label: "Organisation administrator · Taylor Cleaning",
  },
  {
    id: "jordan",
    name: "Jordan Lee",
    email: "jordan@example.test",
    org_id: "trilogy",
    role: "author",
    audience: "staff",
    service_role: null,
    timezone: "Australia/Brisbane",
    label: "Learning author and Hub owner · Trilogy",
    review_role: "publisher",
    review_area: "Partner Hub",
  },
  // Trilogy staff who review topics before they're published (see server/topicApproval). They open
  // admin like authors do, so they can read the draft and comment on its cards.
  {
    id: "dana",
    name: "Dana Okafor",
    email: "dana@example.test",
    org_id: "trilogy",
    role: "author",
    audience: "staff",
    service_role: null,
    timezone: "Australia/Brisbane",
    label: "Subject-matter expert, clinical · Trilogy",
    review_role: "sme",
    review_area: "Clinical",
  },
  {
    id: "hamish",
    name: "Hamish Clarke",
    email: "hamish@example.test",
    org_id: "trilogy",
    role: "author",
    audience: "staff",
    service_role: null,
    timezone: "Australia/Sydney",
    label: "Subject-matter expert, care coordination · Trilogy",
    review_role: "sme",
    review_area: "Care coordination",
  },
  {
    id: "morgan",
    name: "Morgan Reid",
    email: "morgan@example.test",
    org_id: "trilogy",
    role: "author",
    audience: "staff",
    service_role: null,
    timezone: "Australia/Brisbane",
    label: "Compliance approver · Trilogy",
    review_role: "compliance",
    review_area: "Quality and Compliance",
  },
] as const;

/** Adds demo accounts that arrived after a database was first created, and keeps their approval roles current. */
export function seedStaff(db: Db) {
  for (const u of demoUsers) {
    db.prepare("INSERT OR IGNORE INTO users (id, name, email, org_id, role, audience, service_role, timezone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      u.id,
      u.name,
      u.email,
      u.org_id,
      u.role,
      u.audience,
      u.service_role,
      u.timezone,
    );
    if ("review_role" in u) db.prepare("UPDATE users SET review_role = ?, review_area = ? WHERE id = ?").run(u.review_role, u.review_area, u.id);
  }
}

export function migrate(db: Db) {
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  // Columns added after a table first shipped.
  const cols = (db.prepare("PRAGMA table_info(learning_paths)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("audience")) db.exec("ALTER TABLE learning_paths ADD COLUMN audience TEXT NOT NULL DEFAULT ''");
  // Testing paths: people on them can move on before audio or video finishes.
  if (!cols.includes("allow_skip")) db.exec("ALTER TABLE learning_paths ADD COLUMN allow_skip INTEGER NOT NULL DEFAULT 0");
  // The overview learners see: who it's for, what they'll be able to do (JSON list) and what they get at the end.
  if (!cols.includes("who_for")) db.exec("ALTER TABLE learning_paths ADD COLUMN who_for TEXT NOT NULL DEFAULT ''");
  if (!cols.includes("outcomes")) db.exec("ALTER TABLE learning_paths ADD COLUMN outcomes TEXT NOT NULL DEFAULT '[]'");
  if (!cols.includes("reward")) db.exec("ALTER TABLE learning_paths ADD COLUMN reward TEXT NOT NULL DEFAULT ''");
  if (!cols.includes("who_photo")) db.exec("ALTER TABLE learning_paths ADD COLUMN who_photo TEXT");
  // The upfront quiz (JSON settings: questions, pass mark, attempts); null when the path has none.
  if (!cols.includes("quiz")) db.exec("ALTER TABLE learning_paths ADD COLUMN quiz TEXT");
  const assignmentCols = (db.prepare("PRAGMA table_info(learning_path_assignments)").all() as { name: string }[]).map((c) => c.name);
  // 1 when the learner enrolled themselves; an administrator assigning them turns it into an assignment (0).
  if (!assignmentCols.includes("self")) db.exec("ALTER TABLE learning_path_assignments ADD COLUMN self INTEGER NOT NULL DEFAULT 0");
  const completionCols = (db.prepare("PRAGMA table_info(lesson_completions)").all() as { name: string }[]).map((c) => c.name);
  // How a topic was completed when it wasn't worked through, e.g. "path-quiz:lp-care-coordination" for passing a path's upfront quiz.
  if (!completionCols.includes("via")) db.exec("ALTER TABLE lesson_completions ADD COLUMN via TEXT");
  // First-try results and assessment scores when they finished (JSON), so a later attempt can't erase them.
  if (!completionCols.includes("evidence")) db.exec("ALTER TABLE lesson_completions ADD COLUMN evidence TEXT");
  const userCols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
  if (!userCols.includes("manager_id")) db.exec("ALTER TABLE users ADD COLUMN manager_id TEXT");
  // The language they read the hub in (Google Translate); null means English.
  if (!userCols.includes("language")) db.exec("ALTER TABLE users ADD COLUMN language TEXT");
  // Trilogy staff in the topic approval process: a subject-matter expert ("sme"), "compliance", or the "publisher" (Hub owner).
  if (!userCols.includes("review_role")) db.exec("ALTER TABLE users ADD COLUMN review_role TEXT");
  // What a reviewer knows about, shown when an author picks one: "Clinical", "Care coordination".
  if (!userCols.includes("review_area")) db.exec("ALTER TABLE users ADD COLUMN review_area TEXT");
  const settingCols = (db.prepare("PRAGMA table_info(lesson_settings)").all() as { name: string }[]).map((c) => c.name);
  const uploadCols = (db.prepare("PRAGMA table_info(uploads)").all() as { name: string }[]).map((c) => c.name);
  // Stock photos keep their photographer's credit (JSON).
  if (!uploadCols.includes("credit")) db.exec("ALTER TABLE uploads ADD COLUMN credit TEXT");
  // Deleted from the library: hidden there, but the file is kept so cards still using it keep working.
  if (!uploadCols.includes("deleted_at")) db.exec("ALTER TABLE uploads ADD COLUMN deleted_at TEXT");
  if (!uploadCols.includes("deleted_by")) db.exec("ALTER TABLE uploads ADD COLUMN deleted_by TEXT");
  // A picture converted to WebP points at its new file, so old addresses keep showing it.
  if (!uploadCols.includes("replaced_by")) db.exec("ALTER TABLE uploads ADD COLUMN replaced_by TEXT");
  const campaignCols = (db.prepare("PRAGMA table_info(campaigns)").all() as { name: string }[]).map((c) => c.name);
  // The email topic a campaign goes out under (lib/emailTopics): only people subscribed to it get it.
  if (!campaignCols.includes("topic")) db.exec("ALTER TABLE campaigns ADD COLUMN topic TEXT NOT NULL DEFAULT 'newsletters'");
  // Recipients are asked to confirm they've read it, in their Inbox (critical changes and policy updates).
  if (!campaignCols.includes("ack")) db.exec("ALTER TABLE campaigns ADD COLUMN ack INTEGER NOT NULL DEFAULT 0");
  const authoredCols = (db.prepare("PRAGMA table_info(authored_lessons)").all() as { name: string }[]).map((c) => c.name);
  // Deleted lessons are hidden everywhere but kept on record, so they can be restored.
  if (!authoredCols.includes("deleted_at")) db.exec("ALTER TABLE authored_lessons ADD COLUMN deleted_at TEXT");
  const pathLessonCols = (db.prepare("PRAGMA table_info(learning_path_lessons)").all() as { name: string }[]).map((c) => c.name);
  // Which chapter each lesson sits in; null for paths without chapters.
  if (!pathLessonCols.includes("chapter_id")) db.exec("ALTER TABLE learning_path_lessons ADD COLUMN chapter_id TEXT");
  if (!settingCols.includes("signoff")) db.exec("ALTER TABLE lesson_settings ADD COLUMN signoff INTEGER NOT NULL DEFAULT 0");
}

// Published versions pin the activity versions they use; short lessons are unversioned (0).
const pinSeedStep = (s: PathStep) => {
  const pin = (id: string) => (id.startsWith("lesson:") ? 0 : 1);
  return { ...s, pinned: { default: pin(s.followUpId), variants: Object.fromEntries(Object.entries(s.variants).map(([r, id]) => [r, pin(id)])) } };
};

export function seed(db: Db, now = new Date()) {
  const has = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (has.n > 0) return;
  const at = now.toISOString();
  db.exec("BEGIN");
  for (const o of demoOrgs) db.prepare("INSERT INTO orgs VALUES (?, ?, ?)").run(o.id, o.name, o.timezone);
  for (const u of demoUsers)
    db.prepare("INSERT INTO users (id, name, email, org_id, role, audience, service_role, timezone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      u.id,
      u.name,
      u.email,
      u.org_id,
      u.role,
      u.audience,
      u.service_role,
      u.timezone,
    );
  for (const f of seedFollowUps) db.prepare("INSERT INTO follow_ups VALUES (?, ?, ?, ?, ?, ?)").run(f.id, f.version, f.status, JSON.stringify(f), at, "seed");
  db.prepare("INSERT INTO paths VALUES (?, ?, ?)").run(seedPath.id, at, "seed");
  db.prepare(
    "INSERT INTO path_versions (path_id, version, status, config, steps, created_at, updated_at, published_at, published_by) VALUES (?, 1, 'published', ?, ?, ?, ?, ?, 'seed')",
  ).run(seedPath.id, JSON.stringify(seedPath.config), JSON.stringify(seedPath.steps.map(pinSeedStep)), at, at, at);
  db.exec("COMMIT");
}

/** Adds seeded paths that arrived after a database was first created. */
export function seedPaths(db: Db, now = new Date()) {
  // Which master lessons have spaced learning switched on, and the path that delivers it.
  for (const [slug, pathId] of [
    ["legislative-framework", "path-legislative-framework"],
    ["a-little-extra-time", "path-extra-time"],
  ] as const) {
    db.prepare("INSERT OR IGNORE INTO lesson_settings (slug, spaced, path_id, updated_at, updated_by) VALUES (?, 1, ?, ?, 'seed')").run(
      slug,
      pathId,
      now.toISOString(),
    );
  }
  // A little extra time moved from single-question follow ups to short lessons. Older databases get
  // the new sequence as a new published version; anyone already enrolled stays on their version.
  const extra = db.prepare("SELECT version, steps FROM path_versions WHERE path_id = ? AND status = 'published'").get(seedPath.id) as
    { version: number; steps: string } | undefined;
  if (extra && !extra.steps.includes("lesson:")) {
    const at = now.toISOString();
    const next = (db.prepare("SELECT MAX(version) v FROM path_versions WHERE path_id = ?").get(seedPath.id) as { v: number }).v + 1;
    db.prepare("UPDATE path_versions SET status = 'superseded' WHERE path_id = ? AND status = 'published'").run(seedPath.id);
    db.prepare(
      "INSERT INTO path_versions (path_id, version, status, config, steps, created_at, updated_at, published_at, published_by) VALUES (?, ?, 'published', ?, ?, ?, ?, ?, 'seed')",
    ).run(seedPath.id, next, JSON.stringify(seedPath.config), JSON.stringify(seedPath.steps.map(pinSeedStep)), at, at, at);
  }
  seedLearningPaths(db, now);
  seedManagers(db);
  seedSurveys(db, now);
  seedWall(db, now);
  seedComments(db, now);
  seedFacts(db, now);
  seedWebinars(db, now);
  for (const p of [seedSequencePath]) {
    const exists = db.prepare("SELECT 1 FROM paths WHERE id = ?").get(p.id);
    if (exists) continue;
    const at = now.toISOString();
    const pinned = p.steps.map((s) => ({ ...s, pinned: { default: 0, variants: {} } }));
    db.prepare("INSERT INTO paths VALUES (?, ?, ?)").run(p.id, at, "seed");
    db.prepare(
      "INSERT INTO path_versions (path_id, version, status, config, steps, created_at, updated_at, published_at, published_by) VALUES (?, 1, 'published', ?, ?, ?, ?, ?, 'seed')",
    ).run(p.id, JSON.stringify(p.config), JSON.stringify(pinned), at, at, at);
  }
}

export function openDb(file: string) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  migrate(db);
  seed(db);
  seedStaff(db);
  seedPaths(db);
  return db;
}

const globalForDb = globalThis as unknown as { __hubDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__hubDb) {
    globalForDb.__hubDb = openDb(process.env.HUB_DB_PATH ?? path.join(process.cwd(), "data", "hub.sqlite"));
  }
  // Lessons published from the editor replace (or join) the ones in the content files.
  syncPublishedLessons(globalForDb.__hubDb);
  // …and so do news stories edited in admin.
  syncStories(globalForDb.__hubDb);
  return globalForDb.__hubDb;
}

/** Runs `fn` inside BEGIN IMMEDIATE so concurrent workers serialise their claims. */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function audit(db: Db, e: { actor: string; event: string; entity: string; previous?: unknown; next?: unknown; reason?: string; at: Date }) {
  db.prepare("INSERT INTO audit (actor, event, entity, previous, next, reason, at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    e.actor,
    e.event,
    e.entity,
    e.previous === undefined ? null : JSON.stringify(e.previous),
    e.next === undefined ? null : JSON.stringify(e.next),
    e.reason ?? null,
    e.at.toISOString(),
  );
}

/* Demo learning paths: Trilogy Care's proposed pathways, as named sets of lessons in order. */
const demoLearningPaths: {
  id: string;
  name: string;
  audience: string;
  description: string;
  lessons: string[];
  assign: { user: string; due: string | null }[];
}[] = [
  {
    id: "lp-welcome",
    name: "Welcome to Trilogy Care",
    audience: "All staff and partners",
    description: "Mission and model, person-centred care, client journey, Statement of Rights, Code of Conduct, privacy and safeguarding.",
    lessons: ["our-mission-and-model", "legislative-framework"],
    assign: [
      { user: "sam", due: "2026-11-13" },
      { user: "ash", due: "2026-11-13" },
      { user: "riley", due: null },
    ],
  },
  {
    id: "lp-customer-service",
    name: "Customer Service & Enquiries",
    audience: "Customer Service Representatives",
    description: "First contact, My Aged Care referrals, explaining fees, eligibility, client conversations, managing objections and escalating concerns.",
    lessons: ["our-mission-and-model", "extra-time-briefing"],
    assign: [],
  },
  {
    id: "lp-care-coordination",
    name: "Care Coordination",
    audience: "Care Coordinators",
    description: "Care planning, client goals, budgets, service coordination, provider selection, incident reporting and managing changing care needs.",
    lessons: ["extra-time-briefing", "noticing-a-change"],
    assign: [{ user: "riley", due: "2026-12-12" }],
  },
  {
    id: "lp-partner-onboarding",
    name: "Partner Onboarding & Compliance",
    audience: "External service providers",
    description: "Application stages, required documentation, service expectations, invoicing, communication, safeguarding and maintaining compliance.",
    lessons: ["our-mission-and-model", "legislative-framework", "a-little-extra-time", "noticing-a-change"],
    assign: [
      { user: "sam", due: "2026-11-30" },
      { user: "ash", due: null },
    ],
  },
  {
    id: "lp-quality-safety",
    name: "Quality, Safety & Compliance",
    audience: "Role-dependent",
    description: "Aged Care Act 2024, strengthened Quality Standards, incident management, SIRS, complaints, risk identification and documentation.",
    lessons: ["legislative-framework", "noticing-a-change"],
    assign: [],
  },
  {
    id: "lp-leadership",
    name: "Leadership & Professional Development",
    audience: "Team leaders and managers",
    description: "Coaching, difficult conversations, quality monitoring, performance improvement, decision-making and continuous improvement.",
    lessons: [],
    assign: [],
  },
];
const LEARNING_PATHS_SEED = "2";

function seedLearningPaths(db: Db, now: Date) {
  const seeded = db.prepare("SELECT value FROM settings WHERE key = 'learning_paths_seed'").get() as { value: string } | undefined;
  if (seeded?.value === LEARNING_PATHS_SEED) return;
  const at = now.toISOString();
  // Replace the first demo paths with the proposed pathways. Paths people made themselves are left alone.
  for (const old of ["lp-partner-essentials", "lp-coordinator-induction"]) {
    db.prepare("DELETE FROM learning_path_assignments WHERE path_id = ?").run(old);
    db.prepare("DELETE FROM learning_path_lessons WHERE path_id = ?").run(old);
    db.prepare("DELETE FROM learning_paths WHERE id = ?").run(old);
  }
  for (const p of demoLearningPaths) {
    const added = db
      .prepare(
        "INSERT OR IGNORE INTO learning_paths (id, name, description, audience, in_order, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 'jordan', ?, ?)",
      )
      .run(p.id, p.name, p.description, p.audience, at, at);
    if (!added.changes) continue;
    p.lessons.forEach((slug, i) => db.prepare("INSERT INTO learning_path_lessons (path_id, position, lesson_slug) VALUES (?, ?, ?)").run(p.id, i, slug));
    for (const a of p.assign)
      db.prepare("INSERT INTO learning_path_assignments (path_id, user_id, due_date, assigned_by, assigned_at) VALUES (?, ?, ?, 'jordan', ?)").run(
        p.id,
        a.user,
        a.due,
        at,
      );
  }
  db.prepare("INSERT INTO settings (key, value) VALUES ('learning_paths_seed', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    LEARNING_PATHS_SEED,
  );
}

/* Demo surveys: a module feedback survey on two learning paths, and a short one on a single lesson. */
const SURVEYS_SEED = "1";
function seedSurveys(db: Db, now: Date) {
  const seeded = db.prepare("SELECT value FROM settings WHERE key = 'surveys_seed'").get() as { value: string } | undefined;
  if (seeded?.value === SURVEYS_SEED) return;
  const at = now.toISOString();
  for (const sv of demoSurveys) {
    db.prepare(
      "INSERT OR IGNORE INTO surveys (id, name, description, anonymous, required, questions, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'jordan', ?, ?)",
    ).run(sv.id, sv.name, sv.description, sv.anonymous ? 1 : 0, sv.required ? 1 : 0, JSON.stringify(sv.questions), at, at);
    for (const [type, id] of sv.links) db.prepare("INSERT OR IGNORE INTO survey_links VALUES (?, ?, ?, ?)").run(sv.id, type, id, at);
  }
  // Some earlier anonymous answers so the results page has something to show.
  const answers: [string, Record<string, unknown>, number][] = [
    ["taylor-cleaning", { useful: 5, clear: 4, confident: 4, apply: "Agree", better: "More examples from cleaning visits." }, 9],
    ["greenway-gardens", { useful: 4, clear: 4, confident: 3, apply: "Agree", better: "" }, 8],
    ["greenway-gardens", { useful: 5, clear: 5, confident: 5, apply: "Strongly agree", better: "Short and to the point. The narration helped." }, 7],
    ["northside-coord", { useful: 3, clear: 4, confident: 3, apply: "Neutral", better: "I'd like a printable summary of the five parts." }, 5],
    ["taylor-cleaning", { useful: 4, clear: 3, confident: 4, apply: "Agree", better: "The legislation card had a lot of reading." }, 3],
    ["northside-coord", { useful: 5, clear: 5, confident: 4, apply: "Strongly agree", better: "" }, 1],
  ];
  for (const [org, a, daysAgo] of answers)
    db.prepare(
      "INSERT INTO survey_responses (survey_id, target_type, target_id, org_id, user_id, answers, submitted_at) VALUES ('sv-module-feedback', 'path', 'lp-welcome', ?, NULL, ?, ?)",
    ).run(org, JSON.stringify(a), new Date(now.getTime() - daysAgo * 86400000).toISOString());
  db.prepare("INSERT INTO settings (key, value) VALUES ('surveys_seed', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(SURVEYS_SEED);
}

/*
  Demo managers. Casey manages Taylor Cleaning; partners from organisations without an
  administrator report to Jordan at Trilogy. Spaced lessons start with manager sign-off on.
*/
function seedManagers(db: Db) {
  const seeded = db.prepare("SELECT value FROM settings WHERE key = 'managers_seed'").get();
  if (seeded) return;
  for (const [user, manager] of [
    ["sam", "casey"],
    ["ash", "jordan"],
    ["riley", "jordan"],
  ])
    db.prepare("UPDATE users SET manager_id = ? WHERE id = ? AND manager_id IS NULL").run(manager, user);
  db.prepare("UPDATE lesson_settings SET signoff = 1 WHERE slug IN ('legislative-framework', 'a-little-extra-time')").run();
  db.prepare("INSERT INTO settings (key, value) VALUES ('managers_seed', '1')").run();
}

/* Demo insight wall posts on Legislative Framework, so Sam sees a wall waiting to open. */
function seedWall(db: Db, now: Date) {
  if (db.prepare("SELECT value FROM settings WHERE key = 'wall_seed'").get()) return;
  const posts: [string, string, number][] = [
    ["ash", "I ask what they’d like done first today and work around that. Some days the garden matters more than the lawn.", 6],
    ["riley", "Before a review I send the questions ahead, so clients have time to think about what they want rather than answering on the spot.", 3],
    ["jordan", "Offer two real options instead of asking “is this OK?”. People find it easier to choose than to object.", 1],
  ];
  for (const [user, text, daysAgo] of posts) {
    const at = new Date(now.getTime() - daysAgo * 86400000).toISOString();
    db.prepare(
      "INSERT OR IGNORE INTO wall_posts (lesson_slug, card_id, user_id, text, created_at, updated_at) VALUES ('legislative-framework', 'share', ?, ?, ?, ?)",
    ).run(user, text, at, at);
  }
  const first = db.prepare("SELECT id FROM wall_posts WHERE user_id = 'jordan' AND card_id = 'share'").get() as { id: number } | undefined;
  if (first) for (const u of ["ash", "riley"]) db.prepare("INSERT OR IGNORE INTO wall_likes VALUES (?, ?)").run(first.id, u);
  db.prepare("INSERT INTO settings (key, value) VALUES ('wall_seed', '1')").run();
}

/* The facts the demo lessons use as {{key}}. */
function seedFacts(db: Db, now: Date) {
  if (db.prepare("SELECT value FROM settings WHERE key = 'facts_seed'").get()) return;
  const facts = [
    {
      key: "aged_care_act_start",
      label: "Aged Care Act 2024 start date",
      value: "1 November 2025",
      notes: "When the new Act and Statement of Rights took effect.",
      source_title: "About the Aged Care Act (Department of Health)",
      source_url: "https://www.health.gov.au/our-work/aged-care-act/about",
      owner: "Quality and Compliance",
      check_by: "2027-01-31",
    },
    {
      key: "example_rate",
      label: "Example hourly rate (illustrative)",
      value: "$80",
      notes: "Used in worked examples. Not Trilogy pricing. Amounts worked out from it are written into cards, so check those too when it changes.",
      source_title: null,
      source_url: null,
      owner: "Learning and Development",
      check_by: "2026-11-15",
    },
    {
      key: "emergency_number",
      label: "Emergency number",
      value: "000",
      notes: "Police, fire and ambulance in Australia.",
      source_title: "Triple Zero",
      source_url: "https://www.triplezero.gov.au/",
      owner: "Quality and Compliance",
      check_by: null,
    },
  ];
  for (const f of facts)
    db.prepare(
      "INSERT OR IGNORE INTO facts (key, label, value, notes, source_title, source_url, owner, check_by, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed')",
    ).run(f.key, f.label, f.value, f.notes, f.source_title, f.source_url, f.owner, f.check_by, now.toISOString());
  db.prepare("INSERT INTO settings (key, value) VALUES ('facts_seed', '1')").run();
}

/* A few demo comments on the "Standards at a visit" card, including a pinned tip. */
function seedComments(db: Db, now: Date) {
  if (db.prepare("SELECT value FROM settings WHERE key = 'comments_seed'").get()) return;
  const comments: [string, string, number][] = [
    ["casey", "In older homes with no bathroom exhaust fan, don’t use bleach-based products. Open a window and use the client’s mild cleaner instead.", 5],
    ["ash", "I keep a spare pair of gloves in the car. Saves going without when one tears halfway through.", 3],
    ["riley", "If a client asks you to use their own products, check the label first and let me know if anything looks unsafe.", 1],
  ];
  for (const [user, text, daysAgo] of comments) {
    const at = new Date(now.getTime() - daysAgo * 86400000).toISOString();
    db.prepare(
      "INSERT INTO card_comments (lesson_slug, card_id, user_id, text, created_at, updated_at) VALUES ('legislative-framework', 'kit', ?, ?, ?, ?)",
    ).run(user, text, at, at);
  }
  db.prepare("UPDATE card_comments SET pinned_at = ?, pinned_by = 'jordan' WHERE user_id = 'casey' AND card_id = 'kit'").run(now.toISOString());
  db.prepare("INSERT INTO settings (key, value) VALUES ('comments_seed', '1')").run();
}

/* Two demo webinar recordings, so the Webinars page and newsletters have something to show. */
export const demoWebinars = [
  {
    id: "w-support-at-home",
    title: "Support at Home: what changes for partners (demo recording)",
    summary: "A walk through the Support at Home changes and what they mean for visits, invoicing and talking with clients.",
    presenter: "Ava, Trilogy Care (synthetic presenter)",
    recorded_on: "2026-10-14",
    minutes: 42,
    topics: ["Support at Home", "Invoicing"],
    audience: ["partner", "coordinator"],
    resources: [{ title: "About the Aged Care Act", url: "https://www.health.gov.au/our-work/aged-care-act" }],
    transcript: "This is a demonstration webinar. The recording is a short sample presenter clip standing in for a full session.",
  },
  {
    id: "w-confirming-changes",
    title: "Confirming changes to a visit: Q&A (demo recording)",
    summary: "Partners’ questions about extra time, swapped tasks and family requests, answered by the coordination team.",
    presenter: "Coordination team (demo)",
    recorded_on: "2026-09-02",
    minutes: 35,
    topics: ["Changes to services"],
    audience: ["partner"],
    resources: [],
    transcript: "This is a demonstration webinar. The recording is a short sample presenter clip standing in for a full session.",
  },
];

function seedWebinars(db: Db, now: Date) {
  if (db.prepare("SELECT value FROM settings WHERE key = 'webinar_seed'").get()) return;
  for (const w of demoWebinars)
    db.prepare(
      "INSERT OR IGNORE INTO webinars (id, title, summary, presenter, recorded_on, minutes, video, thumbnail, audience, topics, transcript, resources, status, created_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 'jordan', ?)",
    ).run(
      w.id,
      w.title,
      w.summary,
      w.presenter,
      w.recorded_on,
      w.minutes,
      JSON.stringify({ provider: "synthesia", id: "d17ebdc9-8f64-4630-ad37-24747e308796", orientation: "landscape" }),
      "/images/presenter-intro.jpg",
      JSON.stringify(w.audience),
      JSON.stringify(w.topics),
      w.transcript,
      JSON.stringify(w.resources),
      now.toISOString(),
    );
  db.prepare("INSERT INTO settings (key, value) VALUES ('webinar_seed', '1')").run();
}
