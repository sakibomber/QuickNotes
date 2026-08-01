/**
 * Screen chrome. The header is fixed, the body scrolls, the nav never moves.
 */

import Icon from './Icon.jsx'

export function Screen({ children, className = '' }) {
  return <div className={['flex min-h-0 flex-1 flex-col', className].join(' ')}>{children}</div>
}

export function ScreenHeader({ title, subtitle, onBack, backLabel = 'Back', right, accent }) {
  return (
    <header className="safe-t z-20 shrink-0 border-b border-line bg-bg2">
      <div className="mx-auto flex max-w-lg items-center gap-2 px-2 py-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="press focus-ring tap -ml-1 flex shrink-0 items-center justify-center rounded-xl text-muted"
          >
            <Icon name="chevronLeft" size={28} />
          </button>
        )}
        <div className={['min-w-0 flex-1', onBack ? '' : 'pl-2'].join(' ')}>
          <h1
            className="stamp-label truncate text-[1.05rem] leading-tight"
            style={accent ? { color: accent } : undefined}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-[0.78rem] leading-tight text-muted">{subtitle}</p>
          )}
        </div>
        {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
      </div>
    </header>
  )
}

export function ScreenBody({ children, className = '', pad = true }) {
  return (
    <div className={['scroll-y min-h-0 flex-1', className].join(' ')}>
      <div className={['mx-auto max-w-lg', pad ? 'px-3 pt-3 pb-8' : ''].join(' ')}>{children}</div>
    </div>
  )
}

/** Empty states carry the tone of the app — plain words, never a dead end. */
export function EmptyState({ icon = 'inbox', title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 rounded-2xl border-2 border-dashed border-line p-5 text-faint">
        <Icon name={icon} size={40} strokeWidth={1.5} />
      </div>
      <h2 className="stamp-label text-[0.95rem] text-ink">{title}</h2>
      {message && (
        <p className="mt-2 max-w-xs text-[0.92rem] leading-relaxed text-muted">{message}</p>
      )}
      {action && <div className="mt-6 w-full max-w-xs">{action}</div>}
    </div>
  )
}
