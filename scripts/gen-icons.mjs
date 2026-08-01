/**
 * Generates every PWA icon from scratch — no image library, no binary assets
 * checked in. Draws into an RGBA buffer at 4x and box-downsamples for clean
 * edges, then writes real PNGs with zlib.
 *
 * Two marks, because the app has two home-screen icons (spec §3):
 *   app       — a ruled note card on olive ink
 *   shortcut  — a red record dot, unmistakably different at a glance
 *
 *   npm run icons
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
const SS = 4 // supersample factor

const INK = [0x14, 0x17, 0x0f, 255]
const OLIVE = [0xa8, 0xb5, 0x45, 255]
const PAPER = [0xf2, 0xe9, 0xd3, 255]
const RULE = [0xc2, 0xb6, 0x98, 255]
const RED = [0xc8, 0x56, 0x3c, 255]
const MARGIN = [0xa3, 0x40, 0x2a, 255]

/* ------------------------------------------------------------ canvas ---- */

function canvas(size) {
  const w = size * SS
  const data = new Uint8ClampedArray(w * w * 4)
  return { w, data }
}

function blend(c, i, [r, g, b, a], alpha) {
  const A = (a / 255) * alpha
  if (A <= 0) return
  const inv = 1 - A
  c.data[i] = c.data[i] * inv + r * A
  c.data[i + 1] = c.data[i + 1] * inv + g * A
  c.data[i + 2] = c.data[i + 2] * inv + b * A
  c.data[i + 3] = c.data[i + 3] * inv + 255 * A
}

function fillAll(c, color) {
  for (let i = 0; i < c.data.length; i += 4) blend(c, i, color, 1)
}

/** Rounded rectangle in unit coordinates (0..1 of the icon square). */
function roundRect(c, x0, y0, x1, y1, radius, color) {
  const s = c.w
  const ax = x0 * s
  const ay = y0 * s
  const bx = x1 * s
  const by = y1 * s
  const r = radius * s
  const lo = Math.max(0, Math.floor(ay))
  const hi = Math.min(s, Math.ceil(by))
  for (let y = lo; y < hi; y++) {
    for (let x = Math.max(0, Math.floor(ax)); x < Math.min(s, Math.ceil(bx)); x++) {
      const px = x + 0.5
      const py = y + 0.5
      let dx = 0
      let dy = 0
      if (px < ax + r) dx = ax + r - px
      else if (px > bx - r) dx = px - (bx - r)
      if (py < ay + r) dy = ay + r - py
      else if (py > by - r) dy = py - (by - r)
      if (dx * dx + dy * dy <= r * r) blend(c, (y * s + x) * 4, color, 1)
    }
  }
}

function circle(c, cx, cy, radius, color) {
  const s = c.w
  const x = cx * s
  const y = cy * s
  const r = radius * s
  for (let py = Math.max(0, Math.floor(y - r)); py < Math.min(s, Math.ceil(y + r)); py++) {
    for (let px = Math.max(0, Math.floor(x - r)); px < Math.min(s, Math.ceil(x + r)); px++) {
      const dx = px + 0.5 - x
      const dy = py + 0.5 - y
      if (dx * dx + dy * dy <= r * r) blend(c, (py * s + px) * 4, color, 1)
    }
  }
}

function ring(c, cx, cy, radius, thickness, color) {
  const s = c.w
  const x = cx * s
  const y = cy * s
  const outer = radius * s
  const inner = (radius - thickness) * s
  for (let py = Math.max(0, Math.floor(y - outer)); py < Math.min(s, Math.ceil(y + outer)); py++) {
    for (let px = Math.max(0, Math.floor(x - outer)); px < Math.min(s, Math.ceil(x + outer)); px++) {
      const dx = px + 0.5 - x
      const dy = py + 0.5 - y
      const d2 = dx * dx + dy * dy
      if (d2 <= outer * outer && d2 >= inner * inner) blend(c, (py * s + px) * 4, color, 1)
    }
  }
}

