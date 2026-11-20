# AI Learning Guide

Built from the PRD *AI Learning Guide* (19 November 2026). This note records how v1 works, the decisions made, and what is left. Admin → Content → **AI Learning Guide**; in the Magazine editor, **Add block → Content → AI Learning Guide**.

## What it is

One recognisable, openly AI-generated guide who appears at purposeful moments. Every appearance is a **recorded, scripted** asset: the script is the content that's written, reviewed and approved; the video or audio is rendered from it (in ElevenLabs, for v1) and uploaded. The guide presents approved learning. It is not a tutor, and nothing about it looks live: no typing dots, no "online", no microphone.

## What the Hub already had

- **Topic presenter cards**: an AI presenter with a portrait, lip-synced video and captions timed to the voice, generated through `server/avatar.ts`. These now carry the same label, **AI Learning Guide · Recorded**. Their behaviour is unchanged (see "Not yet" below).
- The Magazine **video block** (upload, captions, transcript, poster) and the upload pipeline (MP4, MP3, WebVTT), which the guide block reuses.

## The Magazine block

| Mode | Use | Media |
|---|---|---|
| **Transmission** | A course opening or major case setup | Video in the full frame |
| **Guide inset** | A short explanation or feedback beside its point | A smaller video with its screen text |
| **Voice over context** | Detail-heavy pages where the picture or document matters more | Audio over a picture; no face |

Each segment has a teaching purpose (set the scene, direct attention, ask a question, explain a consequence, bridge), one line of screen text, an optional frame label ("Case 03"), an owner, a source, and an optional real review ("Content reviewed by … · date", shown only when entered).

**Script first.** Draft → Script approved → Media ready → Media checked → Published.

1. Write the script, or **Draft with AI** from the page (it uses only the page, and never first-hand claims). **Approve the script.**
2. Upload the video or audio rendered from the approved script, with a captions file (.vtt) and a poster for video.
3. Watch it through against the script and **mark it checked**.

Change the script and both the approval and the recording fall away: the recording is "out of date" until it's made again. Spacing alone isn't a change.

**Publishing** is held up by an unapproved script, missing or out-of-date media, an unchecked recording, a video without captions, or Voice over context without its picture. Long segments, first-hand wording, a missing source or owner, and a missing poster are suggestions.

## What learners get

- The **Warm Signal** frame: navy panel, teal signal line, a small waveform that moves only while audio plays, real-text labels. The entry effect and waveform stop for reduced motion.
- **AI Learning Guide · Recorded** (or **AI narration · Recorded**) on every presentation, with the guide's name beside it. The first time, an introduction: *Meet {name}, your AI learning guide. These are recorded, scripted lessons reviewed by Trilogy Care.*
- A poster and one play control. **Never autoplay.** Nothing loads until play is pressed. Replay, speed, captions on/off, **Read the script**, and a "Show me the script first" preference (kept on the device).
- A guide segment set as **feedback on a decision** stays hidden until the learner has answered it.
- **A learner only gets a recording that matches the approved script, has been checked, and isn't withdrawn.** Otherwise, and if the file fails to play, they get the script as text, so the page always works. This holds even when a course is published with "Publish anyway".
- Playing a recording finishes nothing: it isn't an activity, and its events (`guide.started`, `.paused`, `.completed`, `.transcript`, `.read_first`, `.source`) are analytics only.

## Identity and review

- **One identity for the Hub** (Admin → AI Learning Guide): approved name, introduction (must say it's AI), portrait, the avatar and voice references, and the rights and provenance record. Only a Hub administrator changes it. Learners are sent the name, introduction and portrait only.
- **Everywhere the guide is used**: every segment in every Magazine course, live and draft, with its state, owner, source and whether learners have the recording now.
- **Withdraw a recording**: takes effect at once in every course that uses it, without republishing; learners see the script as text. The published record isn't rewritten, and the withdrawal (who, when, why) is kept and audited.

## Not yet

- **Topic cards**: presenter cards take the label only. The three modes, script approval and media checks are not in the Topic editor, and Topic presenter videos still start by themselves when a learner has audio on (existing behaviour, by their own setting).
- **Server-side generation** for the Magazine block (the PRD's v1 is export-and-upload). `server/avatar.ts` could be adapted later.
- **Asset access by audience**: uploads are served to any signed-in user who has the link; a recording isn't restricted to its course's audience.
- A **Hub-wide preference** stored with the account (it's per device), a pronunciation dictionary, automated draft captions.
- The **interactive tutor**: out of scope by design.
- The **pilot comparison** (Transmission, Voice over context, a real presenter or text-first) is a study to run, not software.

## Not verified here

- Real video playback: no genuine video file was available in the test uploads (the test files were placeholders). The failure path (message plus script), posters, controls, captions track and audio playback were checked.
- **Draft with AI** needs Claude or OpenAI connected; it was not run in the browser.
