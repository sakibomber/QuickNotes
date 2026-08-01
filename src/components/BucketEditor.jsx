/**
 * Add or edit a bucket (spec §6: buckets are user-editable, not hardcoded).
 * Name, type, colour, icon — four choices, each one visible on the screen at
 * full size. No dropdowns, no hidden menus.
 */

import { useEffect, useState } from 'react'
import Sheet, { ConfirmSheet } from './Sheet.jsx'
import Button, { Segmented } from './Button.jsx'
import Icon from './Icon.jsx'
import { BUCKET_ICONS, BUCKET_TYPES, COLOR_LIST, colorHex } from '../lib/model.js'
import { useStore } from '../lib/store.jsx'

export default function BucketEditor({ open, onClose, bucket, onSave, onDelete }) {
  const { settings } = useStore()
  const editing = !!bucket
  const [name, setName] = useState('')
  const [type, setType] = useState('script')
  const [color, setColor] = useState('olive')
  const [icon, setIcon] = useState('note')
  const [clearMode, setClearMode] = useState('archive')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(bucket?.name || '')
    setType(bucket?.type || 'script')
    setColor(bucket?.color || 'olive')
    setIcon(bucket?.icon || 'note')
    setClearMode(bucket?.clearMode || 'archive')
    setConfirmDelete(false)
  }, [open, bucket])

  const hex = colorHex(color, settings.theme)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${bucket.name}` : 'New bucket'}
      full
      footer={
        <div className="space-y-2.5">
          <Button
            variant="primary"
            full
            icon="check"
            disabled={!name.trim()}
            onClick={() => {
              onSave({ name: name.trim(), type, color, icon, clearMode })
              onClose?.()
            }}
          >
            {editing ? 'Save changes' : 'Create bucket'}
          </Button>
          {editing && bucket.deletable && (
            <Button variant="quiet" full icon="trash" onClick={() => setConfirmDelete(true)}>
              Delete this bucket
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5 pt-1 pb-4">
        {/* preview */}
        <div className="flex items-center gap-3 rounded-2xl border-2 bg-surface px-4 py-3" style={{ borderColor: hex }}>
          <span style={{ color: hex }}>
            <Icon name={icon} size={30} strokeWidth={1.9} />
          </span>
          <span className="stamp-label truncate text-[1rem] text-ink">{name || 'Name it'}</span>
        </div>

        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={22}
            placeholder="Doc, Wife, Truck…"
            className="focus-ring min-h-14 w-full rounded-xl border border-line bg-surface px-4 text-[1.05rem]"
            aria-label="Bucket name"
          />
        </Field>

        <Field label="How it reads" hint={BUCKET_TYPES[type].blurb}>
          <Segmented
            value={type}
            onChange={setType}
            options={[
              { value: 'script', label: 'Script', icon: 'book' },
              { value: 'checklist', label: 'Checklist', icon: 'check' },
            ]}
          />
        </Field>

        <Field label="Colour">
          <div className="grid grid-cols-5 gap-2">
            {COLOR_LIST.map((c) => {
              const swatch = colorHex(c.id, settings.theme)
              const active = c.id === color
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c.id)}
                  aria-label={c.label}
                  aria-pressed={active}
                  className="press focus-ring flex min-h-14 items-center justify-center rounded-xl border-2"
                  style={{
                    borderColor: active ? 'var(--c-ink, currentColor)' : swatch,
                    background: active ? swatch : `${swatch}2e`,
                  }}
                >
                  {active && (
                    <Icon name="check" size={22} strokeWidth={3} style={{ color: 'var(--c-bg)' }} />
                  )}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="Icon">
          <div className="grid grid-cols-6 gap-2">
            {BUCKET_ICONS.map((name_) => {
              const active = name_ === icon
              return (
                <button
                  key={name_}
                  type="button"
                  onClick={() => setIcon(name_)}
                  aria-label={name_}
                  aria-pressed={active}
                  className={[
                    'press focus-ring flex min-h-14 items-center justify-center rounded-xl border-2',
                    active ? 'bg-surface2' : 'border-line text-muted',
                  ].join(' ')}
                  style={active ? { borderColor: hex, color: hex } : undefined}
                >
                  <Icon name={name_} size={24} />
                </button>
              )
            })}
          </div>
        </Field>

        <Field
          label="When you clear finished items"
          hint={
            clearMode === 'archive'
              ? 'Kept in history so you can search for them later.'
              : 'Removed for good. Good for shopping lists.'
          }
        >
          <Segmented
            value={clearMode}
            onChange={setClearMode}
            options={[
              { value: 'archive', label: 'Keep history', icon: 'archive' },
              { value: 'delete', label: 'Delete them', icon: 'trash' },
            ]}
          />
        </Field>
      </div>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${bucket?.name}?`}
        message="The bucket goes away. Any notes inside it go back to your inbox so you can file them somewhere else — nothing is lost."
        confirmLabel="Delete the bucket"
        cancelLabel="No, keep it"
        tone="danger"
        onConfirm={() => {
          onDelete?.()
          onClose?.()
        }}
      />
    </Sheet>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <div className="stamp-label mb-2 text-[0.7rem] text-faint">{label}</div>
      {children}
      {hint && <p className="mt-2 text-[0.8rem] leading-snug text-muted">{hint}</p>}
    </div>
  )
}
