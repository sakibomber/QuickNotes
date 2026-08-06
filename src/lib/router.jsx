/**
 * Hash router — 60 lines, no dependency.
 *
 * Hash routing is deliberate: the manifest shortcut deep-links to `./#/record`,
 * which works on any static host with no rewrite rules and no server config,
 * and it still fires a `hashchange` when Android focuses an already-open PWA
 * window rather than cold-starting it.
 */

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'

const RouteContext = createContext(null)

export const ROUTES = ['inbox', 'buckets', 'search', 'settings', 'record', 'setup']

function parse(hash) {
  const raw = (hash || '').replace(/^#\/?/, '')
  const [pathPart, queryPart] = raw.split('?')
  const parts = pathPart.split('/').filter(Boolean)
  const name = ROUTES.includes(parts[0]) ? parts[0] : 'inbox'
  const params = new URLSearchParams(queryPart || '')
  return { name, parts, param: parts[1] ? decodeURIComponent(parts[1]) : null, params }
}

export function RouterProvider({ children }) {
  const [hash, setHash] = useState(() => window.location.hash)
  // Bumped on every navigation, including a repeat of the same route, so the
  // Record screen can re-arm when the shortcut is tapped twice.
  const [nav, setNav] = useState(0)

  useEffect(() => {
    const onHashChange = () => {
      setHash(window.location.hash)
      setNav((n) => n + 1)
    }
    window.addEventListener('hashchange', onHashChange)
    if (!window.location.hash) window.location.replace('#/inbox')
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const route = useMemo(() => parse(hash), [hash])

  const navigate = useCallback((to, { replace = false } = {}) => {
    const next = to.startsWith('#') ? to : `#/${to.replace(/^\/+/, '')}`
    if (window.location.hash === next) {
      setNav((n) => n + 1)
      return
    }
    if (replace) window.location.replace(next)
    else window.location.hash = next
  }, [])

  const value = useMemo(() => ({ route, navigate, nav }), [route, navigate, nav])
  return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>
}

export function useRouter() {
  const ctx = useContext(RouteContext)
  if (!ctx) throw new Error('useRouter must be used inside RouterProvider')
  return ctx
}
