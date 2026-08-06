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

/**
 * Weight formats, and why this is a ladder rather than a constant.
 *
 * The S23 failed to create a CPU session with:
 *   qdq_actions.cc TransposeDQWeightsForMatMulNBits — missing required scale
 *   for model.decoder.embed_tokens.weight_transposed_DequantizeLinear
 *
 * MatMulNBits is 4-bit, so a q4 tensor reached the WASM execution provider,
 * which cannot handle it — q4 is effectively WebGPU-only. Asking for 'q8' as a
 * bare string did not prevent that, so the format is now pinned per module.
 */
export const FORMATS = {
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    simple: 'q8',
    blurb: '8-bit. The smallest download, and the only one the CPU reliably runs. Start here.',
    dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
  },
  half: {
    id: 'half',
    label: 'Closer to original',
    simple: 'fp16',
    blurb: '16-bit. Bigger, but nearer the original if 8-bit gets words wrong.',
    dtype: { encoder_model: 'fp16', decoder_model_merged: 'fp16' },
  },
  original: {
    id: 'original',
    label: 'Original',
    simple: 'fp32',
    blurb: 'Full precision. Biggest download, but the most likely to run anywhere.',
    dtype: { encoder_model: 'fp32', decoder_model_merged: 'fp32' },
  },
  /**
   * Kept as `smallest` because that id is already saved in people's settings.
   * The NAME was a lie and is now fixed: q4 quantizes the matmul weights but
   * leaves the embedding table at full precision, so at every model size the
   * q4 download is LARGER than q8 — 96 MB vs 41 MB on tiny, 251 MB vs 172 MB
   * on distil-small. It was never the smallest anything. It is bigger AND
   * CPU-incompatible, so it is listed last and recommended to nobody.
   */
  smallest: {
    id: 'smallest',
    label: '4-bit (graphics chip only)',
    simple: 'q4',
    blurb: 'Needs the graphics chip, and downloads MORE than Balanced. Only worth trying on WebGPU.',
    dtype: { encoder_model: 'q4', decoder_model_merged: 'q4' },
  },
}

export const FORMAT_LIST = Object.values(FORMATS)

/**
 * ONNX Runtime graph optimization level — the fix for DECISIONS.md §18.
 *
 * Every format failed to create a session with:
 *   qdq_actions.cc TransposeDQWeightsForMatMulNBits
 *   Missing required scale: model.decoder.embed_tokens.weight_merged_0_scale
 *
 * §18 read that as "MatMulNBits is 4-bit, so something 4-bit is loading no
 * matter what we ask for" and went hunting for wrong dtype keys or a poisoned
 * cache. Both were dead ends, because the premise was wrong: MatMulNBits is
 * what the optimizer was trying to BUILD, not what it read. From ORT 1.25 the
 * extended-level QDQ transformer rewrites DequantizeLinear+MatMul into
 * MatMulNBits, and that rewrite needs scale tensors which Whisper ONNX exports
 * published before it do not carry. Upstream: onnxruntime#28306 and
 * transformers.js#1707, the latter with this exact tensor name on a q8 decoder.
 *
 * That pass lives at the `extended` level, and ORT's levels are cumulative, so
 * capping at `basic` is the dial that turns it off. `disabled` would also work
 * and costs more speed for nothing.
 *
 * Not device-specific and not fixable by choosing a different model: our target
 * export (distil-small.en) was last published in October 2024, well before the
 * runtime change, so it carries the same defect.
 *
 * THE COST, stated because it lands on the one number this feature is judged
 * on: `extended` is also where the transformer fusions live. Capping at `basic`
 * may make inference measurably slower. Every speed figure from here forward is
 * therefore measured under `basic` — which is what ships, so the go/no-go
 * thresholds are being evaluated against the real thing rather than a
 * configuration that cannot create a session.
 */
const GRAPH_OPTIMIZATION = 'basic'

