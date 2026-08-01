# Quick Notes — decision log

**Build:** v1.0.0 · 2026-07-31
**Contract:** `documents/quick-notes-spec.md`. Where anything here conflicts with the spec, the spec wins and the conflict is written up as a dated addendum at the bottom rather than by editing the spec.

---

## 0. Prototype provenance

`documents/quick-notes-v2.jsx` and `documents/quick-notes-prototype.jsx` were **supplied mid-build**. They were used as a **visual-language reference** and, in v2's case, as the **tested source for the triage gesture structure**. They are chat-artifact prototypes — adapted, not copied.

What came from v2:

| Taken | Not taken | Why |
|---|---|---|
| Gesture structure: `touch-action: pan-y`, immediate pointer capture, guards on `editing \| picker \| stamp`, `rotate(dx/60)`, 200 ms ease spring-back, reset-on-note-id | — | It is the tested arrangement; the trap it avoids is documented in spec §3 |
| Ink/olive dark + sepia paper light, ruled-paper cards, rotated rubber stamp, uppercase condensed stamped labels | Exact hex values | Same family, re-derived against contrast requirements for spec §12 |
| Nine buckets with per-bucket colour + icon | Hardcoding them | Spec §6 requires buckets be user-editable |
| — | Google Fonts (`Oswald` / `Public Sans` via `@import`) | Offline-first (spec §2). A webfont import is a network dependency on the capture path. System stacks with condensed fallbacks instead |
| — | 5-slot nav with centre Record | Spec §3 locked 4 tabs with Kyle on 7/31 *after* the mockup review, so the spec supersedes the prototype here. Record is a full-screen route plus a visible mic button in every main screen header |
| — | Simulated transcription | Real Web Speech behind the swappable interface (spec §4) |

## 1. Swipe tuning reconciliation

**Structure from v2. Tuning is this build's own. The two converged, which is the reason it is settled.**

- v2 commits at a flat **±90 px**. On the S23 Ultra's 412 px viewport that is **~21.8%** of the width.
- This build commits at **`COMMIT_RATIO = 0.24`** of the surface width — **~99 px** on the same device.

Two independent passes landing within ~9 px of each other is convergent validation, not a conflict. The ratio is kept because it holds the same feel on a narrower phone, which matters once this goes to other veterans on hardware nobody has picked yet.

Retained beyond v2, deliberately:

- **Axis detection** (12 px slop, horizontal must beat vertical by 1.3×). v2's card did not scroll; this one does — long transcripts scroll inside the surface, so a vertical drag has to reach the scroller instead of dragging the card.
- **Flick velocity** (`> 0.55 px/ms` commits regardless of distance). A fast short flick is a deliberate gesture and should not be rejected for falling 20 px short.

Adopted from v2 in this pass: `rotate(dx/60)` replacing `dx * 0.012` (a stronger tilt — `dx/60` vs `dx/83`). **Flag for the S23 feel-test:** this is the one gesture value changed on the strength of the prototype rather than measured here.

## 2. Gesture-reconciliation punch list (applied this pass)

1. **`src/ui/constants.js`** — `STAMP_MS = 880`, `STAMP_GUARD_MS = STAMP_MS + 40`. Both stamp sites (Inbox, Record) consume it. One number, so animation and input-guard cannot drift apart.
2. **Stamp guard on the surface** — `flashStamp` holds the swipe surface shut for `STAMP_GUARD_MS`; `onPointerDown` early-returns while a stamp is showing; `flashStamp` hard-cancels any in-flight gesture (`drag.current.active/axis` cleared, `dx` reset). Without this the follow-through of a flick files the *next* note too — the note behind the one you meant. Covered by a test that drives a real double-flick.
3. **Note-change effect resets the gesture** — `dx`, `springing` and `drag.current` reset alongside edit state, or the incoming card inherits the outgoing card's transform. `AudioPlayer` already resets itself on `note.audioBlobId`; not duplicated.
4. **Explicit picker guard in `onPointerDown`**, commented do-not-remove. Redundant today because the sheet has its own scrim; it is there so a later change to sheet layering cannot silently allow a drag underneath an open picker.
5. **`rotate(dx/60)`** — see §1.
6. **`--stamp-ms` threaded from the constant into `Stamp`** via a `style` passthrough; `.animate-stamp` derives its own timings with `calc(var(--stamp-ms) * 0.295)` / `* 0.705`, replacing hard-coded 260 ms / 620 ms.
7. **Reduced-motion branch in `flashStamp`** — `matchMedia('(prefers-reduced-motion: reduce)')` read at call time (no listener; this runs a few times a day). Falls back to a ~120 ms debounce instead of the full guard. **This branch is load-bearing, not cosmetic:** `styles.css` forces `animation-duration: 1ms !important` under reduced motion, so the full guard would swallow input for ~920 ms after a visually instant stamp.
8. **`Record.jsx` SavedScreen** — `setTimeout(..., 1000)` replaced with `STAMP_MS`.

