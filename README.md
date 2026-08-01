# Quick Notes

**Capture. File. Remember.**

Zero-friction voice capture → bucket triage → read-as-script. An installable, offline-first Android PWA. No accounts, no backend, no ads, no telemetry. Everything lives on the phone.

Built to `documents/quick-notes-spec.md`. Build decisions are in [`DECISIONS.md`](./DECISIONS.md).

---

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 45 tests: logic + a jsdom pass over every route
npm run build    # generates icons, then builds to dist/
npm run preview  # serve the production build
```

## Deploying

The repo is private (it holds the spec, which carries personal medical context), so
GitHub Pages is not used — Pages needs a public repo or a paid plan. The site is
published by uploading the built `dist/`. The app contains none of the personal
material; the repo does.

Every push runs `.github/workflows/ci.yml`: full test suite, then build, then `dist/`
is attached to the run as a downloadable artifact. So you can deploy without building
locally — grab the artifact from the Actions tab and upload it.

**To publish or update the site:**

1. Get a `dist/` — either `npm run build` locally, or download the `quick-notes-dist`
   artifact from the newest green run in the repo's **Actions** tab.
2. Drag the folder (or `quick-notes-dist.zip`) onto <https://app.netlify.com/drop>.
3. Netlify returns an HTTPS URL. That URL is the thing you send people.

The build uses relative asset URLs, so the same `dist/` works from a domain root *and*
from a sub-path — no `BASE_PATH` needed, and nothing breaks if it moves hosts later.
Verified against both layouts.

If a host ever does need an absolute prefix, `BASE_PATH` still works — but on Git Bash for
Windows quote it, or MSYS rewrites `/QuickNotes/` into `/Program Files/Git/QuickNotes/`
and produces a silently broken bundle:

```bash
MSYS_NO_PATHCONV=1 BASE_PATH=/QuickNotes/ npm run build   # Git Bash
```

## Testing on the S23 Ultra

The microphone needs a **secure context**. `http://192.168.x.x:5173` is *not* one — `getUserMedia` and service workers are both blocked there, so testing over the LAN address will look broken in a misleading way. Use one of these two:

### A · USB port-forwarding (fastest loop, no hosting)

1. On the phone: Settings → About phone → tap **Build number** 7 times → back → Developer options → **USB debugging** on.
2. Plug the phone into the PC, accept the debugging prompt.
3. On the PC run `npm run dev`.
4. In desktop Chrome open `chrome://inspect/#devices` → **Port forwarding…** → add `5173` → `localhost:5173` → tick *Enable port forwarding*.
5. On the phone open Chrome → `http://localhost:5173`.

`localhost` counts as secure, so the microphone, the service worker and installation all behave exactly as they will in production.

### B · Any HTTPS static host

`npm run build` then upload `dist/`. Netlify drop, GitHub Pages, Cloudflare Pages — all fine, it is a static folder. This is also how you hand it to someone else: send the link.

### Install it, then get the two icons

1. Open the app in Chrome on the phone.
2. Chrome menu (⋮) → **Add to Home screen** → Install.
3. **Press and hold** the installed Quick Notes icon.
4. A small **Record** shortcut appears above it — **drag it out** onto the home screen.

You now have two icons: **Quick Notes** opens the Inbox; **Record** starts recording on tap.
(The same instructions are in the app: Settings → *Get the Record button on your home screen*.)

### What to check on the device

| Check | Expected |
|---|---|
| First tap of the **Record** icon | Chrome asks for microphone permission once. Grant it. |
| Every tap after that | Recording starts on its own — timer running, words appearing, no tap needed |
| If autostart is blocked | The whole screen becomes one **TAP = RECORD** button. One tap, never two |
| Talk, then **STOP & SAVE** | Stamped "Saved", no loading screen |
| Switch apps mid-recording | The capture is saved, not lost |
| Screen left alone while recording | Stays awake (wake lock) so it does not cut you off |
| Open **Quick Notes** icon | Lands on the Inbox with the note waiting |
| Swipe the note right | Full-screen bucket picker |
| Swipe left | Trash, with a stamp |
| Tap a bucket instead | Same result — both paths are equal |
| Press the pencil | Text becomes editable; swiping is off until "Done editing" |
| Play the recording | Audio plays so you can check the words against your voice |
| Airplane mode, reopen | Everything still works |

## How it is put together

```
src/
  lib/
    db.js          IndexedDB: notes, audio blobs, buckets, settings, grocery dictionary
    store.jsx      the whole app state; every change writes through immediately
    model.js       data shapes, the starting buckets, the audio-retention rule
    recorder.js    getUserMedia + MediaRecorder
    transcribe.js  ← the swappable speech-to-text boundary (see below)
    backup.js      readable JSON export + import
    text.js        splitting, copy-as-text, share sheet
    router.jsx     hash router, ~60 lines
  ui/constants.js  stamp timing, single-sourced
  components/      icons, buttons, sheets, cards, the stamp
  screens/         Record · Inbox (triage) · Buckets · BucketDetail · Search · Settings
```

### Swapping the transcription engine

Everything the app knows about speech-to-text is in `src/lib/transcribe.js`. v1 uses the Web Speech API (free, on-device, no keys). To move to Whisper or anything else: fill in the adapter skeleton at the bottom of that file, register it in `TRANSCRIBERS`, and pick it in Settings. Nothing else changes — the record screen already handles non-live engines by transcribing after the recording stops.

### Your data

Notes and recordings never leave the phone. Settings → **Email a backup to myself** produces a plain, readable JSON file you can open in any text app; **Restore from a backup** reads it back. Recordings are not in the backup — only text — and the file says so.