/**
 * The attempt ladder.
 *
 * Every format — including fp32 — failed with the same MatMulNBits error, and
 * fp32 cannot produce that: MatMulNBits is 4-bit only. So the dtype was not
 * reaching file resolution, and something 4-bit was being loaded regardless of
 * what was asked for. Two candidates:
 *
 *   a) the per-module keys are wrong, so the map is ignored and the repo's
 *      default (q4) is used for the decoder
 *   b) a cached artifact is returned regardless of the request
 *
 * The ladder now tries the per-module map AND the plain-string form, which
 * tells (a) apart from (b): if the string form works, the keys were wrong; if
 * both fail identically on a cleared cache, it is not the keys.
 */
function attemptsFor(formatId) {
  const fmt = FORMATS[formatId] || FORMATS.balanced
  const rungs = [
    { label: `${fmt.label} · per-module`, dtype: fmt.dtype },
    { label: `${fmt.label} · whole model`, dtype: fmt.simple },
    { label: 'Original · whole model', dtype: 'fp32' },
  ]
  const seen = new Set()
  return rungs.filter((r) => {
    const key = JSON.stringify(r.dtype)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Deletes EVERY cached model file, for every model. The blunt instrument.
 *
 * This is now only reachable from the "delete everything and start over"
 * button. It used to run before every single load attempt, to rule out a
 * poisoned artifact while §18 was open — which was the right call then and is
 * actively harmful now: §19 named the real cause, and with a working load path
 * a blanket clear before each attempt means every cold start re-downloads the
 * whole model. At 172 MB, on a phone, possibly on mobile data.
 *
 * Prefer `deleteModelCache(id)`, which removes one model and leaves the rest.
 */
export async function clearModelCache() {
  const removed = []
  try {
    if (!globalThis.caches?.keys) return removed
    for (const name of await caches.keys()) {
      if (/transformers|onnx|huggingface|hf/i.test(name)) {
        await caches.delete(name)
        removed.push(name)
      }
    }
  } catch (err) {
    console.warn('[quick-notes] could not clear the model cache', err)
  }
  return removed
}

/**
 * Models, and where these numbers come from.
 *
 * Every size below is the sum of the two files the pipeline actually fetches —
 * `encoder_model` + `decoder_model_merged` — read from the repo's own file
 * listing, in decimal MB. They are not estimates and not scaled from each
 * other, because that is exactly how the previous table went wrong: it claimed
 * 28 MB for tiny/q4 (really 96) and 50 MB for base/q4 (really 142). A number
 * under a button has to be the number that gets downloaded, or the button is
 * lying — the same defect §17 was supposed to have fixed.
 *
 * Labels say what they load. The old table called tiny.en "Small" and base.en
 * "Better", so the app has been running the 39M-parameter model under a button
 * that read Small. Whisper's own size names are now used plainly.
 */
const MODELS = {
  tiny: {
    id: 'tiny',
    repo: 'onnx-community/whisper-tiny.en',
    label: 'Quickest (tiny)',
    sizes: { balanced: 41, half: 76, original: 151, smallest: 96 },
    blurb: 'Fastest, least accurate. Good for a shopping list, not for a script you will read out.',
  },
  base: {
    id: 'base',
    repo: 'onnx-community/whisper-base.en',
    label: 'Middle (base)',
    sizes: { balanced: 77, half: 146, original: 291, smallest: 142 },
    blurb: 'Twice the download, noticeably better words.',
  },
  /**
   * The target. Distilled from whisper-small: the full encoder with a 4-layer
   * decoder instead of 12, published as within ~1% WER of its teacher at
   * several times the speed. Chosen over whisper-small.en itself (249 MB q8,
   * ~5–10× realtime on CPU) because small-class ACCURACY is the requirement —
   * notes get read out verbatim at appointments — and small.en would sit
   * astride the 6× watchdog on the CPU-only path, i.e. fail the requirement by
   * never finishing.
   */
  'distil-small': {
    id: 'distil-small',
    repo: 'onnx-community/distil-small.en',
    label: 'Most accurate (distil-small)',
    sizes: { balanced: 172, half: 333, original: 665, smallest: 251 },
    blurb: 'Biggest download, best words. Use this if notes get read out loud.',
  },
}

export const WHISPER_MODELS = Object.values(MODELS)

/** Approximate download for a model+format pair, in MB. */
export function approxDownloadMB(modelId, formatId) {
  const m = MODELS[modelId] || MODELS.tiny
  return m.sizes[formatId] ?? m.sizes.balanced
}

/* --------------------------------------------------------- model storage */

/**
 * What is ACTUALLY on the phone, read from Cache Storage rather than inferred
 * from settings.
 *
 * Three models at three formats is most of a gigabyte, and nobody should have
 * to remember what they downloaded in order to get the space back. Sizes are
 * measured from the cached responses, so this reports what is stored, not what
 * we predicted would be stored — the same rule as the download-size matrix.
 */
async function eachModelEntry(fn) {
  if (!globalThis.caches?.keys) return
  for (const name of await caches.keys()) {
    if (!/transformers|onnx|huggingface|hf/i.test(name)) continue
    const cache = await caches.open(name)
    for (const request of await cache.keys()) {
      await fn({ cache, request, url: request.url })
    }
  }
}

/** Bytes held by one cached response, without reading the whole body if we can. */
async function entryBytes(cache, request) {
  try {
    const res = await cache.match(request)
    if (!res) return 0
    const len = res.headers.get('content-length')
    if (len) return Number(len) || 0
    return (await res.clone().blob()).size
  } catch {
    return 0
  }
}

/** Which model a cached URL belongs to, or null. Matched on the repo path. */
function modelForUrl(url) {
  for (const model of Object.values(MODELS)) {
    if (url.includes(`/${model.repo}/`)) return model
  }
  return null
}

/**
 * Per-model storage report: what is downloaded, and how much space it holds.
 * `bytes` is 0 for a model that is not stored at all.
 */
export async function modelCacheReport() {
  const totals = new Map()
  try {
    await eachModelEntry(async ({ cache, request, url }) => {
      const model = modelForUrl(url)
      if (!model) return
      const row = totals.get(model.id) || { weights: 0, bytes: 0 }
      row.bytes += await entryBytes(cache, request)
      if (/\.onnx/i.test(url)) row.weights++
      totals.set(model.id, row)
    })
  } catch (err) {
    console.warn('[quick-notes] could not read the model cache', err)
  }
  const models = Object.values(MODELS).map((m) => {
    const row = totals.get(m.id) || { weights: 0, bytes: 0 }
    return {
      id: m.id,
      label: m.label,
      repo: m.repo,
      bytes: row.bytes,
      // Both weight files have to be present for the model to be usable. One
      // of two is an interrupted download or a partial eviction, not a model.
      stored: row.weights >= 2,
      weights: row.weights,
    }
  })
  return { models, totalBytes: models.reduce((sum, m) => sum + m.bytes, 0) }
}

/** Deletes one model's files and leaves every other model alone. */
export async function deleteModelCache(modelId) {
  const model = MODELS[modelId]
  if (!model) return { bytes: 0, files: 0 }
  let bytes = 0
  let files = 0
  try {
    const doomed = []
    await eachModelEntry(async ({ cache, request, url }) => {
      if (!url.includes(`/${model.repo}/`)) return
      bytes += await entryBytes(cache, request)
      doomed.push({ cache, request })
    })
    for (const { cache, request } of doomed) {
      if (await cache.delete(request)) files++
    }
  } catch (err) {
    console.warn('[quick-notes] could not delete the model', err)
  }
  return { bytes, files }
}

/** Is this model actually still on the phone? The eviction check. */
export async function isModelCached(modelId) {
  const { models } = await modelCacheReport()
  return !!models.find((m) => m.id === modelId)?.stored
}

/**
 * Storage permission and headroom.
 *
 * `persisted` is the one that matters. Chrome can evict an origin's storage
 * under pressure unless persistence was granted, and a 172 MB model is a fat
 * target. §4 already asks for persistence at boot — this reports whether the
 * ask was actually honoured, because a silent refusal looks identical to a
 * grant right up until the model disappears.
 */
export async function storageReport() {
  const out = { supported: false, persisted: null, usage: null, quota: null }
  try {
    if (!navigator.storage) return out
    out.supported = true
    if (navigator.storage.persisted) out.persisted = await navigator.storage.persisted()
    if (navigator.storage.estimate) {
      const est = await navigator.storage.estimate()
      out.usage = est?.usage ?? null
      out.quota = est?.quota ?? null
    }
  } catch (err) {
    console.warn('[quick-notes] could not read storage state', err)
  }
  return out
}

/** Asks for persistent storage. Safe to call repeatedly. */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

let pipelinePromise = null
let loadedModelId = null
let loadedBackend = null
let loadedRequest = null
let loadedFormat = null
let downloadedBytes = 0
/** Per-attempt record: which dtype was asked for, and which files came down. */
let loadAttempts = []

/**
 * Hard ceiling on one transcription, as a multiple of the audio length.
 *
 * The ship/no-ship threshold is ~2× realtime and the stop threshold is ~3–4×,
 * so anything past 6× is already a failure even if it eventually returns.
 * Bounding it turns an indefinite hang into a reportable error, which is the
 * whole point — a silent hang must never be a terminal state.
 */
const WATCHDOG_FACTOR = 6
const WATCHDOG_FLOOR_MS = 45_000

export function watchdogMs(audioSeconds) {
  return Math.max(WATCHDOG_FLOOR_MS, Math.round((audioSeconds || 0) * 1000 * WATCHDOG_FACTOR))
}

/**
 * The model was turned on, and is no longer on the phone.
 *
 * Chrome can evict Cache Storage under pressure. Without this the next queued
 * note would quietly re-fetch 172 MB — possibly on mobile data, definitely
 * without being asked. Consent for the first download is not consent for every
 * subsequent one, so the queue stops and says so instead.
 */
export class ModelEvictedError extends Error {
  constructor(modelId) {
    super('The downloaded model is no longer on this phone.')
    this.name = 'ModelEvictedError'
    this.modelId = modelId
  }
}

export class TranscribeTimeout extends Error {
  constructor(ms, backend) {
    super(`Gave up after ${Math.round(ms / 1000)}s on ${backend || 'unknown'}`)
    this.name = 'TranscribeTimeout'
    this.backend = backend
  }
}

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

export function lastLoadAttempts() {
  return loadAttempts
}

export function loadedModel() {
  return loadedModelId
    ? { id: loadedModelId, backend: loadedBackend, format: loadedFormat, bytes: downloadedBytes }
    : null
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
export async function loadWhisper(
  modelId = 'tiny',
  { onProgress, backend = 'wasm', format = 'balanced' } = {}
) {
  const key = `${backend}:${format}`
  if (pipelinePromise && loadedModelId === modelId && loadedRequest === key) {
    return pipelinePromise
  }

  const model = MODELS[modelId] || MODELS.tiny
  loadedModelId = modelId
  loadedRequest = key
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

    const seen = new Map()
    // Exact filenames fetched during the current attempt. This is the evidence
    // that says whether the dtype reached file resolution at all: asking for
    // fp32 and seeing *_q4.onnx come down names the bug outright.
    let filesThisAttempt = new Set()
    const progress_callback = (info) => {
      if (info?.file) filesThisAttempt.add(info.file)
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
    }

    /** Only the .onnx weights matter here; configs and tokenizers are noise. */
    const onnxFiles = () => [...filesThisAttempt].filter((f) => /\.onnx/i.test(f))

    /**
     * Try WebGPU, fall back to CPU.
     *
     * WebGPU is worth having — it is the difference between a usable wait and
     * an unusable one — but it pulls in a different WASM variant and a whole
     * separate driver path. Any failure there must degrade to CPU rather than
     * take the feature down with it, which is exactly what happened on the
     * S23: one missing WebGPU asset killed transcription outright instead of
     * quietly running slower.
     */
    /**
     * Backend order.
     *
     * Default is CPU-only. WebGPU loaded and reported itself active on the
     * S23, then hung indefinitely mid-inference — no result, no error, no way
     * out. Slow but finishing beats fast but hung, so WebGPU is now opt-in
     * ('auto') rather than preferred, and a hang demotes it permanently.
     */
    const devices =
      backend === 'auto' && (await hasWebGPU()) ? ['webgpu', 'wasm'] : ['wasm']

    const rungs = attemptsFor(format)
    const sessionOptions = { graphOptimizationLevel: GRAPH_OPTIMIZATION }
    let lastError = null
    loadAttempts = []

    for (const device of devices) {
      for (const rung of rungs) {
        // NO cache clear here. It was added to rule out a poisoned artifact
        // while §18 was open; §19 named the real cause, and clearing before
        // every attempt now means a 172 MB re-download on every cold start.
        // "Delete and start over" is a button the user presses, not something
        // the load path does behind their back.
        filesThisAttempt = new Set()
        onProgress?.({ phase: 'trying', device, label: rung.label })

        try {
          const pipe = await pipeline('automatic-speech-recognition', model.repo, {
            device,
            dtype: rung.dtype,
            session_options: sessionOptions,
            progress_callback,
          })
          loadedBackend = device
          loadedFormat = rung.label
          loadAttempts.push({
            label: rung.label,
            device,
            dtype: rung.dtype,
            optimization: GRAPH_OPTIMIZATION,
            files: onnxFiles(),
            ok: true,
          })
          return pipe
        } catch (err) {
          lastError = err
          const files = onnxFiles()
          console.warn(`[quick-notes] ${device} / ${rung.label} failed`, { files, err })
          loadAttempts.push({
            label: rung.label,
            device,
            dtype: rung.dtype,
            optimization: GRAPH_OPTIMIZATION,
            files,
            ok: false,
            reason: String(err?.message || err),
          })
          onProgress?.({
            phase: 'falling-back',
            from: `${device} / ${rung.label}`,
            fromLabel: rung.label,
            files,
            reason: String(err?.message || err).slice(0, 240),
            bytes: downloadedBytes,
          })
        }
      }
    }
    throw lastError || new Error('No backend could be started.')
  })()

  try {
    return await pipelinePromise
  } catch (err) {
    // Leave no half-loaded state behind; the next attempt starts clean.
    pipelinePromise = null
    loadedModelId = null
    loadedBackend = null
    loadedFormat = null
    throw err
  }
}

/**
 * Throws the pipeline away. Called after a watchdog trip: a hung inference
 * cannot be cancelled from here, so the session is disposed and the next
 * attempt starts from a clean one rather than queueing behind a dead job.
 */
export async function unloadWhisper() {
  const pending = pipelinePromise
  pipelinePromise = null
  loadedModelId = null
  loadedBackend = null
  loadedRequest = null
  loadedFormat = null
  downloadedBytes = 0
  try {
    const pipe = await pending
    await pipe?.dispose?.()
  } catch {
    /* it was already broken; that is why we are here */
  }
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
export async function transcribeWithWhisper(
  blob,
  { modelId = 'tiny', backend = 'wasm', format = 'balanced', onProgress, allowDownload = false } = {}
) {
  // The background queue never downloads. Only a screen where someone has just
  // agreed to a download passes allowDownload.
  if (!allowDownload && !(await isModelCached(modelId))) throw new ModelEvictedError(modelId)
  const pipe = await loadWhisper(modelId, { onProgress, backend, format })
  onProgress?.({ phase: 'decoding' })
  const { samples, seconds } = await decodeTo16k(blob)

  onProgress?.({ phase: 'transcribing', seconds })
  const startedAt = performance.now()

  // Watchdog. A hung inference cannot be cancelled, so it is raced against a
  // timer and abandoned — the session is then disposed so the next attempt is
  // not queued behind a dead job.
  const limit = watchdogMs(seconds)
  let timer
  const output = await Promise.race([
    pipe(samples, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: false,
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new TranscribeTimeout(limit, loadedBackend)), limit)
    }),
  ]).finally(() => clearTimeout(timer))

  const tookMs = Math.round(performance.now() - startedAt)

  const text = (Array.isArray(output) ? output[0]?.text : output?.text) || ''
  return {
    text: text.trim(),
    audioSeconds: seconds,
    tookMs,
    // The number the go/no-go thresholds are written against.
    realtimeFactor: seconds > 0 ? tookMs / 1000 / seconds : null,
    backend: loadedBackend,
    format: loadedFormat,
    modelId,
    bytes: downloadedBytes,
  }
}
