/**
 * Render + interaction test. Mounts the real app against a fake IndexedDB in a
 * jsdom window, then walks every route and does a full capture-to-filed loop.
 *
 * This is not a unit test — it is the closest thing to "open the app and press
 * things" that runs without a phone. Any console error fails the run.
 *
 * Bundled by scripts/run-tests.mjs (esbuild) because Node cannot import JSX.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import 'fake-indexeddb/auto'

/* ------------------------------------------------------- browser world */

const dom = new JSDOM(
  `<!doctype html><html data-theme="dark"><head><meta name="theme-color" content="#14170F"></head><body><div id="root"></div></body></html>`,
  { url: 'http://localhost/', pretendToBeVisual: true }
)

const win = dom.window
const define = (key, value) =>
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })

define('window', win)
define('document', win.document)
define('navigator', win.navigator)
define('location', win.location)
define('history', win.history)
define('HTMLElement', win.HTMLElement)
define('Element', win.Element)
define('Node', win.Node)
define('Event', win.Event)
define('CustomEvent', win.CustomEvent)
define('MutationObserver', win.MutationObserver)
define('requestAnimationFrame', win.requestAnimationFrame.bind(win))
define('cancelAnimationFrame', win.cancelAnimationFrame.bind(win))
define('localStorage', win.localStorage)
define('getComputedStyle', win.getComputedStyle.bind(win))
define('IS_REACT_ACT_ENVIRONMENT', true)

// jsdom has no object URLs, no media and no clipboard.
win.URL.createObjectURL = () => 'blob:stub'
win.URL.revokeObjectURL = () => {}
win.HTMLMediaElement.prototype.play = () => Promise.resolve()
win.HTMLMediaElement.prototype.pause = () => {}

/**
 * A stub speech recogniser, installed HERE and not inside a test, because
 * transcribe.js binds `window.SpeechRecognition` once at module load and the
 * app is imported a few lines below.
 *
 * `autoEndMs` is the knob the sweep test needs: a recogniser that tidies itself
 * up after a few milliseconds would hide a leaked one, so that test turns the
 * auto-end off and then asks how many are still running.
 */
class FakeSpeechRecognition {
  static live = 0
  static autoEndMs = 10
  static reset(autoEndMs = 10) {
    FakeSpeechRecognition.live = 0
    FakeSpeechRecognition.autoEndMs = autoEndMs
  }
  start() {
    if (this._started) throw new Error('already started')
    this._started = true
    FakeSpeechRecognition.live++
    setTimeout(() => {
      this.onstart?.()
      this.onaudiostart?.()
    }, 0)
    if (FakeSpeechRecognition.autoEndMs) {
      // Android's "handed a silent stream" shape: audio starts, no sound, end.
      this._timer = setTimeout(() => {
        this._release()
        this.onend?.()
      }, FakeSpeechRecognition.autoEndMs)
    }
  }
  stop() {
    this._release()
    this.onend?.()
  }
  _release() {
    clearTimeout(this._timer)
    if (this._started && !this._done) {
      this._done = true
      FakeSpeechRecognition.live--
    }
  }
}
define('SpeechRecognition', FakeSpeechRecognition)
win.SpeechRecognition = FakeSpeechRecognition

// Surface any console error as a test failure — silent breakage is the enemy.
const consoleErrors = []
const realError = console.error
console.error = (...args) => {
  consoleErrors.push(args.map(String).join(' '))
  realError(...args)
}

/* ------------------------------------------------------------ imports */

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: App } = await import('../src/App.jsx')
const { RouterProvider } = await import('../src/lib/router.jsx')
const { StoreProvider } = await import('../src/lib/store.jsx')
const { STAMP_GUARD_MS } = await import('../src/ui/constants.js')

/* ------------------------------------------------------------ helpers */

const root = createRoot(document.getElementById('root'))

async function flush(times = 3) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
  }
}

function text() {
  return document.getElementById('root').textContent || ''
}

/**
 * Waits for the UI to actually say something, rather than assuming a fixed
 * number of ticks is enough. Boot is async (IndexedDB), so tick-counting is a
 * race that tightens every time the bundle grows.
 */
async function waitForText(pattern, { timeout = 5000 } = {}) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (pattern.test(text())) return true
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25))
    })
  }
  throw new Error(`timed out waiting for ${pattern}\nsaw: ${text().slice(0, 300)}`)
}

