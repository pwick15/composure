import { motion } from 'motion/react'
import { useMemo } from 'react'
import { keepFocus, SNAP } from '../lib/motion'
import { live, planQueue, todayList, todayProgress, visibleInDump } from '../lib/selectors'
import { leaves } from '../lib/tree'
import type { Mode } from '../lib/types'
import { openPalette, setMode, toggleHelp } from '../state/actions'
import { useStore } from '../state/store'
import { FocusPill } from './FocusPill'
import { Kbd } from './Kbd'

// The Archive is not a tab: reach it with ⇧5 or by searching for it, and ⌫ comes back.
const TABS: { mode: Mode; label: string; key: string }[] = [
  { mode: 'dump', label: 'Dump', key: 'shift+1' },
  { mode: 'sort', label: 'Sort', key: 'shift+2' },
  { mode: 'plan', label: 'Plan', key: 'shift+3' },
  { mode: 'today', label: 'Today', key: 'shift+4' },
]

export function TopBar() {
  const mode = useStore((s) => s.mode)
  const items = useStore((s) => s.items)
  const showPlanned = useStore((s) => s.showPlanned)
  const key = useStore((s) => s.today)

  const counts = useMemo(() => {
    const kept = live(items)
    // Dump counts what it lists, so the number matches the rows you see.
    const shown = visibleInDump(items, showPlanned).length
    const unsorted = leaves(kept).filter((i) => !i.quadrant).length
    const unplanned = planQueue(items, key).length
    const today = todayList(items, key)
    return {
      dump: shown ? String(shown) : '',
      sort: kept.length ? (unsorted ? `${unsorted} left` : '✓') : '',
      plan: kept.length ? (unplanned ? `${unplanned} left` : '✓') : '',
      today: today.length ? `${today.length} left` : todayProgress(items, key).done ? '✓' : '',
    }
  }, [items, showPlanned, key])

  return (
    <header className="topbar">
      <div className="brand" aria-label="Composure">
        <span className="brand__mark" aria-hidden />
        <span className="brand__name">composure</span>
      </div>

      <nav className="tabs" role="tablist" aria-label="Mode">
        {TABS.map((t) => {
          const active = mode === t.mode
          return (
            <button
              key={t.mode}
              role="tab"
              aria-selected={active}
              className="tab"
              data-active={active}
              onMouseDown={keepFocus}
              onClick={() => setMode(t.mode)}
            >
              {active && <motion.span layoutId="tab-bg" className="tab__bg" transition={SNAP} />}
              <Kbd k={t.key} size="xs" className="tab__key" />
              <span className="tab__label">{t.label}</span>
              {counts[t.mode as keyof typeof counts] && <span className="tab__count">{counts[t.mode as keyof typeof counts]}</span>}
            </button>
          )
        })}
      </nav>

      <div className="topbar__actions">
        <FocusPill />
        <button className="ghost-btn" onMouseDown={keepFocus} onClick={() => openPalette()}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.5" />
            <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="ghost-btn__label">Search</span>
          <Kbd k="mod+f" size="xs" />
        </button>
        <button className="ghost-btn ghost-btn--icon" onMouseDown={keepFocus} onClick={toggleHelp} aria-label="How it works, and every key" title="How it works (?)">
          <Kbd k="?" size="xs" />
        </button>
      </div>
    </header>
  )
}