## 3. Architecture

| Decision | Reasoning |
|---|---|
| **Hash routing** (`#/record`), ~60 lines, no router dependency | Works on any static host with no rewrite rules, and fires `hashchange` when Android focuses an already-open PWA window rather than cold-starting it — which is exactly what the Record shortcut does on the second tap |
| **Relative manifest URLs** (`start_url: "."`, `url: "./#/record"`) | Deploys to a domain root or a sub-path (GitHub Pages) with no edit. `BASE_PATH` env var drives Vite's `base` |
| **Hand-rolled IndexedDB wrapper** (~140 lines, no `idb`) | This is the layer that must never break because a dependency moved on. It is small enough to own outright |
| **Whole store in memory, audio blobs on demand** | Notes are small text records; blobs are not. Search over everything stays instant |
| **`writeNotes` helper** — every note write updates ref and React state together | Two taps inside one frame could otherwise read a stale list and silently drop the first change. In this app that means a lost note |
| **Boot runs once per page load** via a module-level promise | StrictMode double-mounts in dev; without this the first-run seed notes are written twice |
| **No service-worker update prompt** (`registerType: 'autoUpdate'`) | "An update is available" is a decision nobody asked for. New build is taken silently on next launch |
| **Icons generated procedurally at build time** (`scripts/gen-icons.mjs`, raw PNG encoding via zlib) | No binary assets in the repo, no image dependency, and the two home-screen marks stay in sync with the palette |

## 4. Data and safety

| Decision | Reasoning |
|---|---|
| **Audio sweep deferred 12 s past filing**, not immediate | Makes undo able to restore a filed note *with its recording intact*. Immediate deletion would make undo a lie |
| **Never drop audio when the transcript is empty** — hard guard, beyond spec | Spec §5: "a mangled note that can't be audited is worse than no note." A note with no text at all is that case taken to its limit; the recording is the only copy of the thought. Extracted as a pure function (`shouldDropAudio`) and tested directly because it is the only rule in the app that destroys data |
| **Undo on every filing and every clear** (8 s), beyond spec | Misfiles are the expected failure mode for the intended users. Cheap to offer, expensive to omit |
| **Deleting a bucket returns its notes to the Inbox** rather than deleting them | Losing a note to a tidy-up is a memory erased. The user is told how many came back |
| **Trashing keeps the recording** | Trash is recoverable; a note in it has not been decided on yet |
| **Storage persistence requested** (`navigator.storage.persist()`) | Android's automatic storage cleanup can otherwise evict a week of captures |
| **Backup excludes audio** | Spec §9 requires the file be *readable*. Base64 audio would make it neither readable nor emailable. The file says so explicitly in its own `audioNote` field |
| **Import offers merge or replace**, two full-size buttons | One decision, both answers visible. Merge is by note id, so re-importing the same file is idempotent |

## 5. Interaction and scope calls

