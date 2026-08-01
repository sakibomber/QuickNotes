/**
 * Drops Vite's duplicate copies of the ORT binaries from assets/.
 *
 * Vite sees static asset references inside transformers.js and emits its own
 * hashed copies (~23.5 MB) into assets/. Those copies are never fetched: we
 * set env.backends.onnx.wasm.wasmPaths to /ort/, and ORT builds every request
 * from that prefix. The device confirmed it directly — a failed load asked for
 *
 *   https://quicknotes-kk.netlify.app/ort/ort-wasm-simd-threaded.asyncify.mjs
 *
 * i.e. /ort/, never /assets/. So pruning the assets duplicates is safe, and
 * that is now observed rather than assumed.
 *
 * NOTE: this prunes only the assets/ duplicates. The real files live in /ort/
 * and are copied there by copy-ort.mjs. An earlier version of this script
 * treated "asyncify" as an unused variant and dropped it everywhere, which
 * broke WebGPU — the WebGPU path requests exactly that variant. If wasmPaths
 * is ever unset, this prune must go too.
 */

import { readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const assets = join(dist, 'assets')

const DROP = /^ort-wasm.*\.(asyncify|jspi)[-.].*\.wasm$/

let freed = 0
try {
  for (const name of readdirSync(assets)) {
    if (!DROP.test(name)) continue
    const path = join(assets, name)
    freed += statSync(path).size
    rmSync(path)
    process.stdout.write(`  pruned assets/${name}\n`)
  }
} catch {
  // No dist yet — nothing to do.
}

if (freed) process.stdout.write(`  freed ${(freed / 1024 / 1024).toFixed(1)} MB\n`)
