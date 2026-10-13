// dismissOnboardingModals 控制流单测（1.7 墙钟治理）：收起后模态不再复挂 = 即退
// （旧行为每次缺席都重开全窗盲等——全量套件每 boot 白付 ~30s，152/164 用例实测）。
// 纯 Node 面：Page 以桩承载（locator.isVisible 脚本化在场队列 + click 改写在场 + 真实短窗）。
import { describe, expect, it, vi } from 'vitest'
import type { Page } from '@playwright/test'
import { dismissOnboardingModals } from './modals.js'

/** 在场脚本桩：isVisible 按序消费布尔队列（耗尽后停末值）；click 收起在场 */
function stubPage(presentScript: boolean[]): { page: Page; clicks: () => number } {
  let index = 0
  let clicks = 0
  const button = {
    isVisible: vi.fn(() => {
      const value = presentScript[Math.min(index, presentScript.length - 1)]
      index++
      return Promise.resolve(value)
    }),
    click: vi.fn(() => {
      clicks++
      presentScript[Math.min(index, presentScript.length - 1)] = false
      return Promise.resolve(undefined)
    }),
  }
  const page = {
    locator: vi.fn(() => ({ first: () => button })),
    waitForTimeout: vi.fn(() => new Promise((r) => setTimeout(r, 20))),
  } as unknown as Page
  return { page, clicks: () => clicks }
}

describe('dismissOnboardingModals', () => {
  it('收起成功后模态不再复挂 → 立即返回（不重开全窗盲等）', async () => {
    const { page, clicks } = stubPage([true, false])
    const start = Date.now()
    await dismissOnboardingModals(page, 5_000)
    expect(clicks()).toBe(1)
    expect(Date.now() - start).toBeLessThan(4_000)
  })

  it('首轮缺席 → 等满窗口留痕返回（晚挂载观测窗保留）', async () => {
    const { page, clicks } = stubPage([false])
    const log: string[] = []
    vi.spyOn(console, 'log').mockImplementation((msg) => log.push(String(msg)))
    const start = Date.now()
    await dismissOnboardingModals(page, 1_000)
    expect(clicks()).toBe(0)
    expect(Date.now() - start).toBeGreaterThanOrEqual(900)
    expect(log.join('\n')).toContain('窗口期内无 API Key onboarding')
    vi.mocked(console.log).mockRestore()
  })

  it('窗口期内晚挂载 → 收起一次后即退', async () => {
    const { page, clicks } = stubPage([false, false, false, true, true, true, false])
    const start = Date.now()
    await dismissOnboardingModals(page, 30_000)
    expect(clicks()).toBe(1)
    expect(Date.now() - start).toBeLessThan(10_000)
  })
})
