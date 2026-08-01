/**
 * /record — the whole point of the app.
 *
 * Spec §1: capture must cost less than the thought is worth. Spec §3:
 *   - the mic starts the instant this route loads, no tap at all
 *   - if the browser won't allow that, the ENTIRE viewport becomes one button
 *   - big timer, live transcript for reassurance, one full-width STOP & SAVE
 *   - leaving the app saves instead of losing the capture
 *   - saving is instant: no interstitial, no title prompt, no bucket prompt
 *
 * Zero decisions on this screen. Everything else is triage's job.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from '../lib/router.jsx'
import { useStore } from '../lib/store.jsx'
import { Recorder, micErrorMessage, micPermissionState, recorderSupported } from '../lib/recorder.js'
import { getTranscriber, describeSpeechError } from '../lib/transcribe.js'
import { isStandalone } from '../lib/diagnostics.js'
import { clockTime } from '../lib/format.js'
import Icon from '../components/Icon.jsx'
import Button from '../components/Button.jsx'
import Stamp from '../components/Stamp.jsx'
import { ConfirmSheet } from '../components/Sheet.jsx'
import { STAMP_MS } from '../ui/constants.js'

const PHASE = {
  OPENING: 'opening', // asking for the mic
  READY: 'ready', // waiting for one tap (autostart unavailable)
  RECORDING: 'recording',
  SAVED: 'saved',
  ERROR: 'error',
}

export default function Record() {
  const { navigate, nav } = useRouter()
  const { addCapture, patchNote, settings, haptic, showToast } = useStore()

  const [phase, setPhase] = useState(PHASE.OPENING)
  const [elapsed, setElapsed] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [level, setLevel] = useState(0)
  const [error, setError] = useState(null)
  const [errorName, setErrorName] = useState(null)
  const [speechError, setSpeechError] = useState(null)
  const [saved, setSaved] = useState(null)
  const [showStamp, setShowStamp] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const recorderRef = useRef(null)
  const sessionRef = useRef(null)
  const transcriptRef = useRef('')
  const savingRef = useRef(false)
  const startingRef = useRef(false)
  const tickRef = useRef(0)
  const wakeLockRef = useRef(null)
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  /* ---------------------------------------------------------- wake lock */

  const acquireWakeLock = useCallback(async () => {
    if (!settings.keepAwake || !navigator.wakeLock) return
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
    } catch {
      /* not fatal — the recording still runs */
    }
  }, [settings.keepAwake])

  const releaseWakeLock = useCallback(() => {
    try {
      wakeLockRef.current?.release?.()
    } catch {
      /* ignore */
    }
    wakeLockRef.current = null
  }, [])

  /* ------------------------------------------------------------- start */

  /**
   * `fromTap` means we are inside a real user gesture.
   *
   * This matters on the installed app: a WebAPK is a separate Android package
   * with its own runtime microphone permission, and Android will not raise that
   * prompt outside a user gesture. Autostarting on load in the installed app
   * therefore failed silently — the whole two-icon design died there. So we
   * only autostart when the permission is already granted; otherwise the
   * one-tap screen comes first and the tap is what asks.
   */
  const begin = useCallback(async ({ fromTap = false } = {}) => {
    if (phaseRef.current === PHASE.RECORDING) return
    if (startingRef.current) return
    if (!recorderSupported()) {
      setError('This browser cannot record audio. Try Chrome.')
      setErrorName('NotSupportedError')
      setPhase(PHASE.ERROR)
      return
    }

    if (!fromTap) {
      const state = await micPermissionState()
      if (state !== 'granted' && state !== 'unknown') {
        // Not ours to take yet. Show the one-tap screen; the tap asks.
        setPhase(PHASE.READY)
        setError(
          state === 'denied'
            ? isStandalone()
              ? 'The microphone is blocked for this app. Android Settings → Apps → Quick Notes → Permissions → Microphone → Allow.'
              : 'The microphone is blocked. Allow it in Chrome’s site settings, then reopen this screen.'
            : null
        )
        return
      }
    }

    startingRef.current = true
    setPhase(PHASE.OPENING)
    setError(null)
    setErrorName(null)
    setSpeechError(null)
    setTranscript('')
    transcriptRef.current = ''
    savingRef.current = false

    const recorder = new Recorder({
      audioProfile: settings.audioProfile,
      onLevel: setLevel,
      onError: () => {
        /* a mid-capture recorder fault still leaves the chunks collected */
      },
    })
    recorderRef.current = recorder

    const engine = getTranscriber(settings.transcriber)
    const wantsSpeech = settings.liveTranscribe && engine.live

    /**
     * On some phones the microphone can only be shared if the speech service
     * asks for it first — the recorder otherwise takes it outright and the
     * speech service is handed silence. Settings → Microphone finds which
     * order works; this honours it.
     */
    const startSpeech = () => {
      if (!wantsSpeech) return
      try {
        sessionRef.current = engine.createSession({
          onPartial: (text) => {
            transcriptRef.current = text
            setTranscript(text)
          },
          onFinal: (text) => {
            transcriptRef.current = text
          },
          // Report the real error name. Hiding these is what made
          // "no words, ever" undiagnosable on the S23.
          onError: (code, { fatal } = {}) => {
            if (code === 'no-speech' || code === 'aborted') return
            setSpeechError({ code, fatal, message: describeSpeechError(code) })
          },
        })
        sessionRef.current.start()
      } catch (e) {
        sessionRef.current = null
        setSpeechError({
          code: e?.message || 'start-failed',
          fatal: true,
          message: describeSpeechError(e?.message),
        })
      }
    }

    if (settings.speechFirst) {
      startSpeech()
      await new Promise((r) => setTimeout(r, 400))
    }

    try {
      await recorder.start()
    } catch (err) {
      recorderRef.current = null
      startingRef.current = false
      const name = err?.name || 'UnknownError'
      setErrorName(name)
      setError(micErrorMessage(err))
      // Anything permission-shaped stays on the one-tap screen, because a tap
      // is exactly what might fix it. Everything else is a hard stop.
      setPhase(
        name === 'NotAllowedError' || name === 'SecurityError' || name === 'NotReadableError'
          ? PHASE.READY
          : PHASE.ERROR
      )
      return
    }

    // Live transcription rides alongside the recording. If the speech service
    // and the recorder fight over the mic, the recording still wins — audio is
    // the source of truth and the transcript can be fixed in triage.
    if (!settings.speechFirst) startSpeech()

    acquireWakeLock()
    haptic(18)
    setElapsed(0)
    startingRef.current = false
    setPhase(PHASE.RECORDING)
  }, [
    settings.transcriber,
    settings.liveTranscribe,
    settings.audioProfile,
    settings.speechFirst,
    acquireWakeLock,
    haptic,
  ])

  /* ---------------------------------------------------- stop and save */

  const stopAndSave = useCallback(async () => {
    if (savingRef.current) return
    savingRef.current = true
    const recorder = recorderRef.current
    if (!recorder) {
      savingRef.current = false
      return
    }

    let finalText = transcriptRef.current
    try {
      const fromSession = sessionRef.current?.stop()
      if (fromSession) finalText = fromSession
    } catch {
      /* keep whatever streamed in */
    }
    sessionRef.current = null

    const { blob, mimeType, duration } = await recorder.stop()
    recorderRef.current = null
    releaseWakeLock()
    setLevel(0)

    // Nothing was captured. Never write a note that looks like a successful
    // save when the capture failed — a note that says nothing, with no audio
    // behind it, is a lost thought wearing a timestamp.
    if ((!blob || blob.size === 0) && !finalText.trim()) {
      savingRef.current = false
      setErrorName('EmptyCapture')
      setError(
        'Nothing was recorded — no sound and no words. Nothing has been saved. Tap to try again.'
      )
      setPhase(PHASE.READY)
      haptic([20, 60, 20])
      return
    }

    const note = await addCapture({
      transcript: finalText,
      blob,
      mimeType,
      duration,
    })

    haptic([12, 45, 12])
    setSaved({ ...note, transcript: finalText })
    setShowStamp(true)
    setPhase(PHASE.SAVED)
    savingRef.current = false

    // Non-live engines (e.g. a Whisper adapter) transcribe after the fact.
    const engine = getTranscriber(settings.transcriber)
    if (blob && !finalText.trim() && settings.liveTranscribe && !engine.live) {
      try {
        const text = await engine.transcribeBlob(blob)
        if (text) {
          await patchNote(note.id, { transcript: text })
          setSaved((cur) => (cur && cur.id === note.id ? { ...cur, transcript: text } : cur))
        }
      } catch {
        /* the audio is saved either way */
      }
    }
  }, [addCapture, patchNote, haptic, releaseWakeLock, settings.transcriber, settings.liveTranscribe])

  const discard = useCallback(() => {
    try {
      sessionRef.current?.stop()
    } catch {
      /* ignore */
    }
    sessionRef.current = null
    recorderRef.current?.cancel()
    recorderRef.current = null
    releaseWakeLock()
    clearInterval(tickRef.current)
    savingRef.current = false
    startingRef.current = false
    // Leave RECORDING *before* navigating. Without this the phase stayed
    // RECORDING with its recorder torn out — a frozen timer and a dead
    // Stop & Save — which is why Cancel appeared to do nothing on the S23.
    // It also stops the unmount handler from trying to save a discarded take.
    setPhase(PHASE.READY)
    setElapsed(0)
    setLevel(0)
    setTranscript('')
    transcriptRef.current = ''
    showToast('Recording thrown away', { tone: 'danger', ms: 1600 })
    navigate('inbox')
  }, [navigate, releaseWakeLock, showToast])

  /* --------------------------------------------------------- lifecycle */

  // Autostart on arrival, and again whenever the Record shortcut is tapped
  // while the app is already open (the router bumps `nav` every navigation).
  useEffect(() => {
    begin()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav])

  // Timer.
  useEffect(() => {
    if (phase !== PHASE.RECORDING) return undefined
    tickRef.current = setInterval(() => {
      setElapsed(recorderRef.current?.elapsed() || 0)
    }, 200)
    return () => clearInterval(tickRef.current)
  }, [phase])

  /**
   * Leaving the app mid-capture saves it. Spec §3: never lose a capture to a
   * distracted exit. A screen blank counts as leaving, which is exactly why
   * the wake lock is held while recording.
   */
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden' && phaseRef.current === PHASE.RECORDING) {
        stopAndSave()
      }
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [stopAndSave])

  // Navigating away mid-capture also saves rather than discards.
  useEffect(
    () => () => {
      if (phaseRef.current === PHASE.RECORDING && !savingRef.current) stopAndSave()
      releaseWakeLock()
      clearInterval(tickRef.current)
    },
    [stopAndSave, releaseWakeLock]
  )

  // Re-acquire the wake lock if Android dropped it while we were backgrounded.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && phaseRef.current === PHASE.RECORDING) {
        acquireWakeLock()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [acquireWakeLock])

  useEffect(() => {
    if (!showStamp) return undefined
    const t = setTimeout(() => setShowStamp(false), STAMP_MS)
    return () => clearTimeout(t)
  }, [showStamp])

  /* ------------------------------------------------------------ render */

  if (phase === PHASE.SAVED) {
    return (
      <SavedScreen
        note={saved}
        showStamp={showStamp}
        onAnother={() => {
          setSaved(null)
          setShowStamp(false)
          begin()
        }}
        onDone={() => navigate('inbox')}
      />
    )
  }

  if (phase === PHASE.RECORDING) {
    return (
      <RecordingScreen
        elapsed={elapsed}
        level={level}
        transcript={transcript}
        speechError={speechError}
        transcribing={settings.liveTranscribe}
        onStop={stopAndSave}
        onCancel={() => setConfirmCancel(true)}
        confirmCancel={confirmCancel}
        closeConfirm={() => setConfirmCancel(false)}
        onDiscard={discard}
      />
    )
  }

  // OPENING / READY / ERROR all render the same thing: one enormous button.
  return (
    <TapToRecord
      phase={phase}
      error={error}
      errorName={errorName}
      onTap={() => begin({ fromTap: true })}
      onExit={() => navigate('inbox')}
      onSettings={() => navigate('settings')}
    />
  )
}

