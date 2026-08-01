/**
 * TRANSCRIPTION — one swappable interface (spec §4).
 *
 * Everything the app knows about speech-to-text is behind this file. If Web
 * Speech ever degrades, add an adapter below, register it in `TRANSCRIBERS`,
 * and change one setting — no other file changes. A skeleton Whisper adapter is
 * at the bottom showing exactly what a replacement has to implement.
 *
 * Adapter contract:
 *   id            string
 *   label         string                      shown in Settings
 *   isSupported() boolean
 *   live          boolean                     can stream during capture?
 *   createSession({ onPartial, onFinal, onError }) -> { start(), stop() }
 *   transcribeBlob(blob) -> Promise<string>   post-hoc pass over saved audio
 *
 * `transcribe()` at the bottom is the single generic entry point the spec asks
 * for: transcribe(audioBlobOrStream) -> text.
 */

/* ------------------------------------------------------------------ helpers */

function joinText(a, b) {
  if (!a) return b
  if (!b) return a
  return /[\s\n]$/.test(a) ? a + b : `${a} ${b}`
}

class NotSupportedError extends Error {
  constructor(msg) {
    super(msg)
    this.name = 'NotSupportedError'
  }
}

/** Plain-words explanation of a SpeechRecognition error code. */
export function describeSpeechError(code) {
  switch (code) {
    case 'not-allowed':
      return 'The phone refused the speech service access to the microphone.'
    case 'service-not-allowed':
      return 'The phone blocked the speech service itself. On Samsung this often means no speech service is selected, or Google is not the assist app.'
    case 'audio-capture':
      return 'The speech service could not take the microphone — usually because the recorder already has it.'
    case 'network':
      return 'Speech recognition needs a network connection on this device and could not reach it.'
    case 'no-speech':
      return 'No speech was detected.'
    case 'aborted':
      return 'Recognition was stopped.'
    case 'language-not-supported':
      return 'This phone has no speech pack for the current language.'
    case 'unsupported':
      return 'This browser has no speech recognition at all.'
    default:
      return code ? `Speech service reported: ${code}` : 'Speech recognition produced no words and no error.'
  }
}

/* ------------------------------------------------------- Web Speech adapter */

const SR =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : undefined

/**
 * Android quirk this handles: Chrome's SpeechRecognition ends itself after a
 * pause even with continuous=true. We restart it for as long as the user is
 * still recording, and stitch the finals together ourselves.
 */
const webSpeech = {
  id: 'webspeech',
  label: 'Phone (Web Speech)',
  live: true,
  isSupported: () => !!SR,

  createSession({ onPartial, onFinal, onError } = {}) {
    if (!SR) throw new NotSupportedError('Speech recognition is not available in this browser.')

    let rec = null
    let running = false
    let finalText = ''
    let restartTimer = null
    let consecutiveErrors = 0
    let lastError = null
    let sawResult = false
    let starts = 0

    const emit = (interim) => {
      onPartial?.(interim ? joinText(finalText, interim) : finalText)
    }

    function build() {
      const r = new SR()
      r.continuous = true
      r.interimResults = true
      r.lang = navigator.language || 'en-US'
      r.maxAlternatives = 1

      r.onresult = (event) => {
        consecutiveErrors = 0
        sawResult = true
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const text = result[0]?.transcript || ''
          if (result.isFinal) finalText = joinText(finalText, text.trim())
          else interim = joinText(interim, text)
        }
        emit(interim)
      }

      r.onerror = (event) => {
        const err = event.error
        lastError = err
        // Every error is reported now, even the benign ones. Swallowing them
        // is what made "no words, ever" impossible to diagnose on the S23.
        // 'no-speech' and 'aborted' are normal during a pause, so they are
        // reported as non-fatal and the restart loop continues.
        if (err === 'no-speech' || err === 'aborted') {
          onError?.(err, { fatal: false })
          return
        }
        consecutiveErrors++
        // 'audio-capture' here usually means the recorder and the speech
        // service are fighting over the microphone.
        const fatal =
          consecutiveErrors >= 3 || err === 'not-allowed' || err === 'service-not-allowed'
        if (fatal) running = false
        onError?.(err, { fatal })
      }

      r.onend = () => {
        if (!running) return
        clearTimeout(restartTimer)
        restartTimer = setTimeout(() => {
          if (!running) return
          try {
            r.start()
          } catch {
            // start() throws if it is already starting; the next onend retries.
          }
        }, 250)
      }
      return r
    }

    return {
      start() {
        if (running) return
        running = true
        finalText = ''
        rec = build()
        try {
          rec.start()
          starts++
        } catch (e) {
          running = false
          lastError = e?.message || 'start-failed'
          onError?.(lastError, { fatal: true })
        }
      },
      stop() {
        running = false
        clearTimeout(restartTimer)
        if (rec) {
          rec.onend = null
          try {
            rec.stop()
          } catch {
            /* already stopped */
          }
          rec = null
        }
        const text = finalText.trim()
        onFinal?.(text)
        return text
      },
      get text() {
        return finalText.trim()
      },
      /** What actually happened, for the diagnostics screen. */
      get status() {
        return { lastError, sawResult, starts, running }
      },
    }
  },

  /**
   * Runs speech recognition ALONE for a few seconds, with no MediaRecorder
   * anywhere near the microphone. This is the test that separates "the speech
   * service is unavailable on this device" from "it cannot share the mic with
   * the recorder" — the open question after the S23 test.
   */
  probe({ ms = 6000 } = {}) {
    return new Promise((resolve) => {
      if (!SR) {
        resolve({ ok: false, reason: 'unsupported', detail: 'No SpeechRecognition in this browser.' })
        return
      }
      const events = []
      let done = false
      let heard = ''
      let r
      const finish = (ok, reason, detail) => {
        if (done) return
        done = true
        clearTimeout(timer)
        try {
          r.onend = null
          r.stop()
        } catch {
          /* already stopped */
        }
        resolve({ ok, reason, detail, events, heard: heard.trim() })
      }
      try {
        r = new SR()
      } catch (e) {
        resolve({ ok: false, reason: 'construct-failed', detail: String(e?.message || e) })
        return
      }
      r.continuous = true
      r.interimResults = true
      r.lang = navigator.language || 'en-US'
      r.onstart = () => events.push('start')
      r.onaudiostart = () => events.push('audiostart')
      r.onsoundstart = () => events.push('soundstart')
      r.onspeechstart = () => events.push('speechstart')
      r.onresult = (event) => {
        events.push('result')
        for (let i = event.resultIndex; i < event.results.length; i++) {
          heard = joinText(heard, event.results[i][0]?.transcript || '')
        }
      }
      r.onerror = (event) => {
        events.push(`error:${event.error}`)
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          finish(false, event.error, describeSpeechError(event.error))
        }
      }
      r.onend = () => {
        events.push('end')
        finish(!!heard, heard ? 'heard' : 'ended-silent', heard ? '' : 'Ended without returning any words.')
      }
      const timer = setTimeout(
        () => finish(!!heard, heard ? 'heard' : 'timeout', heard ? '' : 'No words in the time allowed.'),
        ms
      )
      try {
        r.start()
      } catch (e) {
        finish(false, 'start-threw', String(e?.message || e))
      }
    })
  },

  async transcribeBlob() {
    // Web Speech only listens to a live mic; it cannot re-read a saved file.
    throw new NotSupportedError(
      'The phone speech engine can only transcribe live audio, not a saved recording.'
    )
  },
}