/** Finds the smallest clickable element whose text contains `needle`. */
function button(needle, { exact = false } = {}) {
  const candidates = [...document.querySelectorAll('button, a, [role="button"]')].filter((el) => {
    const label = `${el.textContent || ''} ${el.getAttribute('aria-label') || ''}`.trim()
    return exact ? label === needle : label.toLowerCase().includes(needle.toLowerCase())
  })
  candidates.sort((a, b) => (a.textContent?.length || 0) - (b.textContent?.length || 0))
  return candidates[0] || null
}

async function click(needle, opts) {
  const el = button(needle, opts)
  assert.ok(el, `no clickable element matching "${needle}"`)
  await act(async () => {
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await flush(2)
  return el
}

async function typeInto(selector, value) {
  const el = document.querySelector(selector)
  assert.ok(el, `no input matching ${selector}`)
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set
  await act(async () => {
    setter.call(el, value)
    el.dispatchEvent(new win.Event('input', { bubbles: true }))
  })
  await flush(2)
  return el
}

/**
 * Drives a real drag across the triage surface. jsdom has no PointerEvent, so
 * the native events are built by hand — React reads clientX off the native
 * event either way.
 */
function pointer(type, x, y = 300) {
  const e = new win.Event(type, { bubbles: true, cancelable: true })
  Object.assign(e, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'touch',
    button: 0,
    isPrimary: true,
  })
  return e
}

function surface() {
  const el = document.querySelector('.swipe-surface')
  assert.ok(el, 'the triage swipe surface is on screen')
  return el
}

async function swipe(distance) {
  const el = surface()
  const from = 200
  await act(async () => {
    el.dispatchEvent(pointer('pointerdown', from))
  })
  // Several moves, like a finger: the first crosses the axis-decision gate.
  for (const step of [0.3, 0.7, 1]) {
    await act(async () => {
      el.dispatchEvent(pointer('pointermove', from + distance * step))
    })
  }
  await act(async () => {
    el.dispatchEvent(pointer('pointerup', from + distance))
  })
  await flush(3)
}

async function go(hash) {
  await act(async () => {
    win.location.hash = hash
    win.dispatchEvent(new win.Event('hashchange'))
  })
  await flush(3)
}

/* ------------------------------------------------------------- tests */

async function mount() {
  await act(async () => {
    root.render(
      <React.StrictMode>
        <RouterProvider>
          <StoreProvider>
            <App />
          </StoreProvider>
        </RouterProvider>
      </React.StrictMode>
    )
  })
}

test('a fresh install opens the set-up check', async () => {
  // §18 shipped a transcription feature that could not create a session,
  // through four device rounds, because nothing ever attempted the operation
  // that would have said so. The wizard is that attempt, made in front of the
  // user before they depend on it.
  await mount()
  await waitForText(/Setting up/)
  assert.match(text(), /Let the app hear you/, 'gate 1 is the microphone')
  assert.match(text(), /Step 1 of 4/)
})

test('the Record shortcut is never hijacked by set-up', async () => {
  /**
   * The two-icon design (§9) lives or dies on the shortcut cold-starting
   * straight into a recording, and that path was only just verified working on
   * device. Someone launching into /record is trying not to lose a thought;
   * an onboarding screen in front of it trades the app's one job for a form.
   * Set-up is still unseen at this point, so the redirect is live and must
   * decline to fire.
   */
  await go('#/record')
  await waitForText(/Cannot record|Tap = Record/)
  assert.doesNotMatch(text(), /Setting up/, 'setup must not intercept a capture')
})

test('set-up can be skipped, and skipping lands you in the inbox', async () => {
  await go('#/setup')
  await waitForText(/Setting up/)
  await click('Skip the rest')
  await waitForText(/Swipe RIGHT to file it/)
  assert.match(text(), /Inbox/, 'skipping leaves a usable app, not a dead end')
})

test('boots into the inbox with the first-run notes waiting', async () => {
  await mount()
  await waitForText(/Swipe RIGHT to file it/)

  assert.match(text(), /Inbox/, 'inbox header')
  assert.match(text(), /Swipe RIGHT to file it/, 'the teaching note is on screen')
  assert.match(text(), /2 waiting/, 'both seed notes counted')
  // Nav is always present.
  for (const tab of ['Inbox', 'Buckets', 'Search', 'Settings']) {
    assert.ok(button(tab), `${tab} tab exists`)
  }
})

test('the note renders as static text, not a textarea, so swipe can work', async () => {
  assert.equal(
    document.querySelector('textarea'),
    null,
    'no textarea until the pencil is pressed — that is what kills the gesture'
  )
  assert.ok(button('Fix the words'), 'the pencil toggle is there')
})

test('a note with no recording says so instead of quietly hiding the player', async () => {
  // Device test, 2026-08-01: "the play button is missing" was indistinguishable
  // from "this note never had audio", because the row simply was not rendered.
  // Absence is now stated out loud.
  assert.match(text(), /No recording attached to this note/)
})

test('the pencil toggle opens an editor and saves the corrected words', async () => {
  await click('Fix the words')
  const area = document.querySelector('textarea')
  assert.ok(area, 'edit mode gives a textarea')
  assert.match(text(), /Swiping is off while you edit/, 'swipe is explicitly disabled')

  const setter = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value').set
  await act(async () => {
    setter.call(area, 'corrected by hand')
    area.dispatchEvent(new win.Event('input', { bubbles: true }))
  })
  await click('Done editing')

  assert.equal(document.querySelector('textarea'), null, 'editor closes')
  assert.match(text(), /corrected by hand/, 'the correction stuck')
})

test('tapping a bucket files the note and offers an undo', async () => {
  await click('Doc')
  await flush(3)
  assert.match(text(), /Filed to Doc/, 'toast confirms')
  assert.ok(button('Undo'), 'undo is offered at full size')
  assert.match(text(), /1 waiting/, 'the inbox moved on to the next note')
})

test('undo puts the note back in the inbox', async () => {
  await click('Undo')
  await flush(3)
  assert.match(text(), /2 waiting/, 'back to two')
})

/** Waits out the stamp guard so a test starts with a live swipe surface. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, STAMP_GUARD_MS + 60))
  })
  await flush(2)
}

const waiting = () => Number(text().match(/(\d+) waiting/)?.[1] ?? 0)

test('a vertical drag scrolls and never files anything', async () => {
  await go('#/inbox')
  await settle()
  const before = waiting()
  const el = surface()
  await act(async () => {
    el.dispatchEvent(pointer('pointerdown', 200, 300))
  })
  for (const y of [340, 400, 460]) {
    await act(async () => {
      el.dispatchEvent(pointer('pointermove', 205, y))
    })
  }
  await act(async () => {
    el.dispatchEvent(pointer('pointerup', 205, 460))
  })
  await flush(2)
  assert.equal(waiting(), before, 'a scroll is not a swipe')
  assert.ok(!text().includes('File it where?'), 'and it did not open the picker')
})

test('swiping right opens the full-screen bucket picker', async () => {
  await settle()
  assert.ok(waiting() >= 2, 'two notes to work with')
  await swipe(180)
  assert.match(text(), /File it where\?/, 'swipe right asks where, it does not guess')
  await click('Close', { exact: false })
  await flush(2)
})

test('swiping left trashes one note — and the follow-through cannot take a second', async () => {
  await settle()
  const before = waiting()
  assert.ok(before >= 2, 'a second note is behind the first, so a slip would cost something')

  await swipe(-180)
  assert.match(text(), /Thrown away|Trashed/, 'stamped and toasted')
  const during = waiting()
  assert.equal(during, before - 1, 'exactly one note left the inbox')

  // The same flick's follow-through, while the stamp is still up.
  await swipe(-180)
  assert.equal(waiting(), during, 'the second swipe was swallowed by the stamp guard')
})

test('once the stamp lifts, the surface takes the next swipe', async () => {
  await settle()
  assert.ok(!text().includes('Trashed'), 'the stamp has lifted')
  const before = waiting()
  await swipe(-180)
  assert.equal(waiting(), before - 1, 'the guard released rather than latching')
})

test('the buckets grid shows every starting bucket', async () => {
  await go('#/buckets')
  for (const name of ['Temp', 'Reminders', 'Doc', 'Wife', 'Kid', 'Todo', 'Grocery', 'Notes', 'Thoughts']) {
    assert.match(text(), new RegExp(name), `${name} tile`)
  }
  assert.match(text(), /Trash/, 'trash is reachable but out of the way')
})

test('a bucket opens, takes a typed item, and crosses it off', async () => {
  await go('#/buckets/grocery')
  assert.match(text(), /Checklist/, 'grocery renders as a checklist')

  await typeInto('input[aria-label="Add to Grocery"]', 'Milk')
  await click('Add', { exact: true })
  assert.match(text(), /Milk/, 'the item is on the list')

  await click('Milk')
  await flush(2)
  assert.ok(button('Clear 1 finished'), 'clearing finished items is offered once something is done')

  await click('Clear 1 finished')
  await flush(3)
  assert.match(text(), /Archived 1/, 'archived, not deleted — history is clinical evidence')
  assert.match(text(), /Show history \(1\)/, 'and it is still findable')
})

test('typing a learned word offers it back as autocomplete', async () => {
  await typeInto('input[aria-label="Add to Grocery"]', 'mi')
  await flush(2)
  assert.ok(button('Milk', { exact: true }), '"mi" suggests "Milk" from what was filed before')
})

test('search finds a filed note and its bucket', async () => {
  await go('#/search')
  await typeInto('input[aria-label="Search your notes"]', 'milk')
  await flush(3)
  assert.match(text(), /Milk/, 'the archived item is still searchable')
  assert.match(text(), /Grocery/, 'and it says where it lives')
})

test('search filters do not crash and can be cleared', async () => {
  await click('Has voice')
  await flush(2)
  assert.match(text(), /Nothing matches|matches/, 'filtering ran')
  await click('Clear', { exact: false })
  await flush(2)
})

test('settings renders every group on one screen', async () => {
  await go('#/settings')
  for (const heading of [
    'Look',
    'Recording',
    'Microphone',
    'On your home screen',
    'Backup',
    'This app',
  ]) {
    assert.match(text(), new RegExp(heading), `${heading} section`)
  }
  assert.match(text(), /Until filed/, 'audio retention is a setting')
  assert.match(text(), /Ask me/)
  assert.match(text(), /Erase everything/)
})

test('the microphone panel offers permission state and a way to ask for it', async () => {
  assert.match(text(), /Microphone: /, 'current permission state is shown, not hidden')
  assert.ok(button('Allow the microphone'), 'asking happens from a real tap')
  assert.ok(button('Check microphone and speech'), 'the diagnostic is one tap away')
})

test('switching to paper mode changes the theme immediately', async () => {
  await click('Paper')
  await flush(2)
  assert.equal(document.documentElement.dataset.theme, 'sepia')
  assert.equal(
    document.querySelector('meta[name="theme-color"]').getAttribute('content'),
    '#E8DCC0',
    'the Android status bar follows the theme'
  )
  await click('Dark')
  await flush(2)
  assert.equal(document.documentElement.dataset.theme, 'dark')
})

test('the Record shortcut instructions are reachable in one tap', async () => {
  await click('Get the Record button on your home screen')
  await flush(2)
  assert.match(text(), /Press and hold the Quick Notes icon/)
  assert.match(text(), /Drag that Record shortcut/)
  await click('Close', { exact: false })
  await flush(2)
})

test('/record falls back to the full-screen button when the mic is unavailable', async () => {
  await go('#/record')
  await flush(4)
  // jsdom has no getUserMedia at all, which is the worst case.
  assert.match(text(), /Cannot record|Tap = Record/, 'a single full-screen button, not a dead end')
  assert.match(text(), /browser cannot record|microphone/i, 'and it says why in plain words')
  assert.ok(button('Back to notes'), 'there is always a way out')
})

test('a sheet survives its parent re-rendering repeatedly', async () => {
  /**
   * The device bug tests missed: Sheet's back-button effect listed `onClose` in
   * its deps, callers pass inline arrows, and the recording screen re-renders
   * five times a second from its timer. Cleanup ran on every tick —
   * history.back() fired popstate, popstate called onClose — so the confirm
   * dialog appeared and vanished instantly and Cancel never happened.
   *
   * This drives the same shape directly: open a sheet, force many parent
   * re-renders with a fresh onClose identity each time, and require it to still
   * be open afterwards.
   */
  const { default: Sheet } = await import('../src/components/Sheet.jsx')
  const holder = document.createElement('div')
  document.body.appendChild(holder)
  const sheetRoot = createRoot(holder)

  // Count history churn rather than waiting for a close. jsdom's back()/popstate
  // does not emulate the browser closely enough to reproduce the visible
  // symptom, but the CAUSE is exact and directly observable: with `onClose` in
  // the effect deps, the effect tears down and re-runs on every render, so
  // pushState fires once per render instead of once per open.
  const realPush = win.history.pushState.bind(win.history)
  let pushes = 0
  win.history.pushState = (...args) => {
    pushes++
    return realPush(...args)
  }

  let renders = 0
  function Harness() {
    // The PARENT owns `open` and closes on onClose — as Record does. Without
    // that the sheet can never close and the test passes on broken code, which
    // is exactly the mistake that let this ship.
    const [open, setOpen] = React.useState(true)
    const [, force] = React.useState(0)
    renders++
    React.useEffect(() => {
      if (renders < 12) force((n) => n + 1)
    })
    // New identity every render, exactly as the record screen does it.
    return (
      <Sheet open={open} onClose={() => setOpen(false)} title="Throw this away?">
        <p>body</p>
      </Sheet>
    )
  }

  await act(async () => {
    sheetRoot.render(<Harness />)
  })
  await flush(3)

  win.history.pushState = realPush

  assert.ok(renders >= 12, 'the parent really did re-render repeatedly')
  assert.match(holder.textContent || '', /Throw this away\?/, 'the sheet is still open')
  assert.equal(
    pushes,
    1,
    `the sheet pushed history ${pushes} times across ${renders} renders — it must be exactly 1, ` +
      'or the back-button effect is thrashing and will slam the sheet shut on a real device'
  )

  await act(async () => {
    sheetRoot.unmount()
  })
  holder.remove()
})

