/**
 * INBOX — triage (spec §7).
 *
 * One note at a time, oldest first, filed with one gesture.
 *
 * The trap this screen was rebuilt around (spec §3, prototype findings): an
 * editable <textarea> swallows the pointer drag for text selection and kills
 * the swipe. So the note renders as STATIC TEXT, the whole screen is the swipe
 * surface, and editing lives behind a pencil toggle that disables swiping while
 * it is on.
 *
 * Swipe right -> bucket picker. Swipe left -> trash. The tap grid underneath is
 * the equal path, not a fallback.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useRouter } from '../lib/router.jsx'
import { INBOX } from '../lib/model.js'
import { looksSplittable, splitItems } from '../lib/text.js'
import { friendlyDate, relativeAge, firstLine } from '../lib/format.js'
import Icon from '../components/Icon.jsx'
import Button, { IconButton } from '../components/Button.jsx'
import { Screen, ScreenHeader, EmptyState } from '../components/Screen.jsx'
import BucketTile from '../components/BucketTile.jsx'
import BucketPickerSheet from '../components/BucketPickerSheet.jsx'
import SplitSheet from '../components/SplitSheet.jsx'
import Sheet from '../components/Sheet.jsx'
import AudioPlayer from '../components/AudioPlayer.jsx'
import Stamp from '../components/Stamp.jsx'
import { STAMP_MS, STAMP_GUARD_MS, STAMP_REDUCED_GUARD_MS } from '../ui/constants.js'

/**
 * How far a drag must travel to count as a swipe.
 *
 * The v2 prototype used a flat ±90px. This uses a share of the viewport width,
 * which lands at ~99px on an S23 Ultra — the two arrived at nearly the same
 * distance independently, so the feel is the tested one. See DECISIONS.md.
 */
const COMMIT_RATIO = 0.24
const FLICK_VELOCITY = 0.55 // px per ms

