/**
 * Pure-logic tests. No DOM, no browser — just the rules that decide what a
 * note becomes. Run with: npm test
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { splitItems, looksSplittable, bucketAsText, allAsText } from '../src/lib/text.js'
import { buildBackup, parseBackup, serializeBackup, ImportError } from '../src/lib/backup.js'
import {
  defaultBuckets,
  newNote,
  shouldDropAudio,
  INBOX,
  TRASH,
  DEFAULT_SETTINGS,
} from '../src/lib/model.js'
import { clockTime, firstLine, bytes, plural } from '../src/lib/format.js'
import { describeSpeechError } from '../src/lib/transcribe.js'

/* ------------------------------------------------------------- splitting */

test('splits a dictated grocery line on commas and "and"', () => {
  assert.deepEqual(splitItems('milk, bread and eggs'), ['Milk', 'Bread', 'Eggs'])
})

test('splits on newlines and semicolons, drops filler words', () => {
  assert.deepEqual(splitItems('call the VA\nrefill pills; and then ask about sleep'), [
    'Call the VA',
    'Refill pills',
    'Ask about sleep',
  ])
})

test('drops duplicates and trailing punctuation', () => {
  assert.deepEqual(splitItems('eggs, eggs, milk.'), ['Eggs', 'Milk'])
})

test('a single thought is not offered as a split', () => {
  assert.equal(looksSplittable('tell the doc about the shoulder thing'), false)
  assert.equal(looksSplittable(''), false)
})

test('a long paragraph is never split', () => {
  const long = `${'word, '.repeat(120)}end`
  assert.equal(looksSplittable(long), false)
})

test('two items is enough to offer a split', () => {
  assert.equal(looksSplittable('milk and bread'), true)
})

/* ----------------------------------------------------------- copy as text */

test('copy-as-text is readable and marks what is done', () => {
  const bucket = { id: 'doc', name: 'Doc', type: 'script', order: 0 }
  const notes = [
    newNote({ transcript: 'shoulder thing', bucketId: 'doc' }),
    { ...newNote({ transcript: 'sleep meds', bucketId: 'doc' }), checked: true },
    { ...newNote({ transcript: 'old business', bucketId: 'doc' }), archived: true },
  ]
  const text = bucketAsText(bucket, notes)
  assert.match(text, /^DOC/)
  assert.match(text, /\[ \] shoulder thing/)
  assert.match(text, /\[x\] sleep meds/)
  assert.ok(!text.includes('old business'), 'archived items stay out unless asked for')

  const withHistory = bucketAsText(bucket, notes, { includeArchived: true })
  assert.match(withHistory, /DONE \/ ARCHIVED/)
  assert.match(withHistory, /old business/)
})

test('copy-as-text says so when a bucket is empty', () => {
  const text = bucketAsText({ id: 'x', name: 'Wife', type: 'script' }, [])
  assert.match(text, /\(nothing here\)/)
})

test('copy-everything skips empty buckets', () => {
  const buckets = defaultBuckets()
  const notesByBucket = { doc: [newNote({ transcript: 'hello', bucketId: 'doc' })] }
  const text = allAsText(buckets, notesByBucket)
  assert.match(text, /DOC/)
  assert.ok(!text.includes('GROCERY'))
})

/* ---------------------------------------------------------------- backup */

