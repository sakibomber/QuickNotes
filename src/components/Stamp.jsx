/**
 * The filing stamp. A note doesn't just disappear when it's filed — it gets
 * stamped, the way paper does. It is the reward for triaging, and the reason
 * clearing an inbox feels like something.
 */

export default function Stamp({ text, tone = 'accent', sub, style }) {
  const color =
    tone === 'danger' ? 'var(--c-stamp)' : tone === 'muted' ? 'var(--c-muted)' : 'var(--c-accent)'
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      {/* `style` threads --stamp-ms in from ui/constants so the keyframes and
          the gesture guard cannot drift apart. */}
      <div className="animate-stamp flex flex-col items-center" style={{ color, ...style }}>
        <div className="stamp-mark text-[clamp(1.6rem,9vw,2.6rem)]">{text}</div>
        {sub && (
          <div className="stamp-label mt-2 text-[0.8rem] opacity-80">{sub}</div>
        )}
      </div>
    </div>
  )
}

/** The small stamped caption used as a section label throughout the app. */
export function StampLabel({ children, className = '' }) {
  return (
    <div className={['stamp-label text-[0.72rem] text-faint', className].join(' ')}>{children}</div>
  )
}
