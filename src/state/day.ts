import { useEffect } from 'react'
import { todayKey } from '../lib/dates'
import { getState, setState } from './store'

/**
 * Keeps `today` in the store right: at midnight, and whenever the tab or window comes back, since
 * timers sleep in a background tab. Without it a tab left open overnight shows yesterday as Today.
 */
export function useDayRollover() {
  useEffect(() => {
    const sync = () => {
      const today = todayKey()
      if (getState().today !== today) setState({ today })
    }
    let timer: ReturnType<typeof setTimeout>
    const arm = () => {
      const now = new Date()
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      timer = setTimeout(() => {
        sync()
        arm()
      }, midnight.getTime() - now.getTime() + 1000)
    }
    sync()
    arm()
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])
}
