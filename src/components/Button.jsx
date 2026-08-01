/**
 * Buttons. Every one of these clears the 56px minimum target from spec §12 —
 * fat-finger and tremor tolerant is the baseline, not the accessible variant.
 */

import Icon from './Icon.jsx'

const VARIANTS = {
  primary:
    'bg-accent text-onaccent border-transparent shadow-[0_2px_0_var(--c-shadow)] font-semibold',
  danger: 'bg-danger text-ondanger border-transparent shadow-[0_2px_0_var(--c-shadow)] font-semibold',
  solid: 'bg-surface2 text-ink border-line',
  quiet: 'bg-transparent text-ink border-line',
  ghost: 'bg-transparent text-muted border-transparent',
}

export default function Button({
  children,
  icon,
  iconRight,
  variant = 'solid',
  full = false,
  size = 'lg',
  className = '',
  ...rest
}) {
  const height = size === 'lg' ? 'min-h-14' : 'min-h-12'
  const pad = size === 'lg' ? 'px-5' : 'px-4'
  return (
    <button
      type="button"
      className={[
        'press focus-ring inline-flex items-center justify-center gap-2.5 rounded-xl border',
        'text-[0.95rem] leading-tight tracking-wide disabled:opacity-40 disabled:pointer-events-none',
        height,
        pad,
        VARIANTS[variant] || VARIANTS.solid,
        full ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {icon && <Icon name={icon} size={22} />}
      {children && <span className="truncate">{children}</span>}
      {iconRight && <Icon name={iconRight} size={22} />}
    </button>
  )
}

export function IconButton({ icon, label, variant = 'ghost', size = 24, className = '', ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={[
        'press focus-ring tap inline-flex items-center justify-center rounded-xl border',
        VARIANTS[variant] || VARIANTS.ghost,
        className,
      ].join(' ')}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  )
}

/**
 * A labelled segmented control. Used for every either/or setting so there is
 * never a hidden state — you can see all the options and which one is on.
 */
export function Segmented({ value, onChange, options, className = '' }) {
  return (
    <div
      className={['grid gap-2', className].join(' ')}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="radiogroup"
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={[
              'press focus-ring tap flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center',
              active
                ? 'border-accent bg-accent text-onaccent font-semibold'
                : 'border-line bg-surface2 text-muted',
            ].join(' ')}
          >
            {opt.icon && <Icon name={opt.icon} size={20} />}
            <span className="text-[0.8rem] leading-tight">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Big on/off row. The whole row is the target. */
export function ToggleRow({ icon, label, hint, checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="press focus-ring flex w-full items-center gap-3 rounded-xl border border-line bg-surface2 px-4 py-3 text-left min-h-14"
    >
      {icon && <Icon name={icon} size={22} className="shrink-0 text-muted" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.95rem]">{label}</span>
        {hint && <span className="block text-[0.78rem] leading-snug text-muted">{hint}</span>}
      </span>
      <span
        className={[
          'relative h-8 w-14 shrink-0 rounded-full border transition-colors',
          checked ? 'border-accent bg-accent' : 'border-line bg-bg2',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full transition-all',
            checked ? 'left-[calc(100%-1.65rem)] bg-onaccent' : 'left-1 bg-faint',
          ].join(' ')}
        />
      </span>
    </button>
  )
}
