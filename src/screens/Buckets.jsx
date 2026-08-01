/**
 * BUCKETS — the grid of everything you file into (spec §6).
 * Colour + icon carry recognition; the count tells you what needs attention.
 * "Arrange" turns the grid into a reorder/edit list — up/down buttons rather
 * than drag, because drag-and-drop is unkind to a tremor.
 */

import { useMemo, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useRouter } from '../lib/router.jsx'
import { TRASH, colorHex } from '../lib/model.js'
import { plural } from '../lib/format.js'
import Icon from '../components/Icon.jsx'
import Button, { IconButton } from '../components/Button.jsx'
import { Screen, ScreenHeader, ScreenBody } from '../components/Screen.jsx'
import BucketTile from '../components/BucketTile.jsx'
import BucketEditor from '../components/BucketEditor.jsx'
import { StampLabel } from '../components/Stamp.jsx'

export default function Buckets() {
  const { buckets, bucketCounts, settings, addBucket, updateBucket, deleteBucket, moveBucket, showToast } =
    useStore()
  const { navigate } = useRouter()
  const [arranging, setArranging] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const list = useMemo(
    () => buckets.filter((b) => b.id !== TRASH).sort((a, b) => a.order - b.order),
    [buckets]
  )
  const trashCount = bucketCounts[TRASH] || 0

  const openNew = () => {
    setEditing(null)
    setEditorOpen(true)
  }

  const header = (
    <ScreenHeader
      title="Buckets"
      subtitle={arranging ? 'Reorder, rename or add' : `${list.length} places to file things`}
      right={
        <>
          <IconButton
            icon={arranging ? 'check' : 'pencil'}
            label={arranging ? 'Done arranging' : 'Arrange buckets'}
            variant={arranging ? 'primary' : 'ghost'}
            onClick={() => setArranging((v) => !v)}
          />
          {!arranging && (
            <button
              type="button"
              onClick={() => navigate('record')}
              aria-label="Record a note"
              className="press focus-ring tap flex items-center justify-center rounded-xl border-2 border-stamp text-stamp"
            >
              <Icon name="mic" size={24} strokeWidth={2} />
            </button>
          )}
        </>
      }
    />
  )

  return (
    <Screen>
      {header}
      <ScreenBody>
        {arranging ? (
          <ul className="space-y-2">
            {list.map((bucket, index) => (
              <li key={bucket.id}>
                <ArrangeRow
                  bucket={bucket}
                  theme={settings.theme}
                  count={bucketCounts[bucket.id] || 0}
                  isFirst={index === 0}
                  isLast={index === list.length - 1}
                  onUp={() => moveBucket(bucket.id, 'up')}
                  onDown={() => moveBucket(bucket.id, 'down')}
                  onEdit={() => {
                    setEditing(bucket)
                    setEditorOpen(true)
                  }}
                />
              </li>
            ))}
            <li className="pt-2">
              <Button variant="primary" full icon="plus" onClick={openNew}>
                New bucket
              </Button>
            </li>
          </ul>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              {list.map((bucket) => (
                <BucketTile
                  key={bucket.id}
                  bucket={bucket}
                  size="lg"
                  count={bucketCounts[bucket.id] || 0}
                  onClick={() => navigate(`buckets/${bucket.id}`)}
                />
              ))}
              <button
                type="button"
                onClick={openNew}
                className="press focus-ring flex min-h-[6.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line text-muted"
              >
                <Icon name="plus" size={28} />
                <span className="stamp-label text-[0.72rem]">New</span>
              </button>
            </div>

            <div className="mt-6">
              <StampLabel className="mb-2 px-1">Also</StampLabel>
              <button
                type="button"
                onClick={() => navigate(`buckets/${TRASH}`)}
                className="press focus-ring paper flex min-h-14 w-full items-center gap-3 rounded-xl px-4"
              >
                <Icon name="trash" size={22} className="shrink-0 text-muted" />
                <span className="flex-1 text-left text-[0.95rem]">Trash</span>
                <span className="text-[0.85rem] text-muted">
                  {trashCount ? plural(trashCount, 'note') : 'empty'}
                </span>
                <Icon name="chevronRight" size={20} className="shrink-0 text-faint" />
              </button>
            </div>
          </>
        )}
      </ScreenBody>

      <BucketEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        bucket={editing}
        onSave={async (data) => {
          if (editing) {
            await updateBucket(editing.id, data)
            showToast(`Saved ${data.name}`, { ms: 1500 })
          } else {
            await addBucket(data)
            showToast(`Added ${data.name}`, { tone: 'good', ms: 1800 })
          }
        }}
        onDelete={
          editing
            ? async () => {
                const moved = await deleteBucket(editing.id)
                showToast(
                  moved
                    ? `Deleted. ${plural(moved, 'note')} sent back to your inbox.`
                    : 'Bucket deleted',
                  { ms: 3200 }
                )
              }
            : undefined
        }
      />
    </Screen>
  )
}

function ArrangeRow({ bucket, theme, count, isFirst, isLast, onUp, onDown, onEdit }) {
  const hex = colorHex(bucket.color, theme)
  return (
    <div className="paper flex items-center gap-1.5 rounded-xl px-2 py-2">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center" style={{ color: hex }}>
        <Icon name={bucket.icon} size={24} strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.98rem] text-ink">{bucket.name}</span>
        <span className="block text-[0.74rem] text-muted">
          {bucket.type === 'checklist' ? 'Checklist' : 'Script'}
          {count ? ` · ${count}` : ''}
        </span>
      </span>
      <IconButton icon="arrowUp" label={`Move ${bucket.name} up`} onClick={onUp} disabled={isFirst} variant="quiet" size={20} />
      <IconButton icon="arrowDown" label={`Move ${bucket.name} down`} onClick={onDown} disabled={isLast} variant="quiet" size={20} />
      <IconButton icon="pencil" label={`Edit ${bucket.name}`} onClick={onEdit} variant="quiet" size={20} />
    </div>
  )
}
