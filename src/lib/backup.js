/**
 * BACKUP — readable JSON (spec §9).
 *
 * Requirement: Kyle must be able to open this file and *read* it, not just
 * restore it. So: pretty-printed, human field names, notes grouped by bucket,
 * dates written out in words as well as timestamps. Audio blobs are excluded
 * on purpose — base64 audio would make the file unreadable and enormous.
 */

import { friendlyDate, fullStamp, isoDate } from './format.js'
import { defaultBuckets, newNote, uid, INBOX, TRASH } from './model.js'

export const BACKUP_VERSION = 1

export function buildBackup({ buckets, notes, settings, grocery }) {
  const ordered = [...buckets].sort((a, b) => a.order - b.order)
  const byBucket = {}
  for (const note of notes) {
    ;(byBucket[note.bucketId] ||= []).push(note)
  }

  const bucketsOut = ordered.map((bucket) => {
    const rows = (byBucket[bucket.id] || []).sort((a, b) => a.createdAt - b.createdAt)
    return {
      bucket: bucket.name,
      type: bucket.type,
      color: bucket.color,
      icon: bucket.icon,
      canBeDeleted: bucket.deletable !== false,
      whenDone: bucket.clearMode === 'delete' ? 'delete' : 'archive',
      noteCount: rows.length,
      notes: rows.map(noteOut),
      _id: bucket.id,
      _order: bucket.order,
    }
  })

  const loose = notes.filter((n) => !ordered.some((b) => b.id === n.bucketId))
  if (loose.length) {
    bucketsOut.push({
      bucket: 'Unsorted (bucket no longer exists)',
      type: 'script',
      noteCount: loose.length,
      notes: loose.map(noteOut),
      _id: INBOX,
      _order: 999,
    })
  }

  return {
    app: 'Quick Notes',
    tagline: 'Capture. File. Remember.',
    backupMadeOn: fullStamp(),
    backupMadeAtTimestamp: Date.now(),
    formatVersion: BACKUP_VERSION,
    readMe:
      'This is your whole notebook in plain, readable form. You can open it in any text app. ' +
      'To put it back into Quick Notes, use Settings → Restore from backup and pick this file.',
    audioNote:
      'Voice recordings are NOT included in this file — only the text of each note. ' +
      'Recordings stay on the phone that made them.',
    totals: {
      buckets: ordered.length,
      notes: notes.length,
      waitingInInbox: notes.filter((n) => n.bucketId === INBOX && !n.archived).length,
    },
    buckets: bucketsOut,
    groceryWordsLearned: [...(grocery || [])]
      .sort((a, b) => b.count - a.count)
      .map((g) => ({ word: g.term, list: g.bucketId, timesUsed: g.count, lastUsed: g.lastUsed })),
    settings: { ...settings },
  }
}

function noteOut(note) {
  const out = {
    text: note.transcript || '',
    written: friendlyDate(note.createdAt),
    status: note.archived ? 'archived' : note.checked ? 'done' : 'open',
  }
  if (note.filedAt) out.filed = friendlyDate(note.filedAt)
  if (note.audioBlobId) out.hasVoiceRecording = true
  out._id = note.id
  out._createdAt = note.createdAt
  if (note.filedAt) out._filedAt = note.filedAt
  out._checked = !!note.checked
  out._archived = !!note.archived
  out._audioKept = !!note.audioKept
  if (note.duration) out._durationMs = note.duration
  return out
}

export function backupFilename() {
  return `quick-notes-backup-${isoDate()}.json`
}

export function serializeBackup(data) {
  return JSON.stringify(data, null, 2)
}

/* ------------------------------------------------------------------ import */

export class ImportError extends Error {}

/**
 * Parses a backup file back into { buckets, notes, grocery, settings }.
 * Tolerant on purpose: hand-edited files should still import.
 */
export function parseBackup(json) {
  let data
  try {
    data = typeof json === 'string' ? JSON.parse(json) : json
  } catch {
    throw new ImportError('That file is not readable. It should be a Quick Notes backup (.json).')
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.buckets)) {
    throw new ImportError('That does not look like a Quick Notes backup.')
  }

  const buckets = []
  const notes = []
  const seenBucketIds = new Set()
  const known = new Map(defaultBuckets().map((b) => [b.name.toLowerCase(), b]))

  data.buckets.forEach((entry, index) => {
    const name = String(entry.bucket || entry.name || `List ${index + 1}`).trim()
    let id = entry._id || known.get(name.toLowerCase())?.id || slugId(name)
    while (seenBucketIds.has(id)) id = `${id}_${index}`
    seenBucketIds.add(id)

    if (id !== INBOX) {
      buckets.push({
        id,
        name,
        type: entry.type === 'checklist' ? 'checklist' : 'script',
        color: entry.color || 'slate',
        icon: entry.icon || 'note',
        order: Number.isFinite(entry._order) ? entry._order : index,
        deletable: entry.canBeDeleted !== false && id !== TRASH,
        system: id === TRASH || undefined,
        clearMode: entry.whenDone === 'delete' ? 'delete' : 'archive',
      })
    }

    for (const row of entry.notes || []) {
      const text = typeof row === 'string' ? row : row.text || row.transcript || ''
      const src = typeof row === 'string' ? {} : row
      notes.push(
        newNote({
          id: src._id || uid('note'),
          transcript: String(text),
          bucketId: id,
          createdAt: Number(src._createdAt) || Date.now(),
          filedAt: Number(src._filedAt) || (id === INBOX ? undefined : Date.now()),
          checked: !!src._checked || src.status === 'done',
          archived: !!src._archived || src.status === 'archived',
          audioKept: !!src._audioKept,
          duration: Number(src._durationMs) || 0,
          audioBlobId: undefined, // recordings are never in the file
        })
      )
    }
  })

  const grocery = (data.groceryWordsLearned || [])
    .map((g) => ({
      term: String(g.word || g.term || '').trim(),
      bucketId: g.list || g.bucketId || 'grocery',
      count: Number(g.timesUsed || g.count) || 1,
      lastUsed: Number(g.lastUsed) || Date.now(),
    }))
    .filter((g) => g.term)

  const settings = data.settings && typeof data.settings === 'object' ? data.settings : {}

  return { buckets, notes, grocery, settings }
}

function slugId(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return base || uid('b')
}