/* ------------------------------------------------------------------------ */

/**
 * The fallback from spec §3: the entire viewport is the button. One tap, ever.
 * This is also the first-run screen, where the tap is what raises Android's
 * microphone prompt — a permission dialog needs something to have been tapped.
 */
function TapToRecord({ phase, error, errorName, onTap, onExit, onSettings }) {
  const opening = phase === PHASE.OPENING
  const fatal = phase === PHASE.ERROR

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <button
        type="button"
        onClick={onTap}
        disabled={opening}
        className="press focus-ring flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 text-center disabled:opacity-100"
      >
        <span className="relative flex items-center justify-center">
          {!opening && !fatal && (
            <span className="animate-ring absolute h-40 w-40 rounded-full border-4 border-stamp" />
          )}
          <span
            className={[
              'flex h-40 w-40 items-center justify-center rounded-full border-4',
              fatal ? 'border-line text-muted' : 'border-stamp text-stamp',
              opening ? 'animate-rec' : '',
            ].join(' ')}
          >
            <Icon name={fatal ? 'warning' : 'mic'} size={72} strokeWidth={1.7} />
          </span>
        </span>

        <span className="stamp-label text-[clamp(1.5rem,8vw,2.25rem)] text-ink">
          {opening ? 'Opening mic…' : fatal ? 'Cannot record' : 'Tap = Record'}
        </span>

        {error && (
          <span className="max-w-sm text-[1rem] leading-relaxed text-muted">{error}</span>
        )}
        {!error && !opening && (
          <span className="max-w-xs text-[1rem] leading-relaxed text-muted">
            Tap anywhere on this screen and start talking.
          </span>
        )}
        {errorName && (
          <span className="font-mono text-[0.72rem] text-faint">{errorName}</span>
        )}
      </button>

      <div className="safe-b shrink-0 space-y-2 px-4 pb-3">
        {(error || fatal) && (
          <Button variant="quiet" full icon="settings" onClick={onSettings}>
            Check the microphone
          </Button>
        )}
        <Button variant="quiet" full icon="chevronLeft" onClick={onExit}>
          Back to notes
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------ */

function RecordingScreen({
  elapsed,
  level,
  transcript,
  speechError,
  transcribing,
  onStop,
  onCancel,
  confirmCancel,
  closeConfirm,
  onDiscard,
}) {
  const scrollRef = useRef(null)
  const [peak, setPeak] = useState(0)

  // Keep the newest words in view — this is the reassurance that it's working.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [transcript])

  // Highest level seen this take. If this stays at zero the mic is open but
  // deaf, which is a completely different problem from "no words came through".
  useEffect(() => {
    setPeak((p) => (level > p ? level : p))
  }, [level])

  const ring = 1 + level * 0.35

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="safe-t flex shrink-0 items-center justify-between px-3 pt-2">
        <div className="flex items-center gap-2.5 px-1">
          <span className="animate-rec block h-3.5 w-3.5 rounded-full bg-stamp" />
          <span className="stamp-label text-[0.8rem] text-stamp">Recording</span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="press focus-ring flex min-h-12 items-center gap-1.5 rounded-xl border border-line px-3 text-[0.85rem] text-muted"
        >
          <Icon name="close" size={18} />
          Cancel
        </button>
      </div>

      <div className="flex shrink-0 flex-col items-center pt-6 pb-4">
        <div className="relative flex items-center justify-center">
          <span
            className="absolute h-28 w-28 rounded-full border-2 border-stamp opacity-40 transition-transform duration-100"
            style={{ transform: `scale(${ring})` }}
          />
          <span className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-stamp text-stamp">
            <Icon name="mic" size={44} strokeWidth={1.8} />
          </span>
        </div>
        <div className="mt-5 font-mono text-[clamp(2.75rem,16vw,4.25rem)] leading-none font-bold tabular-nums text-ink">
          {clockTime(elapsed)}
        </div>

        {/* Input level. Proof the microphone is actually hearing something,
            separate from whether any words come back. */}
        <div className="mt-4 w-full max-w-xs px-6">
          <div className="flex items-center gap-2">
            <Icon name="mic" size={15} className="shrink-0 text-faint" />
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface2">
              <div
                className="h-full rounded-full transition-[width] duration-75"
                style={{
                  width: `${Math.round(level * 100)}%`,
                  background: peak < 0.02 ? 'var(--c-danger)' : 'var(--c-accent)',
                }}
              />
            </div>
            <span className="w-9 shrink-0 text-right font-mono text-[0.7rem] text-faint">
              {Math.round(level * 100)}%
            </span>
          </div>
          <p
            className={[
              'mt-1.5 text-center text-[0.72rem]',
              peak < 0.02 ? 'text-danger' : 'text-faint',
            ].join(' ')}
          >
            {peak < 0.02 ? 'No sound reaching the microphone yet' : 'Microphone is hearing you'}
          </p>
        </div>
      </div>

      <div className="mx-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-linesoft px-3 py-2">
          <span className="stamp-label text-[0.68rem] text-faint">
            {transcribing ? 'What I am hearing' : 'Voice only'}
          </span>
          {speechError && (
            <span className="flex items-center gap-1.5 font-mono text-[0.68rem] text-danger">
              <Icon name="warning" size={13} />
              {speechError.code}
            </span>
          )}
        </div>
        <div ref={scrollRef} className="scroll-y ruled min-h-0 flex-1 px-4 py-3">
          {transcript ? (
            <p className="text-[1.08rem] leading-8 whitespace-pre-wrap text-ink">{transcript}</p>
          ) : (
            <p className="text-[1.08rem] leading-8 text-faint">
              {transcribing ? 'Listening…' : 'Recording your voice.'}
            </p>
          )}
        </div>
        {speechError && (
          <div className="shrink-0 border-t border-linesoft bg-surface2 px-3 py-2">
            <p className="text-[0.78rem] leading-snug text-muted">
              <span className="text-danger">Words are not coming through.</span>{' '}
              {speechError.message} Your voice is still being recorded and saved.
            </p>
          </div>
        )}
      </div>

      <div className="safe-b shrink-0 px-3 pt-3 pb-3">
        <button
          type="button"
          onClick={onStop}
          className="press focus-ring flex w-full items-center justify-center gap-3 rounded-2xl bg-stamp py-6 text-ondanger shadow-[0_3px_0_var(--c-shadow)]"
        >
          <Icon name="stop" size={30} filled strokeWidth={0} />
          <span className="stamp-label text-[1.35rem]">Stop &amp; Save</span>
        </button>
      </div>

      <ConfirmSheet
        open={confirmCancel}
        onClose={closeConfirm}
        title="Throw this away?"
        message="This recording has not been saved yet. Throwing it away cannot be undone."
        confirmLabel="Yes, throw it away"
        cancelLabel="No, keep recording"
        tone="danger"
        onConfirm={onDiscard}
      />
    </div>
  )
}

