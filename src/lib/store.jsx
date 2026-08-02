/**
 * The single app store. Everything loads into memory on boot (notes are small
 * text records); audio blobs stay in IndexedDB and are fetched on demand.
 * Every mutation writes through to IndexedDB immediately — there is no save
 * button anywhere in this app, and nothing is ever "unsaved".
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as db from './db.js'
import {
  DEFAULT_SETTINGS,
  INBOX,
  TRASH,
  defaultBuckets,
  newNote,
  seedNotes,
  shouldDropAudio,
  uid,
} from './model.js'
import { buildBackup, parseBackup } from './backup.js'
import { TRANSCRIBERS } from './transcribe.js'

const StoreContext = createContext(null)

/** How long an undo stays offered — also the grace period before audio is swept. */
const UNDO_MS = 8000
const AUDIO_GRACE_MS = 12000

/**
 * Boot runs exactly once per page load no matter how many times the provider
 * mounts (React StrictMode mounts it twice in development).
 */
let bootPromise = null
function bootOnce() {
  bootPromise ||= (async () => {
    let [buckets, notes, settingRows, grocery] = await Promise.all([
      db.getAll('buckets'),
      db.getAll('notes'),
      db.getAll('settings'),
      db.getAll('grocery'),
    ])

    if (!buckets.length) {
      buckets = defaultBuckets()
      await db.putMany('buckets', buckets)
    }

    const settings = { ...DEFAULT_SETTINGS }
    for (const row of settingRows) settings[row.key] = row.value

    // First-run onboarding: notes that teach the app by being triaged (spec §12).
    if (!settings.seeded) {
      const seeds = seedNotes()
      await db.putMany('notes', seeds)
      notes = [...notes, ...seeds]
      settings.seeded = true
      await db.put('settings', { key: 'seeded', value: true })
    }

    return {
      buckets: buckets.sort((a, b) => a.order - b.order),
      notes,
      settings,
      grocery,
    }
  })()
  return bootPromise
}

