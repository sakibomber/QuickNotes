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

## 13. WebGPU hung; CPU is the default, and a hang is now recoverable (2026-08-01)

On the S23 the WebGPU backend loaded, reported itself active, picked notes off the queue (1 → 3) — and then hung. Five minutes, no completion, no timing block, no error. That is the worst failure mode this app can have: it looks like progress.

**Three changes.**

**1 · CPU is the default.** `whisperBackend` defaults to `'wasm'`. Slow but finishing beats fast but hung. WebGPU is available as "Fast (graphics)" for anyone whose device handles it, but it is no longer the automatic choice.

**2 · A watchdog, because a silent hang must never be terminal.** One transcription is bounded at **6× the audio length** (45 s floor). That number is not arbitrary: the ship threshold is ~2× realtime and the stop threshold is ~3–4×, so anything past 6× is already a failure even if it eventually returns. A hung inference cannot be cancelled, so it is raced against a timer, abandoned, and the pipeline **disposed** so the next attempt does not queue behind a dead job. If the trip happened on WebGPU, the backend is demoted to CPU **permanently** and the same note is retried automatically — the user sees "Switched to the slower, reliable method" and nothing else. Otherwise the note is marked `failed` with the reason, and the run stops rather than grinding the same fault through every queued note.

**3 · The queue state is visible.** `transcribeState` now shows on the triage card — "Waiting to be written up", "Writing this one up now…", or "Could not write this one up — *reason*" with a Retry that re-queues it. Settings shows pending and failed counts and a "Try the N that failed again" button. Kyle diagnosed the hang by watching a counter go 1 → 3 and stop; nobody else would have. A queue that stalls silently is indistinguishable from one that is working.

**Pending decision:** if CPU completes reliably, the 26 MB WebGPU/JSEP binary comes out of the deploy (75 MB → ~13 MB once the unused variants go with it) and WebGPU-on-mobile gets logged as not worth the weight until proven on more than paper. Waiting on the CPU-path numbers before cutting, so the option is still there if CPU turns out unusable too.

## 14. Third device round — quantization, sheet thrash, safe areas (2026-08-01)

**1 · CPU session would not create — q4 reached the WASM provider.**
`TransposeDQWeightsForMatMulNBits — missing required scale` on base.en/WASM. MatMulNBits is 4-bit, so a q4 tensor reached an execution provider that cannot handle it; q4 is effectively WebGPU-only. Passing `dtype: 'q8'` as a bare string did not prevent it, so the format is now **pinned per module** (`{ encoder_model, decoder_model_merged }`) and exposed as a **Format** choice — Balanced (8-bit, CPU-safe), Original (fp32, always works, much larger), Smallest (4-bit, WebGPU only). A session that will not create walks the ladder rather than dead-ending on ONNX internals. Same principle as the mic sweep: after being wrong repeatedly about ORT specifics, let the device decide and report.

**2 · Cancel: the actual root cause, three rounds in.**
`Sheet`'s back-button effect listed `onClose` in its dependencies. Callers pass inline arrows, and the recording screen re-renders **five times a second** from its timer. So cleanup ran on every tick — `history.back()` → `popstate` → `onClose()` → the sheet shut itself a moment after opening. That is exactly "something pops up and instantly disappears". Fixed by holding `onClose` in a ref so the effect depends on `open` alone.

> Why two earlier attempts missed it: both previous fixes were to `Record.jsx` (phase handling), and the tests exercised sheets in screens that do not re-render on a timer. Nothing in the suite rendered fast enough to expose it.

**Regression test, and a note on what makes one real.** The first version of the test passed against the deliberately re-broken code — it hardcoded `open`, so the sheet could never close. The second still passed, because jsdom's `history.back()`/`popstate` does not emulate a browser closely enough to reproduce the *symptom*. The test now asserts the **cause**: exactly one `pushState` across twelve forced re-renders. Verified both ways — passes with the fix, fails with the bug reintroduced. A regression test that has not been watched to fail is not evidence.

**3 · Bottom nav behind the Android system buttons.**
Both the viewport meta and the safe-area CSS were present and correct in the deployed build, so "did the fix ship" was the wrong question. The cause is `viewport-fit=cover` itself: it deliberately extends the viewport *under* the system bars and then relies on `env(safe-area-inset-bottom)` to compensate — which Chrome on Android reports as **0** with 3-button navigation. Edge-to-edge is not worth hiding the navigation, so `viewport-fit=cover` is removed. Safe-area padding stays as belt-and-braces; it is a no-op at 0.

Added **Settings → Screen fit**: reports the measured insets, window vs visible height, and how much of the app falls below the visible area, with a copy button. It is wrapped so a diagnostic can never crash the screen it diagnoses.

## 15. The nav bar: a gutter, not an inset (2026-08-01)

The Screen fit readout settled it:

```
safe area bottom: 0px      window height: 742px
viewport-fit cover: no     visible height: 742px      cut off below: 0px
```

