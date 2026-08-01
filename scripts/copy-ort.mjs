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

import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', 'onnxruntime-web', 'dist')
const to = join(root, 'public', 'ort')

/**
 * Copy EVERY ort-wasm-* file, both halves of each variant.
 *
 * Twice now I have reasoned about which variants the runtime "actually needs"
 * and been wrong, costing a deploy cycle each time:
 *
 *   1. Shipped only the .wasm binaries. ORT fetches a .mjs loader first and
 *      instantiates the .wasm from there — the loader 404'd and ORT reported
 *      "no available backend found", naming neither the file nor the 404.
 *   2. Shipped the plain + jsep pairs and pruned "asyncify" as unused. The
 *      WebGPU path requests exactly that: asyncify.mjs.
 *
 * The variants are selected at runtime from device capabilities we cannot see
 * from here, so guessing is the wrong tool. Copy them all; trim only once the
 * device has told us which backend actually wins.
 */
const WANTED = null // null = every ort-wasm-* file present

if (!existsSync(from)) {
  console.error('onnxruntime-web not installed — run npm install first')
  process.exit(1)
}

mkdirSync(to, { recursive: true })

const files =
  WANTED ||
  readdirSync(from).filter((n) => /^ort-wasm.*\.(mjs|wasm)$/.test(n))

if (!files.length) {
  console.error('no ort-wasm-* files found — onnxruntime-web layout may have changed')
  process.exit(1)
}

let total = 0
for (const name of files) {
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
process.stdout.write(`  ${files.length} files · ${total.toFixed(1)} MB served from our own origin\n`)
