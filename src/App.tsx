import { motion, MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import { CommandPalette } from './components/CommandPalette'
import { KeystrokeHUD } from './components/KeystrokeHUD'
import { ShortcutSheet } from './components/ShortcutSheet'
import { StatusBar } from './components/StatusBar'
import { Toasts } from './components/Toasts'
import { TopBar } from './components/TopBar'
import { useGlobalKeys } from './keyboard/useGlobalKeys'
import { SPRING } from './lib/motion'
import { DumpMode } from './modes/DumpMode'
import { PlanMode } from './modes/PlanMode'
import { SortMode } from './modes/SortMode'
import { useStore } from './state/store'

const VIEWS = { dump: DumpMode, sort: SortMode, plan: PlanMode }

export default function App() {
  const mode = useStore((s) => s.mode)
  const theme = useStore((s) => s.theme)
  useGlobalKeys()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const View = VIEWS[mode]

  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      <div className="app">
        <TopBar />
        <main className="stage">
          <motion.div
            key={mode}
            className="stage__view"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <View />
          </motion.div>
        </main>
        <StatusBar />
        <KeystrokeHUD />
        <Toasts />
        <CommandPalette />
        <ShortcutSheet />
      </div>
    </MotionConfig>
  )
}
