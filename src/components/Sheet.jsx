/**
 * Bottom sheets and confirmations.
 * Rule from spec §12: one decision per screen. A sheet asks exactly one
 * question and both answers are full-size buttons — never a tiny "cancel".
 */

import { useEffect, useRef } from 'react'
import Icon from './Icon.jsx'
import Button from './Button.jsx'

export default function Sheet({ open, onClose, title, subtitle, children, full = false, footer }) {
  /**
   * Android's back button should close the sheet, not leave the screen.
   *
   * This effect MUST depend on `open` alone. Callers routinely pass an inline
   * arrow as `onClose`, which is a new identity on every render — and the
   * recording screen re-renders five times a second from its timer. With
   * `onClose` in the deps, cleanup ran on every tick: history.back() fired
   * popstate, popstate called onClose, and the sheet slammed shut a moment
   * after opening. On the device that looked like "something pops up and
   * instantly disappears"; in tests nothing re-rendered fast enough to show it.
   *
   * The ref keeps the newest callback without making the effect re-run.
   */
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    let closedByBack = false
    window.history.pushState({ qnSheet: true }, '')
    const onPop = () => {
      closedByBack = true
      closeRef.current?.()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Only unwind our own entry, and never when the back button already did.
      if (!closedByBack && window.history.state?.qnSheet) window.history.back()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 animate-fade"
        style={{ background: 'var(--c-scrim)' }}
      />
      <div
        className={[
          'animate-sheet relative flex min-h-0 flex-col rounded-t-2xl border-t border-x border-line bg-bg shadow-[0_-8px_24px_var(--c-shadow)]',
          full ? 'h-[92dvh]' : 'max-h-[88dvh]',
        ].join(' ')}
      >
        <div className="flex items-start gap-3 px-4 pt-3 pb-2">
          <div className="min-w-0 flex-1 pt-1">
            {title && (
              <h2 className="stamp-label text-[0.95rem] text-ink">{title}</h2>
            )}
            {subtitle && <p className="mt-1 text-[0.85rem] leading-snug text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press focus-ring tap -mt-1 -mr-2 flex items-center justify-center rounded-xl text-muted"
          >
            <Icon name="close" size={26} />
          </button>
        </div>
        <div className="scroll-y min-h-0 flex-1 px-4 pb-2">{children}</div>
        {footer && (
          <div className="safe-b border-t border-line bg-bg2 px-4 pt-3 pb-3">{footer}</div>
        )}
        {!footer && <div className="safe-b" />}
      </div>
    </div>
  )
}

/** One question, two big answers. */
export function ConfirmSheet({
  open,
  onClose,
  title,
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'No, go back',
  tone = 'primary',
  onConfirm,
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="pb-4 pt-1 text-[1.02rem] leading-relaxed text-ink">{message}</p>
      <div className="flex flex-col gap-3 pb-3">
        <Button
          variant={tone}
          full
          onClick={() => {
            onConfirm?.()
            onClose?.()
          }}
        >
          {confirmLabel}
        </Button>
        <Button variant="quiet" full onClick={onClose}>
          {cancelLabel}
        </Button>
      </div>
    </Sheet>
  )
}
