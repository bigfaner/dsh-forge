/**
 * 官方复制件（PROVENANCE 逐文件锚）：源位 ui-chat/src/client/chat/use-calendar-day.ts
 * @ deepseek-harness 0.2.0-rc.2（repo f059f01ce367748392d8f665c0705fb4302a626b，复制日期 2026-10-22）；适配：相对 import 后缀 .ts→.js，体逐字未改。
 */
// Component-local calendar-day tick: memoized message rows keep stable props
// across midnight, so the IconActions clock needs a local day seat that
// re-fires at the next local midnight without reaching for framework hooks.

import { useEffect, useState } from 'react'
import { msUntilNextLocalMidnight, startOfLocalDay } from './message-chrome.js'

/**
 * Local calendar-day epoch that advances at each local midnight.
 * @returns Midnight ms for the current local day; updates after the boundary.
 */
export function useCalendarDay(): number {
  const [day, setDay] = useState(() => startOfLocalDay(Date.now()))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const arm = (): void => {
      const now = Date.now()
      setDay(startOfLocalDay(now))
      timer = setTimeout(arm, msUntilNextLocalMidnight(now))
    }
    timer = setTimeout(arm, msUntilNextLocalMidnight(Date.now()))
    return () => { clearTimeout(timer) }
  }, [])
  return day
}
