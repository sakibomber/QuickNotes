/**
 * Copies the ONNX Runtime WASM binaries into public/ort/ so they are served
 * from our own origin.
 *
 * Why this exists: transformers.js defaults `wasmPaths` to jsDelivr, which
 * would make on-device transcription depend on a third-party CDN at runtime.
 * For an offline-first app that gets handed to people who cannot debug a
 * failed fetch, that is the wrong kind of fragile — and it quietly undoes the
 * "loads nothing external" property the rest of the build maintains.
 *
 * Only the two binaries actually used are copied (SIMD+threaded for CPU, and
 * the JSEP build for WebGPU). The asyncify and jspi variants are not used by
 * this configuration and would add ~28 MB to the deploy for nothing.
 */

import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', 'onnxruntime-web', 'dist')
const to = join(root, 'public', 'ort')

/**
 * BOTH halves are required. ORT fetches a `.mjs` loader from `wasmPaths` and
 * that loader instantiates the matching `.wasm`. Shipping only the binaries
 * gives a 404 on the loader and ORT reports "no available backend found",
 * which does not point at the missing file at all. Verified on the live site:
 * the .wasm returned 200 and the .mjs returned 404.
 */
const WANTED = [
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
]

if (!existsSync(from)) {
  console.error('onnxruntime-web not installed — run npm install first')
  process.exit(1)
}

mkdirSync(to, { recursive: true })
let total = 0
for (const name of WANTED) {
  const src = join(from, name)
  if (!existsSync(src)) {
    console.error(`missing ${name} — onnxruntime-web layout may have changed`)
    process.exit(1)
  }
  copyFileSync(src, join(to, name))
  const mb = statSync(src).size / 1024 / 1024
  total += mb
  process.stdout.write(`  ort/${name}  ${mb.toFixed(1)} MB\n`)
}
process.stdout.write(`  ${total.toFixed(1)} MB served from our own origin\n`)