| Decision | Reasoning |
|---|---|
| **Split generalised from Grocery to any checklist bucket** | Spec §8 says Grocery; buckets are user-editable (§6), so the behaviour keys off `type === 'checklist'`. Todo benefits identically. Still confirmed, never automatic |
| **Split makes the original note the first item** | Keeps the recording and the original timestamp attached to something real instead of orphaning them |
| **Grocery dictionary keyed per bucket** (compound key `[bucketId, term]`) | Todo vocabulary polluting Grocery suggestions would make autocomplete worse than none |
| **Bucket reorder via up/down buttons, not drag** | Drag-and-drop is unkind to a tremor. Same reason there is no long-press anywhere |
| **Per-item delete behind a visible "Edit list" toggle** | Spec §3 forbids hidden ⋮ menus. A labelled toggle that reveals full-size controls is visible; a delete button on every row is a mis-tap waiting to happen |
| **Text size setting** (Normal / Large / Largest), beyond spec | Spec §12 calls for large default type for a TBI audience; one segmented control is not a settings maze |
| **Wake lock held while recording** | Spec §3 says a screen-off saves the capture. Better to not lose the sentence in the first place |
| **Leaving the record screen saves rather than discards**; Cancel is a separate, confirmed action | "Never lose a capture to a distracted exit" (§3). The only way to lose audio is to answer a direct question |
| **Live-transcription toggle in Settings** | The documented degradation path if the speech service and the recorder contend for the microphone. Audio is the source of truth; text is the convenience |
| **Record button in every main screen header** | Spec §3 asks for a visible Record button in the app. Same position on every screen is worth more than saved pixels for this audience |

## 6. Verification

Browser automation was declined for this session and no S23 is attached, so verification is **45 automated tests** (`npm test`): a pure-logic suite plus a jsdom + `fake-indexeddb` pass that mounts the real app, walks every route, and drives real pointer sequences across the triage surface — including the double-flick that the stamp guard exists to stop. Any `console.error` fails the run.

What that **cannot** cover, and therefore has to be checked on the device: microphone permission on an installed PWA, the shortcut cold-start path, whether Web Speech and MediaRecorder can share the microphone on this handset, and gesture feel. See "Deferred / needs device" in the handover.

## 8. Deployment

**The repo stays private. The site is published by uploading the built `dist/` to Netlify, not by GitHub Pages.**

GitHub Pages was built and attempted twice (`configure-pages` → `upload-pages-artifact` → `deploy-pages`). Both times the pipeline ran green through install, all 45 tests, and build, and failed at exactly one step — `configure-pages`, with *"Your current plan does not support GitHub Pages for this repository."* Pages requires a public repo or a paid plan. It is a visibility gate, not a content gate.

Going public was rejected because of what the repository contains. `documents/quick-notes-spec.md` is the build contract and carries personal medical and cognitive context (TBI, working-memory limits, the VA/clinician framing); the prototypes carry sample notes about specific symptoms. The built app contains none of it — so uploading `dist/` publishes the app without publishing the person.

**`documents/` is untracked** (`git rm --cached` + gitignore, 2026-08-01) so it is out of `HEAD` going forward. It stays on the build machine as the contract.

