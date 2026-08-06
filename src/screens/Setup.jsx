/**
 * FIRST-RUN SETUP — four gates, each one proved rather than assumed.
 *
 * This exists because of DECISIONS §18. A transcription feature shipped that
 * could not create a session, and survived four device rounds, because nothing
 * in the app ever attempted the one operation that would have said so. The
 * cure is not more instrumentation — it is doing the real thing once, in front
 * of the user, before they depend on it.
 *
 *   1  microphone   — asked from inside a real tap (a WebAPK will not prompt
 *                     otherwise, §9 bug 2)
 *   2  a recording  — record, then play it back. "Did you hear yourself?" is
 *                     the only check that catches a deaf microphone, which is
 *                     the failure the level meter was built for
 *   3  the model    — plain words, the real size, on wi-fi, cancellable
 *   4  the words    — transcribe the recording from gate 2 and SHOW THEM. This
 *                     is the gate that would have caught §18 on day one
 *
 * "Not now" is a first-class answer at every gate. Capture works audio-only and
 * always has; nothing here is allowed to stand between someone and a thought
 * they are trying not to lose.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from '../lib/router.jsx'
import { useStore } from '../lib/store.jsx'
import { Recorder, micErrorMessage, micPermissionState } from '../lib/recorder.js'
import { requestMicAccess } from '../lib/diagnostics.js'
import {
  WHISPER_MODELS,
  approxDownloadMB,
  isModelCached,
  requestPersistence,
} from '../lib/whisper.js'
import { TRANSCRIBERS } from '../lib/transcribe.js'
import { bytes as fmtBytes } from '../lib/format.js'
import Icon from '../components/Icon.jsx'
import Button from '../components/Button.jsx'

const TEST_MS = 5000

export default function Setup() {
  const { navigate } = useRouter()
  const { settings, setSetting, showToast, haptic } = useStore()

  const [step, setStep] = useState(1)
  const [permission, setPermission] = useState('unknown')
  const [asking, setAsking] = useState(false)
  const [micError, setMicError] = useState(null)

  const [recording, setRecording] = useState(false)
  const [left, setLeft] = useState(TEST_MS)
  const [peak, setPeak] = useState(0)
  const [clip, setClip] = useState(null)

  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [modelReady, setModelReady] = useState(false)
  const [downloadError, setDownloadError] = useState(null)

  const [transcribing, setTranscribing] = useState(false)
  const [words, setWords] = useState(null)
  const [transcribeError, setTranscribeError] = useState(null)

  const recorderRef = useRef(null)
  const tickRef = useRef(0)

  const model =
    WHISPER_MODELS.find((m) => m.id === settings.whisperModel) || WHISPER_MODELS[0]
  const sizeMB = approxDownloadMB(settings.whisperModel, settings.whisperFormat)

  useEffect(() => {
    micPermissionState().then(setPermission)
    isModelCached(settings.whisperModel).then(setModelReady)
  }, [settings.whisperModel])

  useEffect(
    () => () => {
      clearInterval(tickRef.current)
      recorderRef.current?.cancel()
    },
    []
  )

  /** Leaves setup without nagging. Capture has always worked without any of it. */
  const leave = useCallback(
    async (state) => {
      await setSetting('setupState', state)
      navigate('#/inbox', { replace: true })
    },
    [navigate, setSetting]
  )

  /* ------------------------------------------------------ 1 · microphone */

  const askForMic = async () => {
    setAsking(true)
    setMicError(null)
    // Straight from the tap: a WebAPK is a separate Android package and its
    // permission prompt will not appear outside a user gesture.
    const result = await requestMicAccess()
    setAsking(false)
    if (result.ok) {
      setPermission('granted')
      haptic(18)
      setStep(2)
    } else {
      setPermission(await micPermissionState())
      setMicError(`${result.error}: ${result.message}`)
    }
  }

  /* ------------------------------------------------------- 2 · recording */

  const recordTest = async () => {
    setClip(null)
    setPeak(0)
    setMicError(null)
    const recorder = new Recorder({
      // Processed only. Raw breaks the recording on this hardware (§11), so it
      // is not a profile anything here is allowed to choose.
      audioProfile: 'processed',
      onLevel: (v) => setPeak((p) => Math.max(p, v)),
    })
    recorderRef.current = recorder
    try {
      await recorder.start()
    } catch (err) {
      recorderRef.current = null
      setMicError(micErrorMessage(err))
      return
    }
    setRecording(true)
    setLeft(TEST_MS)
    haptic(18)
    const startedAt = Date.now()
    tickRef.current = setInterval(async () => {
      const remaining = TEST_MS - (Date.now() - startedAt)
      if (remaining > 0) {
        setLeft(remaining)
        return
      }
      clearInterval(tickRef.current)
      const out = await recorder.stop()
      recorderRef.current = null
      setRecording(false)
      setLeft(0)
      setClip(out.blob ? { blob: out.blob, duration: out.duration } : null)
      haptic(12)
    }, 100)
  }

  /* ----------------------------------------------------------- 3 · model */

  const downloadModel = async () => {
    setDownloading(true)
    setDownloadError(null)
    setProgress({ phase: 'starting' })
    try {
      const { loadWhisper } = await import('../lib/whisper.js')
      await loadWhisper(settings.whisperModel, {
        onProgress: setProgress,
        backend: settings.whisperBackend,
        format: settings.whisperFormat,
      })
      await requestPersistence()
      await setSetting('whisperEnabled', true)
      setModelReady(true)
      setProgress(null)
      setStep(4)
    } catch (err) {
      setDownloadError(String(err?.message || err))
      setProgress(null)
    } finally {
      setDownloading(false)
    }
  }

  /* ----------------------------------------------------------- 4 · words */

  const testTranscription = async () => {
    if (!clip?.blob) return
    setTranscribing(true)
    setWords(null)
    setTranscribeError(null)
    try {
      const result = await TRANSCRIBERS.whisper.transcribeBlobDetailed(clip.blob, {
        modelId: settings.whisperModel,
        backend: settings.whisperBackend,
        format: settings.whisperFormat,
        allowDownload: true,
      })
      setWords(result.text || '')
    } catch (err) {
      setTranscribeError(String(err?.message || err))
    } finally {
      setTranscribing(false)
    }
  }

  /* ------------------------------------------------------------- render */

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="safe-t flex items-baseline justify-between px-5 pt-4 pb-2">
        <h1 className="stamp-label text-[1.05rem] text-ink">Setting up</h1>
        <span className="text-[0.8rem] text-muted">Step {step} of 4</span>
      </header>

      <div className="scroll-y min-h-0 flex-1 space-y-3 px-5 pb-4">
        <Gate n={1} step={step} title="Let the app hear you" done={permission === 'granted'}>
          <p className="text-[0.9rem] leading-relaxed text-muted">
            Quick Notes needs the microphone to record what you say. Nothing is sent anywhere —
            recordings stay on this phone.
          </p>
          {permission === 'granted' ? (
            <Done>The microphone is allowed.</Done>
          ) : (
            <Button variant="primary" full icon="mic" onClick={askForMic} disabled={asking}>
              {asking ? 'Asking…' : 'Allow the microphone'}
            </Button>
          )}
          {micError && <Problem>{micError}</Problem>}
          {permission === 'denied' && (
            <Problem>
              Android is refusing. Settings → Apps → Quick Notes → Permissions → Microphone → Allow,
              then come back.
            </Problem>
          )}
        </Gate>

        <Gate n={2} step={step} title="Check it can hear you" done={!!clip}>
          <p className="text-[0.9rem] leading-relaxed text-muted">
            Record five seconds and play it back. If you can hear yourself, the microphone works —
            this is the only way to tell a working one from a dead one.
          </p>
          {recording ? (
            <div className="rounded-xl border border-accent px-3 py-3 text-center">
              <div className="stamp-label text-[1.6rem] text-ink">
                {Math.ceil(left / 1000)}
              </div>
              <p className="mt-1 text-[0.82rem] text-muted">
                {peak > 0.02 ? 'Hearing you.' : 'No sound reaching the microphone yet.'}
              </p>
            </div>
          ) : (
            <Button variant={clip ? 'quiet' : 'primary'} full icon="mic" onClick={recordTest}>
              {clip ? 'Record it again' : 'Record five seconds'}
            </Button>
          )}
          {clip && (
            <>
              <TestPlayback blob={clip.blob} />
              <p className="text-[0.85rem] leading-snug text-muted">
                Heard yourself? Then the microphone is fine.
                {peak <= 0.02 && ' The meter saw almost no sound, so check it carefully.'}
              </p>
              <Button variant="primary" full icon="check" onClick={() => setStep(3)}>
                Yes, I heard myself
              </Button>
            </>
          )}
        </Gate>

        <Gate n={3} step={step} title="Write notes up automatically" done={modelReady}>
          <p className="text-[0.9rem] leading-relaxed text-muted">
            The app can turn your recordings into text, on this phone, with nothing sent anywhere.
            It needs a one-time download of about{' '}
            <strong className="text-ink">{sizeMB} MB</strong> ({model.label}). Best done on wi-fi.
          </p>
          <p className="text-[0.85rem] leading-relaxed text-muted">
            You do not have to. Recording works without it, and you can turn it on later in
            Settings.
          </p>
          {modelReady ? (
            <Done>Downloaded and ready.</Done>
          ) : (
            <>
              <Button
                variant="primary"
                full
                icon="download"
                onClick={downloadModel}
                disabled={downloading}
              >
                {downloading ? 'Downloading…' : `Download it (about ${sizeMB} MB)`}
              </Button>
              <Button variant="quiet" full onClick={() => leave('skipped')}>
                Not now
              </Button>
            </>
          )}
          {progress && (
            <p className="font-mono text-[0.75rem] break-words text-muted">
              {progress.phase === 'downloading'
                ? `${fmtBytes(progress.bytes || 0)}${progress.pct != null ? ` · ${progress.pct}%` : ''}`
                : progress.phase}
            </p>
          )}
          {downloadError && <Problem>{downloadError}</Problem>}
        </Gate>

        <Gate n={4} step={step} title="Prove it actually works" done={words !== null && !transcribeError}>
          <p className="text-[0.9rem] leading-relaxed text-muted">
            Last step, and the important one: the app will write up the five seconds you just
            recorded and show you the words. If anything is broken, it shows up here — not in three
            weeks when you need a note.
          </p>
          {!clip && <Problem>Go back to step 2 and record something first.</Problem>}
          <Button
            variant="primary"
            full
            icon="text"
            onClick={testTranscription}
            disabled={transcribing || !clip}
          >
            {transcribing ? 'Writing it up…' : 'Write up my test recording'}
          </Button>
          {words !== null && (
            <div className="rounded-xl border border-accent px-3 py-3">
              <div className="stamp-label text-[0.65rem] text-accent">What it heard</div>
              <p className="mt-1.5 text-[0.95rem] leading-relaxed text-ink">
                {words || '(no words came back — but the recording is still saved)'}
              </p>
            </div>
          )}
          {transcribeError && (
            <Problem>
              It could not write it up: {transcribeError}. Recording still works, and your voice is
              saved with every note.
            </Problem>
          )}
        </Gate>
      </div>

      <div className="safe-b space-y-2.5 border-t border-line bg-bg2 px-5 pt-3 pb-3">
        <Button
          variant={words !== null && !transcribeError ? 'primary' : 'solid'}
          full
          icon="check"
          onClick={async () => {
            await leave('done')
            showToast('You are set up', { tone: 'good' })
          }}
        >
          Done
        </Button>
        <Button variant="quiet" full onClick={() => leave('skipped')}>
          Skip the rest — just let me record
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ fragments */

