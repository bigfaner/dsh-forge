// e2e 官方首启引导模态处置（fix-37 ① 收编）——统一 30s 窗（两值并存终结）。
//
// 形态取舍（注）：p1mvp 侧 30s 轮询窗（模态挂载可晚于工作台可见数十秒——kit 收敛期，
// 15s 窗实测漏收）；旧 specs 侧 15s 窗/单发探测两态已废。窗口期届满 = 视为
// 「无 API Key onboarding」（provider 叠层预免/凭据在场的确定形态）——留痕返回
// （console 记账，不臆造失败：叠层预免链路 modal 恒不挂载属预期态）。
// 「预览版说明」预免 = 产品 boot overlay 内置（fix-12），本面只收 API Key onboarding。
import type { Page } from '@playwright/test'

/** 运行期模态收起（API Key onboarding「稍后配置」本地收起；轮询窗 30s，至多 3 轮） */
export async function dismissOnboardingModals(page: Page, windowMs = 30_000): Promise<void> {
  const deadline = Date.now() + windowMs
  for (let dismissed = 0; dismissed < 3; dismissed++) {
    const dismissButton = page.locator('[role="dialog"] button', { hasText: /^稍后配置$/ }).first()
    while (!(await dismissButton.isVisible().catch(() => false))) {
      if (Date.now() > deadline) {
        // 留痕（不失败）：窗口期内无模态 = provider 叠层预免/凭据在场的确定形态
        console.log(`[dismiss-onboarding] ${String(windowMs)}ms 窗口期内无 API Key onboarding——预免/在场凭据形态（留痕）`)
        return
      }
      await page.waitForTimeout(500)
    }
    await dismissButton.click({ timeout: 10_000 })
    await page.waitForTimeout(1_000)
  }
}

/** UI 走查前置防复发：模态若在收起后再度挂载（晚到），点掉再走（点击面防拦截） */
export async function ensureNoBlockingDialog(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const dismissButton = page.locator('[role="dialog"] button', { hasText: /^稍后配置$|^继续$/ }).first()
    if (!(await dismissButton.isVisible().catch(() => false))) return
    await dismissButton.click({ timeout: 10_000 })
    await page.waitForTimeout(1_000)
  }
}
