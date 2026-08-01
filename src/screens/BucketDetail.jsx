/**
 * One bucket, open (spec §6).
 *
 *   script    — read straight down while you're on the phone to the doctor.
 *               Checking an item marks it covered but leaves it where it is,
 *               so you never lose your place mid-call.
 *   checklist — a working list. Crossed-off items sink to the bottom and
 *               "Clear finished" takes them away (archived, or deleted if the
 *               bucket is set that way).
 *
 * Also: copy as text, share/email, add items by typing with autocomplete
 * learned from what you've filed here before (spec §8, §9).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useRouter } from '../lib/router.jsx'
import { TRASH, INBOX, colorHex } from '../lib/model.js'
import { bucketAsText, copyText, shareText } from '../lib/text.js'
import { friendlyDate, plural } from '../lib/format.js'
import Icon from '../components/Icon.jsx'
import Button, { IconButton } from '../components/Button.jsx'
import { Screen, ScreenHeader, EmptyState } from '../components/Screen.jsx'
import Sheet, { ConfirmSheet } from '../components/Sheet.jsx'
import BucketEditor from '../components/BucketEditor.jsx'
import AudioPlayer from '../components/AudioPlayer.jsx'
import { StampLabel } from '../components/Stamp.jsx'

export default function BucketDetail({ bucketId }) {
  const {
    buckets,
    notesByBucket,
    settings,
    toggleChecked,
    patchNote,
    clearCompleted,
    addTypedNote,
    learnTerms,
    suggestTerms,
    updateBucket,
    deleteBucket,
    deleteNoteForever,
    emptyTrash,
    showToast,
  } = useStore()
  const { navigate } = useRouter()

  const bucket = buckets.find((b) => b.id === bucketId)
  const rows = notesByBucket[bucketId] || []

  const [editList, setEditList] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const active = useMemo(() => rows.filter((n) => !n.archived), [rows])
  const archived = useMemo(() => rows.filter((n) => n.archived), [rows])

  const ordered = useMemo(() => {
    if (bucket?.type === 'checklist') {
      // Crossed-off items sink to the bottom.
      return [...active].sort((a, b) => Number(a.checked) - Number(b.checked) || a.createdAt - b.createdAt)
    }
    return active
  }, [active, bucket?.type])

  const doneCount = active.filter((n) => n.checked).length
  const hex = bucket ? colorHex(bucket.color, settings.theme) : undefined
  const isTrash = bucketId === TRASH

  if (!bucket) {
    return (
      <Screen>
        <ScreenHeader title="Not found" onBack={() => navigate('buckets')} />
        <EmptyState
          icon="warning"
          title="That bucket is gone"
          message="It may have been deleted. Any notes inside went back to your inbox."
          action={
            <Button variant="primary" full onClick={() => navigate('buckets')}>
              Back to buckets
            </Button>
          }
        />
      </Screen>
    )
  }

  return (
    <Screen>
      <ScreenHeader
        title={bucket.name}
        accent={hex}
        subtitle={
          isTrash
            ? plural(active.length, 'note')
            : `${bucket.type === 'checklist' ? 'Checklist' : 'Script'} · ${plural(active.length, 'item')}`
        }
        onBack={() => navigate('buckets')}
        backLabel="Back to buckets"
        right={
          isTrash ? null : (
            <>
              <IconButton
                icon={editList ? 'check' : 'pencil'}
                label={editList ? 'Done editing the list' : 'Edit the list'}
                variant={editList ? 'primary' : 'ghost'}
                onClick={() => {
                  setEditList((v) => !v)
                  setEditingId(null)
                }}
              />
              <IconButton icon="share" label="Copy or send this list" onClick={() => setShareOpen(true)} />
            </>
          )
        }
      />

      <div className="scroll-y min-h-0 flex-1">
        <div className="mx-auto max-w-lg px-3 pt-3 pb-8">
          {isTrash ? (
            <TrashList
              rows={active}
              onRestore={async (note) => {
                await patchNote(note.id, {
                  bucketId: INBOX,
                  filedAt: undefined,
                  archived: false,
                  checked: false,
                })
                showToast('Back in your inbox', { ms: 1600 })
              }}
              onDelete={(note) => deleteNoteForever(note.id)}
            />
          ) : (
            <>
              {!ordered.length && (
                <EmptyState
                  icon={bucket.icon}
                  title={`${bucket.name} is empty`}
                  message={
                    bucket.type === 'checklist'
                      ? 'Add something below, or record a note and file it here.'
                      : 'File notes here from your inbox, or add a line below.'
                  }
                />
              )}

              <ul className="space-y-2">
                {ordered.map((note) => (
                  <li key={note.id}>
                    <ItemRow
                      note={note}
                      hex={hex}
                      type={bucket.type}
                      editMode={editList}
                      isEditing={editingId === note.id}
                      onToggle={() => toggleChecked(note.id)}
                      onStartEdit={() => setEditingId(note.id)}
                      onSaveEdit={async (text) => {
                        await patchNote(note.id, { transcript: text })
                        setEditingId(null)
                      }}
                      onCancelEdit={() => setEditingId(null)}
                      onArchive={() => patchNote(note.id, { archived: true, checked: true })}
                      onDelete={() => deleteNoteForever(note.id)}
                    />
                  </li>
                ))}
              </ul>

              {archived.length > 0 && (
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setShowArchived((v) => !v)}
                    className="press focus-ring flex min-h-14 w-full items-center gap-2 rounded-xl border border-line px-4 text-[0.9rem] text-muted"
                  >
                    <Icon name="archive" size={20} />
                    <span className="flex-1 text-left">
                      {showArchived ? 'Hide' : 'Show'} history ({archived.length})
                    </span>
                    <Icon name={showArchived ? 'arrowUp' : 'chevronDown'} size={20} />
                  </button>

                  {showArchived && (
                    <ul className="mt-2 space-y-2">
                      {archived
                        .slice()
                        .reverse()
                        .map((note) => (
                          <li key={note.id}>
                            <div className="paper flex items-start gap-3 rounded-xl px-3 py-2.5 opacity-70">
                              <Icon name="check" size={18} className="mt-1 shrink-0 text-faint" />
                              <div className="min-w-0 flex-1">
                                <p className="line-through-soft text-[0.95rem] leading-snug break-words text-muted">
                                  {note.transcript || '(no text)'}
                                </p>
                                <p className="mt-1 text-[0.72rem] text-faint">
                                  {friendlyDate(note.filedAt || note.createdAt)}
                                </p>
                              </div>
                              <IconButton
                                icon="undo"
                                label="Put this back on the list"
                                variant="quiet"
                                size={18}
                                onClick={() => patchNote(note.id, { archived: false, checked: false })}
                              />
                            </div>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* footer actions */}
      <div className="shrink-0 border-t border-line bg-bg2">
        <div className="mx-auto max-w-lg space-y-2 px-3 py-2.5">
          {isTrash ? (
            <Button
              variant="quiet"
              full
              icon="trash"
              disabled={!active.length}
              onClick={() => setConfirmEmpty(true)}
              className="text-danger"
            >
              Empty the trash
            </Button>
          ) : (
            <>
              <AddItemBar
                bucket={bucket}
                onAdd={async (text) => {
                  await addTypedNote(text, bucket.id)
                  if (bucket.type === 'checklist') await learnTerms(bucket.id, [text])
                }}
                suggest={(prefix) => suggestTerms(bucket.id, prefix)}
              />
              {doneCount > 0 && (
                <Button
                  variant="quiet"
                  full
                  icon={bucket.clearMode === 'delete' ? 'trash' : 'archive'}
                  onClick={() => clearCompleted(bucket.id)}
                >
                  {bucket.clearMode === 'delete' ? 'Delete' : 'Clear'} {doneCount} finished
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        bucket={bucket}
        rows={rows}
        onDone={(message) => showToast(message, { tone: 'good', ms: 2200 })}
        onEditBucket={() => {
          setShareOpen(false)
          setEditorOpen(true)
        }}
      />

      <BucketEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        bucket={bucket}
        onSave={(data) => updateBucket(bucket.id, data)}
        onDelete={async () => {
          const moved = await deleteBucket(bucket.id)
          navigate('buckets')
          showToast(
            moved ? `Deleted. ${plural(moved, 'note')} sent back to your inbox.` : 'Bucket deleted',
            { ms: 3200 }
          )
        }}
      />

      <ConfirmSheet
        open={confirmEmpty}
        onClose={() => setConfirmEmpty(false)}
        title="Empty the trash?"
        message={`${plural(active.length, 'note')} will be gone for good. This cannot be undone.`}
        confirmLabel="Yes, empty it"
        cancelLabel="No, keep them"
        tone="danger"
        onConfirm={async () => {
          const n = await emptyTrash()
          showToast(`${plural(n, 'note')} deleted`, { ms: 2000 })
        }}
      />
    </Screen>
  )
}

/* ------------------------------------------------------------------------ */

function ItemRow({
  note,
  hex,
  type,
  editMode,
  isEditing,
  onToggle,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onArchive,
  onDelete,
}) {
  const [draft, setDraft] = useState(note.transcript || '')
  const inputRef = useRef(null)

  useEffect(() => {
    if (isEditing) {
      setDraft(note.transcript || '')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isEditing, note.transcript])

  if (isEditing) {
    return (
      <div className="paper rounded-xl p-2">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="focus-ring w-full resize-none rounded-lg border border-line bg-bg px-3 py-2 text-[1rem] leading-7"
          aria-label="Edit this item"
        />
        <div className="mt-2 flex gap-2">
          <Button variant="primary" icon="check" className="flex-1" onClick={() => onSaveEdit(draft.trim())}>
            Save
          </Button>
          <Button variant="quiet" className="flex-1" onClick={onCancelEdit}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="paper overflow-hidden rounded-xl">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={note.checked}
          className="press focus-ring flex min-h-[3.5rem] flex-1 items-start gap-3 px-3 py-3 text-left"
        >
          <span
            className={[
              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 transition-colors',
              note.checked ? 'text-onaccent' : 'text-transparent',
            ].join(' ')}
            style={{
              borderColor: hex,
              background: note.checked ? hex : 'transparent',
            }}
          >
            <Icon name="check" size={20} strokeWidth={3.2} />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={[
                'block text-[1.05rem] leading-7 break-words',
                note.checked
                  ? type === 'script'
                    ? 'line-through-soft text-muted'
                    : 'line-through-soft text-faint'
                  : 'text-ink',
              ].join(' ')}
            >
              {note.transcript || '(no text)'}
            </span>
            {note.audioBlobId && (
              <span className="mt-1 inline-flex items-center gap-1 text-[0.72rem] text-faint">
                <Icon name="mic" size={12} /> recording kept
              </span>
            )}
          </span>
        </button>

        {editMode && (
          <div className="flex shrink-0 items-center gap-1 border-l border-linesoft px-1.5">
            <IconButton icon="pencil" label="Edit this item" variant="ghost" size={19} onClick={onStartEdit} />
            <IconButton icon="archive" label="Move to history" variant="ghost" size={19} onClick={onArchive} />
            <IconButton
              icon="trash"
              label="Delete this item"
              variant="ghost"
              size={19}
              onClick={onDelete}
              className="text-danger"
            />
          </div>
        )}
      </div>

      {note.audioBlobId && editMode && (
        <div className="border-t border-linesoft px-2 py-2">
          <AudioPlayer note={note} compact />
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------------ */

/**
 * Type an item. On a checklist the words you've used before come back as big
 * chips — "mi" offers "Milk" (spec §8). The dictionary is built entirely from
 * what has been filed here; nothing leaves the phone.
 */
function AddItemBar({ bucket, onAdd, suggest }) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)

  const suggestions = useMemo(
    () => (bucket.type === 'checklist' && value.trim() ? suggest(value.trim()) : []),
    [bucket.type, value, suggest]
  )

  const submit = async (text) => {
    const clean = (text ?? value).trim()
    if (!clean) return
    await onAdd(clean)
    setValue('')
    inputRef.current?.focus()
  }

  return (
    <div>
      {focused && suggestions.length > 0 && (
        <div className="no-scrollbar -mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              // onMouseDown so the chip fires before the input blurs.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => submit(s)}
              className="press focus-ring min-h-12 shrink-0 rounded-full border border-accent bg-surface px-4 text-[0.92rem] text-accent"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder={bucket.type === 'checklist' ? 'Add an item…' : 'Add a line…'}
          enterKeyHint="done"
          autoComplete="off"
          aria-label={`Add to ${bucket.name}`}
          className="focus-ring min-h-14 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 text-[1rem]"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          aria-label="Add"
          className="press focus-ring tap flex shrink-0 items-center justify-center rounded-xl bg-accent px-5 text-onaccent disabled:opacity-35"
        >
          <Icon name="plus" size={26} strokeWidth={2.4} />
        </button>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------------ */

function ShareSheet({ open, onClose, bucket, rows, onDone, onEditBucket }) {
  const [includeArchived, setIncludeArchived] = useState(false)

  const build = () => bucketAsText(bucket, rows, { includeArchived })

  return (
    <Sheet open={open} onClose={onClose} title={`${bucket.name} — copy or send`}>
      <div className="space-y-2.5 py-1 pb-4">
        <button
          type="button"
          onClick={() => setIncludeArchived((v) => !v)}
          className="press focus-ring flex min-h-14 w-full items-center gap-3 rounded-xl border border-line bg-surface2 px-4 text-left"
        >
          <span
            className={[
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 border-accent',
              includeArchived ? 'bg-accent text-onaccent' : 'text-transparent',
            ].join(' ')}
          >
            <Icon name="check" size={18} strokeWidth={3.2} />
          </span>
          <span className="flex-1 text-[0.95rem]">Include finished items</span>
        </button>

        <Button
          variant="primary"
          full
          icon="copy"
          onClick={async () => {
            const ok = await copyText(build())
            onDone(ok ? 'Copied as text' : 'Could not copy')
            onClose()
          }}
        >
          Copy as text
        </Button>

        <Button
          variant="solid"
          full
          icon="mail"
          onClick={async () => {
            const result = await shareText({ title: `Quick Notes — ${bucket.name}`, text: build() })
            if (result !== 'cancelled') {
              onDone(result === 'copied' ? 'Copied instead — paste it anywhere' : 'Sent to your share sheet')
            }
            onClose()
          }}
        >
          Email or send it
        </Button>

        <div className="pt-2">
          <StampLabel className="mb-2 px-1">This bucket</StampLabel>
          <Button variant="quiet" full icon="settings" onClick={onEditBucket}>
            Rename, recolour, change type
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------------------ */

function TrashList({ rows, onRestore, onDelete }) {
  if (!rows.length) {
    return <EmptyState icon="trash" title="Trash is empty" message="Nothing has been thrown away." />
  }
  return (
    <ul className="space-y-2">
      {rows
        .slice()
        .reverse()
        .map((note) => (
          <li key={note.id} className="paper rounded-xl px-3 py-2.5">
            <p className="text-[0.98rem] leading-7 break-words text-muted">
              {note.transcript || '(no text)'}
            </p>
            <p className="mt-1 text-[0.72rem] text-faint">{friendlyDate(note.createdAt)}</p>
            {note.audioBlobId && (
              <div className="mt-2">
                <AudioPlayer note={note} compact />
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <Button variant="quiet" icon="undo" className="flex-1" onClick={() => onRestore(note)}>
                Put back
              </Button>
              <Button
                variant="quiet"
                icon="trash"
                className="flex-1 text-danger"
                onClick={() => onDelete(note)}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
    </ul>
  )
}
