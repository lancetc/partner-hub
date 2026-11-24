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

## Ava 2.0: the transmission (22 November 2026)

Built from *Ava 2.0, AI Learning Guide*. One component, `components/ava/AvaTransmission.tsx` (styles in `ava.css`), shows Ava wherever she appears.

**The window.** A small broadcast monitor: navy frame, thin cyan border, a slim status bar (`AI` mark, "Ava · AI Learning Guide · Recorded", the state), a 16:9 screen, and a bottom bar with the waveform and a three-way **Transcript** toggle: **Off** (the default), **On screen**, **Full**. The screen's treatment is CSS over the picture, not a processed file: one cool blue (with some of the picture's own colour showing through), scanlines, grain, a vignette and a faint shimmer. A tall portrait still is set as a medium close-up (the face about half the screen), its sides fading into the navy.

**Arrival.** A Magazine course's videos for Ava come with the course itself (`avaForCourse`, added in `loadGuide`), so her window is there as the page appears, never a picture first that then gives way to her. Until it comes into view the window is on standby, dim. Then it flickers on like a set finding its power and, for two seconds, *Incoming transmission*: static, a scan line, a beacon calling out, the words typing in and a signal bar locking (*Locking signal*). It runs at least two seconds and on until her video's first frame has loaded (at most ten; a video set to start by itself loads during it), so the video never appears before it's ready; then the face comes through with one soft tear, *Ava · Transmission ready*. On a Magazine cover or page and at the top of a Path she starts by herself as the page opens; in a Topic card, only for someone with card audio on. Browsers allow sound by itself only once the page has been used (a click, a key), so before that, or when the learner has the Audio guide off, she starts muted with a **Turn sound on** button. People who ask for less motion start her themselves unless she can speak. Playing: *Transmitting*. Ended: *Transmission complete*; the picture folds to a line and goes, and play becomes Replay (Replay brings her back through with the tear). With less motion asked for, nothing flickers or folds.

**Her words.** The Transcript toggle starts at **Off**. **On screen**: while she speaks, about a dozen words around the one she's saying sit along the bottom of the screen, that word lit. **Full**: the whole script below the window, with the same word marked. The timings come from her voice where the Hub has them (narration it recorded, videos it made, an uploaded video timed by ElevenLabs forced alignment); otherwise the words are spread over the recording's length. A video uploaded without its script has no words to show until the script is saved.

**Fill in from the video.** An uploaded video's **Fill in from the video** button (in the Magazine editor's Ava's video, and in Ava's talking videos) has ElevenLabs' speech-to-text (Scribe) listen to the video and write out what she says, every word with its time, and saves that as the video's script. Her words on screen then follow her voice exactly, without the Forced alignment permission. It's a small paid call (priced by the minute of audio), made only when an author presses it, at most 20 an hour each, and it needs the **Speech to Text** permission on the Hub's ElevenLabs key; without it the button says so. Read the result through: a correction that keeps the same number of words (a spelling, punctuation) keeps every word's time when saved; a bigger change is timed again.

**The waveform** reads the real sound through the Web Audio API, but only for the Hub's own files: for a recording hosted elsewhere (the Synthesia presenter video) the browser keeps the sound private, and routing it through Web Audio would mute it, so the bars move gently while it plays and rest when it doesn't. Paused or ended, the bars settle.

**Where she appears.**

| Where | What plays | Script |
|---|---|---|
| Topics: a presenter card marked synthetic | Its recorded video if it has one, otherwise the card's transcript read in Ava's voice over her portrait | The card's transcript |
| Magazine: a guide segment set as **Transmission** | The checked video only (no change to the script-first rules). When it ends, it gives way to its poster | The approved script |
| Magazine: a course's cover, when its Audio Guide introduction is approved | The introduction read in Ava's voice (it replaces the inline Introduction player; the Audio guide switch stays). It plays each time the page opens. When it ends her last frame holds for 3 seconds, then she signs off (the screen folds to a line, then a point, and the window flickers out) and, after a two-second pause, the cover picture floats slowly up into place as it fades in over three seconds, and stays (she plays again the next time the page opens) | The approved introduction script |
| Discovery Paths: the top of a path's page | The path's description read in Ava's voice | The description |

Topic presenter cards in Synthesia's or YouTube's own player keep that player. The Magazine's Guide inset and Voice over context modes are unchanged.