/* ------------------------------------------------------------ null adapter */

/** Audio-only capture. The recording is still the source of truth. */
const noTranscription = {
  id: 'none',
  label: 'Off (audio only)',
  live: false,
  isSupported: () => true,
  createSession() {
    return { start() {}, stop: () => '', text: '' }
  },
  async transcribeBlob() {
    return ''
  },
}

/* --------------------------------------------------------------- registry */

/* ------------------------------------------------------- Whisper adapter */

/**
 * On-device Whisper. Not live — it reads the saved recording after the fact,
 * which is the only thing that works on a phone that will not share the
 * microphone (DECISIONS.md §11). The heavy lifting is dynamically imported so
 * nothing here costs anything until it is actually used.
 */
const whisper = {
  id: 'whisper',
  label: 'On this phone (Whisper)',
  live: false,
  isSupported: () => {
    if (typeof WebAssembly !== 'object') return false
    return true
  },
  createSession() {
    // Nothing to stream — the pass happens after Stop & Save.
    return { start() {}, stop: () => '', text: '' }
  },
  async transcribeBlob(blob, opts = {}) {
    const { transcribeWithWhisper } = await import('./whisper.js')
    const result = await transcribeWithWhisper(blob, opts)
    return result.text
  },
  /** Same pass, but returns the timing numbers the spike is judged on. */
  async transcribeBlobDetailed(blob, opts = {}) {
    const { transcribeWithWhisper } = await import('./whisper.js')
    return transcribeWithWhisper(blob, opts)
  },
}

export const TRANSCRIBERS = {
  [webSpeech.id]: webSpeech,
  [whisper.id]: whisper,
  [noTranscription.id]: noTranscription,
}

export function getTranscriber(id) {
  const t = TRANSCRIBERS[id]
  if (t && t.isSupported()) return t
  return webSpeech.isSupported() ? webSpeech : noTranscription
}

export function speechSupported() {
  return webSpeech.isSupported()
}

/**
 * The generic entry point from spec §4: transcribe(audio|stream) -> text.
 * Pass a Blob for a post-hoc pass, or a MediaStream for a live session that
 * resolves when you call the returned stop().
 */
export async function transcribe(input, { engine, onPartial } = {}) {
  const t = getTranscriber(engine)
  if (input instanceof Blob) return t.transcribeBlob(input)
  const session = t.createSession({ onPartial })
  session.start()
  return {
    stop: () => session.stop(),
  }
}

/* ----------------------------------------------------------------------------
 * SWAP-IN SKELETON — Whisper (or any HTTP / wasm engine).
 *
 * Uncomment, fill in, register in TRANSCRIBERS, and pick it in Settings.
 * Nothing else in the app changes.
 *
 * const whisper = {
 *   id: 'whisper',
 *   label: 'Whisper',
 *   live: false,                       // no live stream — transcribe after stop
 *   isSupported: () => true,
 *   createSession() {
 *     return { start() {}, stop: () => '', text: '' }
 *   },
 *   async transcribeBlob(blob) {
 *     const body = new FormData()
 *     body.append('file', blob, 'note.webm')
 *     body.append('model', 'whisper-1')
 *     const res = await fetch(WHISPER_ENDPOINT, { method: 'POST', body, headers: {...} })
 *     if (!res.ok) throw new Error('Transcription failed')
 *     return (await res.json()).text
 *   },
 * }
 *
 * Record.jsx already calls transcribeBlob() after saving when the selected
 * adapter reports live === false, so a non-live engine works with no UI change.
 * ------------------------------------------------------------------------- */
