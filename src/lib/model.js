/**
 * Domain model: ids, defaults, the starting bucket set, and the first-run seed.
 * Data shapes follow spec §10.
 */

export const INBOX = 'inbox'
export const TRASH = 'trash'

export const BUCKET_TYPES = {
  script: {
    id: 'script',
    label: 'Script',
    blurb: 'Read down the list on a call. Checked items stay put.',
  },
  checklist: {
    id: 'checklist',
    label: 'Checklist',
    blurb: 'Working list. Crossed-off items sink to the bottom.',
  },
}

/** Bucket colors — picked for contrast in both skins, and easy to tell apart. */
export const BUCKET_COLORS = {
  olive: { id: 'olive', label: 'Olive', dark: '#a8b545', sepia: '#5c6b2f' },
  rust: { id: 'rust', label: 'Rust', dark: '#d2703f', sepia: '#a8501f' },
  clay: { id: 'clay', label: 'Clay', dark: '#c8563c', sepia: '#a3402a' },
  teal: { id: 'teal', label: 'Teal', dark: '#4fa8a0', sepia: '#2f6b64' },
  sky: { id: 'sky', label: 'Sky', dark: '#6b9bd2', sepia: '#38618f' },
  plum: { id: 'plum', label: 'Plum', dark: '#a97bc0', sepia: '#6d3f80' },
  gold: { id: 'gold', label: 'Gold', dark: '#d8ac4a', sepia: '#8a6410' },
  moss: { id: 'moss', label: 'Moss', dark: '#7ea04d', sepia: '#40632a' },
  slate: { id: 'slate', label: 'Slate', dark: '#93a0a8', sepia: '#4f5b63' },
}

export const COLOR_LIST = Object.values(BUCKET_COLORS)

export function colorHex(colorId, theme) {
  const c = BUCKET_COLORS[colorId] || BUCKET_COLORS.olive
  return theme === 'sepia' ? c.sepia : c.dark
}

/** Icon keys resolved by components/Icon.jsx. */
export const BUCKET_ICONS = [
  'inbox',
  'bell',
  'stethoscope',
  'heart',
  'child',
  'check',
  'cart',
  'note',
  'bulb',
  'star',
  'flag',
  'phone',
  'car',
  'tools',
  'home',
  'money',
  'pill',
  'calendar',
]

export function uid(prefix = 'n') {
  const rand = crypto.getRandomValues(new Uint32Array(2))
  return `${prefix}_${Date.now().toString(36)}_${rand[0].toString(36)}${rand[1].toString(36)}`
}

/** Kyle's starting list (spec §6) + the two system buckets. */
export function defaultBuckets() {
  const rows = [
    ['temp', 'Temp', 'script', 'slate', 'note', true],
    ['reminders', 'Reminders', 'script', 'gold', 'bell', true],
    ['doc', 'Doc', 'script', 'teal', 'stethoscope', true],
    ['wife', 'Wife', 'script', 'clay', 'heart', true],
    ['kid', 'Kid', 'script', 'sky', 'child', true],
    ['todo', 'Todo', 'checklist', 'olive', 'check', true],
    ['grocery', 'Grocery', 'checklist', 'moss', 'cart', true],
    ['notes', 'Notes', 'script', 'plum', 'note', true],
    ['thoughts', 'Thoughts', 'script', 'rust', 'bulb', true],
  ]
  const buckets = rows.map(([id, name, type, color, icon, deletable], i) => ({
    id,
    name,
    type,
    color,
    icon,
    order: i,
    deletable,
    clearMode: 'archive',
  }))
  buckets.push({
    id: TRASH,
    name: 'Trash',
    type: 'script',
    color: 'slate',
    icon: 'trash',
    order: 900,
    deletable: false,
    system: true,
    clearMode: 'delete',
  })
  return buckets
}

