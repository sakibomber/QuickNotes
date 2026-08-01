/**
 * Microphone capture. Thin wrapper over getUserMedia + MediaRecorder.
 *
 * Design rule from spec §3: the recording starts the instant the route loads.
 * No confirmation, no settings, no decisions.
 */

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  '',
]

export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const type of MIME_CANDIDATES) {
    if (!type) return ''
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

export function recorderSupported() {
  return !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
}

/**
 * Reports what we know about mic permission without triggering a prompt.
 * Returns 'granted' | 'denied' | 'prompt' | 'unknown'.
 */
export async function micPermissionState() {
  if (!navigator.permissions?.query) return 'unknown'
  try {
    const status = await navigator.permissions.query({ name: 'microphone' })
    return status.state
  } catch {
    return 'unknown'
  }
}

/**
 * Audio constraint profiles.
 *
 * On Android, asking for echo cancellation makes Chrome open the
 * VOICE_COMMUNICATION audio source, which engages the hardware AEC path and
 * tends to be exclusive — so the speech service, arriving second, gets handed
 * a silent stream. Requesting raw audio often opens a shareable source instead.
 * This is the difference the S23 contention hinges on, so it is a setting.
 */
export const AUDIO_PROFILES = {
  processed: {
    id: 'processed',
    label: 'Cleaned up',
    constraints: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  },
  raw: {
    id: 'raw',
    label: 'Raw',
    constraints: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  },
}

export function profileConstraints(id) {
  return (AUDIO_PROFILES[id] || AUDIO_PROFILES.processed).constraints
}

export class Recorder {
  constructor({ onLevel, onError, audioProfile = 'processed' } = {}) {
    this.onLevel = onLevel
    this.onError = onError
    this.audioProfile = audioProfile
    this.stream = null
    this.recorder = null
    this.chunks = []
    this.startedAt = 0
    this.stoppedAt = 0
    this.mimeType = ''
    this._audioCtx = null
    this._raf = 0
    this._stopPromise = null
  }

  get isRecording() {
    return this.recorder?.state === 'recording'
  }

  /** Elapsed capture time in ms. */
  elapsed() {
    if (!this.startedAt) return 0
    return (this.stoppedAt || Date.now()) - this.startedAt
  }

  /**
   * Opens the mic and starts recording.
   * Throws a DOMException with a useful `name` on failure:
   *   NotAllowedError  — user or policy denied
   *   NotFoundError    — no microphone
   *   NotReadableError — mic is busy (another app has it)
   */
  async start() {
    if (!recorderSupported()) {
      const err = new Error('Recording is not supported in this browser.')
      err.name = 'NotSupportedError'
      throw err
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: profileConstraints(this.audioProfile),
    })

    this.mimeType = pickMimeType()
    const options = this.mimeType ? { mimeType: this.mimeType } : undefined
    this.recorder = new MediaRecorder(this.stream, options)
    this.chunks = []

    this.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data)
    }
    this.recorder.onerror = (event) => {
      this.onError?.(event.error || new Error('Recorder error'))
    }

    // Timeslice keeps data flowing so a hard kill still leaves usable chunks.
    this.recorder.start(1000)
    this.startedAt = Date.now()
    this.stoppedAt = 0
    this._startMeter()
    return true
  }

  _startMeter() {
    if (!this.onLevel || !this.stream) return
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      this._audioCtx = ctx
      // May be suspended without a user gesture; the meter is decorative, so a
      // failure here must never stop the capture.
      ctx.resume?.().catch(() => {})
      const source = ctx.createMediaStreamSource(this.stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.75
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteTimeDomainData(data)
        let peak = 0
        for (let i = 0; i < data.length; i++) {
          const v = Math.abs(data[i] - 128) / 128
          if (v > peak) peak = v
        }
        this.onLevel?.(Math.min(1, peak * 1.8))
        this._raf = requestAnimationFrame(tick)
      }
      this._raf = requestAnimationFrame(tick)
    } catch {
      /* no meter, no problem */
    }
  }

  /** Stops and resolves with { blob, mimeType, duration } (blob may be null). */
  stop() {
    if (this._stopPromise) return this._stopPromise
    this._stopPromise = new Promise((resolve) => {
      const finish = () => {
        this.stoppedAt = this.stoppedAt || Date.now()
        const duration = this.stoppedAt - this.startedAt
        const type = this.mimeType || this.chunks[0]?.type || 'audio/webm'
        const blob = this.chunks.length ? new Blob(this.chunks, { type }) : null
        this._teardown()
        resolve({ blob, mimeType: type, duration })
      }

      if (!this.recorder || this.recorder.state === 'inactive') {
        finish()
        return
      }
      this.recorder.onstop = finish
      try {
        this.recorder.requestData()
        this.recorder.stop()
      } catch {
        finish()
      }
    })
    return this._stopPromise
  }

  /** Releases the mic without waiting for a blob. */
  _teardown() {
    cancelAnimationFrame(this._raf)
    this._raf = 0
    if (this._audioCtx) {
      this._audioCtx.close?.().catch(() => {})
      this._audioCtx = null
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop()
      this.stream = null
    }
    this.recorder = null
  }

  /** Abandon the capture entirely (used when a screen unmounts unsaved). */
  cancel() {
    try {
      if (this.recorder?.state === 'recording') {
        this.recorder.onstop = null
        this.recorder.stop()
      }
    } catch {
      /* ignore */
    }
    this.chunks = []
    this._teardown()
  }
}

/**
 * Human-readable reason a capture could not start, written for someone who is
 * not going to debug it.
 */
export function micErrorMessage(err) {
  const name = err?.name || ''
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'The microphone is blocked. Turn it back on in your browser site settings, then reopen this screen.'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError')
    return 'No microphone was found on this device.'
  if (name === 'NotReadableError' || name === 'TrackStartError')
    return 'Another app is using the microphone. Close it and try again.'
  if (name === 'NotSupportedError')
    return 'This browser cannot record audio. Try Chrome.'
  return 'Could not start the microphone. Tap to try again.'
}