test('backup round-trips notes, buckets and the grocery dictionary', () => {
  const buckets = defaultBuckets()
  const notes = [
    newNote({ transcript: 'shoulder thing', bucketId: 'doc', filedAt: Date.now() }),
    { ...newNote({ transcript: 'milk', bucketId: 'grocery' }), checked: true },
    newNote({ transcript: 'unfiled thought', bucketId: INBOX }),
  ]
  const grocery = [{ bucketId: 'grocery', term: 'milk', count: 4, lastUsed: Date.now() }]

  const backup = buildBackup({ buckets, notes, settings: DEFAULT_SETTINGS, grocery })
  const json = serializeBackup(backup)

  // The whole point: a person has to be able to read it.
  assert.match(json, /"bucket": "Doc"/)
  assert.match(json, /"text": "shoulder thing"/)
  assert.match(json, /"backupMadeOn"/)
  assert.match(json, /"readMe"/)
  assert.match(json, /Voice recordings are NOT included/)
  assert.ok(json.includes('\n  '), 'pretty printed')

  const restored = parseBackup(json)
  assert.equal(restored.notes.length, 3)
  const doc = restored.notes.find((n) => n.transcript === 'shoulder thing')
  assert.equal(doc.bucketId, 'doc')
  const milk = restored.notes.find((n) => n.transcript === 'milk')
  assert.equal(milk.checked, true)
  assert.equal(milk.bucketId, 'grocery')
  const loose = restored.notes.find((n) => n.transcript === 'unfiled thought')
  assert.equal(loose.bucketId, INBOX, 'inbox notes come back to the inbox')
  assert.equal(restored.grocery[0].term, 'milk')
  assert.equal(restored.grocery[0].count, 4)
  assert.ok(restored.buckets.some((b) => b.id === TRASH))
})

test('restoring never carries an audio reference that no longer exists', () => {
  const notes = [
    { ...newNote({ transcript: 'voice memo', bucketId: 'doc' }), audioBlobId: 'aud_1' },
  ]
  const json = serializeBackup(
    buildBackup({ buckets: defaultBuckets(), notes, settings: {}, grocery: [] })
  )
  const restored = parseBackup(json)
  assert.equal(restored.notes[0].audioBlobId, undefined)
  assert.match(json, /"hasVoiceRecording": true/, 'but the file still says one existed')
})

test('a hand-edited backup with bare strings still imports', () => {
  const restored = parseBackup(
    JSON.stringify({ buckets: [{ bucket: 'Doc', notes: ['ask about the shoulder'] }] })
  )
  assert.equal(restored.notes.length, 1)
  assert.equal(restored.notes[0].transcript, 'ask about the shoulder')
  assert.equal(restored.notes[0].bucketId, 'doc', 'known bucket names map to known ids')
})

test('a bucket that is not in the default set gets a usable id', () => {
  const restored = parseBackup(
    JSON.stringify({ buckets: [{ bucket: 'Truck Stuff', type: 'checklist', notes: ['oil change'] }] })
  )
  assert.equal(restored.buckets[0].id, 'truck-stuff')
  assert.equal(restored.buckets[0].type, 'checklist')
})

test('nonsense files are refused with a sentence a person can act on', () => {
  assert.throws(() => parseBackup('not json at all'), ImportError)
  assert.throws(() => parseBackup('{"hello":"world"}'), ImportError)
  try {
    parseBackup('nope')
  } catch (err) {
    assert.match(err.message, /Quick Notes backup/)
  }
})

/* -------------------------------------------------------------- defaults */

test("the starting bucket set is Kyle's list plus Trash", () => {
  const buckets = defaultBuckets()
  const names = buckets.map((b) => b.name)
  for (const expected of [
    'Temp',
    'Reminders',
    'Doc',
    'Wife',
    'Kid',
    'Todo',
    'Grocery',
    'Notes',
    'Thoughts',
    'Trash',
  ]) {
    assert.ok(names.includes(expected), `${expected} is missing`)
  }
  assert.equal(buckets.find((b) => b.name === 'Grocery').type, 'checklist')
  assert.equal(buckets.find((b) => b.name === 'Todo').type, 'checklist')
  assert.equal(buckets.find((b) => b.name === 'Doc').type, 'script')
  assert.equal(buckets.find((b) => b.id === TRASH).deletable, false)
  assert.ok(
    buckets.filter((b) => b.id !== TRASH).every((b) => b.deletable),
    'every real bucket can be deleted — none are hardcoded'
  )
})

test('a new note starts unfiled, unchecked and unarchived', () => {
  const note = newNote()
  assert.equal(note.bucketId, INBOX)
  assert.equal(note.checked, false)
  assert.equal(note.archived, false)
  assert.equal(note.audioKept, false)
  assert.equal(note.filedAt, undefined)
  assert.ok(note.id.startsWith('note_'))
})

/* ------------------------------------------------- audio retention rule */

const NOW = 1_800_000_000_000
const GRACE = 12_000
const filed = (extra = {}) => ({
  ...newNote({ transcript: 'shoulder thing', bucketId: 'doc' }),
  audioBlobId: 'aud_1',
  filedAt: NOW - 60_000,
  ...extra,
})

