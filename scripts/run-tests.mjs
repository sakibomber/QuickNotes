/**
 * Test runner.
 *
 * Node cannot import JSX, so the render test is bundled with esbuild (already
 * present as a Vite dependency) into a throwaway file and run with node:test
 * alongside the plain logic suite.
 *
 *   npm test
 */

import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, '.test-build')

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [join(root, 'test', 'render.test.jsx')],
  outfile: join(outDir, 'render.test.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  jsx: 'automatic',
  logLevel: 'warning',
  // Keep node_modules external so React and jsdom resolve normally.
  packages: 'external',
  loader: { '.css': 'empty' },
})

const result = spawnSync(
  process.execPath,
  ['--test', join(root, 'test', 'logic.test.js'), join(outDir, 'render.test.mjs')],
  { stdio: 'inherit', cwd: root }
)

rmSync(outDir, { recursive: true, force: true })
process.exit(result.status ?? 1)
