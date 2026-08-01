/**
 * IndexedDB layer.
 *
 * Deliberately dependency-free: this is the one part of the app that must never
 * break because a library moved on. Everything lives on the device — no backend,
 * no accounts (spec §2).
 *
 * Stores
 *   notes    { id, createdAt, transcript, audioBlobId?, bucketId, filedAt?,
 *              checked, archived, audioKept, duration? }
 *   audio    { id, blob, mimeType, duration, createdAt }
 *   buckets  { id, name, type, order, deletable, color, icon }
 *   settings { key, value }
 *   grocery  { bucketId, term, count, lastUsed }   // key: [bucketId, term]
 */

const DB_NAME = 'quick-notes'
const DB_VERSION = 1

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (event) => {
      const db = req.result
      const from = event.oldVersion

      if (from < 1) {
        const notes = db.createObjectStore('notes', { keyPath: 'id' })
        notes.createIndex('bucketId', 'bucketId')
        notes.createIndex('createdAt', 'createdAt')

        db.createObjectStore('audio', { keyPath: 'id' })

        const buckets = db.createObjectStore('buckets', { keyPath: 'id' })
        buckets.createIndex('order', 'order')

        db.createObjectStore('settings', { keyPath: 'key' })

        db.createObjectStore('grocery', { keyPath: ['bucketId', 'term'] })
      }
      // Future migrations: if (from < 2) { ... }
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('Database is blocked by another open tab.'))
  })
  return dbPromise
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'))
  })
}

function reqDone(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getAll(store) {
  const db = await openDB()
  return reqDone(db.transaction(store, 'readonly').objectStore(store).getAll())
}

export async function get(store, key) {
  const db = await openDB()
  return reqDone(db.transaction(store, 'readonly').objectStore(store).get(key))
}

export async function put(store, value) {
  const db = await openDB()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).put(value)
  await txDone(tx)
  return value
}

export async function putMany(store, values) {
  if (!values.length) return
  const db = await openDB()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store)
  for (const v of values) os.put(v)
  await txDone(tx)
}

export async function del(store, key) {
  const db = await openDB()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).delete(key)
  await txDone(tx)
}

export async function delMany(store, keys) {
  if (!keys.length) return
  const db = await openDB()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store)
  for (const k of keys) os.delete(k)
  await txDone(tx)
}

export async function clearStore(store) {
  const db = await openDB()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).clear()
  await txDone(tx)
}

export async function clearAll() {
  const db = await openDB()
  const names = ['notes', 'audio', 'buckets', 'settings', 'grocery']
  const tx = db.transaction(names, 'readwrite')
  for (const n of names) tx.objectStore(n).clear()
  await txDone(tx)
}

/** Approximate on-device usage, when the browser will tell us. */
export async function estimateStorage() {
  if (!navigator.storage?.estimate) return null
  try {
    const { usage, quota } = await navigator.storage.estimate()
    return { usage: usage || 0, quota: quota || 0 }
  } catch {
    return null
  }
}

/**
 * Ask Chrome to make this origin's storage persistent so Android's automatic
 * storage cleanup can't quietly evict a week of captures.
 */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export { openDB }
