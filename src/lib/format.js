/** Date, time and size formatting. Short, plain words — no dense text. */

const DAY = 86400000

export function clockTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function shortDuration(ms) {
  if (!ms) return ''
  return clockTime(ms)
}

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.getTime()
}

/** "Today 2:14 PM", "Yesterday 9:02 AM", "Mon 12 May, 8:31 AM". */
export function friendlyDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const today = startOfDay(Date.now())
  const day = startOfDay(ts)
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (day === today) return `Today ${time}`
  if (day === today - DAY) return `Yesterday ${time}`
  const sameYear = d.getFullYear() === new Date().getFullYear()
  const date = d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
  return `${date}, ${time}`
}

/** "3 days ago" — used on triage cards to make staleness obvious. */
export function relativeAge(ts) {
  const diff = Date.now() - ts
  if (diff < 60000) return 'just now'
  if (diff < 3600000) {
    const m = Math.round(diff / 60000)
    return `${m} min ago`
  }
  if (diff < DAY) {
    const h = Math.round(diff / 3600000)
    return h === 1 ? '1 hour ago' : `${h} hours ago`
  }
  const days = Math.round(diff / DAY)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.round(days / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}

export function isoDate(ts = Date.now()) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fullStamp(ts = Date.now()) {
  return new Date(ts).toLocaleString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function bytes(n) {
  if (!n) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

/** First line of a transcript, for list rows. */
export function firstLine(text, max = 90) {
  const line = (text || '').trim().split('\n')[0] || ''
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}
