// dismissOnboardingModals 控制流单测：①就绪信号双模（B1）——主界面就绪锚在场即秒级即返；
// ②1.7 墙钟治理——收起后模态不再复挂 = 即退（旧行为每次缺席都重开全窗盲等，全量套件
// 每 boot 白付 ~30s，152/164 用例实测）。
// 纯 Node 面：Page 以桩承载（locator 按选择器分流——就绪锚与收起按钮各持 isVisible 脚本化
// 在场队列；click 改写在场 + 真实短窗）。
import { describe, expect, it, vi } from 'vitest'
import type { Page } from '@playwright/test'
import { dismissOnboardingModals } from './modals.js'

/** 在场脚本桩：isVisible 按序消费布尔队列（耗尽后停末值）；click 收起在场 */
function stubLocator(presentScript: boolean[], onClick?: () => void): { isVisible: () => Promise<boolean>; click: () => Promise<void> } {
  let index = 0
  return {
    isVisible: vi.fn(() => {
      const value = presentScript[Math.min(index, presentScript.length - 1)]
      index++
      return Promise.resolve(value)
    }),
    click: vi.fn(() => {
      onClick?.()
      return Promise.resolve(undefined)
    }),
  }
}

/** Page 桩：选择器分流——含 data-dswf-phase 的是就绪锚，其余视为收起按钮 */
function stubPage(buttonScript: boolean[], readyScript: boolean[]): { page: Page; clicks: () => number } {
  let clicks = 0
  const button = stubLocator(buttonScript, () => {
    clicks++
    buttonScript.fill(false)
  })
  const ready = stubLocator(readyScript)
  const page = {
    locator: vi.fn((selector: string) => ({
      first: () => (selector.includes('data-dswf-phase') ? ready : button),
    })) as unknown as Page,
    waitForTimeout: vi.fn(() => new Promise((r) => setTimeout(r, 20))),
  } as unknown as Page
  return { page, clicks: () => clicks }
}

describe('dismissOnboardingModals', () => {
  it('B1 双模：就绪锚在场 + 晚挂载观测窗净空 → 秒级即返零点击（真机校准：无凭据模态可晚于锚 ~2s 挂载）', async () => {
    const { page, clicks } = stubPage([false], [true])
    const log: string[] = []
    vi.spyOn(console, 'log').mockImplementation((msg) => log.push(String(msg)))
    const start = Date.now()
    await dismissOnboardingModals(page, 5_000, 15_000, 300)
    expect(clicks()).toBe(0)
    expect(Date.now() - start).toBeLessThan(4_000)
    expect(log.join('\n')).toContain('即返')
    vi.mocked(console.log).mockRestore()
  })

  it('B1 双模：晚挂载观测窗内模态真实出现 → 收起后即退（零凭据形态）', async () => {
    const { page, clicks } = stubPage([false, false, false, true, false], [true])
    const start = Date.now()
    await dismissOnboardingModals(page, 30_000, 15_000, 2_000)
    expect(clicks()).toBe(1)
    expect(Date.now() - start).toBeLessThan(5_000)
  })

  it('B1 双模：就绪锚窗内晚到（settling 收敛）→ 锚在场 + 观测窗净空即返，不等盲等窗', async () => {
    const { page, clicks } = stubPage([false], [false, false, true])
    const start = Date.now()
    await dismissOnboardingModals(page, 30_000, 15_000, 300)
    expect(clicks()).toBe(0)
    expect(Date.now() - start).toBeLessThan(4_000)
  })

  it('B1 双模：就绪信号超时（异常形态）→ 回退既有盲等窗，留痕后满窗返回', async () => {
    const { page, clicks } = stubPage([false], [false])
    const log: string[] = []
    vi.spyOn(console, 'log').mockImplementation((msg) => log.push(String(msg)))
    const start = Date.now()
    await dismissOnboardingModals(page, 1_000, 500)
    expect(clicks()).toBe(0)
    expect(Date.now() - start).toBeGreaterThanOrEqual(1_400) // 500ms 就绪窗 + 1s 回退盲等窗
    expect(log.join('\n')).toContain('就绪信号超时')
    expect(log.join('\n')).toContain('窗口期内无 API Key onboarding')
    vi.mocked(console.log).mockRestore()
  })

  it('就绪锚预检：模态已早挂载（settling 期）→ 收起一次后即退', async () => {
    const { page, clicks } = stubPage([true, false], [true])
    const start = Date.now()
    await dismissOnboardingModals(page, 5_000)
    expect(clicks()).toBe(1)
    expect(Date.now() - start).toBeLessThan(4_000)
  })

  it('收起成功后模态不再复挂 → 立即返回（不重开全窗盲等）', async () => {
    const { page, clicks } = stubPage([true, false], [false])
    const start = Date.now()
    await dismissOnboardingModals(page, 5_000)
    expect(clicks()).toBe(1)
    expect(Date.now() - start).toBeLessThan(4_000)
  })

  it('首轮缺席 → 等满窗口留痕返回（晚挂载观测窗保留）', async () => {
    const { page, clicks } = stubPage([false], [false])
    const log: string[] = []
    vi.spyOn(console, 'log').mockImplementation((msg) => log.push(String(msg)))
    const start = Date.now()
    await dismissOnboardingModals(page, 1_000, 1)
    expect(clicks()).toBe(0)
    expect(Date.now() - start).toBeGreaterThanOrEqual(900)
    expect(log.join('\n')).toContain('窗口期内无 API Key onboarding')
    vi.mocked(console.log).mockRestore()
  })

  it('窗口期内晚挂载 → 收起一次后即退', async () => {
    const { page, clicks } = stubPage([false, false, false, true, true, true, false], [false])
    const start = Date.now()
    await dismissOnboardingModals(page, 30_000, 1)
    expect(clicks()).toBe(1)
    expect(Date.now() - start).toBeLessThan(10_000)
  })
})