/* ------------------------------------------------------------------------ */

/** Saved. Stamped, not announced. Two big exits, no decision required. */
function SavedScreen({ note, showStamp, onAnother, onDone }) {
  const text = (note?.transcript || '').trim()
  return (
    <div className="relative flex h-full flex-col bg-bg">
      {showStamp && (
        <Stamp text="Saved" sub="in your inbox" style={{ '--stamp-ms': `${STAMP_MS}ms` }} />
      )}

      <div className="safe-t shrink-0 px-4 pt-6 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-accent text-accent">
          <Icon name="check" size={40} strokeWidth={2.4} />
        </div>
        <h1 className="stamp-label mt-4 text-[1.5rem] text-ink">Saved</h1>
        <p className="mt-1.5 text-[0.95rem] text-muted">It is waiting in your inbox.</p>
      </div>

      <div className="scroll-y mx-3 mt-5 min-h-0 flex-1 rounded-2xl border border-line bg-surface">
        <div className="ruled ruled-margin px-4 py-3 pl-10">
          {text ? (
            <p className="text-[1.05rem] leading-8 whitespace-pre-wrap text-ink">{text}</p>
          ) : (
            <p className="text-[1.05rem] leading-8 text-muted">
              No text came through — your voice recording is saved and you can play it back when
              you sort your inbox.
            </p>
          )}
        </div>
      </div>

      <div className="safe-b shrink-0 space-y-2.5 px-3 pt-4 pb-3">
        <Button variant="primary" full icon="mic" onClick={onAnother} className="py-5">
          Record another
        </Button>
        <Button variant="quiet" full icon="inbox" onClick={onDone}>
          Go to inbox
        </Button>
      </div>
    </div>
  )
}
