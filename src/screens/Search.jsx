/**
 * SEARCH (spec §3).
 *
 * "Archives are clinical history — search is not optional." Full text across
 * every note including archived ones, with filters for bucket, date, has-audio
 * and open/done. Filters are chips you can see, not a hidden panel.
 */

import { useDeferredValue, useMemo, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useRouter } from '../lib/router.jsx'
import { INBOX } from '../lib/model.js'
import { friendlyDate, plural } from '../lib/format.js'
import Icon from '../components/Icon.jsx'
import Button from '../components/Button.jsx'
import { Screen, ScreenHeader, EmptyState } from '../components/Screen.jsx'
import { BucketChip } from '../components/BucketTile.jsx'
import AudioPlayer from '../components/AudioPlayer.jsx'
import Sheet from '../components/Sheet.jsx'
import { StampLabel } from '../components/Stamp.jsx'

const DAY = 86400000
const WHEN = [
  { id: 'any', label: 'Any time' },
  { id: '7', label: 'Last week' },
  { id: '30', label: 'Last month' },
  { id: '365', label: 'Last year' },
]
const STATE = [
  { id: 'any', label: 'Everything' },
  { id: 'open', label: 'Not done' },
  { id: 'done', label: 'Done' },
]

export default function Search() {
  const { notes, buckets, getBucket } = useStore()
  const { navigate } = useRouter()

  const [query, setQuery] = useState('')
  const [bucketId, setBucketId] = useState('any')
  const [when, setWhen] = useState('any')
  const [state, setState] = useState('any')
  const [audioOnly, setAudioOnly] = useState(false)
  const [openNote, setOpenNote] = useState(null)

  const deferred = useDeferredValue(query)

  const results = useMemo(() => {
    const terms = deferred.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const cutoff = when === 'any' ? 0 : Date.now() - Number(when) * DAY

    return notes
      .filter((note) => {
        if (bucketId !== 'any' && note.bucketId !== bucketId) return false
        if (cutoff && note.createdAt < cutoff) return false
        if (audioOnly && !note.audioBlobId) return false
        if (state === 'open' && (note.checked || note.archived)) return false
        if (state === 'done' && !note.checked && !note.archived) return false
        if (!terms.length) return true
        const hay = (note.transcript || '').toLowerCase()
        return terms.every((t) => hay.includes(t))
      })
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 300)
  }, [notes, deferred, bucketId, when, state, audioOnly])

  const filtersOn =
    bucketId !== 'any' || when !== 'any' || state !== 'any' || audioOnly

  const bucketOptions = useMemo(
    () => [...buckets].sort((a, b) => a.order - b.order),
    [buckets]
  )

  return (
    <Screen>
      <ScreenHeader
        title="Search"
        subtitle={
          deferred.trim() || filtersOn ? plural(results.length, 'match', 'matches') : 'Everything you have ever kept'
        }
        right={
          <button
            type="button"
            onClick={() => navigate('record')}
            aria-label="Record a note"
            className="press focus-ring tap flex items-center justify-center rounded-xl border-2 border-stamp text-stamp"
          >
            <Icon name="mic" size={24} strokeWidth={2} />
          </button>
        }
      />

      <div className="shrink-0 border-b border-line bg-bg2 px-3 pt-2 pb-2.5">
        <div className="mx-auto max-w-lg">
          <div className="relative">
            <Icon
              name="search"
              size={22}
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              enterKeyHint="search"
              placeholder="Type a word you remember…"
              aria-label="Search your notes"
              className="focus-ring min-h-14 w-full rounded-xl border border-line bg-surface pr-12 pl-11 text-[1.02rem]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear the search"
                className="press focus-ring absolute top-1/2 right-1 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-xl text-muted"
              >
                <Icon name="close" size={22} />
              </button>
            )}
          </div>

          <div className="no-scrollbar -mx-3 mt-2 flex gap-2 overflow-x-auto px-3">
            <FilterChip
              label={bucketId === 'any' ? 'All buckets' : getBucket(bucketId)?.name || 'Bucket'}
              icon="buckets"
              active={bucketId !== 'any'}
              options={[
                { id: 'any', label: 'All buckets' },
                { id: INBOX, label: 'Inbox' },
                ...bucketOptions.map((b) => ({ id: b.id, label: b.name })),
              ]}
              value={bucketId}
              onChange={setBucketId}
            />
            <FilterChip
              label={WHEN.find((w) => w.id === when).label}
              icon="calendar"
              active={when !== 'any'}
              options={WHEN.map((w) => ({ id: w.id, label: w.label }))}
              value={when}
              onChange={setWhen}
            />
            <FilterChip
              label={STATE.find((s) => s.id === state).label}
              icon="check"
              active={state !== 'any'}
              options={STATE.map((s) => ({ id: s.id, label: s.label }))}
              value={state}
              onChange={setState}
            />
            <button
              type="button"
              onClick={() => setAudioOnly((v) => !v)}
              className={[
                'press focus-ring flex min-h-12 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[0.85rem]',
                audioOnly ? 'border-accent bg-accent text-onaccent' : 'border-line bg-surface text-muted',
              ].join(' ')}
            >
              <Icon name="mic" size={17} />
              Has voice
            </button>
            {filtersOn && (
              <button
                type="button"
                onClick={() => {
                  setBucketId('any')
                  setWhen('any')
                  setState('any')
                  setAudioOnly(false)
                }}
                className="press focus-ring flex min-h-12 shrink-0 items-center gap-1.5 rounded-full border border-line px-3.5 text-[0.85rem] text-muted"
              >
                <Icon name="close" size={16} />
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="scroll-y min-h-0 flex-1">
        <div className="mx-auto max-w-lg px-3 pt-3 pb-8">
          {!results.length ? (
            <EmptyState
              icon="search"
              title={deferred.trim() || filtersOn ? 'Nothing matches' : 'Search everything'}
              message={
                deferred.trim() || filtersOn
                  ? 'Try a shorter word, or clear the filters.'
                  : 'Every note you have ever written or spoken is in here, including finished ones.'
              }
            />
          ) : (
            <ul className="space-y-2">
              {results.map((note) => (
                <li key={note.id}>
                  <ResultRow
                    note={note}
                    bucket={getBucket(note.bucketId)}
                    query={deferred.trim()}
                    onOpen={() => setOpenNote(note)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <NoteSheet
        note={openNote}
        onClose={() => setOpenNote(null)}
        onGoToBucket={(id) => {
          setOpenNote(null)
          navigate(id === INBOX ? 'inbox' : `buckets/${id}`)
        }}
      />
    </Screen>
  )
}

/* ------------------------------------------------------------------------ */

function FilterChip({ label, icon, active, options, value, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          'press focus-ring flex min-h-12 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[0.85rem]',
          active ? 'border-accent bg-accent text-onaccent' : 'border-line bg-surface text-muted',
        ].join(' ')}
      >
        <Icon name={icon} size={17} />
        <span className="max-w-[8rem] truncate">{label}</span>
        <Icon name="chevronDown" size={15} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Narrow it down">
        <ul className="space-y-2 py-1 pb-4">
          {options.map((opt) => (
            <li key={opt.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(opt.id)
                  setOpen(false)
                }}
                className={[
                  'press focus-ring flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 text-left text-[1rem]',
                  opt.id === value ? 'border-accent bg-surface2 text-ink' : 'border-line text-muted',
                ].join(' ')}
              >
                <span className="flex-1 truncate">{opt.label}</span>
                {opt.id === value && <Icon name="check" size={22} className="text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  )
}

function ResultRow({ note, bucket, query, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="press focus-ring paper block w-full rounded-xl px-3 py-2.5 text-left"
    >
      <p
        className={[
          'text-[0.98rem] leading-7 break-words',
          note.archived || note.checked ? 'text-muted' : 'text-ink',
        ].join(' ')}
      >
        <Highlight text={note.transcript || '(voice note with no text)'} query={query} />
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <BucketChip bucket={bucket} />
        <span className="text-[0.72rem] text-faint">{friendlyDate(note.createdAt)}</span>
        {note.audioBlobId && <Icon name="mic" size={13} className="text-faint" />}
        {note.archived && (
          <span className="stamp-label text-[0.62rem] text-faint">archived</span>
        )}
      </div>
    </button>
  )
}

function Highlight({ text, query }) {
  const clipped = text.length > 260 ? `${text.slice(0, 259)}…` : text
  if (!query) return clipped
  const terms = query.split(/\s+/).filter(Boolean).map(escapeRe)
  if (!terms.length) return clipped
  const parts = clipped.split(new RegExp(`(${terms.join('|')})`, 'ig'))
  const lower = terms.map((t) => t.toLowerCase())
  return parts.map((part, i) =>
    lower.includes(part.toLowerCase()) ? (
      <mark key={i} className="rounded bg-accent px-0.5 text-onaccent">
        {part}
      </mark>
    ) : (
      part
    )
  )
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* ------------------------------------------------------------------------ */

function NoteSheet({ note, onClose, onGoToBucket }) {
  const { getBucket } = useStore()
  if (!note) return null
  const bucket = getBucket(note.bucketId)
  return (
    <Sheet open={!!note} onClose={onClose} title={friendlyDate(note.createdAt)}>
      <div className="space-y-3 py-1 pb-4">
        <div className="paper ruled ruled-margin rounded-xl px-4 py-3 pl-10">
          <p className="text-[1.05rem] leading-8 whitespace-pre-wrap text-ink">
            {note.transcript || '(no text — play the recording)'}
          </p>
        </div>
        {note.audioBlobId && <AudioPlayer note={note} />}
        <div>
          <StampLabel className="mb-2 px-1">Filed in</StampLabel>
          <Button
            variant="quiet"
            full
            icon={note.bucketId === INBOX ? 'inbox' : bucket?.icon || 'note'}
            iconRight="chevronRight"
            onClick={() => onGoToBucket(note.bucketId)}
          >
            {note.bucketId === INBOX ? 'Inbox' : bucket?.name || 'Unknown bucket'}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