test('the record route takes over the whole screen — no bottom nav', async () => {
  assert.equal(button('Buckets'), null, 'nothing to press by accident while capturing')
})

test('a backup exports readable JSON and imports back', async () => {
  await go('#/settings')
  await flush(2)
  // Exercised directly: jsdom has no share sheet or download.
  const { buildBackup, serializeBackup, parseBackup } = await import('../src/lib/backup.js')
  const { getAll } = await import('../src/lib/db.js')
  const [notes, buckets, grocery] = await Promise.all([
    getAll('notes'),
    getAll('buckets'),
    getAll('grocery'),
  ])
  const json = serializeBackup(buildBackup({ notes, buckets, grocery, settings: {} }))
  assert.match(json, /"bucket": "Grocery"/)
  assert.match(json, /"text": "Milk"/)
  const back = parseBackup(json)
  assert.ok(back.notes.some((n) => n.transcript === 'Milk'))
})

/* ------------------------------------------- the microphone instrument */

/**
 * Fake media stack. Returns the constraint objects getUserMedia was actually
 * asked for, which is the only thing these two tests care about.
 */
function installFakeMedia({ failGetUserMedia = false } = {}) {
  const asked = []
  const stream = { getTracks: () => [{ stop() {} }] }
  Object.defineProperty(win.navigator, 'mediaDevices', {
    value: {
      getUserMedia: async (constraints) => {
        asked.push(constraints.audio)
        if (failGetUserMedia) {
          const err = new Error('busy')
          err.name = 'NotReadableError'
          throw err
        }
        return stream
      },
    },
    configurable: true,
  })
  class FakeMediaRecorder {
    static isTypeSupported() {
      return true
    }
    constructor() {
      this.state = 'inactive'
    }
    start() {
      this.state = 'recording'
      setTimeout(() => this.ondataavailable?.({ data: new Blob(['x'.repeat(64)]) }), 0)
    }
    requestData() {}
    stop() {
      this.state = 'inactive'
      setTimeout(() => this.onstop?.(), 0)
    }
  }
  define('MediaRecorder', FakeMediaRecorder)
  win.MediaRecorder = FakeMediaRecorder
  return asked
}

