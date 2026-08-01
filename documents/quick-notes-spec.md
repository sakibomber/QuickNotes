# QUICK NOTES — Build Spec for Tom
**From:** Kyle + chat-Claude · 2026-07-31
**Goal:** Zero-friction voice capture → bucket triage → read-as-script. Replaces EasyNotes. Free, ours, unbreakable by ad-model churn.

---

## 1. The one rule that governs everything
**Capture must cost less than the thought is worth.** Kyle's working memory cannot hold "tell the doc about X" across days. Any friction between thought and record = lost thought. Every design decision defers to this. If a feature adds a tap to the capture path, cut the feature.

Second rule: **capture and triage are separate modes.** Capture must be executable by cognitively-impaired-Kyle (bad pain days). Triage/organizing happens later, in a good hour. Never make the capture moment do any organizing.

## 2. Platform & stack
- Android target device: **Samsung S23 Ultra** (no Google Recorder — Pixel-only; we bring our own transcription)
- **PWA**: React + Vite + Tailwind (house stack, same as ATELIER / recipe app)
- Installable; offline-first; no accounts, no backend for v1. All data local: **IndexedDB** (audio blobs + note records + settings). localStorage is not enough — audio blobs need IDB.
- No ads, no paywall, obviously. This app exists because the last one grew both.

