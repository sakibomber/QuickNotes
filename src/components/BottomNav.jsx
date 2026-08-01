/**
 * Bottom navigation — four tabs, always visible.
 * Prototype finding (spec §3): the nav must never scroll away. The app is
 * locked to the viewport and only the content region scrolls.
 */

import { useRouter } from '../lib/router.jsx'
import { useStore } from '../lib/store.jsx'
import Icon from './Icon.jsx'

const TABS = [
  { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'buckets', label: 'Buckets', icon: 'buckets' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

export default function BottomNav() {
  const { route, navigate } = useRouter()
  const { inboxNotes } = useStore()
  const badge = inboxNotes.length

  return (
    <nav className="safe-b z-30 shrink-0 border-t border-line bg-bg2">
      <div className="mx-auto flex max-w-lg">
        {TABS.map((tab) => {
          const active = route.name === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigate(tab.id)}
              aria-current={active ? 'page' : undefined}
              className={[
                'press focus-ring relative flex min-h-[3.75rem] flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1',
                active ? 'text-accent' : 'text-muted',
              ].join(' ')}
            >
              <span className="relative">
                <Icon name={tab.icon} size={25} strokeWidth={active ? 2.1 : 1.7} />
                {tab.id === 'inbox' && badge > 0 && (
                  <span
                    className="absolute -top-2 -right-3 min-w-[1.25rem] rounded-full bg-stamp px-1 text-center text-[0.68rem] font-bold leading-5 text-ondanger"
                    aria-label={`${badge} waiting`}
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span className="stamp-label text-[0.62rem]">{tab.label}</span>
              {active && (
                <span className="absolute inset-x-5 top-0 h-[3px] rounded-b bg-accent" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
