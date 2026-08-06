/**
 * App shell.
 *
 * The whole app is locked to the viewport: header, one scrolling region, and a
 * bottom nav that never moves (spec §3, prototype findings). /record is the one
 * route that takes over the entire screen — no nav, no distractions.
 */

import { useEffect } from 'react'
import { useRouter } from './lib/router.jsx'
import { useStore } from './lib/store.jsx'
import BottomNav from './components/BottomNav.jsx'
import Toast from './components/Toast.jsx'
import Icon from './components/Icon.jsx'
import Inbox from './screens/Inbox.jsx'
import Buckets from './screens/Buckets.jsx'
import BucketDetail from './screens/BucketDetail.jsx'
import Search from './screens/Search.jsx'
import SettingsScreen from './screens/Settings.jsx'
import Record from './screens/Record.jsx'
import Setup from './screens/Setup.jsx'

export default function App() {
  const { route, navigate } = useRouter()
  const { ready, bootError, settings } = useStore()

  /**
   * First run goes to setup — but never at the cost of a capture.
   *
   * /record is excluded explicitly. The Record shortcut cold-start is the
   * whole two-icon design (§9) and it is verified working; a wizard that
   * intercepts it would trade the app's one job for an onboarding screen.
   * Someone launching straight into Record is trying not to lose a thought,
   * and setup can wait until they are done.
   */
  useEffect(() => {
    if (!ready || bootError) return
    if (settings.setupState !== 'unseen') return
    if (route.name === 'record' || route.name === 'setup') return
    navigate('#/setup', { replace: true })
  }, [ready, bootError, settings.setupState, route.name, navigate])

  // Belt and braces against a rubber-banding page behind the fixed layout.
  useEffect(() => {
    const stop = (e) => {
      if (e.touches.length > 1) e.preventDefault()
    }
    document.addEventListener('touchmove', stop, { passive: false })
    return () => document.removeEventListener('touchmove', stop)
  }, [])

  if (!ready) return <Splash />
  if (bootError) return <BootFailure error={bootError} />

  if (route.name === 'record') {
    return (
      <div className="h-full">
        <Record />
        <Toast />
      </div>
    )
  }

  // Full screen, no nav: setup is a sequence, and a tab bar invites leaving it
  // half done. Every step still has its own way out.
  if (route.name === 'setup') {
    return (
      <div className="h-full">
        <Setup />
        <Toast />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <main className="flex min-h-0 flex-1 flex-col">
        {route.name === 'inbox' && <Inbox />}
        {route.name === 'buckets' &&
          (route.param ? <BucketDetail bucketId={route.param} key={route.param} /> : <Buckets />)}
        {route.name === 'search' && <Search />}
        {route.name === 'settings' && <SettingsScreen />}
      </main>
      <Toast />
      <BottomNav />
    </div>
  )
}

function Splash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 bg-bg text-center">
      <span className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-accent text-accent">
        <Icon name="note" size={44} strokeWidth={1.7} />
      </span>
      <div>
        <div className="stamp-label text-[1.4rem] text-ink">Quick Notes</div>
        <div className="stamp-label mt-1.5 text-[0.72rem] text-faint">
          Capture. File. Remember.
        </div>
      </div>
    </div>
  )
}

function BootFailure({ error }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-danger text-danger">
        <Icon name="warning" size={40} />
      </span>
      <h1 className="stamp-label text-[1.1rem] text-ink">Could not open your notes</h1>
      <p className="max-w-sm text-[0.95rem] leading-relaxed text-muted">
        The phone would not let the app open its storage. This usually clears up if you close the
        app fully and open it again. Private browsing windows also block it.
      </p>
      <p className="font-mono text-[0.72rem] break-all text-faint">{String(error?.message || error)}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="press focus-ring min-h-14 rounded-xl border border-line bg-surface2 px-6 text-[0.95rem]"
      >
        Try again
      </button>
    </div>
  )
}
