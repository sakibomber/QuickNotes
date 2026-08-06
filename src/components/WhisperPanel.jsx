/**
 * Settings → Write notes up from your voice.
 *
 * The on-device Whisper spike. Nothing here happens until it is asked for: the
 * model is a ~40 MB download and springing that on someone on mobile data
 * would be its own kind of harm. The app stays fully usable audio-only if this
 * is declined, fails, or is never touched.
 *
 * It also reports the numbers the spike is judged on — download size, seconds
 * per pass, and the realtime factor — because "it felt slow" is not a result.
 */

import { useEffect, useState } from 'react'
import {
  FORMAT_LIST,
  WHISPER_MODELS,
  approxDownloadMB,
  clearModelCache,
  lastLoadAttempts,
  hasWebGPU,
  loadWhisper,
  loadedModel,
  wasmSource,
} from '../lib/whisper.js'
import { TRANSCRIBERS } from '../lib/transcribe.js'
import { bytes } from '../lib/format.js'
import { copyText } from '../lib/text.js'
import Icon from './Icon.jsx'
import Button, { Segmented } from './Button.jsx'
import { useStore } from '../lib/store.jsx'

export default function WhisperPanel({ onToast }) {
  const {
    settings,
    setSetting,
    notes,
    transcribing,
    getAudio,
    runTranscriptionQueue,
    retryAllTranscription,
    transcribeCounts,
  } = useStore()
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(!!loadedModel())
  const [gpu, setGpu] = useState(null)
  const [bench, setBench] = useState(null)
  const [benching, setBenching] = useState(false)
  const [wasm, setWasm] = useState(null)
  const [errorText, setErrorText] = useState(null)
  const [attempts, setAttempts] = useState([])

  useEffect(() => {
    hasWebGPU().then(setGpu)
  }, [])

  const model = WHISPER_MODELS.find((m) => m.id === settings.whisperModel) || WHISPER_MODELS[0]
  const waiting = notes.filter(
    (n) => n.audioBlobId && !(n.transcript || '').trim() && n.transcribeState === 'pending'
  ).length

  const download = async () => {
    setLoading(true)
    setErrorText(null)
    setAttempts([])
    setProgress({ phase: 'starting' })
    try {
      await loadWhisper(settings.whisperModel, {
        onProgress: (p) => {
          if (p.phase === 'falling-back') {
            setAttempts((a) => [...a, { label: p.fromLabel, reason: p.reason, files: p.files }])
          }
          setProgress(p)
        },
        backend: settings.whisperBackend,
        format: settings.whisperFormat,
      })
      // Clear it explicitly. The library does not reliably emit a final
      // "ready", so waiting for one left a full bar reading "Downloading…"
      // forever — which looks exactly like a hang.
      setProgress(null)
      setWasm(await wasmSource())
      setReady(true)
      await setSetting('whisperEnabled', true)
      onToast?.('Ready — your notes will be written up automatically', 'good')
      runTranscriptionQueue()
    } catch (err) {
      setErrorText(String(err?.message || err))
      onToast?.('Download failed')
      setProgress(null)
    } finally {
      setLoading(false)
    }
  }

  /** Times one real recording so the spike has numbers, not impressions. */
  const benchmark = async () => {
    // Longest recording available: a realtime factor measured on a 2-second
    // clip is dominated by fixed startup cost and tells you nothing useful.
    const candidate = notes
      .filter((n) => n.audioBlobId)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))[0]
    if (!candidate) {
      onToast?.('Record a note first, then run this')
      return
    }
    setBenching(true)
    setBench(null)
    try {
      const row = await getAudio(candidate.audioBlobId)
      if (!row?.blob) throw new Error('recording missing')
      const result = await TRANSCRIBERS.whisper.transcribeBlobDetailed(row.blob, {
        modelId: settings.whisperModel,
        backend: settings.whisperBackend,
        format: settings.whisperFormat,
        onProgress: setProgress,
      })
      setBench(result)
      setWasm(await wasmSource())
    } catch (err) {
      onToast?.(`Test failed: ${err?.message || err}`)
    } finally {
      setBenching(false)
      setProgress(null)
    }
  }

  return (
    <div className="space-y-2.5">
      {!settings.whisperEnabled && !ready && (
        <div className="rounded-xl border border-line bg-surface2 px-3 py-3">
          <p className="text-[0.88rem] leading-relaxed text-ink">
            This phone cannot turn speech into text while recording. Instead, it can write your
            notes up afterwards — on the phone itself, with nothing sent anywhere.
          </p>
          <p className="mt-2 text-[0.82rem] leading-relaxed text-muted">
            It needs a one-time download of about{' '}
            <strong className="text-ink">
              {approxDownloadMB(settings.whisperModel, settings.whisperFormat)} MB
            </strong>.
            Best done on wi-fi. You can carry on using the app without it.
          </p>
        </div>
      )}

      <div>
        <div className="mb-2 px-1 text-[0.85rem] text-muted">Which one</div>
        <Segmented
          value={settings.whisperModel}
          onChange={(v) => setSetting('whisperModel', v)}
          // `m.approxMB` does not exist — this rendered "· undefined MB". The size
          // depends on model AND format, which is the whole point of the matrix.
          options={WHISPER_MODELS.map((m) => ({
            value: m.id,
            label: `${m.label} · ${approxDownloadMB(m.id, settings.whisperFormat)} MB`,
          }))}
        />
        <p className="mt-2 px-1 text-[0.8rem] leading-snug text-muted">{model.blurb}</p>
      </div>

      <Button
        variant="quiet"
        full
        icon="trash"
        onClick={async () => {
          const { unloadWhisper } = await import('../lib/whisper.js')
          await unloadWhisper()
          const removed = await clearModelCache()
          setReady(false)
          setAttempts([])
          setErrorText(null)
          await setSetting('whisperEnabled', false)
          onToast?.(
            removed.length ? 'Downloaded model cleared' : 'Nothing was cached',
            'good'
          )
        }}
      >
        Delete the downloaded model and start over
      </Button>

      <div>
        <div className="mb-2 px-1 text-[0.85rem] text-muted">Format</div>
        <Segmented
          value={settings.whisperFormat}
          onChange={(v) => setSetting('whisperFormat', v)}
          options={FORMAT_LIST.map((f) => ({ value: f.id, label: f.label }))}
        />
        <p className="mt-2 px-1 text-[0.8rem] leading-snug text-muted">
          {(FORMAT_LIST.find((f) => f.id === settings.whisperFormat) || FORMAT_LIST[0]).blurb}
        </p>
      </div>

      {progress && (
        <div className="rounded-xl border border-accent px-3 py-2.5">
          <div className="flex items-center justify-between text-[0.82rem] text-ink">
            <span>
              {progress.phase === 'downloading'
                ? 'Downloading…'
                : progress.phase === 'decoding'
                  ? 'Reading the recording…'
                  : progress.phase === 'trying'
                  ? `Trying ${progress.label}…`
                  : progress.phase === 'falling-back'
                    ? `${progress.fromLabel} did not work — trying the next one`
                    : progress.phase === 'transcribing'
                    ? 'Writing it up…'
                    : progress.phase === 'ready'
                      ? 'Ready'
                      : 'Starting…'}
            </span>
            {progress.bytes > 0 && (
              <span className="font-mono text-[0.75rem] text-muted">{bytes(progress.bytes)}</span>
            )}
          </div>
          {progress.pct != null && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg">
              <div className="h-full rounded-full bg-accent" style={{ width: `${progress.pct}%` }} />
            </div>
          )}
        </div>
      )}

      {attempts.length > 0 && (
        <div className="rounded-xl border border-line bg-surface2 px-3 py-2.5">
          <p className="text-[0.82rem] leading-snug text-ink">
            Some formats would not run on this phone:
          </p>
          <ul className="mt-1.5 space-y-1">
            {attempts.map((a, i) => (
              <li key={i} className="font-mono text-[0.7rem] leading-snug break-words text-muted">
                <span className="text-ink">{a.label}</span>
                {a.files?.length ? (
                  <span className="block">files: {a.files.join(', ')}</span>
                ) : (
                  <span className="block">files: (none fetched — served from cache?)</span>
                )}
                <span className="block">{a.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {attempts.length > 0 && (
        <div className="space-y-2.5">
          <Button
            variant="quiet"
            full
            icon="copy"
            onClick={async () => {
              const log = lastLoadAttempts()
                .map((a) =>
                  [
                    `[${a.ok ? 'OK' : 'FAIL'}] ${a.label} on ${a.device}`,
                    `  asked for: ${JSON.stringify(a.dtype)}`,
                    `  files fetched: ${a.files.length ? a.files.join(', ') : '(none — served from cache?)'}`,
                    ...(a.reason ? [`  error: ${a.reason}`] : []),
                  ].join('\n')
                )
                .join('\n\n')
              const ok = await copyText(
                ['Quick Notes — model load attempts', navigator.userAgent, '', log].join('\n')
              )
              onToast?.(ok ? 'Copied the load log' : 'Could not copy', ok ? 'good' : undefined)
            }}
          >
            Copy what it tried
          </Button>
        </div>
      )}

      {errorText && (
        <div className="rounded-xl border border-danger px-3 py-2.5">
          <p className="text-[0.85rem] leading-snug text-danger">It could not start.</p>
          <p className="mt-1 font-mono text-[0.72rem] leading-snug break-words text-muted">
            {errorText}
          </p>
        </div>
      )}

      {!settings.whisperEnabled ? (
        <Button variant="primary" full icon="download" onClick={download} disabled={loading}>
          {loading
            ? 'Downloading…'
            : `Download and turn on (about ${approxDownloadMB(settings.whisperModel, settings.whisperFormat)} MB)`}
        </Button>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface2 px-4 py-3">
            <Icon name="check" size={20} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.92rem] text-ink">
                {transcribing ? 'Writing up a note now…' : 'On — notes are written up in the background'}
              </span>
              <span className="block text-[0.8rem] leading-snug text-muted">
                {transcribeCounts.pending > 0
                  ? `${transcribeCounts.pending} waiting`
                  : 'Nothing waiting'}
                {transcribeCounts.failed > 0 ? ` · ${transcribeCounts.failed} could not be done` : ''}
                {loadedModel()?.backend ? ` · on ${loadedModel().backend.toUpperCase()}` : ''}
              </span>
            </span>
          </div>

          {transcribeCounts.failed > 0 && (
            <Button
              variant="solid"
              full
              icon="restart"
              onClick={async () => {
                const n = await retryAllTranscription()
                onToast?.(`Trying ${n} again`)
              }}
            >
              Try the {transcribeCounts.failed} that failed again
            </Button>
          )}

          <div>
            <div className="mb-2 px-1 text-[0.85rem] text-muted">How it runs</div>
            <Segmented
              value={settings.whisperBackend}
              onChange={(v) => setSetting('whisperBackend', v)}
              options={[
                { value: 'wasm', label: 'Reliable (CPU)' },
                { value: 'auto', label: 'Fast (graphics)' },
              ]}
            />
            <p className="mt-2 px-1 text-[0.8rem] leading-snug text-muted">
              {settings.whisperBackend === 'wasm'
                ? 'Slower, but it finishes. This is the default because the graphics route hung on this phone.'
                : 'Tries the graphics chip first. If a note takes too long it switches back to CPU on its own.'}
            </p>
          </div>
          <Button variant="quiet" full icon="close" onClick={() => setSetting('whisperEnabled', false)}>
            Turn it off
          </Button>
        </>
      )}

      {/* Spike instrumentation — the numbers the go/no-go is written against. */}
      <div className="rounded-xl border border-line px-3 py-3">
        <div className="stamp-label mb-2 text-[0.66rem] text-faint">Speed test</div>
        <p className="mb-2 text-[0.8rem] leading-snug text-muted">
          Times one of your own recordings, so the decision is made on numbers rather than a
          feeling. Graphics: {gpu === null ? 'checking…' : gpu ? 'WebGPU available' : 'WASM only'}.
        </p>
        <Button variant="solid" full icon="clock" onClick={benchmark} disabled={benching}>
          {benching ? 'Timing…' : 'Time one recording'}
        </Button>
        {bench && (
          <div className="mt-2.5 space-y-1 font-mono text-[0.75rem] text-muted">
            <div>audio: {bench.audioSeconds?.toFixed(1)}s</div>
            <div>took: {(bench.tookMs / 1000).toFixed(1)}s</div>
            <div className={bench.realtimeFactor <= 2 ? 'text-accent' : 'text-danger'}>
              realtime factor: {bench.realtimeFactor?.toFixed(2)}x
              {bench.realtimeFactor <= 2 ? ' — within target' : ' — over target'}
            </div>
            <div>backend: {bench.backend}</div>
            <div>format: {bench.format}</div>
            <div>model: {bench.modelId}</div>
            {wasm && (
              <div className={wasm.local ? 'text-accent' : 'text-danger'}>
                runtime from: {wasm.local ? 'this site (no third party)' : wasm.path}
              </div>
            )}
            <div className="pt-1.5 font-sans text-[0.82rem] leading-snug break-words text-ink">
              “{bench.text || '(nothing came back)'}”
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
