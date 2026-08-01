/**
 * Plays the recording attached to a note (spec §5).
 *
 * This is the audit tool: a mangled transcript that can't be checked against
 * the voice is a false memory with a timestamp on it. So the play button sits
 * right next to the text, and it is a real target, not an icon in a corner.
 *
 * Note: MediaRecorder's WebM output usually reports duration as Infinity, so
 * the length recorded at capture time is what gets displayed.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { clockTime } from '../lib/format.js'
import Icon from './Icon.jsx'

export default function AudioPlayer({ note, compact = false }) {
  const { getAudio } = useStore()
  const [url, setUrl] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [failed, setFailed] = useState(false)
  const audioRef = useRef(null)
  const urlRef = useRef(null)

  const total = note?.duration || 0

  useEffect(() => {
    let dead = false
    setUrl(null)
    setPlaying(false)
    setPosition(0)
    setFailed(false)
    if (!note?.audioBlobId) return undefined
    getAudio(note.audioBlobId).then(
      (row) => {
        if (dead || !row?.blob) {
          if (!dead && !row) setFailed(true)
          return
        }
        const objectUrl = URL.createObjectURL(row.blob)
        urlRef.current = objectUrl
        setUrl(objectUrl)
      },
      () => !dead && setFailed(true)
    )
    return () => {
      dead = true
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [note?.audioBlobId, getAudio])

  const toggle = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      el.play().then(
        () => setPlaying(true),
        () => setFailed(true)
      )
    } else {
      el.pause()
      setPlaying(false)
    }
  }, [])

  const restart = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    try {
      el.currentTime = 0
    } catch {
      /* seeking a stream-recorded blob can throw before metadata lands */
    }
    setPosition(0)
    el.play().then(
      () => setPlaying(true),
      () => setFailed(true)
    )
  }, [])

  if (!note?.audioBlobId) return null

  const pct = total > 0 ? Math.min(100, (position / (total / 1000)) * 100) : 0

  return (
    <div
      className={[
        'flex items-center gap-3 rounded-xl border border-line bg-surface2 px-3',
        compact ? 'py-1.5' : 'py-2',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={!url || failed}
        aria-label={playing ? 'Pause the recording' : 'Play the recording'}
        className="press focus-ring flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-accent text-accent disabled:opacity-40"
      >
        <Icon name={playing ? 'pause' : 'play'} size={26} filled={!playing} strokeWidth={2.2} />
      </button>

      <div className="min-w-0 flex-1">
        <div className="stamp-label text-[0.68rem] text-faint">
          {failed ? 'Recording unavailable' : 'Your recording'}
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-bg">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 font-mono text-[0.72rem] text-muted">
          {clockTime(position * 1000)} {total ? `/ ${clockTime(total)}` : ''}
        </div>
      </div>

      <button
        type="button"
        onClick={restart}
        disabled={!url || failed}
        aria-label="Play from the start"
        className="press focus-ring tap flex shrink-0 items-center justify-center rounded-xl border border-line text-muted disabled:opacity-40"
      >
        <Icon name="restart" size={22} />
      </button>

      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
          onEnded={() => {
            setPlaying(false)
            setPosition(0)
          }}
          onPause={() => setPlaying(false)}
          onError={() => setFailed(true)}
          className="hidden"
        />
      )}
    </div>
  )
}
