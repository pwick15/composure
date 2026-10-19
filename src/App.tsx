import { motion, MotionConfig } from 'motion/react'
import { useEffect, useState } from 'react'
import { CommandPalette } from './components/CommandPalette'
import { Help } from './components/Help'
import { KeystrokeHUD } from './components/KeystrokeHUD'
import { SessionDriver } from './components/SessionDriver'
import { StatusBar } from './components/StatusBar'
import { ThoughtSheet } from './components/ThoughtSheet'
import { Toasts } from './components/Toasts'
import { TopBar } from './components/TopBar'
import { useGlobalKeys } from './keyboard/useGlobalKeys'
import { SPRING } from './lib/motion'
import { ArchiveMode } from './modes/ArchiveMode'
import { DumpMode } from './modes/DumpMode'
import { PlanMode } from './modes/PlanMode'
import { SortMode } from './modes/SortMode'
import { TodayMode } from './modes/TodayMode'
import { useDayRollover } from './state/day'
import { useStore } from './state/store'

const VIEWS = { dump: DumpMode, sort: SortMode, plan: PlanMode, today: TodayMode, archive: ArchiveMode }
const ORDER = ['dump', 'sort', 'plan', 'today', 'archive']

export default function App() {
  const mode = useStore((s) => s.mode)
  const theme = useStore((s) => s.theme)
  const focusing = useStore((s) => s.mode === 'today' && s.run?.phase === 'running')
  useGlobalKeys()
  useDayRollover()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const View = VIEWS[mode]

  // Screens sit side by side: moving right slides the next one in from the right.
  const [prevMode, setPrevMode] = useState(mode)
  const [dir, setDir] = useState(0)
  if (prevMode !== mode) {
    setDir(Math.sign(ORDER.indexOf(mode) - ORDER.indexOf(prevMode)))
    setPrevMode(mode)
  }

  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      <div className="app" data-focusing={focusing || undefined}>
        <TopBar />
        <main className="stage">
          <motion.div
            key={mode}
            className="stage__view"
            initial={{ opacity: 0, x: dir * 28, y: dir ? 0 : 6 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <View />
          </motion.div>
        </main>
        <StatusBar />
        <KeystrokeHUD />
        <SessionDriver />
        <Toasts />
        <CommandPalette />
        <ThoughtSheet />
        <Help />
      </div>
    </MotionConfig>
  )
}
