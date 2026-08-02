/**
 * MICROPHONE DIAGNOSTICS
 *
 * Built after the first S23 device test, where speech-to-text produced nothing
 * ever and the installed app could not record at all — with no way to tell why
 * from the phone. Guessing from a laptop is not a debugging strategy.
 *
 * Each check answers one question and reports the real error name, not a
 * friendly summary that hides it:
 *
 *   1  secure context      — is the page even allowed to use a microphone?
 *   2  permission state    — granted / prompt / denied, without prompting
 *   3  microphone alone    — can getUserMedia open it, and is there signal?
 *   4  speech alone        — does the speech service work with NO recorder?
 *   5  speech + recorder   — does it still work while the recorder holds the mic?
 *
 * 4 versus 5 is the whole point: if 4 passes and 5 fails, it is contention on
 * Samsung's audio stack. If 4 fails too, the speech service is unavailable and
 * no amount of stream juggling will fix it.
 */

import { Recorder, micPermissionState, pickMimeType, recorderSupported } from './recorder.js'
import { TRANSCRIBERS, describeSpeechError, speechSupported } from './transcribe.js'

const webSpeech = TRANSCRIBERS.webspeech

/** Opens the mic briefly and reports the peak input level seen. */
async function measureInput(ms = 2500) {
  const recorder = new Recorder({ onLevel: (v) => { peak = Math.max(peak, v) } })
  let peak = 0
  try {
    await recorder.start()
  } catch (err) {
    recorder.cancel()
    return { ok: false, error: err?.name || 'UnknownError', message: err?.message || String(err) }
  }
  await new Promise((r) => setTimeout(r, ms))
  const { blob, mimeType } = await recorder.stop()
  return {
    ok: true,
    peak,
    bytes: blob?.size || 0,
    mimeType,
  }
}

export function isSecure() {
  return typeof window !== 'undefined' && window.isSecureContext === true
}

export function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator.standalone === true
  )
}

/**
 * Runs the whole sequence, reporting each step as it completes so the screen
 * can fill in live rather than sitting blank for fifteen seconds.
 */