## 3. Entry points (the two-icon architecture)
1. **Main app icon** → opens **Inbox** (triage-first — Kyle's call: "you just do it and it is done"). Buckets one tap away.
2. **"Record" shortcut** → declared in `manifest.json` `shortcuts[]`, deep-links to `/record`. Kyle long-presses the installed icon and drags "Record" out as its own home-screen icon. Result: dedicated record button separate from the app, per spec.

### Navigation & theming (locked with Kyle 7/31, after mockup review)
- Bottom nav, 4 tabs: **Inbox (badge) · Buckets · Search · Settings**. Record is its own full-screen route reached via the shortcut icon (and a visible Record button inside the app).
- **Themes: dark primary** (ink/olive), **light = sepia "book" mode** (the field-paper look). One design family across both — ruled-paper note cards, stamped labels, the filing stamp moment.
- **Buckets get a color + simple icon** (picked at creation/edit) — recognition speed for a 9-target grid.
- **Filing = swipe OR tap**, both supported.
- **Search**: full-text across notes; filters for bucket, date, has-audio, open/done. Archives are clinical history — search is not optional.
- **No "Saving…" interstitial screen.** Save is instant + toast. Nothing stands between stop-and-save and pocketing the phone.
- **No hidden ⋮ menus.** Every action visible and big. Triage stays one-note-at-a-time as primary (optional list toggle).
- Audio retention is a setting: **until-filed (default) / always keep / ask each time**, plus per-note override.
- Tagline: **Capture. File. Remember.**

### Prototype-tested findings (7/31, fold into build)
- **Nav bar always visible** — app locked to viewport height, content scrolls internally. Never let nav scroll away.
- **Triage swipe surface = the whole screen**, not just the card. Known trap: an editable textarea captures pointer drag for text selection and kills the gesture — so the note renders as static text, with **edit behind a pencil toggle** ("Done editing" to exit; swipe disabled while editing).
- Swipe right → full-screen bucket picker sheet; swipe left → trash (with stamp). Tap grid remains below as the equal path.

### /record route behavior
- On load: attempt `getUserMedia` + start MediaRecorder **immediately** (permission persists after first grant on installed Android PWAs — test this on the S23; Samsung Internet vs Chrome may differ, target Chrome).
- If autostart is blocked by gesture policy: fall back to a **single full-screen button** ("TAP = RECORD" — the entire viewport is the button). One tap max, ever.
- While recording: big timer, live transcript streaming below it (reassurance it's working), one full-screen-width **STOP & SAVE** button. Closing the app/tab also saves (flush on `visibilitychange`) — never lose a capture to a distracted exit.
- On save: note goes to **Inbox** (bucket = Temp/unsorted) with timestamp, audio blob, transcript. No title prompt. No bucket prompt. Nothing.

## 4. Transcription
- **v1:** Web Speech API (`SpeechRecognition`), continuous mode, running live during capture. On Android this rides the on-device Google speech engine. Free, no keys.
- **Architecture requirement:** wrap it in a single swappable interface, e.g. `transcribe(audio|stream) → text`, so if Web Speech ever degrades we point the function at Whisper API (or local whisper.cpp/wasm) and nothing else changes. Kyle explicitly asked about breakage risk — this is the answer.
- Transcripts are **known-imperfect**. Which is why:

## 5. Audio retained until filed (audit requirement)
- Every note keeps its **raw audio attached until the note is filed** (moved out of Inbox into a bucket during triage).
- In triage view: play button next to the transcript so Kyle can audit voice-to-text, fix the text inline if garbled.
- On filing: default **drop the audio**, keep the corrected text (storage hygiene). Setting to override per-note ("keep audio").
- A mangled note that can't be audited is worse than no note — it's a false memory with a timestamp. This feature is not optional.

## 6. Buckets
Starting set (Kyle's list): **Temp, Reminders, Doc, Wife, Kid, Todo, Grocery, Notes, Thoughts** (+ system Trash).
- Buckets are **user-editable**: add, rename, delete, reorder. Not hardcoded.
- Each bucket has a **type** that controls rendering:
  - **script** — read-down list for calls/appointments (Doc, Wife, Kid, Reminders, Notes, Thoughts). Check items as covered; checked items visually done but retained.
  - **checklist** — live working list (Grocery, Todo). Tap to cross off, crossed items sink to bottom, "Clear completed" action.
  - Type is a bucket setting; new buckets pick one on creation.
- **Done behavior:** default **archive** (searchable history — feeds clinical docs later). Per-item and per-bucket **delete** option. Kyle keeps most things; Grocery/Todo are the disposable ones.

## 7. Triage mode (Inbox)
- One note at a time, card UI: transcript (editable), audio play button, timestamp.
- Big swipe/tap targets: one per bucket + Trash. Filing = one gesture.
- Fast, low-load, slightly game-like on purpose. Order: oldest first.
- Inbox badge count on the main icon view so unfiled notes are visible.

## 8. Grocery mode extras
- **Predictive text from his own history**: every item ever filed to Grocery builds a local autocomplete dictionary ranked by frequency + recency. Type "mi" → "milk". No external service.
- Voice-captured grocery notes: on filing to Grocery, offer a **split** — break the transcript on commas/"and"/newlines into individual checklist items (confirm screen, not automatic).
- Future flag, do not build yet: possible merge/feed with the recipe app's AnyList grocery output. Keep the grocery item model simple (`{text, checked, count?}`) so that integration doesn't require a migration.

## 9. Export & backup
- Per-bucket **"Copy as text"** button: dumps the bucket (active + optionally archived) as plain text to clipboard. Use case: paste Doc bucket into a chat with Claude before an appointment; dump Thoughts into a project doc.
- **"Email to myself"**: per-bucket and full-backup. Implementation: `navigator.share()` (Web Share API — native Android share sheet, Kyle picks Gmail) with `mailto:` fallback for text-only. Full backup shares the JSON file via share sheet.
- **Full backup = readable JSON**: pretty-printed, human-legible field names, notes grouped by bucket. Kyle's requirement: he must be able to open it and read it, not just restore it. Include an **import/restore** from that same JSON (cheap, and required once other vets have data they care about).

## 10. Data model (suggested)
```
Note {
  id, createdAt,
  transcript: string,        // editable
  audioBlobId?: string,      // present until filed (or kept by override)
  bucketId: string,          // 'inbox' initially
  filedAt?: number,
  checked: boolean,          // script/checklist state
  archived: boolean,
  audioKept: boolean
}
Bucket {
  id, name, type: 'script'|'checklist',
  order: number, deletable: boolean   // Temp/Trash system-ish
}
GroceryDict { term, count, lastUsed }
```

## 11. Non-goals for v1
No accounts, no sync, no backup (flag: IDB is device-local — a manual "export all as JSON" button is cheap insurance and worth including), no reminders/notifications, no EasyNotes import (Kyle migrates by hand — his old notes are mostly stale anyway; confirm with him), no widgets/native wrapper (v2 escalation if the shortcut-icon path isn't fast enough in practice).

## 12. Distribution & accessibility (this changed the bar)
Kyle intends to hand this to his speech clinician to distribute **free to other veterans**. That means the UI is not just for him — it's for TBI/cognitively-loaded users generally. Requirements:
- **Big targets everywhere.** Minimum ~56px touch targets; primary actions are huge. Fat-finger and tremor tolerant.
- **One decision per screen.** Never present two questions at once. Capture screen has zero decisions.
- **High contrast, large default type, no dense text.** Labels are 1-3 words. No settings maze — settings fit on one screen.
- **Zero onboarding required.** The app must be self-evident on first open: a first-run inbox note (pre-seeded example) that teaches by being triaged.
- **Polish matters.** This will be judged by clinicians. Smooth transitions, consistent spacing, it should feel like a product, not a project. Follow house frontend-design standards.
- Free forever, no telemetry, no accounts. It should be shareable as "install this from a link."

## 13. Acceptance test (the only one that matters)
Kyle, mid-task in the garage, thinks "tell the doc about the shoulder thing":
phone → tap Record icon → talking within ~2 seconds → pockets phone.
Three days later, good hour: opens app, triages 6 notes in under a minute, audits one garbled transcript against audio, fixes it, files to Doc.
Doc calls: opens Doc bucket, reads down the script, checks items off. Nothing forgotten.
If that loop works on the S23, ship it. Everything else is polish.