test('a filed note drops its recording once the undo window has passed', () => {
  assert.equal(shouldDropAudio(filed(), { audioRetention: 'until-filed' }, NOW, GRACE), true)
})

test('a note still in the inbox never loses its recording', () => {
  const note = filed({ bucketId: INBOX, filedAt: undefined })
  assert.equal(shouldDropAudio(note, { audioRetention: 'until-filed' }, NOW, GRACE), false)
})

test('a note with no transcript never loses its recording — it is the only copy', () => {
  for (const transcript of ['', '   ', '\n']) {
    assert.equal(
      shouldDropAudio(filed({ transcript }), { audioRetention: 'until-filed' }, NOW, GRACE),
      false,
      `empty transcript ${JSON.stringify(transcript)} must keep its audio`
    )
  }
})

test('"keep this recording" beats the retention setting', () => {
  assert.equal(
    shouldDropAudio(filed({ audioKept: true }), { audioRetention: 'until-filed' }, NOW, GRACE),
    false
  )
})

test('"always keep" keeps everything', () => {
  assert.equal(shouldDropAudio(filed(), { audioRetention: 'always' }, NOW, GRACE), false)
})

test('nothing is swept inside the undo window, so undo restores the audio too', () => {
  const justFiled = filed({ filedAt: NOW - 2000 })
  assert.equal(shouldDropAudio(justFiled, { audioRetention: 'until-filed' }, NOW, GRACE), false)
  assert.equal(
    shouldDropAudio(justFiled, { audioRetention: 'until-filed' }, NOW + GRACE, GRACE),
    true
  )
})

test('a note with no recording is a no-op', () => {
  assert.equal(
    shouldDropAudio(filed({ audioBlobId: undefined }), { audioRetention: 'until-filed' }, NOW, GRACE),
    false
  )
})

/* ------------------------------------------- post-device-test defaults */

test('recordings are kept by default while transcription is unproven', () => {
  // S23 test, 2026-08-01: speech-to-text produced nothing at all, so the
  // recording is the only copy of the thought. Dropping it on filing is only
  // safe once the transcript can be trusted.
  assert.equal(DEFAULT_SETTINGS.audioRetention, 'always')
})

test('the "always" default means nothing is ever swept', () => {
  const note = {
    ...newNote({ transcript: 'a real transcript', bucketId: 'doc' }),
    audioBlobId: 'aud_1',
    filedAt: NOW - 999_999,
  }
  assert.equal(shouldDropAudio(note, DEFAULT_SETTINGS, NOW, GRACE), false)
})

/* ------------------------------------------------ speech error reporting */

test('every speech failure gets a sentence a person can act on', () => {
  for (const code of [
    'not-allowed',
    'service-not-allowed',
    'audio-capture',
    'network',
    'no-speech',
    'aborted',
    'language-not-supported',
    'unsupported',
  ]) {
    const text = describeSpeechError(code)
    assert.ok(text && text.length > 15, `${code} needs a real explanation`)
    assert.ok(/[.!]$/.test(text), `${code} should read as a sentence`)
  }
})

test('an unrecognised speech code still reports the raw code', () => {
  assert.match(describeSpeechError('some-new-code'), /some-new-code/)
})

test('a silent failure with no code is still described, not blank', () => {
  const text = describeSpeechError(undefined)
  assert.ok(text.length > 15)
  assert.match(text, /no words/i)
})

/* -------------------------------------------------------------- format */

test('formatting helpers', () => {
  assert.equal(clockTime(0), '0:00')
  assert.equal(clockTime(65000), '1:05')
  assert.equal(clockTime(600000), '10:00')
  assert.equal(firstLine('line one\nline two'), 'line one')
  assert.equal(firstLine('x'.repeat(200)).length, 90)
  assert.equal(bytes(0), '0 KB')
  assert.equal(bytes(2048), '2.0 KB')
  assert.equal(plural(1, 'note'), '1 note')
  assert.equal(plural(3, 'note'), '3 notes')
  assert.equal(plural(2, 'match', 'matches'), '2 matches')
})
