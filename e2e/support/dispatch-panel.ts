// 派发悬浮面板交互助手——specs 共享（sc6-session-links / task-session-linkage 同款展开步骤）
import { expect, type Page } from '@playwright/test'
import { DP_BADGE, DP_PANEL } from './anchors.js'

/** 展开派发面板（fix bug 570fa4e2：默认折叠悬浮球——行/面板断言前先点 ⟡N 展开） */
export async function expandDispatchPanel(page: Page): Promise<void> {
  const badge = page.locator(DP_BADGE).first()
  await expect(badge, '默认折叠悬浮球在场（不默认展开遮挡消息）').toBeVisible({ timeout: 30_000 })
  await expect(page.locator(DP_PANEL), '默认零展开面板（悬浮球形态）').toHaveCount(0)
  await badge.click()
}
