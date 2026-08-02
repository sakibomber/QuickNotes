/**
 * Settings → Screen fit.
 *
 * Exists because "the bottom nav is hidden behind the Android system buttons"
 * could not be diagnosed from a laptop: the viewport meta and the safe-area
 * CSS were both present and correct in the deployed build. The question was
 * never whether the fix shipped — it was what the device reports the insets
 * to be. This says so, out loud, and can be copied out.
 */

import { useCallback, useEffect, useState } from 'react'
import { screenReport } from '../lib/diagnostics.js'
import { copyText } from '../lib/text.js'
import Button from './Button.jsx'

export default function ScreenFitPanel({ onToast }) {
  const [report, setReport] = useState(null)

  const refresh = useCallback(() => setReport(screenReport()), [])

  useEffect(() => {
    refresh()
    window.addEventListener('resize', refresh)
    window.visualViewport?.addEventListener('resize', refresh)
    return () => {
      window.removeEventListener('resize', refresh)
      window.visualViewport?.removeEventListener('resize', refresh)
    }
  }, [refresh])

  if (!report) return null
  if (report.error) {
    return (
      <p className="px-1 text-[0.82rem] leading-snug text-muted">
        This phone would not report its screen measurements ({report.error}).
      </p>
    )
  }

  const rows = [
    ['safe area bottom', report.insets.bottom],
    ['safe area top', report.insets.top],
    ['viewport-fit: cover', report.viewportFitCover ? 'yes' : 'no'],
    ['window height', `${report.innerHeight}px`],
    ['visible height', report.visualViewport != null ? `${report.visualViewport}px` : 'unknown'],
    ['cut off below', report.lostBelow != null ? `${report.lostBelow}px` : 'unknown'],
    ['installed app', report.standalone ? 'yes' : 'no'],
  ]

  const bad = report.lostBelow != null && report.lostBelow > 2

  return (
    <div className="space-y-2.5">
      <p className="px-1 text-[0.82rem] leading-relaxed text-muted">
        If the bottom row of buttons is ever hidden behind your phone&rsquo;s own buttons, these
        numbers say why.
      </p>
      <div className="paper space-y-1.5 rounded-xl px-4 py-3 font-mono text-[0.78rem] text-muted">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <span>{label}</span>
            <span className="text-ink">{value}</span>
          </div>
        ))}
      </div>
      {bad && (
        <p className="px-1 text-[0.82rem] leading-snug text-danger">
          {report.lostBelow}px of the app is below the visible area. Send this to whoever is
          maintaining the app.
        </p>
      )}
      <Button
        variant="quiet"
        full
        icon="copy"
        onClick={async () => {
          const ok = await copyText(
            [
              'Quick Notes — screen fit',
              navigator.userAgent,
              ...rows.map(([l, v]) => `${l}: ${v}`),
            ].join('\n')
          )
          onToast?.(ok ? 'Copied' : 'Could not copy', ok ? 'good' : undefined)
        }}
      >
        Copy these numbers
      </Button>
    </div>
  )
}
