// e2e 官方首启引导模态处置（fix-37 ① 收编）——统一 30s 窗（两值并存终结）。
//
// 形态取舍（注）：p1mvp 侧 30s 轮询窗（模态挂载可晚于工作台可见数十秒——kit 收敛期，
// 15s 窗实测漏收）；旧 specs 侧 15s 窗/单发探测两态已废。窗口期届满 = 视为
// 「无 API Key onboarding」（provider 叠层预免/凭据在场的确定形态）——留痕返回
// （console 记账，不臆造失败：叠层预免链路 modal 恒不挂载属预期态）。
// 「预览版说明」预免 = 产品 boot overlay 内置（fix-12），本面只收 API Key onboarding。
import type { Page } from '@playwright/test'

/** 运行期模态收起（API Key onboarding「稍后配置」本地收起；首轮缺席保留 windowMs 晚挂载窗）
 *
 *  1.7 墙钟治理（worker-exec-evidence-replay）：旧形态「至多 3 轮、每轮缺席都重开全窗」——
 *  收起成功后的第 2 轮必然缺席并盲等满窗，全量套件每 boot 白付 ~30s（006-final-full 实测
 *  152/164 用例命中「窗口期内无」留痕 + ~53s plateau）。现行为：首轮缺席保留原窗（kit 收敛期
 *  晚挂载观测窗不动）；任一次收起后再缺席 = 收起态稳定，立即返回——复挂兜底归
 *  ensureNoBlockingDialog（spec 走查前置防复发面），行为语义不变。
 */
export async function dismissOnboardingModals(page: Page, windowMs = 30_000): Promise<void> {
  let dismissed = 0
  for (;;) {
    const dismissButton = page.locator('[role="dialog"] button', { hasText: /^稍后配置$/ }).first()
    if (await dismissButton.isVisible().catch(() => false)) {
      await dismissButton.click({ timeout: 10_000 })
      dismissed++
      await page.waitForTimeout(1_000)
      if (dismissed >= 3) return // 旧 3 轮上限保留（复挂失控防环）
      continue
    }
    if (dismissed > 0) return // 收起后不再复挂——即退（省全窗盲等）
    const deadline = Date.now() + windowMs
    while (Date.now() < deadline && !(await dismissButton.isVisible().catch(() => false))) {
      await page.waitForTimeout(500)
    }
    if (await dismissButton.isVisible().catch(() => false)) continue
    // 留痕（不失败）：窗口期内无模态 = provider 叠层预免/凭据在场的确定形态
    console.log(`[dismiss-onboarding] ${String(windowMs)}ms 窗口期内无 API Key onboarding——预免/在场凭据形态（留痕）`)
    return
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
