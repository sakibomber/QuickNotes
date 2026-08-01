/**
 * Settings → Microphone.
 *
 * Exists because the first S23 device test produced "speech never works" and
 * "the installed app can't record" with no way to find out why from the phone.
 * This shows the permission state, asks for access from inside a real tap, and
 * runs the check that separates a microphone conflict from a missing speech
 * service — then lets you copy the whole result out.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  findMicCombination,
  isSecure,
  isStandalone,
  requestMicAccess,
  runDiagnostics,
} from '../lib/diagnostics.js'
import { micPermissionState } from '../lib/recorder.js'
import { copyText } from '../lib/text.js'
import { fullStamp } from '../lib/format.js'
import Icon from './Icon.jsx'
import Button from './Button.jsx'

const STATE_COPY = {
  granted: { label: 'Allowed', tone: 'ok', hint: 'Recording can start on its own.' },
  prompt: {
    label: 'Not asked yet',
    tone: 'warn',
    hint: 'You will be asked the first time you tap Record.',
  },
  denied: {
    label: 'Blocked',
    tone: 'bad',
    hint: 'Android Settings → Apps → Quick Notes → Permissions → Microphone → Allow.',
  },
  unknown: {
    label: 'Unknown',
    tone: 'warn',
    hint: 'This browser will not say. Use the button below to find out.',
  },
}

export default function MicPanel({ onToast, onApplyCombination, settings }) {
  const [state, setState] = useState('unknown')
  const [rows, setRows] = useState([])
  const [running, setRunning] = useState(false)
  const [asked, setAsked] = useState(null)
  const [combos, setCombos] = useState([])
  const [sweeping, setSweeping] = useState(false)
  const [sweepDone, setSweepDone] = useState(false)

  // Offered once the main check has proved speech works alone but not while
  // recording — the only situation where a different combination can help.
  const contention =
    rows.some((r) => r.id === 'speech-alone' && r.ok) &&
    rows.some((r) => r.id === 'speech-with-recorder' && !r.ok)

  const refresh = useCallback(() => {
    micPermissionState().then(setState)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const request = async () => {
    // Called straight from a tap on purpose: the installed app is a separate
    // Android package and its permission prompt will not appear otherwise.
    const result = await requestMicAccess()
    setAsked(result)
    refresh()
    onToast?.(
      result.ok ? 'Microphone allowed' : `Refused: ${result.error}`,
      result.ok ? 'good' : undefined
    )
  }

  const run = async () => {
    setRunning(true)
    setRows([])
    try {
      await runDiagnostics({ onStep: (_row, all) => setRows(all) })
    } finally {
      setRunning(false)
    }
  }

  const sweep = async () => {
    setSweeping(true)
    setSweepDone(false)
    setCombos([])
    try {
      const results = await findMicCombination({
        onStep: (_row, all) => setCombos(all),
      })
      setCombos(results)
      const winner = results.find((r) => r.ok)
      if (winner) {
        onApplyCombination?.({
          audioProfile: winner.profile,
          speechFirst: winner.speechFirst,
          speechBlockedReason: null,
        })
        onToast?.(`Fixed — using "${winner.label}"`, 'good')
      } else {
        // Nothing works. Stop attempting a speech session on every capture:
        // it cannot succeed, it costs battery, and on some orderings it makes
        // the recording itself worse.
        onApplyCombination?.({
          audioProfile: 'processed',
          speechFirst: false,
          speechBlockedReason: 'contention',
          disableLive: true,
        })
        onToast?.('Turned off writing-down — this phone cannot do both')
      }
    } finally {
      setSweeping(false)
      setSweepDone(true)
    }
  }

  const copyReport = async () => {
    const lines = [
      'Quick Notes — microphone check',
      fullStamp(),
      `Running as: ${isStandalone() ? 'installed app' : 'browser tab'}`,
      `Secure context: ${isSecure()}`,
      `Permission: ${state}`,
      `Audio profile: ${settings?.audioProfile || 'processed'} · speech first: ${!!settings?.speechFirst}`,
      navigator.userAgent,
      '',
      ...rows.map((r) => `[${r.ok ? 'PASS' : r.warn || r.neutral ? 'INFO' : 'FAIL'}] ${r.label}: ${r.detail}`),
      ...(combos.length
        ? ['', 'Combination sweep:', ...combos.map((c) => `[${c.ok ? 'PASS' : 'FAIL'}] ${c.label}: ${c.detail}`)]
        : []),
    ]
    const ok = await copyText(lines.join('\n'))
    onToast?.(ok ? 'Check copied — paste it anywhere' : 'Could not copy', ok ? 'good' : undefined)
  }

  const copy = STATE_COPY[state] || STATE_COPY.unknown

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface2 px-4 py-3">
        <Icon
          name={copy.tone === 'ok' ? 'check' : 'warning'}
          size={20}
          className={
            copy.tone === 'ok' ? 'shrink-0 text-accent' : copy.tone === 'bad' ? 'shrink-0 text-danger' : 'shrink-0 text-muted'
          }
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.95rem] text-ink">Microphone: {copy.label}</span>
          <span className="block text-[0.8rem] leading-snug text-muted">{copy.hint}</span>
        </span>
      </div>

      {!isSecure() && (
        <div className="rounded-xl border border-danger px-4 py-3 text-[0.85rem] leading-snug text-danger">
          This page is not on a secure connection, so the microphone is blocked no matter what
          the permission says. It needs https:// or localhost.
        </div>
      )}

      <Button variant="primary" full icon="mic" onClick={request}>
        Allow the microphone
      </Button>

      {asked && !asked.ok && (
        <p className="px-1 font-mono text-[0.75rem] leading-snug text-danger">
          {asked.error}: {asked.message}
        </p>
      )}

      <Button variant="solid" full icon="eye" onClick={run} disabled={running}>
        {running ? 'Checking…' : 'Check microphone and speech'}
      </Button>

      {rows.length > 0 && (
        <ul className="space-y-1.5 rounded-xl border border-line bg-surface2 px-3 py-3">
          {rows.map((row) => (
            <li key={row.id} className="flex gap-2.5">
              <Icon
                name={row.neutral ? 'info' : row.ok ? 'check' : row.warn ? 'warning' : 'close'}
                size={16}
                className={[
                  'mt-0.5 shrink-0',
                  row.neutral ? 'text-muted' : row.ok ? 'text-accent' : row.warn ? 'text-muted' : 'text-danger',
                ].join(' ')}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.85rem] text-ink">{row.label}</span>
                <span className="block text-[0.78rem] leading-snug break-words text-muted">
                  {row.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {contention && !running && (
        <div className="space-y-2.5 rounded-xl border border-accent px-3 py-3">
          <p className="text-[0.85rem] leading-snug text-ink">
            Speech works on its own but not while recording. There are four ways to open the
            microphone — this tries each one and keeps the first that works.
          </p>
          <p className="text-[0.8rem] leading-snug text-muted">
            <strong className="text-ink">Keep talking the whole time.</strong> It takes about half
            a minute. Silence looks exactly like failure.
          </p>
          <Button variant="primary" full icon="restart" onClick={sweep} disabled={sweeping}>
            {sweeping ? 'Trying…' : 'Find a way that works'}
          </Button>
        </div>
      )}

      {combos.length > 0 && (
        <ul className="space-y-1.5 rounded-xl border border-line bg-surface2 px-3 py-3">
          {combos.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <Icon
                name={c.ok ? 'check' : 'close'}
                size={16}
                className={['mt-0.5 shrink-0', c.ok ? 'text-accent' : 'text-danger'].join(' ')}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.85rem] text-ink">{c.label}</span>
                <span className="block text-[0.78rem] leading-snug break-words text-muted">
                  {c.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {sweepDone && !combos.some((c) => c.ok) && (
        <div className="rounded-xl border border-line bg-surface2 px-3 py-3">
          <p className="text-[0.85rem] leading-relaxed text-ink">
            None of the four worked. This phone will not let the recorder and the speech service
            share the microphone, whichever way round they are asked.
          </p>
          <p className="mt-2 text-[0.82rem] leading-relaxed text-muted">
            Writing-down has been switched off so it stops trying and failing on every recording.
            <strong className="text-ink"> Your voice is still saved with every note</strong> — play
            it back and type the words in when you sort your inbox.
          </p>
        </div>
      )}

      {rows.length > 0 && !running && (
        <Button variant="quiet" full icon="copy" onClick={copyReport}>
          Copy this check
        </Button>
      )}
    </div>
  )
}
