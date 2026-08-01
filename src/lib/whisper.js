/**
 * ON-DEVICE WHISPER — spike (2026-08-01).
 *
 * Live transcription is impossible on the S23 Ultra (see DECISIONS.md §11), so
 * text has to come from a pass over the saved recording instead. This is that
 * pass, running entirely on the phone.
 *
 * Why on-device rather than a hosted API: this app will eventually hold other
 * veterans' clinical voice notes, and "nothing leaves the phone" is a promise
 * rather than a preference. The model is public data fetched once; the audio
 * never goes anywhere.
 *
 * Everything here sits behind `transcribeBlob()` in transcribe.js, so if the
 * spike fails its thresholds nothing else in the app has to change.
 *
 * The library and the model are BOTH loaded on demand — never at startup.
 * Capture must not pay for a feature it does not use.
 */

const MODELS = {
  tiny: {
    id: 'tiny',
    repo: 'onnx-community/whisper-tiny.en',
    label: 'Small',
    approxMB: 42,
    blurb: 'Quickest. Good enough for most notes.',
  },
  base: {
    id: 'base',
    repo: 'onnx-community/whisper-base.en',
    label: 'Better',
    approxMB: 78,
    blurb: 'Slower, more accurate. Try this if Small gets words wrong.',
  },
}

export const WHISPER_MODELS = Object.values(MODELS)

let pipelinePromise = null
let loadedModelId = null
let loadedBackend = null
let downloadedBytes = 0

export function whisperSupported() {
  // WASM is the floor; WebGPU is a bonus we detect at load time.
  return typeof WebAssembly === 'object'
}

export async function hasWebGPU() {
  try {
    if (!navigator.gpu) return false
    const adapter = await navigator.gpu.requestAdapter()
    return !!adapter
  } catch {
    return false
  }
}

export function loadedModel() {
  return loadedModelId ? { id: loadedModelId, backend: loadedBackend, bytes: downloadedBytes } : null
}

/**
 * Where the runtime is actually fetching its WASM from. Reported in the UI so
 * "nothing external is loaded" is something you can check on the phone rather
 * than something I asserted in a commit message.
 */
export async function wasmSource() {
  try {
    const { env } = await import('@huggingface/transformers')
    const path = env.backends?.onnx?.wasm?.wasmPaths
    if (!path) return { path: null, local: false }
    const local = String(path).startsWith(location.origin)
    return { path: String(path), local }
  } catch {
    return { path: null, local: false }
  }
}

/**
 * Loads the model, reporting progress so the download never looks like a hang.
 * Resolves to a transcription pipeline. Safe to call repeatedly.
 */
export async function loadWhisper(modelId = 'tiny', { onProgress } = {}) {
  if (pipelinePromise && loadedModelId === modelId) return pipelinePromise

  const model = MODELS[modelId] || MODELS.tiny
  loadedModelId = modelId
  downloadedBytes = 0

  pipelinePromise = (async () => {
    // Dynamic import: this chunk is ~1 MB and must never be in the startup path.
    const { pipeline, env } = await import('@huggingface/transformers')

    // Models are cached by the browser after the first fetch.
    env.allowLocalModels = false
    env.useBrowserCache = true

    // Serve the ONNX Runtime WASM binaries from our own origin. Without this
    // transformers.js fetches them from jsDelivr at runtime — a third-party CDN
    // dependency inside an offline-first app, and a silent failure mode for
    // anyone whose network blocks it. `scripts/copy-ort.mjs` puts them there.
    env.backends.onnx.wasm.wasmPaths = new URL('./ort/', document.baseURI).href

    const device = (await hasWebGPU()) ? 'webgpu' : 'wasm'
    loadedBackend = device

    const seen = new Map()
    const pipe = await pipeline('automatic-speech-recognition', model.repo, {
      device,
      dtype: device === 'webgpu' ? 'fp32' : 'q8',
      progress_callback: (info) => {
        if (info?.status === 'progress' && info.file) {
          seen.set(info.file, info.loaded || 0)
          downloadedBytes = [...seen.values()].reduce((a, b) => a + b, 0)
          const total = info.total ? info.total : 0
          onProgress?.({
            phase: 'downloading',
            file: info.file,
            bytes: downloadedBytes,
            pct: total ? Math.min(100, Math.round((info.loaded / total) * 100)) : null,
          })
        } else if (info?.status === 'ready') {
          onProgress?.({ phase: 'ready', bytes: downloadedBytes })
        }
      },
    })
    return pipe
  })()

  try {
    return await pipelinePromise
  } catch (err) {
    // Leave no half-loaded state behind; the next attempt starts clean.
    pipelinePromise = null
    loadedModelId = null
    loadedBackend = null
    throw err
  }
}

export function unloadWhisper() {
  pipelinePromise = null
  loadedModelId = null
  loadedBackend = null
  downloadedBytes = 0
}

/**
 * Whisper wants 16 kHz mono Float32. Decoding through the browser's own audio
 * stack keeps this honest about whatever MediaRecorder produced.
 */
async function decodeTo16k(blob) {
  const buf = await blob.arrayBuffer()
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext
  const DecodeCtx = window.AudioContext || window.webkitAudioContext
  const decoder = new DecodeCtx()
  let decoded
  try {
    decoded = await decoder.decodeAudioData(buf)
  } finally {
    decoder.close?.()
  }

  if (decoded.sampleRate === 16000 && decoded.numberOfChannels === 1) {
    return { samples: decoded.getChannelData(0), seconds: decoded.duration }
  }

  const frames = Math.ceil(decoded.duration * 16000)
  const offline = new Ctx(1, frames, 16000)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()
  return { samples: rendered.getChannelData(0), seconds: decoded.duration }
}

/**
 * Transcribes one recording. Returns the text plus the numbers the spike is
 * being judged on: how long the audio was, how long the pass took, and the
 * ratio between them.
 */
export async function transcribeWithWhisper(blob, { modelId = 'tiny', onProgress } = {}) {
  const pipe = await loadWhisper(modelId, { onProgress })
  onProgress?.({ phase: 'decoding' })
  const { samples, seconds } = await decodeTo16k(blob)

  onProgress?.({ phase: 'transcribing', seconds })
  const startedAt = performance.now()
  const output = await pipe(samples, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
  })
  const tookMs = Math.round(performance.now() - startedAt)

  const text = (Array.isArray(output) ? output[0]?.text : output?.text) || ''
  return {
    text: text.trim(),
    audioSeconds: seconds,
    tookMs,
    // The number the go/no-go thresholds are written against.
    realtimeFactor: seconds > 0 ? tookMs / 1000 / seconds : null,
    backend: loadedBackend,
    modelId,
    bytes: downloadedBytes,
  }
}