The app is sized correctly and clips nothing. Android draws its buttons **on top of a valid viewport**, and reports no inset for it — a situation no amount of `env(safe-area-inset-*)` can express, because from CSS's point of view nothing is wrong. So inset-chasing stopped here.

**A plain fixed gutter instead.** `--nav-gutter` (default **48 px**) is added to `.safe-b` alongside the safe-area inset, lifting the nav above where the system buttons draw.

**It defaults ON, and that is the important call.** The failure modes are wildly asymmetric: with it off, the nav can be unreachable *and Settings is behind that same nav* — so the person who needs the fix cannot get to the control that provides it. With it on, you get a strip of empty space. Given the distribution audience cannot debug either way, default to reachable. It is applied pre-paint from `localStorage` alongside the theme, so the nav never renders under the buttons even for one frame.

Adjustable in **Settings → Screen fit** (None / Some / More) with instructions written for someone looking at the problem, not reading a changelog.

**Believed specific to 3-button navigation.** Gesture navigation reserves no persistent strip, so the gutter is likely unnecessary there — untested, and the reason the control exists rather than a hardcoded constant.

## 16. Swipe dead zone over the note text (2026-08-01)

`touch-action` applies to the element the touch **starts on**, not just an ancestor. `.swipe-surface` had `pan-y`, but the scrollable note text inside it did not — so a drag beginning over the words was claimed by the browser before any `pointermove` reached the handler. That is the dead zone. Fixed by applying `pan-y` to the surface's descendants as well; vertical scrolling stays native, horizontal stays ours. Editing is unaffected because the `.swipe-surface` class is removed while the textarea is open.

## 17. The format ladder was working; the label was lying (2026-08-01)

Reported as "the format switch is not taking effect — Balanced still pulling q4, *Downloading… 186 MB* under a button saying 42 MB".

The switch was working. 42 MB (Balanced attempt) + ~155 MB (Original fallback) ≈ 186 MB: the ladder walked, and the byte counter accumulated across both attempts while the button quoted the **model** size with no regard for the **format**. Two real defects, neither of them the one reported:

1. **Download size depends on both axes.** Sizes are now a model × format matrix, so the button quotes what will actually be fetched.
2. **The fallback was invisible.** It now announces each attempt live ("Trying Balanced…", "Balanced did not work — trying the next one") and lists every format that refused, with the ONNX reason. A silent fallback reads as a broken setting.

Still open: **why** Balanced (8-bit) will not create a session on this phone. It is now visible rather than inferred from a byte count, which is the prerequisite for fixing it.

## 18. Every format failing identically — instrumenting the load (2026-08-01)

Nav gutter, swipe dead zone and Cancel all confirmed fixed on device. One thing left, and the ladder announcements are what exposed it: **every format fails with the same error**, including fp32:

```
qdq_actions.cc:137 TransposeDQWeightsForMatMulNBits
Missing required scale: model.decoder.embed_tokens.weight_merged_0_scale
```

**fp32 cannot produce a MatMulNBits error** — MatMulNBits is 4-bit only. So the requested dtype is not reaching file resolution, and something 4-bit is loaded no matter what is asked for. Two candidates:

- **(a)** the per-module keys (`encoder_model` / `decoder_model_merged`) are wrong, so the map is ignored and the repo default is used for the decoder
- **(b)** a cached artifact is returned regardless of the request

Rather than guess between them — the mistake that cost three deploy cycles on the ORT variants — the load is now instrumented to say which:

1. **Exact filenames are recorded per attempt** from the progress callback and shown in the UI. Asking for fp32 and seeing `*_q4.onnx` come down names the bug outright; seeing **no files fetched at all** names it as cache.
2. **Hard cache-clear before every attempt.** transformers.js caches by URL in Cache Storage, so a bad artifact survives reloads and is handed back on every retry — indistinguishable from "the setting does nothing". Clearing between rungs removes (b) as a confound.
3. **The ladder now tries both dtype forms** — the per-module map *and* the plain string. This is the discriminator: if the string form works, the keys were wrong (a); if both fail identically on a cleared cache, the keys are not the problem.
4. **"Delete the downloaded model and start over"** in Settings, so a poisoned cache is recoverable without reinstalling.
5. **"Copy what it tried"** dumps every attempt with its requested dtype, the files fetched, and the error.

The next report should name the cause rather than requiring another round of inference.

## 19. §18 named: an upstream runtime change, not our dtype plumbing (2026-08-05)

