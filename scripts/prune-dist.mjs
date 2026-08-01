/**
 * Drops build output we provably never load.
 *
 * transformers.js contains a static asset reference to the ORT "asyncify"
 * WASM build, so Vite emits it (~23.5 MB) even though this app never enables
 * asyncify or JSPI — it uses the plain SIMD+threaded build for CPU and the
 * JSEP build for WebGPU, both served from /ort/ via env.backends.onnx.wasm.
 * wasmPaths.
 *
 * Removing it is safe *because* wasmPaths is set: ORT resolves its binaries
 * from /ort/ and never asks for the emitted asset. If that setting is ever
 * removed, this prune must go too.
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
