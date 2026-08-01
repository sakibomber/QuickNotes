/**
 * Spec §8: filing a dictated line into a working list offers to break it into
 * separate items. "Milk, bread and eggs" becomes three things you can cross
 * off. Confirmed, never automatic — the split is a guess and guesses get shown.
 */

import { useEffect, useState } from 'react'
import Sheet from './Sheet.jsx'
import Button from './Button.jsx'
import Icon from './Icon.jsx'

export default function SplitSheet({ open, onClose, bucket, items: initial, onConfirm, onKeepWhole }) {
  const [items, setItems] = useState(initial || [])

  useEffect(() => {
    if (open) setItems(initial || [])
  }, [open, initial])

  const update = (index, value) =>
    setItems((cur) => cur.map((item, i) => (i === index ? value : item)))
  const remove = (index) => setItems((cur) => cur.filter((_, i) => i !== index))

  const kept = items.map((s) => s.trim()).filter(Boolean)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Split into ${bucket?.name || 'list'}?`}
      subtitle="Each line becomes its own item you can cross off."
      full
      footer={
        <div className="space-y-2.5">
          <Button
            variant="primary"
            full
            icon="check"
            disabled={!kept.length}
            onClick={() => {
              onConfirm(kept)
              onClose?.()
            }}
          >
            {kept.length === 1 ? 'Add 1 item' : `Add ${kept.length} items`}
          </Button>
          <Button
            variant="quiet"
            full
            onClick={() => {
              onKeepWhole()
              onClose?.()
            }}
          >
            Keep it as one note
          </Button>
        </div>
      }
    >
      <ul className="space-y-2 pt-1 pb-3">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-2">
            <span className="stamp-label w-6 shrink-0 text-center text-[0.72rem] text-faint">
              {index + 1}
            </span>
            <input
              value={item}
              onChange={(e) => update(index, e.target.value)}
              className="min-h-14 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[1rem] focus-ring"
              aria-label={`Item ${index + 1}`}
            />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remove item ${index + 1}`}
              className="press focus-ring tap flex shrink-0 items-center justify-center rounded-xl border border-line text-muted"
            >
              <Icon name="close" size={22} />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