/** Cache Storage stand-in, so the queue can be watched deciding it is evicted. */
function installFakeModelCache(urls) {
  const entries = new Set(urls)
  globalThis.caches = {
    keys: async () => ['transformers-cache'],
    open: async () => ({
      keys: async () => [...entries].map((url) => ({ url })),
      match: async () => null,
      delete: async (req) => entries.delete(req.url),
    }),
    delete: async () => true,
  }
}

function uninstallFakeMedia() {
  Object.defineProperty(win.navigator, 'mediaDevices', { value: undefined, configurable: true })
  define('MediaRecorder', undefined)
  win.MediaRecorder = undefined
}

test('the microphone check opens the mic the way the app actually does', async () => {
  /**
   * The instrument bug: steps 5 and 7 built a Recorder with no audioProfile, so
   * they always tested `processed`. Once the sweep has applied `raw`, the check
   * a user runs — and copies to us — is measuring a configuration the app is
   * not using. On one handset that is a nuisance; as the self-correcting
   * hardware check for everyone else who installs this, it is a wrong answer
   * delivered with confidence.
   */
  FakeSpeechRecognition.reset(10)
  const asked = installFakeMedia()
  try {
    const { runDiagnostics } = await import('../src/lib/diagnostics.js')
    const rows = await runDiagnostics({ audioProfile: 'raw' })

    assert.ok(asked.length >= 2, `expected the mic to be opened at least twice, got ${asked.length}`)
    for (const constraints of asked) {
      assert.equal(
        constraints.echoCancellation,
        false,
        `the check opened the mic with echoCancellation=${constraints.echoCancellation} while the ` +
          'app is set to raw — it is testing a configuration the app does not use'
      )
    }
    assert.ok(
      rows.some((r) => r.id === 'speech-with-recorder'),
      'the decisive step still runs'
    )
  } finally {
    uninstallFakeMedia()
  }
})