/**
 * Plays the test clip. Deliberately not `AudioPlayer`, which reads from the
 * note store by `audioBlobId` — this recording is not a note and must not
 * become one just to be played back once.
 */
function TestPlayback({ blob }) {
  const [url, setUrl] = useState(null)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
      return
    }
    el.currentTime = 0
    el.play().catch(() => setPlaying(false))
  }

  return (
    <>
      <audio
        ref={audioRef}
        src={url || undefined}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        preload="auto"
      />
      <Button variant="solid" full icon={playing ? 'pause' : 'play'} onClick={toggle}>
        {playing ? 'Stop' : 'Play it back'}
      </Button>
    </>
  )
}

function Gate({ n, step, title, done, children }) {
  const active = step === n
  return (
    <section
      className={[
        'rounded-2xl border px-4 py-3.5',
        active ? 'border-accent bg-surface2' : 'border-line',
      ].join(' ')}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={[
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[0.8rem]',
            done ? 'border-accent text-accent' : 'border-line text-muted',
          ].join(' ')}
        >
          {done ? <Icon name="check" size={16} /> : n}
        </span>
        <h2 className="text-[0.98rem] text-ink">{title}</h2>
      </div>
      <div className="mt-2.5 space-y-2.5">{children}</div>
    </section>
  )
}

function Done({ children }) {
  return (
    <p className="flex items-center gap-2 text-[0.85rem] text-accent">
      <Icon name="check" size={16} className="shrink-0" />
      {children}
    </p>
  )
}

function Problem({ children }) {
  return (
    <p className="rounded-xl border border-danger px-3 py-2 text-[0.82rem] leading-snug text-danger">
      {children}
    </p>
  )
}