The load failure is diagnosed, and it took no device round to do it. It is a known ONNX Runtime regression with our exact error string and our exact tensor name: [onnxruntime#28306](https://github.com/microsoft/onnxruntime/issues/28306) and [transformers.js#1707](https://github.com/huggingface/transformers.js/issues/1707).

**From ORT 1.25 the extended-level QDQ transformer rewrites `DequantizeLinear`+`MatMul` into `MatMulNBits`, and that rewrite requires scale tensors which Whisper ONNX exports published before it do not carry.** The same models load on 1.24. `@huggingface/transformers` 4.2.0 pins `onnxruntime-web` 1.26.0-dev, so we are on the far side of the change.

**The reasoning error, recorded because it is the expensive part.** §18 argued: *"fp32 cannot produce a MatMulNBits error — MatMulNBits is 4-bit only. So the requested dtype is not reaching file resolution."* The premise is false. `MatMulNBits` is what the optimizer was trying to **build**, not what it read; a q8 QDQ model produces this error. That one inference generated both candidates — wrong per-module keys, poisoned cache — and neither existed. Four deploy cycles were spent below a wrong premise, and the instrumentation added to tell (a) from (b) was answering a question with no correct answer in it. The lesson is narrow and worth keeping: **an error names the operation that failed, not the input that caused it.**

**Fix: cap graph optimization at `basic`.** The failing pass lives at `extended`, and ORT's levels are cumulative, so `basic` turns it off while keeping constant folding and dead-node elimination. `disabled` would also work and costs more for nothing. Applied to every attempt in `loadWhisper`, and recorded per-attempt so "Copy what it tried" reports the level it ran at.

**This is not escapable by choosing a different model.** `onnx-community/distil-small.en` — the approved target — was last published **October 2024**, well before the runtime change, so it carries the same defect. Checked rather than assumed.

> **All speed measurements from here forward run under `basic`.** This is load-bearing for the go/no-go thresholds: `extended` is also where the transformer fusions live, so capping it may make inference measurably slower. Measuring under `extended` would be measuring a configuration that cannot create a session. The ~2× ship / ~3–4× stop thresholds are therefore evaluated against what actually ships.

**Still open, low priority:** why the fp32 rung also failed on device. fp32 has no `DequantizeLinear` nodes, so it cannot trigger this pass, and upstream names fp32 as the escape hatch. The likeliest answer is that fp32 was served a cached q8 artifact — exactly what the hard cache-clear in `0507095` was built to eliminate and has never been run on a phone. Worth one attempt only if q8 does not now work.

## 20. Model labels were lying in three places (2026-08-05)

Same defect §17 was supposed to have closed — a name or a number under a button that is not what gets fetched.

1. **`whisper-tiny.en` shipped under a button reading "Small"**, and `base.en` under "Better". Four device rounds ran against the 39M-parameter model while the UI claimed small-class. This one mattered: "small-class, not tiny" was a deliberate accuracy decision, and the app had silently never implemented it.
2. **The q4 sizes were guessed.** 28 MB quoted for tiny/q4 against a real 96 MB; 50 MB for base/q4 against a real 142 MB. q4 quantizes the matmul weights and leaves the embedding table at full precision, so **q4 is larger than q8 at every model size** — "Smallest" was never smallest, and is both bigger and CPU-incompatible. Renamed, listed last, recommended to nobody.
3. **The model picker rendered "undefined MB"** — it read `m.approxMB`, a property that does not exist on those objects. §17 fixed the download button and missed the dropdown three lines below it.

Every size is now the sum of the two files the pipeline actually fetches (`encoder_model` + `decoder_model_merged`), read from each repo's own file listing rather than scaled from a neighbour. Three tests hold the line: every model×format pair has a measured number, nothing may claim q4 is smallest, and every label must name its repo.

**Target model: `distil-small.en` at q8 (172 MB).** The full whisper-small encoder with a 4-layer decoder instead of 12 — published as within ~1% WER of its teacher at several times the speed. Chosen over `whisper-small.en` itself (249 MB q8, est. 5–10× realtime on CPU) because the requirement is small-class **accuracy** — notes get read out verbatim at appointments — and small.en would sit astride the 6× watchdog on the CPU-only path, failing the requirement by never finishing. fp16 (333 MB) is the documented fallback if q8 accuracy disappoints on real notes.

**Watchdog stays at 6×.** If measured numbers put real notes near it, the answer is minutes-long background transcription with visible queue state, not a raised ceiling. Capture is never blocked by transcription.

**Default stays on `tiny` until §18 is confirmed fixed on device.** Changing the weights and the load path in the same round is how you lose track of which one moved.

## 21. The mic instrument was not testing the app (2026-08-05)

Two defects in the diagnostic itself, found auditing the instrument rather than the result. Both matter beyond this handset: the sweep is the self-correcting hardware check for everyone else who installs this, so a wrong answer delivered confidently is worse than no check at all.

1. **Steps 5 and 7 built a `Recorder` with no `audioProfile`**, so they always measured `processed`. Once the sweep has applied `raw`, the check a user runs — and copies to us — is testing a configuration the app is not using.
2. **A speech-first combination that could not open the recorder abandoned its probe un-stopped.** A live recogniser carried into the next combination, which would report that contamination as its own result. The 700 ms settle never covered it, because nothing was ever told to stop. `probe()` now takes an `AbortSignal`, and the caller aborts **and awaits** — told-to-stop is not stopped.

Both regression tests were watched failing against the reintroduced bugs before they passed (§14's rule). The leak test reports **2** live recognisers, one per speech-first combination — the mechanism confirmed rather than inferred. Its stub deliberately disables auto-end, because a recogniser that tidies itself up after 10 ms would hide a leaked one and the test would pass against the bug.

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
