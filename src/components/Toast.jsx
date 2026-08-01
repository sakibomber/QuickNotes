/**
 * Toast. Save is instant and a toast confirms it — there is never a "Saving…"
 * screen between stopping a recording and pocketing the phone (spec §3).
 * When an action can be undone, the undo lives here at full size.
 */

import { useStore } from '../lib/store.jsx'
import Icon from './Icon.jsx'

const TONES = {
  good: 'border-accent text-ink',
  danger: 'border-danger text-ink',
  plain: 'border-line text-ink',
}

export default function Toast() {
  const { toast, dismissToast } = useStore()
  if (!toast) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]"
      role="status"
      aria-live="polite"
    >
      <div
        className={[
          'animate-rise pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border-2 bg-surface px-4 py-2.5 shadow-[0_6px_20px_var(--c-shadow)]',
          TONES[toast.tone] || TONES.plain,
        ].join(' ')}
      >
        {toast.tone === 'danger' && <Icon name="trash" size={20} className="shrink-0 text-danger" />}
        {toast.tone === 'good' && <Icon name="check" size={20} className="shrink-0 text-accent" />}
        <span className="min-w-0 flex-1 truncate text-[0.95rem]">{toast.message}</span>
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.onAction?.()
              dismissToast()
            }}
            className="press focus-ring -my-1 shrink-0 rounded-lg border border-line bg-surface2 px-4 py-2.5 text-[0.9rem] font-semibold"
          >
            {toast.action}
          </button>
        )}
      </div>
    </div>
  )
}