export default function Inbox() {
  const {
    inboxNotes,
    fileableBuckets,
    bucketCounts,
    settings,
    fileNote,
    trashNote,
    patchNote,
    splitNoteInto,
    getBucket,
    haptic,
    enqueueTranscription,
  } = useStore()
  const { navigate } = useRouter()

  const [mode, setMode] = useState('card') // card | list
  const [focusId, setFocusId] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [stamp, setStamp] = useState(null)
  const [pending, setPending] = useState(null) // { note, bucket, items? }
  const [splitOpen, setSplitOpen] = useState(false)
  const [audioAskOpen, setAudioAskOpen] = useState(false)

  const note = useMemo(() => {
    if (!inboxNotes.length) return null
    if (focusId) {
      const found = inboxNotes.find((n) => n.id === focusId)
      if (found) return found
    }
    return inboxNotes[0]
  }, [inboxNotes, focusId])

  /* ------------------------------------------------------------ gesture state */

  const [dx, setDx] = useState(0)
  const [springing, setSpringing] = useState(false)
  const drag = useRef({ active: false, axis: null, x0: 0, y0: 0, t0: 0 })
  const surfaceRef = useRef(null)
  const bumped = useRef(false)
  const stampTimer = useRef(0)

  /** Kills any in-flight drag dead, with no spring-back animation. */
  const cancelGesture = useCallback(() => {
    drag.current.active = false
    drag.current.axis = null
    bumped.current = false
    setSpringing(false)
    setDx(0)
  }, [])

  /**
   * A new card is a new gesture. Reset the drag offset and the spring along
   * with the edit state, or the incoming note inherits the outgoing one's
   * transform. (AudioPlayer resets itself on note change — not duplicated here.)
   */
  useEffect(() => {
    setEditing(false)
    setDraft(note?.transcript || '')
    cancelGesture()
  }, [note?.id, cancelGesture])

  const buckets = useMemo(() => fileableBuckets.filter((b) => b.id !== INBOX), [fileableBuckets])

  /* --------------------------------------------------------------- filing */

  /**
   * Lands the stamp and holds the swipe surface shut while it plays, so the
   * follow-through of a flick cannot file the next note as well.
   */
  const flashStamp = useCallback(
    (text, tone, sub) => {
      cancelGesture()
      setStamp({ text, tone, sub, key: Date.now() })
      clearTimeout(stampTimer.current)
      // Read at call time rather than subscribing: this runs a few times a day,
      // and a listener would be more machinery than the question deserves.
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
      stampTimer.current = setTimeout(
        () => setStamp(null),
        reduced ? STAMP_REDUCED_GUARD_MS : STAMP_GUARD_MS
      )
    },
    [cancelGesture]
  )

  useEffect(() => () => clearTimeout(stampTimer.current), [])

  const commitFile = useCallback(
    async (target, bucket, { keepAudio, items } = {}) => {
      if (items?.length) {
        await splitNoteInto(target.id, bucket.id, items, { keepAudio })
        flashStamp('Filed', 'accent', `${items.length} to ${bucket.name}`)
      } else {
        await fileNote(target.id, bucket.id, { keepAudio })
        flashStamp('Filed', 'accent', bucket.name)
      }
      setFocusId(null)
    },
    [fileNote, splitNoteInto, flashStamp]
  )

  /**
   * Filing runs a short queue of questions, never more than one on screen:
   *   1. break this into separate items?   (checklist buckets only)
   *   2. keep the recording?               (only when retention is "ask")
   * Most filings ask nothing at all.
   */
  const startFiling = useCallback(
    (bucket, target = note) => {
      if (!target || !bucket) return
      setPickerOpen(false)

      const wantsSplit =
        settings.splitOnFile && bucket.type === 'checklist' && looksSplittable(target.transcript)
      if (wantsSplit) {
        setPending({ note: target, bucket, items: splitItems(target.transcript) })
        setSplitOpen(true)
        return
      }

      const wantsAudioAsk = settings.audioRetention === 'ask' && !!target.audioBlobId
      if (wantsAudioAsk) {
        setPending({ note: target, bucket })
        setAudioAskOpen(true)
        return
      }

      commitFile(target, bucket)
    },
    [note, settings.splitOnFile, settings.audioRetention, commitFile]
  )

  const afterSplitChoice = useCallback(
    (items) => {
      const { note: target, bucket } = pending || {}
      if (!target || !bucket) return
      if (settings.audioRetention === 'ask' && target.audioBlobId) {
        setPending({ note: target, bucket, items })
        setAudioAskOpen(true)
        return
      }
      commitFile(target, bucket, { items })
      setPending(null)
    },
    [pending, settings.audioRetention, commitFile]
  )

  const afterAudioChoice = useCallback(
    (keepAudio) => {
      const { note: target, bucket, items } = pending || {}
      setAudioAskOpen(false)
      setPending(null)
      if (!target || !bucket) return
      commitFile(target, bucket, { keepAudio, items })
    },
    [pending, commitFile]
  )

  const doTrash = useCallback(
    async (target = note) => {
      if (!target) return
      await trashNote(target.id)
      flashStamp('Trashed', 'danger')
      setFocusId(null)
    },
    [note, trashNote, flashStamp]
  )

  /* ---------------------------------------------------------------- swipe */

  const resetDrag = useCallback((animate = true) => {
    drag.current.active = false
    drag.current.axis = null
    bumped.current = false
    setSpringing(animate)
    setDx(0)
    if (animate) setTimeout(() => setSpringing(false), 220)
  }, [])

  const onPointerDown = (e) => {
    if (editing || !note) return
    // Do not remove: the picker sheet has its own scrim, so this is redundant
    // today. It is here so a refactor that changes how the sheet is layered
    // cannot silently let a drag start underneath an open picker.
    if (pickerOpen) return
    // A stamp is playing. Ignore the follow-through of the flick that caused
    // it, or the same gesture files the next note too.
    if (stamp) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    drag.current = { active: true, axis: null, x0: e.clientX, y0: e.clientY, t0: Date.now() }
    bumped.current = false
    setSpringing(false)
  }

  const onPointerMove = (e) => {
    const d = drag.current
    if (!d.active) return
    const moveX = e.clientX - d.x0
    const moveY = e.clientY - d.y0

    if (!d.axis) {
      // Decide the axis once. A mostly-vertical move hands control back to the
      // scroller and this gesture is over.
      if (Math.abs(moveX) > 12 && Math.abs(moveX) > Math.abs(moveY) * 1.3) {
        d.axis = 'x'
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* capture is a nicety */
        }
      } else if (Math.abs(moveY) > 12) {
        d.axis = 'y'
        d.active = false
        return
      } else {
        return
      }
    }

    if (d.axis === 'x') {
      const width = surfaceRef.current?.clientWidth || 360
      if (!bumped.current && Math.abs(moveX) > width * COMMIT_RATIO) {
        bumped.current = true
        haptic(10)
      }
      setDx(moveX)
    }
  }

  const onPointerUp = (e) => {
    const d = drag.current
    if (!d.active || d.axis !== 'x') {
      resetDrag(false)
      return
    }
    const moveX = e.clientX - d.x0
    const width = surfaceRef.current?.clientWidth || 360
    const elapsed = Math.max(1, Date.now() - d.t0)
    const velocity = Math.abs(moveX) / elapsed
    const committed = Math.abs(moveX) > width * COMMIT_RATIO || velocity > FLICK_VELOCITY

    resetDrag(true)
    if (!committed || !note) return

    if (moveX > 0) {
      haptic(12)
      setPickerOpen(true)
    } else {
      doTrash()
    }
  }

  /* ---------------------------------------------------------------- render */

  const header = (
    <ScreenHeader
      title="Inbox"
      subtitle={
        inboxNotes.length
          ? `${inboxNotes.length} waiting${note ? ` · oldest ${relativeAge(note.createdAt)}` : ''}`
          : 'All clear'
      }
      right={
        <>
          {inboxNotes.length > 1 && (
            <IconButton
              icon={mode === 'card' ? 'text' : 'note'}
              label={mode === 'card' ? 'Show as a list' : 'Show one at a time'}
              onClick={() => {
                setMode(mode === 'card' ? 'list' : 'card')
                setFocusId(null)
              }}
            />
          )}
          <RecordButton onClick={() => navigate('record')} />
        </>
      }
    />
  )

  if (!inboxNotes.length) {
    return (
      <Screen>
        {header}
        <div className="scroll-y min-h-0 flex-1">
          <EmptyState
            icon="check"
            title="Inbox clear"
            message="Nothing left to sort. Everything you captured is filed away."
            action={
              <Button variant="primary" full icon="mic" onClick={() => navigate('record')}>
                Record a note
              </Button>
            }
          />
        </div>
      </Screen>
    )
  }

  if (mode === 'list') {
    return (
      <Screen>
        {header}
        <div className="scroll-y min-h-0 flex-1">
          <ul className="mx-auto max-w-lg space-y-2 px-3 pt-3 pb-8">
            {inboxNotes.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => {
                    setFocusId(row.id)
                    setMode('card')
                  }}
                  className="press focus-ring paper flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[1rem] text-ink">
                      {firstLine(row.transcript) || 'Voice note (no text)'}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-[0.75rem] text-muted">
                      {friendlyDate(row.createdAt)}
                      {row.audioBlobId && <Icon name="mic" size={13} />}
                    </span>
                  </span>
                  <Icon name="chevronRight" size={22} className="shrink-0 text-faint" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Screen>
    )
  }

  const width = surfaceRef.current?.clientWidth || 360
  const progress = Math.min(1, Math.abs(dx) / (width * COMMIT_RATIO))
  const armed = progress >= 1

  return (
    <Screen>
      {header}

      {/* The swipe surface is the whole region, not just the card. */}
      <div
        ref={surfaceRef}
        className={[
          'relative flex min-h-0 flex-1 flex-col overflow-hidden',
          // While editing, hand the surface back to the browser so the textarea
          // gets its normal selection, caret and scroll behaviour.
          editing ? '' : 'swipe-surface',
        ].join(' ')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => resetDrag(true)}
      >
        {stamp && (
          <Stamp
            text={stamp.text}
            tone={stamp.tone}
            sub={stamp.sub}
            key={stamp.key}
            style={{ '--stamp-ms': `${STAMP_MS}ms` }}
          />
        )}

        <SwipeHint side="right" progress={dx > 0 ? progress : 0} armed={armed && dx > 0} />
        <SwipeHint side="left" progress={dx < 0 ? progress : 0} armed={armed && dx < 0} />

        <div
          className="flex min-h-0 flex-1 flex-col"
          style={{
            // rotate(dx/60) is the v2 prototype's tilt, kept as tested.
            transform: `translateX(${dx}px) rotate(${dx / 60}deg)`,
            transition: springing ? 'transform 200ms cubic-bezier(.2,.8,.2,1)' : 'none',
          }}
        >
          <TriageCard
            note={note}
            editing={editing}
            draft={draft}
            setDraft={setDraft}
            onToggleEdit={async () => {
              if (editing) {
                const text = draft.trim()
                if (text !== (note.transcript || '').trim()) {
                  await patchNote(note.id, { transcript: text })
                }
                setEditing(false)
              } else {
                setDraft(note.transcript || '')
                setEditing(true)
              }
            }}
            onToggleKeepAudio={() => patchNote(note.id, { audioKept: !note.audioKept })}
            onRetryTranscribe={() => enqueueTranscription(note.id)}
            retention={settings.audioRetention}
            remaining={inboxNotes.length}
          />
        </div>
      </div>

      {/* The equal path: tap a bucket. Always visible, never scrolled away. */}
      <div className="shrink-0 border-t border-line bg-bg2">
        <div className="mx-auto max-w-lg px-2.5 pt-2 pb-2.5">
          <div className="flex items-center justify-between px-1 pb-1.5">
            <span className="stamp-label text-[0.66rem] text-faint">File it</span>
            <button
              type="button"
              onClick={() => doTrash()}
              className="press focus-ring flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[0.78rem] text-muted"
            >
              <Icon name="trash" size={17} />
              Throw away
            </button>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {buckets.slice(0, 10).map((bucket) => (
              <BucketTile
                key={bucket.id}
                bucket={bucket}
                size="sm"
                count={bucketCounts[bucket.id] || 0}
                onClick={() => startFiling(bucket)}
              />
            ))}
          </div>
          {buckets.length > 10 && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="press focus-ring mt-1.5 min-h-11 w-full rounded-lg border border-line text-[0.8rem] text-muted"
            >
              Show all {buckets.length} buckets
            </button>
          )}
        </div>
      </div>

      <BucketPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        buckets={buckets}
        counts={bucketCounts}
        onPick={(bucket) => startFiling(bucket)}
        onTrash={() => doTrash()}
      />

      <SplitSheet
        open={splitOpen}
        onClose={() => setSplitOpen(false)}
        bucket={pending?.bucket}
        items={pending?.items}
        onConfirm={afterSplitChoice}
        onKeepWhole={() => {
          const { note: target, bucket } = pending || {}
          setPending(null)
          if (target && bucket) {
            if (settings.audioRetention === 'ask' && target.audioBlobId) {
              setPending({ note: target, bucket })
              setAudioAskOpen(true)
            } else {
              commitFile(target, bucket)
            }
          }
        }}
      />

      <Sheet
        open={audioAskOpen}
        onClose={() => afterAudioChoice(false)}
        title="Keep the recording?"
        subtitle={`Filing to ${pending?.bucket?.name || 'a bucket'}.`}
      >
        <div className="space-y-2.5 py-2">
          <Button variant="primary" full icon="mic" onClick={() => afterAudioChoice(true)}>
            Keep the recording
          </Button>
          <Button variant="quiet" full icon="check" onClick={() => afterAudioChoice(false)}>
            Keep just the text
          </Button>
        </div>
      </Sheet>
    </Screen>
  )
}

