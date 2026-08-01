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
        // 'no-speech' and 'aborted' are normal in a pause — not failures.
        if (err === 'no-speech' || err === 'aborted') return
        consecutiveErrors++
        // 'audio-capture' can mean the recorder and the speech service are
        // fighting over the mic. Report it, stop retrying forever.
        if (consecutiveErrors >= 3 || err === 'not-allowed' || err === 'service-not-allowed') {
          running = false
          onError?.(err)
        }
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
        } catch (e) {
          running = false
          onError?.(e?.message || 'start-failed')
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
    }
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

export const TRANSCRIBERS = {
  [webSpeech.id]: webSpeech,
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