export const DEFAULT_SETTINGS = {
  theme: 'dark',
  textScale: '1',
  /**
   * until-filed | always | ask  (spec §3 / §5)
   *
   * Defaults to "always" as of 2026-08-01. Device testing on the S23 found
   * speech-to-text producing nothing at all, which makes the recording the
   * only copy of every thought. Dropping audio on filing is correct only when
   * the transcript is trustworthy; until it is, keeping it is the safe default.
   * Revisit once transcription is confirmed working. See DECISIONS.md §9.
   */
  audioRetention: 'always',
  /** Live Web Speech transcription during capture. Off = audio only. */
  liveTranscribe: true,
  /** Which transcriber the swappable interface uses (spec §4). */
  transcriber: 'webspeech',
  /**
   * How the microphone is opened, and who gets it first. Defaults match what
   * has always shipped; Settings → Microphone can find a combination that lets
   * the recorder and the speech service share the mic on phones where the
   * default cannot (see DECISIONS.md §9).
   */
  audioProfile: 'processed',
  speechFirst: false,
  /**
   * Set when the microphone check has proved this phone cannot run speech
   * recognition and the recorder at the same time (S23 Ultra: confirmed across
   * all four profile/order combinations). Live transcription is switched off
   * rather than left to fail on every capture — a speech session that can never
   * succeed still costs battery, still shows an error, and on some orderings
   * measurably degrades the recording itself.
   */
  speechBlockedReason: null,

  /**
   * On-device Whisper (spike, 2026-08-01). Off until the model is downloaded
   * on purpose — a 40 MB download is not something to spring on someone.
   * The app is fully usable audio-only if this is never turned on.
   */
  whisperEnabled: false,
  /**
   * The ship configuration, measured on an S23 Ultra on 2026-08-05 (§22):
   * distil-small.en q8 on the CPU ran 8.5 s of audio in 8.9 s — 1.05× realtime,
   * inside the ~2× ship threshold, under the capped optimizer that actually
   * ships. tiny stays selectable at 0.40× for anyone who wants speed over
   * accuracy.
   */
  whisperModel: 'distil-small',
  /**
   * 'wasm' (CPU only) or 'auto' (try WebGPU first).
   *
   * Defaults to CPU. On the S23 WebGPU loaded, reported itself active, then
   * hung mid-inference with no result and no error. A watchdog trip on WebGPU
   * demotes it to 'wasm' permanently. See DECISIONS.md §13.
   */
  whisperBackend: 'wasm',
  /**
   * Weight format. 'balanced' (8-bit) is CPU-safe; 'smallest' (4-bit) needs
   * the graphics chip and will not create a session on the CPU — that failure
   * is what the S23 hit. See DECISIONS.md §14.
   */
  whisperFormat: 'balanced',

  /**
   * Extra space under the bottom nav, in px.
   *
   * Defaults ON. On an S23 with 3-button navigation Android draws its buttons
   * over a correctly-sized viewport and reports no safe-area inset, so the nav
   * is unreachable. The failure modes are asymmetric: with the gutter off the
   * app can be unusable AND Settings unreachable, so you cannot even turn it
   * on; with it on you get a strip of empty space. Default to reachable.
   * Likely specific to 3-button nav — gesture navigation may not need it.
   */
  navGutter: 48,
  /** Offer to split a dictated line into separate checklist items (spec §8). */
  splitOnFile: true,
  /** Keep the screen awake while recording so a screen-off doesn't cut capture. */
  keepAwake: true,
  haptics: true,
  seeded: false,
  installTipDismissed: false,
}

/**
 * Should this note's recording be deleted? (spec §5)
 *
 * Pulled out as a pure function because it is the only rule in the app that
 * destroys data, and it has three hard guards:
 *   - a note still in the Inbox keeps its audio, always
 *   - a note the user marked "keep" keeps its audio, always
 *   - a note with NO transcript keeps its audio, always — that recording is
 *     the only copy of the thought, and a note that cannot be audited is worse
 *     than no note at all
 * The grace period is what makes "undo" able to put a filed note back intact.
 */
export function shouldDropAudio(note, settings, now = Date.now(), graceMs = 0) {
  if (!note?.audioBlobId) return false
  if (settings?.audioRetention === 'always') return false
  if (note.audioKept) return false
  if (note.bucketId === INBOX) return false
  if (!note.filedAt) return false
  if (now - note.filedAt <= graceMs) return false
  if (!(note.transcript || '').trim()) return false
  return true
}

export function newNote(fields = {}) {
  return {
    id: uid('note'),
    createdAt: Date.now(),
    transcript: '',
    audioBlobId: undefined,
    bucketId: INBOX,
    filedAt: undefined,
    checked: false,
    archived: false,
    audioKept: false,
    duration: 0,
    /**
     * Written-up-from-voice state. Lives on the note itself so the queue
     * survives an app restart for free — there is no separate queue to lose.
     *   null | 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'blocked'
     *
     * 'blocked' is not a failure of the note: the model was evicted from the
     * phone, so nothing can be written up until it is downloaded again. Kept
     * distinct from 'failed' so a single storage event does not read as a list
     * of individual errors, and so the backlog can be released in one go.
     */
    transcribeState: null,
    transcribeMs: 0,
    transcribeError: null,
    ...fields,
  }
}

/** Notes waiting to be written up: has audio, has no words yet. */
export function needsTranscription(note) {
  if (!note?.audioBlobId) return false
  if ((note.transcript || '').trim()) return false
  return note.transcribeState === 'pending' || note.transcribeState === 'running'
}

/** First-run inbox note: onboarding that teaches by being triaged (spec §12). */
export function seedNotes() {
  const now = Date.now()
  return [
    {
      ...newNote({
        transcript:
          'Welcome. This is a note waiting to be filed.\n\nSwipe RIGHT to file it into a bucket, or tap a bucket below. Swipe LEFT to throw it away.\n\nThat is the whole app.',
        createdAt: now - 60000,
      }),
      seed: true,
    },
    {
      ...newNote({
        transcript:
          'To get the Record button on your home screen: press and hold the Quick Notes icon, then drag "Record" out onto the screen. Tap it and you are recording in about two seconds.',
        createdAt: now - 30000,
      }),
      seed: true,
    },
  ]
}
