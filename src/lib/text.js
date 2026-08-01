/**
 * Plain-text rendering, splitting and sharing (spec §8 split, §9 export).
 */

import { friendlyDate, fullStamp } from './format.js'

/* ------------------------------------------------------------- splitting */

const SPLIT_RE = /\s*(?:,|;|\r?\n|\band\b|\bthen\b|\balso\b|\bplus\b)\s*/gi

/** Words that shouldn't survive as a lone item after a split. */
const NOISE = new Set(['', 'and', 'then', 'also', 'plus', 'a', 'an', 'the', 'um', 'uh', 'ok'])

/**
 * Breaks a dictated line into individual items on commas / "and" / newlines.
 * Never runs automatically — the result goes to a confirm screen (spec §8).
 */
export function splitItems(text) {
  if (!text) return []
  const parts = String(text)
    .replace(/[.!?]+\s*$/, '')
    .split(SPLIT_RE)
    .map((s) => s.replace(/^[\s\-–—•*]+/, '').replace(/[\s.]+$/, '').trim())
    .filter((s) => s && !NOISE.has(s.toLowerCase()))
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))

  const seen = new Set()
  return parts.filter((p) => {
    const k = p.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Worth offering a split? Two or more parts and it isn't a long paragraph. */
export function looksSplittable(text) {
  if (!text) return false
  if (text.length > 400) return false
  return splitItems(text).length >= 2
}

/* --------------------------------------------------------- copy as text */

/**
 * Human-readable dump of one bucket (spec §9). This gets pasted into a chat
 * before a doctor's appointment, so it has to read like a list a person wrote.
 */
export function bucketAsText(bucket, notes, { includeArchived = false } = {}) {
  const active = notes.filter((n) => !n.archived)
  const archived = notes.filter((n) => n.archived)
  const lines = []

  lines.push(bucket.name.toUpperCase())
  lines.push('='.repeat(Math.max(bucket.name.length, 6)))
  lines.push(fullStamp())
  lines.push('')

  if (!active.length) lines.push('(nothing here)')

  for (const note of active) {
    const box = note.checked ? '[x]' : '[ ]'
    lines.push(`${box} ${indentBody(note.transcript)}`)
  }

  if (includeArchived && archived.length) {
    lines.push('')
    lines.push('--- DONE / ARCHIVED ---')
    for (const note of archived) {
      lines.push(`[x] ${indentBody(note.transcript)}   (${friendlyDate(note.filedAt || note.createdAt)})`)
    }
  }

  lines.push('')
  lines.push(`— Quick Notes`)
  return lines.join('\n')
}

function indentBody(text) {
  const t = (text || '').trim()
  if (!t) return '(no text)'
  return t.split('\n').join('\n    ')
}

/** Everything, as readable text. Used by "Copy all". */
export function allAsText(buckets, notesByBucket, { includeArchived = true } = {}) {
  const chunks = []
  chunks.push('QUICK NOTES — everything')
  chunks.push(fullStamp())
  chunks.push('')
  for (const bucket of buckets) {
    const notes = notesByBucket[bucket.id] || []
    if (!notes.length) continue
    chunks.push(bucketAsText(bucket, notes, { includeArchived }))
    chunks.push('')
  }
  return chunks.join('\n')
}

/* ----------------------------------------------------------- clipboard */

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/* --------------------------------------------------------------- share */

export function canShare(data) {
  if (!navigator.share) return false
  if (data && navigator.canShare) return navigator.canShare(data)
  return true
}

/**
 * Share sheet first (Android native — Kyle picks Gmail), mailto: fallback.
 * Returns 'shared' | 'mail' | 'copied' | 'failed'.
 */
export async function shareText({ title, text }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
    }
  }
  try {
    const href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`
    // mailto: has a URL length ceiling on Android; copy long dumps instead.
    if (href.length < 6000) {
      window.location.href = href
      return 'mail'
    }
  } catch {
    /* fall through */
  }
  return (await copyText(text)) ? 'copied' : 'failed'
}

/** Shares a file via the sheet, or downloads it when files can't be shared. */
export async function shareFile(file, { title, text } = {}) {
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title, text })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
    }
  }
  return downloadFile(file, file.name) ? 'downloaded' : 'failed'
}

export function downloadFile(blob, filename) {
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    return true
  } catch {
    return false
  }
}