**Identity.** The guide's defaults are now Ava: name *Ava*, avatar *ElevenLabs Avatars · Laura (rcbCmFkg00466hCegzsZ)*, voice *Alloy* from OpenAI (`openai:alloy`), the same voice as the Topics' narrator, so a Topic's introduction and its cards sound alike. It was ElevenLabs' *Charlotte* (`cvpTJfe9LINpHIOmB2Hp`) until November 2026. Change them in Admin → AI Learning Guide. Learners get her name and portrait from `/api/ava`; with no portrait set, the Topic presenter's still is used.

**Voice.** `server/ava.ts` resolves the voice: `AVA_VOICE_ID` if set, else the identity's voice as an ElevenLabs id, `openai:<voice>`, or a name looked up in the account's voices (exact name first, then one starting with it). Ava's lines (Topic presenter cards, path introductions) are spoken in it through `/api/tts`; everything else stays with the Hub's narrator. Narration is made once per script and voice and served from the disk cache after that.


**Ava's talking videos.** ElevenLabs' API can't play or render an avatar by its id (the Laura avatar lives only in their app), but it can make a talking video from a still and a recording (the Creatify Aurora model). So Admin → AI Learning Guide → **Ava's talking videos** lists every line Ava speaks (path introductions, Magazine course introductions with an approved script, and Topic presenter cards without a video of their own) and makes each one's video from Ava's portrait and her voice: a paid generation, a minute or two each, checked every ten seconds and copied into the Hub when done (the `ava_videos` table). Learners get a line's video only while its script, voice and portrait all still match; otherwise the portrait with her voice. Making videos needs the **Image & Video generation** permission on the ElevenLabs key; without it the button says so and nothing is charged. Set a still of Laura as the portrait first: until then the Topic presenter's still is used.

**Uploading a video made elsewhere.** Each line in Ava's talking videos also has **Upload a video** (MP4, WebM or MOV), for a transmission made in ElevenLabs with the Laura avatar, and **Copy the script** to paste its exact words there. An uploaded video has its own face and voice, so only its words have to match: if the script changes it's marked out of date and stops playing. It shows its own first frame, not Ava's portrait. **Remove the video** stops using it (the file stays in the library).

**Magazine pages.** Each page with an approved Audio Guide introduction is one of Ava's lines (`magazine:<guideId>:page:<pageId>`). When the page's line has a video, Ava plays it where the page's picture goes, then the picture takes over after the same 3-second hold and sign-off as the cover, and the page's audio-only introduction gives way to her. Pages without a video are unchanged.

**In the Magazine editor.** Each page's **Audio guide and Ava's video** strip (and the course introduction in the narration review) has **Ava's video**: add a video with what it says, replace it, or take it off. It's the same video as in Admin → AI Learning Guide. A video with its own words can go on a page that has no Audio guide script; the page then shows Ava first and the picture after. Without a video, the page keeps its Audio guide. A transmission whose words break off ends on **Signal lost** rather than Transmission complete.

**In the Path and Topic editors.** The same **Ava's video** panel (upload, her script, Fill in from the video, Save the script, Take it off) is in the Discovery Path editor, as **Ava's introduction** under About this path (the line `path:<id>`; it plays at the top of the path's page, and without it Ava reads "What it covers" over her portrait), and in the Topic editor on every Video (presenter) card (Change video → Ava's video; the line `lesson:<slug>:<card>`). Uploading her video there sets the card to Ava's window, in the video's shape: a portrait video gets a tall 9:16 screen sized to fit the card, a landscape one the usual wide screen. Without a video, an AI presenter card has Ava read the presenter script. A Topic card only saved as a draft (a card added since the Topic was published) can take a video too: the editor judges it against the draft's script, and learners get it once the published script matches (or straight away when the video has its own script).

### Not yet

- **Magazine page narration** (the Audio Guide on each page) is still recorded in the voice the course's author chose. The Contractor Induction's is OpenAI's Alloy; it changes only when the pages are recorded again in another voice and the course is published.

- **The voice** is set by its ElevenLabs id. Another voice can be named in Admin → AI Learning Guide by id or by its name in the account.
- **Laura herself**: export a still of the Laura avatar (in the style wanted) and set it as the portrait, and turn on the Image & Video permission for the key; then make the videos from the admin list. Different Laura styles per transmission would each need their own still.
- **Laura's 33 styles.** Choosing a style per transmission needs either the API above or a field on each segment to record which style its upload used; neither is built.
- **Show or hide Ava per path.** Every path with a description has the introduction; there's no per-path switch yet.
- **Ava in One Day, Five Perspectives** (`docs/one-day-five-perspectives.md`): the PRD lets her open Leila's day as a transmission. That isn't built. If it is, she stays outside Leila's knowledge: she sets the scene and never tells the learner a fact Leila hasn't been told.