> **Known and accepted:** history was deliberately not rewritten, so `documents/` is still readable at commit `c382fed` (`git show c382fed:documents/quick-notes-spec.md`, or GitHub's tree view). Untracking changes what is in `HEAD`, not what is in the repository. This is sound **only while the repo is private**, which is now a load-bearing condition rather than an incidental one. If this repo is ever made public, scrub history first.

**CI runs on every push** (`.github/workflows/ci.yml`): full suite, then build, then `dist/` attached to the run as a downloadable artifact. So whatever gets uploaded is always a build that passed its tests, and there is no "did I remember to build?" step.

**`npm test` gates the artifact.** A red suite produces nothing to upload. This app goes to people who cannot distinguish a broken build from a bad day, so shipping past failing tests is not a trade worth having.

`dist/` is gitignored — the repo holds source, CI holds output.

**Settled 2026-08-01: GitHub Pages deployment abandoned.** It requires a public repo (or a paid plan), and this repo stays private because its history still contains `documents/`. Deploys are manual: drag the built `dist/` onto Netlify Drop. The cost of that choice is one drag per release instead of push-to-deploy.

**Revisit trigger:** if the release cadence ever makes the manual drag the thing that stops a fix reaching the phone, GitHub Pro (~$4/mo) enables Pages on private repos and restores push-to-deploy without publishing anything. The workflow to do it is in the history at `7169b97` (`.github/workflows/deploy.yml`) — restoring it is a `git show` away, and the Pages site visibility would need setting to public so recipients can reach it. Not worth $4/mo for a v1 that ships occasionally; worth reconsidering the first time it is annoying.

**No `BASE_PATH` is set, deliberately — this is a deviation from the instruction to build with `BASE_PATH=/QuickNotes/`.**
The build defaults to relative asset URLs (`base: './'`), which was verified to serve correctly both from a domain root and from the exact `/QuickNotes/` sub-path — HTML, CSS, JS, `sw.js`, the workbox chunk, all seven icons, and the manifest's `start_url`, `scope`, shortcut URL and shortcut icon all resolve. Reasons to prefer it over an absolute base:

- An absolute `/QuickNotes/` hardcodes the repo name into the bundle. Renaming the repo, or later pointing a custom domain at the root, silently breaks every asset.
- It is one build for every host, so the "which base did I build with?" mistake stops existing.
- It works because the app hash-routes (every navigation is the same document) and vite-plugin-pwa already emits a relative precache manifest.

`BASE_PATH` is still honoured in `vite.config.js` if a host ever needs an absolute prefix.

**Trap worth knowing:** on Git Bash for Windows, `BASE_PATH=/QuickNotes/ npm run build` is rewritten by MSYS path conversion into `/Program Files/Git/QuickNotes/` and produces a silently broken bundle. Quote it, prefix with `MSYS_NO_PATHCONV=1`, or use PowerShell. Found while testing the sub-path variant.

## 9. First device test — S23 Ultra, 2026-08-01

Working: capture records real audio, saves, and plays back. The "no text came through, voice saved" fallback displayed correctly.

Four bugs found. Diagnostics were built **before** the speculative fixes, on the principle that a bug you cannot see from the phone is a bug you fix by guessing.

**Diagnostics added**
- Settings → **Microphone**: live permission state, an **Allow the microphone** button that asks from inside a real tap, and **Check microphone and speech** — a five-step probe (secure context, run mode, permission, mic-alone with peak input level, speech-alone, speech-while-recording) ending in a plain-words verdict, with **Copy this check** to get it off the phone.
- Record screen: live input-level meter with a percentage and an explicit *"No sound reaching the microphone yet"* state, so "the mic is deaf" is distinguishable from "no words came back".
- Real error names surfaced everywhere: `getUserMedia` failures show their `DOMException.name`; speech failures show the raw `SpeechRecognition` error code plus a sentence.

**The decisive test** is speech-alone versus speech-while-recording. Web Speech cannot be handed an existing `MediaStream` — the API has no such input — so "one shared stream" is not available. If speech-alone passes and speech-while-recording fails, it is microphone contention and live transcription is not possible on this handset; if both fail, the speech service is simply unavailable. The verdict line says which, in words.

**Bug 2 — installed app could not record.** Cause: a WebAPK is a separate Android package with its own runtime microphone permission, and Android will not raise that prompt outside a user gesture. Autostarting on load could never work there. Fixed: `begin()` now checks the permission first and only autostarts when it is already `granted`; anything else shows the one-tap screen first and the tap is what asks. The fast path Kyle needs is preserved exactly where it can work.

**Bug 3 — no play button on triage cards.** `AudioPlayer` returns `null` only when `audioBlobId` is falsy, so this was a data problem, not a rendering one. The silent omission is what made it undiagnosable. Absence is now stated: *"No recording attached to this note."*

**Bug 4 — Cancel did nothing.** `discard()` tore out the recorder but never left `PHASE.RECORDING`, leaving a recording screen with no recorder: frozen timer, dead Stop & Save. It now sets phase, clears the timer and resets state before navigating, which also stops the unmount handler trying to save a discarded take.

**Default changed: audio retention is now `always`.** With transcription producing nothing, the recording is the only copy of the thought. Reverting to `until-filed` is only correct once the transcript can be trusted.

**Reinforced: never save a capture that failed.** An empty blob *and* an empty transcript no longer creates a note at all — it reports the failure and keeps you on the record screen. A note that says nothing, with no audio behind it, is a lost thought wearing a timestamp.

## 10. Mic contention confirmed — the combination sweep (2026-08-01)

The diagnostic came back decisive on the S23 Ultra, installed app:

```
[PASS] Microphone alone:      22 KB · peak level 100%
[PASS] Speech to text alone:  Heard: "check"
[FAIL] Speech while recording: ended-silent · events: start, audiostart, end
```

The event list is the finding. `audiostart` fired but **`soundstart` never did** — Android handed the speech service an audio source and it contained silence. That is contention, not a dead speech service, and not a bug in the wiring.

**Before accepting Whisper as the answer**, two variables in our own code were identified as prime suspects:

1. **Audio constraints.** We requested `echoCancellation / noiseSuppression / autoGainControl: true`. On Android that makes Chrome open the **VOICE_COMMUNICATION** audio source, which engages the hardware AEC path and tends to be exclusive. Raw audio often opens a shareable source instead.
2. **Start order.** The recorder called `getUserMedia` first and the speech service arrived second — the loser was whoever asked last.

Both are now configurable (`audioProfile`, `speechFirst`) and Settings → Microphone offers **Find a way that works**: a sweep of all four combinations, stopping at the first that passes, saving it, and using it for every capture afterwards.

**A combination only passes if BOTH survive** — the speech service returned words *and* the recording still has signal. A transcript sitting on top of a silent recording is the worst available outcome: it destroys the audit trail that spec §5 exists to protect, and it would look like success. The sweep reports that case explicitly as "heard the words BUT the recording came out silent — unusable".

If all four fail, the phone genuinely cannot share the microphone and Whisper-after-stop becomes the discussion — with evidence that the cheap options were exhausted first rather than skipped.

## 11. Live transcription ruled out on this handset (2026-08-01)

The sweep came back 0 for 4 on the S23 Ultra:

```
[FAIL] Cleaned up · recorder first: Recording fine (peak 100%) but no words came back.
[FAIL] Raw audio · recorder first:  Neither the words nor the recording worked.
[FAIL] Cleaned up · speech first:   Recording fine (peak 27%) but no words came back.
[FAIL] Raw audio · speech first:    Neither the words nor the recording worked.
```

Two things beyond the headline:

- **Raw audio breaks the recording on this device**, not just the transcript. It is not a safe fallback here. This is only visible because a combination has to prove *both* streams survived; a speech-only pass criterion would have called raw a candidate.
- **Order does not matter.** Speech-first got a 400 ms head start and still heard nothing. So this is not first-come-first-served: once any `getUserMedia` stream is live in the process, the Android speech service is starved regardless. That closes the axis — there is no ordering or constraint combination left to try.

> **Correction (second run, 12:11).** The first write-up said speech-first also *cost* recorder quality, citing peak 27% vs 100%. A repeat run showed 100% for that same combination, so the 27% was sample noise and the claim was drawn from n=1. Withdrawn. Everything else reproduced exactly, including all four sweep failures — the contention finding itself is stable.

**Live transcription is therefore impossible on this handset**, and Web Speech cannot be handed an existing `MediaStream` (no such API), so there is no way to feed one stream to both.

**Consequence shipped:** when the sweep finds nothing, live transcription is switched **off** and the reason recorded (`speechBlockedReason: 'contention'`). A speech session that can never succeed still costs battery, still raises an error banner on every capture, and on some orderings measurably degrades the recording. Settings explains why rather than showing a silently-off toggle, and it can be turned back on to retry after a phone update.

**Capture is unaffected.** Spec §1 is about the cost of capture, and capture still works perfectly: tap the icon, talk within ~2 s, audio saved. What is lost is text — which is load-bearing for spec §3 (search over clinical history) and §6 (reading a script down the phone to the doctor), so it is worth solving rather than accepting.

Next decision — transcription engine — is open. See the handover.

## 12. On-device Whisper — spike build (2026-08-01)

Chosen over a hosted API on privacy grounds: this app will hold other veterans' clinical voice notes, and "nothing leaves the phone" is a promise rather than a preference. Built behind `transcribeBlob()` so a failed spike costs nothing elsewhere.

**Shape**

- **Background job on saved notes.** Capture never waits — the note is written to IndexedDB with its audio *before* transcription is considered. A failure is never a lost note.
- **The queue is note state, not a list.** `transcribeState` lives on the note (`pending` / `running` / `done` / `failed` / `skipped`), so an app restart or a kill mid-pass loses nothing: anything stuck in `running` at launch goes back to `pending` and resumes. There is no separate queue file to corrupt or lose.
- **Never overwrites typed words.** If the user typed the note while the pass was running, the result is discarded (`skipped`).
- **Opt-in, with the size stated up front.** ~42 MB (Small) or ~78 MB (Better). Declining, failing, or ignoring it leaves the app fully usable audio-only.
- **Library and model both load on demand.** The transformers chunk is 549 kB and dynamically imported; it is *not* in the startup path and *not* precached by the service worker. Install stays at 21 entries / 373 KB.

**Verification of the no-external-loads assumption — it did NOT hold, and is now fixed**

Checking the built output as instructed turned up two things:

1. The **main bundle and `index.html` are clean.** The only `http` strings are XML namespace identifiers (never fetched) and a React error-docs URL inside a message string.
2. **transformers.js defaults its ONNX Runtime WASM binaries to `cdn.jsdelivr.net`.** That is a live third-party CDN dependency at transcription time — wrong for an offline-first app, and a silent failure for anyone whose network blocks it. Fixed by setting `env.backends.onnx.wasm.wasmPaths` to our own origin and shipping the binaries in `/ort/` (`scripts/copy-ort.mjs`). The jsDelivr string remains in the bundle as an unreachable fallback branch — it is guarded by `!wasmPaths`, which we set first.

Because asserting that is worth less than being able to check it, the Whisper panel reports **where the runtime actually loaded from** after a run, in green when it is same-origin.

**Deploy size is now the real cost: `dist/` is 39 MB**, of which 38 MB is the two ORT binaries (12.9 MB CPU + 26 MB WebGPU/JSEP). Vite additionally auto-emitted a 23.5 MB `asyncify` variant that this configuration never loads; `scripts/prune-dist.mjs` removes it, and that prune is only safe *because* `wasmPaths` is set — if that setting goes, the prune must go too.

**Open question for after the numbers land:** if WebGPU turns out unavailable or no faster, dropping the JSEP binary takes the deploy from 39 MB to 13 MB. Worth doing before this ships to anyone else.

**Go/no-go thresholds (set before measuring):** under ~2× realtime with readable accuracy → ship. Worse than ~3–4× realtime, or garbage accuracy → stop and report; hosted-with-proxy is only discussed after these numbers exist.

## 7. Settled — do not relitigate

- Swipe threshold (`0.24` ratio) and flick velocity — converged with the tested prototype
- Stamp duration 880 ms and the guard pinned to it
- 4-tab nav, Record as a full-screen route (spec §3, locked after mockup review)
- Backup excludes audio
- Hash routing
- Inbox as a pseudo-bucket (see addendum A)
- System fonts, no webfonts

---

## Addenda — spec contradictions

**A · 2026-07-31 · §3, "/record → note goes to Inbox (bucket = Temp/unsorted)".**
Implemented as `bucketId: 'inbox'`, a pseudo-bucket that is not in the user-editable bucket list, rather than as the real `Temp` bucket. Reason: §3's nav and §7 both treat Inbox as the triage queue with its own badge count, and `Temp` is listed in §6 as one of nine *filing destinations*. Making them the same store would mean filing a note to Temp puts it back in the triage queue forever. `Temp` remains available as the "not sure yet" destination it reads as. No spec edit made.

**B · 2026-07-31 · §8, grocery item model `{text, checked, count?}`.**
Grocery items are stored as ordinary `Note` records (`transcript`, `checked`) rather than a second model, so a checklist item and a filed voice note are the same kind of thing and the split in §8 is a field edit rather than a type conversion. The mapping to `{text, checked}` is `{text: note.transcript, checked: note.checked}` — one line, so the future AnyList merge still does not require a migration, which was the stated intent.
