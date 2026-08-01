/**
 * A bucket as a big, colour-coded, icon-led target.
 * Colour + icon exist for recognition speed across a 9-target grid (spec §3) —
 * you should be able to hit "Doc" without reading the word.
 */

import { colorHex } from '../lib/model.js'
import { useStore } from '../lib/store.jsx'
import Icon from './Icon.jsx'

export default function BucketTile({ bucket, count = 0, onClick, size = 'md', selected = false }) {
  const { settings } = useStore()
  const hex = colorHex(bucket.color, settings.theme)
  const big = size === 'lg'
  const small = size === 'sm'

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'press focus-ring relative flex flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-2 bg-surface text-center',
        big ? 'min-h-[6.5rem] px-2 py-3' : small ? 'min-h-[4.75rem] px-1 py-2' : 'min-h-[5.25rem] px-1.5 py-2.5',
        selected ? 'ring-2 ring-offset-0' : '',
      ].join(' ')}
      style={{
        borderColor: hex,
        backgroundImage: `linear-gradient(180deg, ${hex}1f, transparent 62%)`,
        ...(selected ? { boxShadow: `0 0 0 3px ${hex}` } : null),
      }}
    >
      <span
        className="flex items-center justify-center rounded-xl"
        style={{ color: hex }}
        aria-hidden="true"
      >
        <Icon name={bucket.icon} size={big ? 30 : small ? 23 : 26} strokeWidth={1.9} />
      </span>
      <span
        className={[
          'stamp-label w-full truncate px-0.5 leading-tight text-ink',
          big ? 'text-[0.82rem]' : small ? 'text-[0.6rem] tracking-[0.06em]' : 'text-[0.74rem]',
        ].join(' ')}
      >
        {bucket.name}
      </span>
      {count > 0 && (
        <span
          className={[
            'absolute rounded-full text-center font-bold',
            small
              ? 'top-1 right-1 min-w-[1.15rem] px-1 text-[0.62rem] leading-[1.15rem]'
              : 'top-1.5 right-1.5 min-w-[1.4rem] px-1.5 text-[0.7rem] leading-[1.4rem]',
          ].join(' ')}
          style={{ background: hex, color: 'var(--c-bg)' }}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  )
}

/** Small inline chip: used in search results and note rows to show provenance. */
export function BucketChip({ bucket, className = '' }) {
  const { settings } = useStore()
  if (!bucket) return null
  const hex = colorHex(bucket.color, settings.theme)
  return (
    <span
      className={[
        'stamp-label inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[0.66rem]',
        className,
      ].join(' ')}
      style={{ borderColor: hex, color: hex }}
    >
      <Icon name={bucket.icon} size={13} strokeWidth={2.1} />
      {bucket.name}
    </span>
  )
}