export function StoreProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [buckets, setBuckets] = useState([])
  const [notes, setNotes] = useState([])
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [grocery, setGrocery] = useState([])
  const [toast, setToast] = useState(null)
  const [bootError, setBootError] = useState(null)

  // Actions read the newest data through refs, so no callback is ever stale
  // and none of them need to be re-created when state changes.
  const notesRef = useRef(notes)
  const bucketsRef = useRef(buckets)
  const settingsRef = useRef(settings)
  const groceryRef = useRef(grocery)
  notesRef.current = notes
  bucketsRef.current = buckets
  settingsRef.current = settings
  groceryRef.current = grocery

  const toastTimer = useRef(0)
  const sweepTimer = useRef(0)

  /**
   * Every note write goes through here so the ref and the React state move
   * together. Without it, two taps inside one frame can read a stale list and
   * silently drop the first change — which on this app means a lost note.
   */
  const writeNotes = useCallback((next) => {
    const rows = typeof next === 'function' ? next(notesRef.current) : next
    notesRef.current = rows
    setNotes(rows)
    return rows
  }, [])

  /* ------------------------------------------------------------------ audio */

  const getAudio = useCallback(async (audioBlobId) => {
    if (!audioBlobId) return null
    return db.get('audio', audioBlobId)
  }, [])

  /**
   * Storage hygiene (spec §5): a filed note drops its recording unless it was
   * explicitly kept. Deliberately deferred past the undo window so "undo" can
   * still put a note back with its audio intact — and it never runs on a note
   * with no transcript, because there the recording is the only copy.
   */
  const sweepAudio = useCallback(async () => {
    const rows = notesRef.current
    const cfg = settingsRef.current
    const now = Date.now()
    const doomed = rows.filter((n) => shouldDropAudio(n, cfg, now, AUDIO_GRACE_MS))
    if (!doomed.length) return
    await db.delMany('audio', doomed.map((n) => n.audioBlobId))
    const ids = new Set(doomed.map((n) => n.id))
    await db.putMany(
      'notes',
      doomed.map((n) => ({ ...n, audioBlobId: undefined }))
    )
    writeNotes((cur) => cur.map((n) => (ids.has(n.id) ? { ...n, audioBlobId: undefined } : n)))
  }, [])

  const scheduleSweep = useCallback(() => {
    clearTimeout(sweepTimer.current)
    sweepTimer.current = setTimeout(sweepAudio, AUDIO_GRACE_MS + 500)
  }, [sweepAudio])

  /* ------------------------------------------------------------------ boot */

  useEffect(() => {
    let cancelled = false
    bootOnce().then(
      (data) => {
        if (cancelled) return
        setBuckets(data.buckets)
        setNotes(data.notes)
        setSettings(data.settings)
        setGrocery(data.grocery)
        applyTheme(data.settings.theme, data.settings.textScale)
        applyGutter(data.settings.navGutter)
        setReady(true)
        db.requestPersistence()
        // Refs are populated on the next render; sweep just after.
        setTimeout(sweepAudio, 0)
      },
      (err) => {
        console.error('[quick-notes] boot failed', err)
        if (cancelled) return
        setBootError(err)
        setReady(true)
      }
    )
    return () => {
      cancelled = true
    }
  }, [sweepAudio])

  /* ------------------------------------------------------------------ toast */

  const showToast = useCallback((message, opts = {}) => {
    clearTimeout(toastTimer.current)
    const entry = { id: uid('t'), message, ...opts }
    setToast(entry)
    const ms = opts.action ? UNDO_MS : opts.ms || 2400
    toastTimer.current = setTimeout(() => {
      setToast((cur) => (cur && cur.id === entry.id ? null : cur))
    }, ms)
    return entry.id
  }, [])

  const dismissToast = useCallback(() => {
    clearTimeout(toastTimer.current)
    setToast(null)
  }, [])

  const haptic = useCallback((pattern = 12) => {
    if (!settingsRef.current.haptics) return
    try {
      navigator.vibrate?.(pattern)
    } catch {
      /* not every device has a motor */
    }
  }, [])

  /* --------------------------------------------------------------- settings */

  const setSetting = useCallback(async (key, value) => {
    const next = { ...settingsRef.current, [key]: value }
    settingsRef.current = next
    setSettings(next)
    if (key === 'theme' || key === 'textScale') applyTheme(next.theme, next.textScale)
    if (key === 'navGutter') applyGutter(value)
    await db.put('settings', { key, value })
  }, [])

  /* ------------------------------------------------------------------ notes */

  const patchNote = useCallback(async (id, patch) => {
    let updated = null
    const rows = notesRef.current.map((n) => {
      if (n.id !== id) return n
      updated = { ...n, ...patch }
      return updated
    })
    if (!updated) return null
    writeNotes(rows)
    await db.put('notes', updated)
    return updated
  }, [writeNotes])

  /** Saves a fresh capture. Called by the record screen; nothing else is asked. */
  const addCapture = useCallback(async ({ transcript = '', blob = null, mimeType = '', duration = 0 } = {}) => {
    const note = newNote({ transcript: (transcript || '').trim(), duration })
    if (blob && blob.size > 0) {
      const audioId = uid('aud')
      await db.put('audio', {
        id: audioId,
        blob,
        mimeType: mimeType || blob.type || 'audio/webm',
        duration,
        createdAt: note.createdAt,
      })
      note.audioBlobId = audioId
      // Queue it for writing up. Capture does not wait for this.
      if (!note.transcript) note.transcribeState = 'pending'
    }
    await db.put('notes', note)
    writeNotes((cur) => [...cur, note])
    return note
  }, [])

  const addTypedNote = useCallback(async (text, bucketId = INBOX) => {
    const note = newNote({
      transcript: text.trim(),
      bucketId,
      filedAt: bucketId === INBOX ? undefined : Date.now(),
    })
    await db.put('notes', note)
    writeNotes((cur) => [...cur, note])
    return note
  }, [])

  const dropAudio = useCallback(
    async (note) => {
      if (!note?.audioBlobId) return
      await db.del('audio', note.audioBlobId)
      await patchNote(note.id, { audioBlobId: undefined, audioKept: false })
    },
    [patchNote]
  )

  /* -------------------------------------------------- grocery / autocomplete */

  /** Builds the local dictionary from what has actually been filed (spec §8). */
  const learnTerms = useCallback(async (bucketId, terms) => {
    const now = Date.now()
    const updates = []
    const current = new Map(groceryRef.current.map((g) => [`${g.bucketId}|${g.term}`, g]))
    for (const raw of terms) {
      const term = String(raw || '').trim()
      if (!term || term.length > 60) continue
      const key = `${bucketId}|${term.toLowerCase()}`
      const prev = current.get(key)
      const row = {
        bucketId,
        term: term.toLowerCase(),
        display: term,
        count: (prev?.count || 0) + 1,
        lastUsed: now,
      }
      current.set(key, row)
      updates.push(row)
    }
    if (!updates.length) return
    await db.putMany('grocery', updates)
    const next = [...current.values()]
    groceryRef.current = next
    setGrocery(next)
  }, [])

  /** Ranked by frequency and recency; prefix matches win (spec §8). */
  const suggestTerms = useCallback((bucketId, prefix, limit = 8) => {
    const q = String(prefix || '').trim().toLowerCase()
    if (!q) return []
    const now = Date.now()
    return groceryRef.current
      .filter((g) => g.bucketId === bucketId && g.term.includes(q) && g.term !== q)
      .map((g) => {
        const starts = g.term.startsWith(q) ? 1 : 0
        const ageDays = (now - (g.lastUsed || 0)) / 86400000
        const recency = 1 / (1 + ageDays / 14)
        return { ...g, score: starts * 100 + g.count * 3 + recency * 10 }
      })
      .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term))
      .slice(0, limit)
      .map((g) => g.display || g.term)
  }, [])

  /* ------------------------------------------------------------------ filing */

  /**
   * The core triage action. One gesture in, note filed, undo offered.
   * `keepAudio` overrides the retention setting for this one note.
   */
  const fileNote = useCallback(
    async (noteId, bucketId, { keepAudio, silent = false, label } = {}) => {
      const note = notesRef.current.find((n) => n.id === noteId)
      if (!note) return null
      const before = { bucketId: note.bucketId, filedAt: note.filedAt, audioKept: note.audioKept }
      const bucket = bucketsRef.current.find((b) => b.id === bucketId)

      const updated = await patchNote(noteId, {
        bucketId,
        filedAt: Date.now(),
        audioKept: keepAudio === undefined ? !!note.audioKept : !!keepAudio,
      })
      haptic(bucketId === TRASH ? [8, 40, 8] : 14)

      if (!silent) {
        showToast(label || `Filed to ${bucket?.name || 'bucket'}`, {
          tone: bucketId === TRASH ? 'danger' : 'good',
          action: 'Undo',
          onAction: async () => {
            await patchNote(noteId, before)
            haptic(8)
            showToast('Put back', { ms: 1400 })
          },
        })
      }
      scheduleSweep()
      return updated
    },
    [patchNote, showToast, haptic, scheduleSweep]
  )

  const trashNote = useCallback(
    (noteId) => fileNote(noteId, TRASH, { keepAudio: true, label: 'Thrown away' }),
    [fileNote]
  )

  const deleteNoteForever = useCallback(async (noteId) => {
    const note = notesRef.current.find((n) => n.id === noteId)
    if (note?.audioBlobId) await db.del('audio', note.audioBlobId)
    await db.del('notes', noteId)
    writeNotes((cur) => cur.filter((n) => n.id !== noteId))
  }, [])

  const emptyTrash = useCallback(async () => {
    const doomed = notesRef.current.filter((n) => n.bucketId === TRASH)
    if (!doomed.length) return 0
    await db.delMany('audio', doomed.filter((n) => n.audioBlobId).map((n) => n.audioBlobId))
    await db.delMany('notes', doomed.map((n) => n.id))
    writeNotes((cur) => cur.filter((n) => n.bucketId !== TRASH))
    return doomed.length
  }, [])

  /**
   * Splitting a dictated line into several checklist items (spec §8).
   * The original note becomes the first item so its recording and timestamp
   * stay attached to something real.
   */
  const splitNoteInto = useCallback(
    async (noteId, bucketId, items, { keepAudio } = {}) => {
      const note = notesRef.current.find((n) => n.id === noteId)
      if (!note || !items.length) return
      const now = Date.now()
      const first = {
        ...note,
        transcript: items[0],
        bucketId,
        filedAt: now,
        audioKept: keepAudio === undefined ? !!note.audioKept : !!keepAudio,
      }
      const rest = items.slice(1).map((text, i) =>
        newNote({
          transcript: text,
          bucketId,
          createdAt: note.createdAt + i + 1,
          filedAt: now,
        })
      )
      const rows = [first, ...rest]
      await db.putMany('notes', rows)
      writeNotes((cur) => [...cur.filter((n) => n.id !== noteId), ...rows])
      await learnTerms(bucketId, items)
      haptic(14)
      scheduleSweep()
    },
    [haptic, scheduleSweep, learnTerms]
  )

  /* --------------------------------------------------------- checked / done */

  const toggleChecked = useCallback(
    async (noteId) => {
      const note = notesRef.current.find((n) => n.id === noteId)
      if (!note) return
      haptic(note.checked ? 6 : 12)
      await patchNote(noteId, { checked: !note.checked })
    },
    [patchNote, haptic]
  )

  const setArchived = useCallback(
    (noteId, archived) => patchNote(noteId, { archived, checked: !!archived }),
    [patchNote]
  )

  /** "Clear completed": archive by default, delete when the bucket says so. */
  const clearCompleted = useCallback(
    async (bucketId) => {
      const bucket = bucketsRef.current.find((b) => b.id === bucketId)
      const done = notesRef.current.filter(
        (n) => n.bucketId === bucketId && n.checked && !n.archived
      )
      if (!done.length) return 0
      const ids = new Set(done.map((n) => n.id))

      if (bucket?.clearMode === 'delete') {
        const snapshot = done.map((n) => ({ ...n }))
        await db.delMany('notes', [...ids])
        writeNotes((cur) => cur.filter((n) => !ids.has(n.id)))
        showToast(`Deleted ${done.length}`, {
          action: 'Undo',
          onAction: async () => {
            await db.putMany('notes', snapshot)
            writeNotes((cur) => [...cur, ...snapshot])
          },
        })
      } else {
        await db.putMany('notes', done.map((n) => ({ ...n, archived: true })))
        writeNotes((cur) => cur.map((n) => (ids.has(n.id) ? { ...n, archived: true } : n)))
        showToast(`Archived ${done.length}`, {
          action: 'Undo',
          onAction: async () => {
            await db.putMany('notes', done.map((n) => ({ ...n, archived: false })))
            writeNotes((cur) => cur.map((n) => (ids.has(n.id) ? { ...n, archived: false } : n)))
          },
        })
      }
      haptic(14)
      return done.length
    },
    [showToast, haptic]
  )

  /* ---------------------------------------------------------------- buckets */

  const addBucket = useCallback(async ({ name, type, color, icon }) => {
    const maxOrder = bucketsRef.current
      .filter((b) => !b.system)
      .reduce((m, b) => Math.max(m, b.order), -1)
    const bucket = {
      id: uid('b'),
      name: (name || '').trim() || 'New list',
      type: type === 'checklist' ? 'checklist' : 'script',
      color: color || 'slate',
      icon: icon || 'note',
      order: maxOrder + 1,
      deletable: true,
      clearMode: 'archive',
    }
    await db.put('buckets', bucket)
    setBuckets((cur) => [...cur, bucket].sort((a, b) => a.order - b.order))
    return bucket
  }, [])

  const updateBucket = useCallback(async (id, patch) => {
    const stored = bucketsRef.current.find((b) => b.id === id)
    if (!stored) return
    const next = { ...stored, ...patch }
    await db.put('buckets', next)
    setBuckets((cur) => cur.map((b) => (b.id === id ? next : b)).sort((a, b) => a.order - b.order))
  }, [])

  /**
   * Deleting a bucket never destroys notes silently — they go back to the Inbox
   * to be re-triaged. Losing a note to a tidy-up is a memory erased.
   */
  const deleteBucket = useCallback(async (id) => {
    const orphans = notesRef.current.filter((n) => n.bucketId === id)
    const rows = orphans.map((n) => ({
      ...n,
      bucketId: INBOX,
      filedAt: undefined,
      archived: false,
    }))
    if (rows.length) await db.putMany('notes', rows)
    await db.del('buckets', id)
    const ids = new Set(rows.map((n) => n.id))
    writeNotes((cur) =>
      cur.map((n) =>
        ids.has(n.id) ? { ...n, bucketId: INBOX, filedAt: undefined, archived: false } : n
      )
    )
    setBuckets((cur) => cur.filter((b) => b.id !== id))
    return rows.length
  }, [])

  /** Reordering is up/down buttons, not drag — kinder to tremor and big fingers. */
  const moveBucket = useCallback(async (id, direction) => {
    const list = bucketsRef.current.filter((b) => !b.system).sort((a, b) => a.order - b.order)
    const index = list.findIndex((b) => b.id === id)
    const target = index + (direction === 'up' ? -1 : 1)
    if (index < 0 || target < 0 || target >= list.length) return
    const reordered = [...list]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    const rows = reordered.map((b, i) => ({ ...b, order: i }))
    await db.putMany('buckets', rows)
    const map = new Map(rows.map((b) => [b.id, b]))
    setBuckets((cur) => cur.map((b) => map.get(b.id) || b).sort((a, b) => a.order - b.order))
  }, [])

  /* ------------------------------------------------------------ backup / io */

  const exportData = useCallback(
    () =>
      buildBackup({
        buckets: bucketsRef.current,
        notes: notesRef.current,
        settings: settingsRef.current,
        grocery: groceryRef.current,
      }),
    []
  )

  const importData = useCallback(async (json, mode = 'merge') => {
    const parsed = parseBackup(json)

    if (mode === 'replace') {
      await db.clearStore('notes')
      await db.clearStore('buckets')
      await db.clearStore('grocery')
      await db.clearStore('audio')
    }

    const bucketById = new Map(
      (mode === 'replace' ? [] : bucketsRef.current).map((b) => [b.id, b])
    )
    for (const b of parsed.buckets) if (!bucketById.has(b.id)) bucketById.set(b.id, b)
    if (!bucketById.has(TRASH)) {
      bucketById.set(TRASH, defaultBuckets().find((b) => b.id === TRASH))
    }
    const mergedBuckets = [...bucketById.values()].sort((a, b) => a.order - b.order)

    const noteById = new Map((mode === 'replace' ? [] : notesRef.current).map((n) => [n.id, n]))
    let added = 0
    for (const n of parsed.notes) {
      if (noteById.has(n.id)) continue
      noteById.set(n.id, n)
      added++
    }
    const mergedNotes = [...noteById.values()]

    const key = (g) => `${g.bucketId}|${g.term}`
    const groceryMap = new Map(
      (mode === 'replace' ? [] : groceryRef.current).map((g) => [key(g), g])
    )
    for (const g of parsed.grocery) {
      const prev = groceryMap.get(key(g))
      groceryMap.set(key(g), {
        ...g,
        count: (prev?.count || 0) + g.count,
        lastUsed: Math.max(prev?.lastUsed || 0, g.lastUsed),
      })
    }
    const mergedGrocery = [...groceryMap.values()]

    await db.putMany('buckets', mergedBuckets)
    await db.putMany('notes', mergedNotes)
    await db.putMany('grocery', mergedGrocery)

    setBuckets(mergedBuckets)
    writeNotes(mergedNotes)
    setGrocery(mergedGrocery)

    return { buckets: mergedBuckets.length, added, total: mergedNotes.length }
  }, [])

  const eraseEverything = useCallback(async () => {
    const keep = { theme: settingsRef.current.theme, textScale: settingsRef.current.textScale }
    await db.clearAll()
    const fresh = defaultBuckets()
    await db.putMany('buckets', fresh)
    const restored = { ...DEFAULT_SETTINGS, ...keep, seeded: true }
    await db.putMany(
      'settings',
      Object.entries(restored).map(([k, v]) => ({ key: k, value: v }))
    )
    setBuckets(fresh)
    writeNotes([])
    setGrocery([])
    setSettings(restored)
  }, [])

  /* ------------------------------------------ background transcription */

  /**
   * Writes saved notes up from their recordings, one at a time, in the
   * background (DECISIONS.md §12).
   *
   * Rules this exists to keep:
   *   - capture NEVER waits on it; the note is already saved before it starts
   *   - a failure is never a lost note; the audio is untouched either way
   *   - the queue is note state, not a separate list, so an app restart or a
   *     kill mid-pass loses nothing and resumes on its own
   */
  const queueRunning = useRef(false)
  const [transcribing, setTranscribing] = useState(null)

  const runTranscriptionQueue = useCallback(async () => {
    if (queueRunning.current) return
    const cfg = settingsRef.current
    if (!cfg.whisperEnabled) return

    queueRunning.current = true
    try {
      for (;;) {
        const next = notesRef.current.find(
          (n) =>
            n.audioBlobId &&
            !(n.transcript || '').trim() &&
            (n.transcribeState === 'pending' || n.transcribeState === 'running')
        )
        if (!next) break
        if (!settingsRef.current.whisperEnabled) break

        setTranscribing({ id: next.id })
        await patchNote(next.id, { transcribeState: 'running' })

        try {
          const row = await db.get('audio', next.audioBlobId)
          if (!row?.blob) throw new Error('recording missing')

          const { transcribeBlobDetailed } = TRANSCRIBERS.whisper
          const result = await transcribeBlobDetailed(row.blob, {
            modelId: settingsRef.current.whisperModel,
            backend: settingsRef.current.whisperBackend,
          })

          // Never overwrite words the user typed while this was running.
          const current = notesRef.current.find((n) => n.id === next.id)
          if (!current) continue
          if ((current.transcript || '').trim()) {
            await patchNote(next.id, { transcribeState: 'skipped' })
          } else if (result.text) {
            await patchNote(next.id, {
              transcript: result.text,
              transcribeState: 'done',
              transcribeMs: result.tookMs,
            })
          } else {
            await patchNote(next.id, { transcribeState: 'failed' })
          }
        } catch (err) {
          console.warn('[quick-notes] transcription failed', err)

          /**
           * A watchdog trip on WebGPU demotes it permanently and retries the
           * same note on CPU. WebGPU reported itself active on the S23 and
           * then hung forever; slow but finishing beats fast but hung, and the
           * user should not have to know any of that happened.
           */
          const timedOut = err?.name === 'TranscribeTimeout'
          const wasWebGPU = err?.backend === 'webgpu'
          const { unloadWhisper } = await import('./whisper.js')
          await unloadWhisper()

          if (timedOut && wasWebGPU && settingsRef.current.whisperBackend !== 'wasm') {
            await setSetting('whisperBackend', 'wasm')
            await patchNote(next.id, { transcribeState: 'pending' })
            showToast('Switched to the slower, reliable method', { ms: 3000 })
            continue
          }

          await patchNote(next.id, {
            transcribeState: 'failed',
            transcribeError: timedOut ? 'took too long' : String(err?.message || err).slice(0, 140),
          })
          // Stop the run rather than grinding the same fault through every
          // queued note. They stay 'pending'-able via Retry.
          if (timedOut) break
        }
      }
    } finally {
      queueRunning.current = false
      setTranscribing(null)
    }
  }, [patchNote, setSetting, showToast])

  /** Puts a note (back) in the queue. Used on capture and on manual retry. */
  const enqueueTranscription = useCallback(
    async (noteId) => {
      await patchNote(noteId, { transcribeState: 'pending', transcribeError: null })
      runTranscriptionQueue()
    },
    [patchNote, runTranscriptionQueue]
  )

  /** Puts every failed note back in the queue. */
  const retryAllTranscription = useCallback(async () => {
    const failed = notesRef.current.filter((n) => n.transcribeState === 'failed')
    await Promise.all(
      failed.map((n) => patchNote(n.id, { transcribeState: 'pending', transcribeError: null }))
    )
    runTranscriptionQueue()
    return failed.length
  }, [patchNote, runTranscriptionQueue])

  /** Counts for the UI, so a stalled queue is visible rather than inferred. */
  const transcribeCounts = useMemo(() => {
    let pending = 0
    let failed = 0
    for (const n of notes) {
      if (n.transcribeState === 'pending' || n.transcribeState === 'running') pending++
      else if (n.transcribeState === 'failed') failed++
    }
    return { pending, failed }
  }, [notes])

  // Resume on launch: anything left 'running' when the app died goes back to
  // 'pending' and the queue picks it up.
  useEffect(() => {
    if (!ready || !settings.whisperEnabled) return
    const stuck = notesRef.current.filter((n) => n.transcribeState === 'running')
    Promise.all(stuck.map((n) => patchNote(n.id, { transcribeState: 'pending' }))).then(() =>
      runTranscriptionQueue()
    )
  }, [ready, settings.whisperEnabled, patchNote, runTranscriptionQueue])

  /* ------------------------------------------------------------ lifecycle */

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') sweepAudio()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [sweepAudio])

  useEffect(
    () => () => {
      clearTimeout(toastTimer.current)
      clearTimeout(sweepTimer.current)
    },
    []
  )

  /* --------------------------------------------------------------- derived */

  const inboxNotes = useMemo(
    () => notes.filter((n) => n.bucketId === INBOX).sort((a, b) => a.createdAt - b.createdAt),
    [notes]
  )

  const notesByBucket = useMemo(() => {
    const map = {}
    for (const n of notes) (map[n.bucketId] ||= []).push(n)
    for (const key of Object.keys(map)) map[key].sort((a, b) => a.createdAt - b.createdAt)
    return map
  }, [notes])

  const bucketCounts = useMemo(() => {
    const map = {}
    for (const n of notes) {
      if (n.archived) continue
      map[n.bucketId] = (map[n.bucketId] || 0) + 1
    }
    return map
  }, [notes])

  const fileableBuckets = useMemo(
    () => buckets.filter((b) => b.id !== TRASH).sort((a, b) => a.order - b.order),
    [buckets]
  )

  const getBucket = useCallback((id) => bucketsRef.current.find((b) => b.id === id), [])

  const value = {
    ready,
    bootError,
    buckets,
    fileableBuckets,
    notes,
    settings,
    grocery,
    inboxNotes,
    notesByBucket,
    bucketCounts,
    toast,
    showToast,
    dismissToast,
    haptic,
    setSetting,
    addCapture,
    addTypedNote,
    patchNote,
    fileNote,
    trashNote,
    deleteNoteForever,
    emptyTrash,
    splitNoteInto,
    toggleChecked,
    setArchived,
    clearCompleted,
    addBucket,
    updateBucket,
    deleteBucket,
    moveBucket,
    getAudio,
    dropAudio,
    learnTerms,
    suggestTerms,
    exportData,
    importData,
    eraseEverything,
    getBucket,
    transcribing,
    enqueueTranscription,
    retryAllTranscription,
    transcribeCounts,
    runTranscriptionQueue,
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}

/* ------------------------------------------------------------------ theme */

const THEME_COLORS = { dark: '#14170F', sepia: '#E8DCC0' }

/** Extra bottom clearance for phones whose system buttons overlay the app. */
export function applyGutter(px) {
  const value = Number.isFinite(Number(px)) ? Math.max(0, Number(px)) : 0
  document.documentElement.style.setProperty('--nav-gutter', `${value}px`)
  try {
    localStorage.setItem('qn.navGutter', String(value))
  } catch {
    /* private mode */
  }
}

export function applyTheme(theme, textScale) {
  const t = theme === 'sepia' ? 'sepia' : 'dark'
  document.documentElement.dataset.theme = t
  document.documentElement.style.setProperty('--ui-scale', textScale || '1')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLORS[t])
  try {
    localStorage.setItem('qn.theme', t)
    localStorage.setItem('qn.textScale', textScale || '1')
  } catch {
    /* private mode — the boot script just falls back to the default */
  }
}