/* ------------------------------------------------------------------------ */

function RecordButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Record a note"
      className="press focus-ring tap flex items-center justify-center rounded-xl border-2 border-stamp text-stamp"
    >
      <Icon name="mic" size={24} strokeWidth={2} />
    </button>
  )
}

/** The reveal behind the card as you drag. */
function SwipeHint({ side, progress, armed }) {
  const right = side === 'right'
  if (progress <= 0.02) return null
  return (
    <div
      className={[
        'pointer-events-none absolute inset-y-0 z-10 flex w-32 items-center',
        right ? 'left-0 justify-start pl-4' : 'right-0 justify-end pr-4',
      ].join(' ')}
      style={{ opacity: Math.min(1, progress) }}
    >
      <div
        className={[
          'flex flex-col items-center gap-2 rounded-2xl border-2 px-3 py-4',
          right ? 'border-accent text-accent' : 'border-danger text-danger',
        ].join(' ')}
        style={{ transform: `scale(${0.85 + Math.min(1, progress) * 0.25})` }}
      >
        <Icon name={right ? 'archive' : 'trash'} size={30} strokeWidth={armed ? 2.4 : 1.8} />
        <span className="stamp-label text-[0.7rem]">{right ? 'File' : 'Trash'}</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------ */

function TriageCard({
  note,
  editing,
  draft,
  setDraft,
  onToggleEdit,
  onToggleKeepAudio,
  onRetryTranscribe,
  retention,
  remaining,
}) {
  const textareaRef = useRef(null)

  useEffect(() => {
    if (editing) {
      const el = textareaRef.current
      el?.focus()
      el?.setSelectionRange(el.value.length, el.value.length)
    }
  }, [editing])

  const text = (note.transcript || '').trim()
  const showKeepToggle = !!note.audioBlobId && retention !== 'always'

  return (
    <div className="animate-deal mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col px-3 pt-3 pb-2">
      <div className="paper flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
        {/* card head */}
        <div className="flex shrink-0 items-center gap-2 border-b border-linesoft px-3 py-2">
          <Icon name="clock" size={15} className="shrink-0 text-faint" />
          <span className="min-w-0 flex-1 truncate text-[0.78rem] text-muted">
            {friendlyDate(note.createdAt)}
          </span>
          <span className="stamp-label shrink-0 text-[0.66rem] text-faint">
            {remaining} left
          </span>
        </div>

        {/* body: static text unless editing — the whole reason swipe works */}
        <div className="scroll-y min-h-0 flex-1">
          {editing ? (
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck
              className="ruled ruled-margin block h-full min-h-[10rem] w-full resize-none touch-auto bg-transparent px-4 py-2.5 pl-10 text-[1.1rem] leading-8 outline-none select-text"
              placeholder="Type what this note should say…"
              aria-label="Edit the note"
            />
          ) : (
            <div className="ruled ruled-margin px-4 py-2.5 pl-10">
              {text ? (
                <p className="text-[1.1rem] leading-8 whitespace-pre-wrap text-ink">{text}</p>
              ) : (
                <p className="text-[1.05rem] leading-8 text-muted">
                  No words came through. Play the recording and type what it says.
                </p>
              )}
            </div>
          )}
        </div>

        {/* card foot: audit tools */}
        <div className="shrink-0 space-y-2 border-t border-linesoft px-3 py-2.5">
          {/* Written-up-from-voice state. A queue that stalls silently is
              indistinguishable from one that is working, and nobody should
              have to watch a counter to find that out. */}
          {note.transcribeState === 'pending' && (
            <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface2 px-3 py-2">
              <Icon name="clock" size={18} className="shrink-0 text-muted" />
              <span className="text-[0.8rem] leading-snug text-muted">
                Waiting to be written up from your voice.
              </span>
            </div>
          )}
          {note.transcribeState === 'running' && (
            <div className="flex items-center gap-2.5 rounded-xl border border-accent px-3 py-2">
              <Icon name="text" size={18} className="shrink-0 animate-rec text-accent" />
              <span className="text-[0.8rem] leading-snug text-ink">Writing this one up now…</span>
            </div>
          )}
          {/* Not a failure of this note. The model was evicted, so nothing can
              be written up until it is downloaded again — said once, plainly,
              rather than as an error on every waiting note. */}
          {note.transcribeState === 'blocked' && (
            <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface2 px-3 py-2">
              <Icon name="warning" size={18} className="shrink-0 text-muted" />
              <span className="text-[0.8rem] leading-snug text-muted">
                Waiting — the write-up model is not on this phone any more. Your voice is still
                here. Open Settings to get it back.
              </span>
            </div>
          )}
          {note.transcribeState === 'failed' && (
            <button
              type="button"
              onClick={onRetryTranscribe}
              className="press focus-ring flex w-full items-center gap-2.5 rounded-xl border border-danger px-3 py-2 text-left"
            >
              <Icon name="warning" size={18} className="shrink-0 text-danger" />
              <span className="min-w-0 flex-1 text-[0.8rem] leading-snug text-muted">
                Could not write this one up
                {note.transcribeError ? ` — ${note.transcribeError}` : ''}. Play it and type it in,
                or tap to try again.
              </span>
              <span className="stamp-label shrink-0 text-[0.62rem] text-accent">Retry</span>
            </button>
          )}

          {note.audioBlobId ? (
            <AudioPlayer note={note} compact />
          ) : (
            // Say it out loud when there is no recording. Silently omitting the
            // player made "the play button is missing" indistinguishable from
            // "this note never had audio" during device testing — and for the
            // person using it, a note with neither words nor voice is the one
            // thing that must never look fine.
            <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface2 px-3 py-2">
              <Icon name="warning" size={18} className="shrink-0 text-muted" />
              <span className="text-[0.8rem] leading-snug text-muted">
                No recording attached to this note.
              </span>
            </div>
          )}

          {showKeepToggle && (
            <button
              type="button"
              onClick={onToggleKeepAudio}
              className="press focus-ring flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-line px-3 text-left text-[0.82rem] text-muted"
            >
              <Icon name={note.audioKept ? 'check' : 'trash'} size={18} className="shrink-0" />
              <span className="min-w-0 flex-1">
                {note.audioKept
                  ? 'Recording will be kept after filing'
                  : 'Recording is deleted when filed'}
              </span>
              <span className="stamp-label shrink-0 text-[0.62rem] text-accent">Change</span>
            </button>
          )}

          {/* When there is no transcript at all, typing it in IS the task —
              so the button says so and leads, rather than sitting quiet as a
              "fix" for words that were never there. */}
          <Button
            variant={editing || !text ? 'primary' : 'quiet'}
            full
            icon={editing ? 'check' : 'pencil'}
            onClick={onToggleEdit}
          >
            {editing ? 'Done editing' : text ? 'Fix the words' : 'Type what it says'}
          </Button>

          {editing && (
            <p className="px-1 text-center text-[0.74rem] text-faint">
              Swiping is off while you edit.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