test('a sweep combination that cannot open the recorder leaves no recogniser running', async () => {
  /**
   * Speech-first combinations hand the microphone to the speech service first.
   * If the recorder then fails to open, the probe was abandoned un-stopped: a
   * live recogniser carried into the next combination, which would report that
   * contamination as its own result. The 700 ms settle between combinations
   * does not cover it — nothing was ever told to stop.
   *
   * Auto-end is off here on purpose. A recogniser that cleans itself up after
   * 10 ms would make a leaked one invisible, and this test would pass against
   * the bug.
   */
  FakeSpeechRecognition.reset(0)
  installFakeMedia({ failGetUserMedia: true })
  try {
    const { findMicCombination } = await import('../src/lib/diagnostics.js')
    const results = await findMicCombination()

    assert.equal(results.length, 4, 'every combination was attempted')
    assert.ok(
      results.every((r) => !r.ok),
      'nothing can pass when the recorder will not open'
    )
    assert.equal(
      FakeSpeechRecognition.live,
      0,
      `${FakeSpeechRecognition.live} recogniser(s) still running after the sweep — each one is ` +
        'holding the microphone through the combinations that follow it'
    )
  } finally {
    uninstallFakeMedia()
    FakeSpeechRecognition.reset(10)
  }
})

test('a capture made during a session is picked up without a relaunch', async () => {
  /**
   * The round-5 regression, and the one that mattered: notes were marked
   * 'pending' by addCapture and nothing ever told the queue. The only triggers
   * were app launch, a manual retry, and finishing a download — so a recording
   * made during a session waited for the next cold start to be written up. On
   * device that read as "3 waiting, oldest 3 minutes ago", forever.
   *
   * Observed here through the eviction path: with no model in the cache the
   * queue marks the note 'blocked'. Reaching 'blocked' at all proves the queue
   * ran, and it ran without anything remounting.
   */
  const { useStore } = await import('../src/lib/store.jsx')
  installFakeModelCache([])

  const holder = document.createElement('div')
  document.body.appendChild(holder)
  const probeRoot = createRoot(holder)
  let api = null
  function Probe() {
    api = useStore()
    return null
  }

  await act(async () => {
    probeRoot.render(
      <RouterProvider>
        <StoreProvider>
          <Probe />
        </StoreProvider>
      </RouterProvider>
    )
  })
  await flush(4)

  await act(async () => {
    await api.setSetting('whisperEnabled', true)
  })

  let note = null
  await act(async () => {
    note = await api.addCapture({ blob: new Blob(['x'.repeat(64)]), duration: 4000 })
  })
  assert.equal(note.transcribeState, 'pending', 'a capture with audio enters the queue')

  // Wait for a settled state. 'running' is not one — it is the queue having
  // started, which is most of what this test is about, but a note parked in
  // 'running' forever is the very failure being guarded against.
  const deadline = Date.now() + 8000
  let seen = null
  while (Date.now() < deadline) {
    seen = api.notes.find((n) => n.id === note.id)?.transcribeState
    if (seen === 'blocked' || seen === 'failed' || seen === 'done') break
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25))
    })
  }
  assert.equal(
    seen,
    'blocked',
    `expected the queue to run and park the note as 'blocked'; it sat at '${seen}' instead ` +
      `[ready=${api.ready} enabled=${api.settings.whisperEnabled}]`
  )

  await act(async () => {
    probeRoot.unmount()
  })
  holder.remove()
  delete globalThis.caches
})

test('nothing logged a console error the whole way through', () => {
  assert.deepEqual(consoleErrors, [], `console errors:\n${consoleErrors.join('\n')}`)
})