export async function runDiagnostics({ onStep } = {}) {
  const results = []
  const step = (row) => {
    results.push(row)
    onStep?.(row, [...results])
    return row
  }

  /* 1 — secure context ---------------------------------------------------- */
  step({
    id: 'secure',
    label: 'Secure connection',
    ok: isSecure(),
    detail: isSecure()
      ? `${location.protocol}//${location.host}`
      : 'Not a secure context — the microphone is blocked. Use https:// or localhost.',
  })

  /* 2 — how the app is running -------------------------------------------- */
  step({
    id: 'mode',
    label: 'Running as',
    ok: true,
    neutral: true,
    detail: isStandalone()
      ? 'Installed app (standalone)'
      : 'Chrome browser tab',
  })

  /* 3 — recorder support --------------------------------------------------- */
  const supported = recorderSupported()
  step({
    id: 'support',
    label: 'Recording support',
    ok: supported,
    detail: supported
      ? `MediaRecorder ready · ${pickMimeType() || 'browser default format'}`
      : 'This browser has no MediaRecorder or getUserMedia.',
  })

  /* 4 — permission state --------------------------------------------------- */
  const perm = await micPermissionState()
  step({
    id: 'permission',
    label: 'Microphone permission',
    ok: perm === 'granted',
    warn: perm === 'prompt' || perm === 'unknown',
    detail:
      perm === 'granted'
        ? 'Granted'
        : perm === 'denied'
          ? 'Denied. Android Settings → Apps → Quick Notes → Permissions → Microphone.'
          : perm === 'prompt'
            ? 'Not asked yet — it will be requested the first time you tap Record.'
            : 'This browser will not report the permission state.',
    value: perm,
  })

  if (!supported) return results

  /* 5 — microphone alone --------------------------------------------------- */
  const mic = await measureInput()
  step({
    id: 'mic',
    label: 'Microphone alone',
    ok: mic.ok && mic.bytes > 0,
    warn: mic.ok && mic.peak < 0.02,
    detail: !mic.ok
      ? `${mic.error} — ${mic.message}`
      : mic.bytes === 0
        ? 'Opened, but recorded zero bytes.'
        : `Recorded ${Math.round(mic.bytes / 1024)} KB · peak level ${Math.round(mic.peak * 100)}%${
            mic.peak < 0.02 ? ' — almost silent, is the mic covered or muted?' : ''
          }`,
    value: mic,
  })

  /* 6 — speech alone ------------------------------------------------------- */
  if (!speechSupported()) {
    step({
      id: 'speech-alone',
      label: 'Speech to text alone',
      ok: false,
      detail: describeSpeechError('unsupported'),
    })
    return results
  }

  const alone = await webSpeech.probe({ ms: 6000 })
  step({
    id: 'speech-alone',
    label: 'Speech to text alone',
    ok: alone.ok,
    detail: alone.ok
      ? `Heard: "${alone.heard}"`
      : `${describeSpeechError(alone.reason)}${
          alone.events?.length ? ` · events: ${alone.events.join(', ')}` : ''
        }`,
    value: alone,
  })

  /* 7 — speech WHILE recording --------------------------------------------- */
  const recorder = new Recorder()
  let together
  try {
    await recorder.start()
    together = await webSpeech.probe({ ms: 6000 })
  } catch (err) {
    together = { ok: false, reason: err?.name || 'recorder-failed', events: [] }
  } finally {
    try {
      await recorder.stop()
    } catch {
      recorder.cancel()
    }
  }
  step({
    id: 'speech-with-recorder',
    label: 'Speech while recording',
    ok: together.ok,
    detail: together.ok
      ? `Heard: "${together.heard}"`
      : `${describeSpeechError(together.reason)}${
          together.events?.length ? ` · events: ${together.events.join(', ')}` : ''
        }`,
    value: together,
  })

  /* 8 — the verdict -------------------------------------------------------- */
  step({
    id: 'verdict',
    label: 'What this means',
    ok: together.ok,
    neutral: !alone.ok && !together.ok,
    detail: together.ok
      ? 'Speech and recording work together on this phone. Live transcription should work.'
      : alone.ok
        ? 'Speech works alone but NOT while recording — the recorder and the speech service are fighting over the microphone on this phone. Live transcription cannot work here; your voice is still saved with every note.'
        : 'Speech to text does not work on this phone even with nothing else using the microphone, so it is not a conflict with the recorder. Check Android Settings → General management → Voice input. Your voice is still saved with every note.',
  })

  return results
}

/* ------------------------------------------------------------------------ */

/**
 * COMBINATION SWEEP — run when speech works alone but not while recording.
 *
 * Two variables decide whether Android will let the recorder and the speech
 * service share the microphone:
 *
 *   audio profile — asking for echo cancellation opens the VOICE_COMMUNICATION
 *                   source, which tends to be exclusive. Raw audio often opens
 *                   a shareable one.
 *   start order   — whoever grabs the microphone first can win it outright.
 *
 * A combination only passes if BOTH survive: the speech service returned words
 * AND the recording still has signal. A "working" transcript on top of a silent
 * recording is the worst outcome available — it destroys the audit trail that
 * spec §5 exists to protect, and it would look like success.
 */
export const COMBINATIONS = [
  { id: 'processed-recorder-first', profile: 'processed', speechFirst: false, label: 'Cleaned up · recorder first' },
  { id: 'raw-recorder-first', profile: 'raw', speechFirst: false, label: 'Raw audio · recorder first' },
  { id: 'processed-speech-first', profile: 'processed', speechFirst: true, label: 'Cleaned up · speech first' },
  { id: 'raw-speech-first', profile: 'raw', speechFirst: true, label: 'Raw audio · speech first' },
]