/** Average each SSxSS block down to one pixel — that's the anti-aliasing. */
function downsample(c, size) {
  const out = Buffer.alloc(size * size * 4)
  const n = SS * SS
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * c.w + (x * SS + sx)) * 4
          r += c.data[i]
          g += c.data[i + 1]
          b += c.data[i + 2]
          a += c.data[i + 3]
        }
      }
      const o = (y * size + x) * 4
      out[o] = Math.round(r / n)
      out[o + 1] = Math.round(g / n)
      out[o + 2] = Math.round(b / n)
      out[o + 3] = Math.round(a / n)
    }
  }
  return out
}

/* --------------------------------------------------------------- PNG ---- */

function crc32(buf) {
  let c
  const table = crc32.table || (crc32.table = buildCrcTable())
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff
    crc = (crc >>> 8) ^ table[c]
  }
  return (crc ^ 0xffffffff) >>> 0
}

function buildCrcTable() {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, crc])
}

function encodePNG(rgba, size) {
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* -------------------------------------------------------------- marks --- */

/** The app mark: a ruled index card, corner-stamped, on olive ink. */
function drawApp(c, inset) {
  const k = 1 - inset * 2
  const at = (v) => inset + v * k

  fillAll(c, INK)
  roundRect(c, at(0.06), at(0.06), at(0.94), at(0.94), 0.13 * k, [0x23, 0x28, 0x19, 255])

  // the card
  roundRect(c, at(0.16), at(0.14), at(0.84), at(0.86), 0.05 * k, PAPER)

  // ruled lines
  const lineH = 0.026 * k
  for (let i = 0; i < 4; i++) {
    const y = at(0.34 + i * 0.135)
    roundRect(c, at(0.245), y, at(0.755), y + lineH, lineH / 2, RULE)
  }

  // the red margin rule
  roundRect(c, at(0.245), at(0.14), at(0.245) + 0.018 * k, at(0.86), 0.009 * k, MARGIN)

  // olive header band
  roundRect(c, at(0.16), at(0.14), at(0.84), at(0.245), 0.05 * k, OLIVE)
  roundRect(c, at(0.16), at(0.205), at(0.84), at(0.245), 0, OLIVE)
}

/** The shortcut mark: a record dot. Nothing else — you find it by the red. */
function drawRecord(c, inset) {
  const k = 1 - inset * 2
  const at = (v) => inset + v * k

  fillAll(c, INK)
  roundRect(c, at(0.06), at(0.06), at(0.94), at(0.94), 0.13 * k, [0x23, 0x28, 0x19, 255])
  ring(c, at(0.5), at(0.5), 0.34 * k, 0.045 * k, [0x3d, 0x45, 0x2e, 255])
  circle(c, at(0.5), at(0.5), 0.235 * k, RED)
}

/* --------------------------------------------------------------- run ---- */

function render(size, draw, inset = 0) {
  const c = canvas(size)
  draw(c, inset)
  return encodePNG(downsample(c, size), size)
}

const FILES = [
  ['icon-192.png', 192, drawApp, 0],
  ['icon-512.png', 512, drawApp, 0],
  // Maskable icons must survive Android's circular crop: keep the mark inside
  // the middle 80%.
  ['icon-maskable-192.png', 192, drawApp, 0.1],
  ['icon-maskable-512.png', 512, drawApp, 0.1],
  ['apple-touch-icon-180.png', 180, drawApp, 0],
  ['shortcut-record-96.png', 96, drawRecord, 0],
  ['shortcut-record-192.png', 192, drawRecord, 0],
]

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#14170F"/>
  <rect x="10" y="9" width="44" height="46" rx="4" fill="#F2E9D3"/>
  <rect x="10" y="9" width="44" height="8" rx="4" fill="#A8B545"/>
  <rect x="16" y="9" width="1.6" height="46" fill="#A3402A"/>
  <g fill="#C2B698">
    <rect x="21" y="25" width="27" height="2.4" rx="1.2"/>
    <rect x="21" y="33" width="27" height="2.4" rx="1.2"/>
    <rect x="21" y="41" width="20" height="2.4" rx="1.2"/>
  </g>
</svg>
`

mkdirSync(OUT, { recursive: true })
for (const [name, size, draw, inset] of FILES) {
  writeFileSync(join(OUT, name), render(size, draw, inset))
  process.stdout.write(`  icons/${name}\n`)
}
writeFileSync(join(OUT, 'favicon.svg'), FAVICON)
process.stdout.write('  icons/favicon.svg\n')