async function tryCombination({ profile, speechFirst }, ms = 6000) {
  let peak = 0
  const recorder = new Recorder({
    audioProfile: profile,
    onLevel: (v) => {
      if (v > peak) peak = v
    },
  })

  let speech
  try {
    if (speechFirst) {
      const probe = webSpeech.probe({ ms })
      // Let the speech service take the microphone before the recorder asks.
      await new Promise((r) => setTimeout(r, 400))
      await recorder.start()
      speech = await probe
    } else {
      await recorder.start()
      speech = await webSpeech.probe({ ms })
    }
  } catch (err) {
    recorder.cancel()
    return {
      ok: false,
      reason: err?.name || 'failed',
      detail: `Could not open the microphone: ${err?.name || err}`,
    }
  }

  let bytes = 0
  try {
    const out = await recorder.stop()
    bytes = out.blob?.size || 0
  } catch {
    recorder.cancel()
  }

  const heardWords = !!speech?.heard
  const recordingAlive = bytes > 0 && peak >= 0.02

  return {
    ok: heardWords && recordingAlive,
    heard: speech?.heard || '',
    peak,
    bytes,
    heardWords,
    recordingAlive,
    detail: heardWords
      ? recordingAlive
        ? `Heard "${speech.heard}" and the recording has sound (peak ${Math.round(peak * 100)}%).`
        : `Heard "${speech.heard}" BUT the recording came out silent (peak ${Math.round(peak * 100)}%) — unusable.`
      : recordingAlive
        ? `Recording fine (peak ${Math.round(peak * 100)}%) but no words came back.`
        : 'Neither the words nor the recording worked.',
  }
}

/**
 * Runs every combination in turn. The caller must keep the user talking
 * throughout — silence looks identical to contention.
 */
export async function findMicCombination({ onStep } = {}) {
  const results = []
  for (const combo of COMBINATIONS) {
    onStep?.({ ...combo, running: true }, [...results])
    const outcome = await tryCombination(combo)
    const row = { ...combo, ...outcome, running: false }
    results.push(row)
    onStep?.(row, [...results])
    if (row.ok) break // first winner is enough
    // Android needs a beat to actually release the audio focus.
    await new Promise((r) => setTimeout(r, 700))
  }
  return results
}

/* ------------------------------------------------------------------------ */

/**
 * What the device actually reports about the viewport and the safe areas.
 *
 * Built because "the nav bar is behind the system buttons" could not be
 * diagnosed from here: the CSS and the meta tag were both present and correct
 * in the deployed build, so the question was never "did it ship" but "what
 * does the device say the insets are". Now it can answer.
 */
export function screenReport() {
  // Wrapped defensively: this is a diagnostic, and a diagnostic that can crash
  // the Settings screen is worse than no diagnostic at all.
  try {
    return measureScreen()
  } catch (err) {
    return { error: String(err?.message || err) }
  }
}

function measureScreen() {
  const probe = document.createElement('div')
  probe.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:0',
    'height:0',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:env(safe-area-inset-top,0px)',
    'padding-right:env(safe-area-inset-right,0px)',
    'padding-bottom:env(safe-area-inset-bottom,0px)',
    'padding-left:env(safe-area-inset-left,0px)',
  ].join(';')
  document.body.appendChild(probe)
  const cs = getComputedStyle(probe)
  const insets = {
    top: cs.paddingTop,
    right: cs.paddingRight,
    bottom: cs.paddingBottom,
    left: cs.paddingLeft,
  }
  probe.remove()

  const meta = document.querySelector('meta[name="viewport"]')?.getAttribute('content') || ''

  return {
    insets,
    viewportFitCover: /viewport-fit\s*=\s*cover/.test(meta),
    innerHeight: window.innerHeight,
    clientHeight: document.documentElement.clientHeight,
    visualViewport: window.visualViewport
      ? Math.round(window.visualViewport.height)
      : null,
    dpr: window.devicePixelRatio,
    standalone: isStandalone(),
    // If this is bigger than a hairline, something is being cut off below.
    lostBelow:
      window.visualViewport && window.innerHeight
        ? Math.round(window.innerHeight - window.visualViewport.height)
        : null,
  }
}

/**
 * Asks for the microphone from inside a user gesture. This is the call that has
 * to happen on a tap in the installed app — a WebAPK is a separate Android
 * package and its runtime permission prompt will not appear without one.
 */
export async function requestMicAccess() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    for (const track of stream.getTracks()) track.stop()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.name || 'UnknownError', message: err?.message || String(err) }
  }
}
