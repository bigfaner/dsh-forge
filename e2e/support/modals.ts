// e2e 官方首启引导模态处置（fix-37 ① 收编；B1 双模改造——e2e-fast-shared-launch）。
//
// B1 双模：先等主界面就绪锚渲染——`[data-dswf-workbench][data-dswf-phase="hero"|"session"]`
// （data 锚单源纪律：锚由 ShellHost 常驻壳宿主渲染——apps/web/src/workbench/ShellHost.tsx:330；
// 消费先例 e2e/support/launch.ts stablePhase :171-172 / settle 探针 :296）。凭据在场 profile
// 即返为秒级（旧 30s 满窗 → readyGraceMs 级）；就绪锚在场后保留 readyGraceMs 晚挂载观测窗
// ——真机实证（b1 探针，e2e-fast-shared-launch/1.1）零凭据形态模态可于就绪锚出现后 ~2s 才
// 挂载（「锚在场 = 模态不可能再挂载」前提在零凭据分支被证伪），观测窗净空才算确定形态即返；
// 就绪信号超时（readyTimeoutMs，异常形态）回退既有 windowMs 盲等窗，行为语义不变。
//
// 旧形态取舍（注）：p1mvp 侧 30s 轮询窗（模态挂载可晚于工作台可见数十秒——kit 收敛期，
// 15s 窗实测漏收）；旧 specs 侧 15s 窗/单发探测两态已废。窗口期届满 = 视为
// 「无 API Key onboarding」（provider 叠层预免/凭据在场的确定形态）——留痕返回
// （console 记账，不臆造失败：叠层预免链路 modal 恒不挂载属预期态）。
// 「预览版说明」预免 = 产品 boot overlay 内置（fix-12），本面只收 API Key onboarding。
import type { Page } from '@playwright/test'

/** 就绪锚（B1 就绪信号单源）：主界面 phase 收敛二态任一在场 = 相位收敛起点 */
const READY_ANCHOR = '[data-dswf-workbench][data-dswf-phase="hero"], [data-dswf-workbench][data-dswf-phase="session"]'

/** 运行期模态收起（API Key onboarding「稍后配置」本地收起；B1 双模：就绪锚 + 晚挂载观测窗）*/
export async function dismissOnboardingModals(
  page: Page,
  windowMs = 30_000,
  readyTimeoutMs = 15_000,
  readyGraceMs = 5_000,
): Promise<void> {
  const dismissButton = page.locator('[role="dialog"] button', { hasText: /^稍后配置$/ }).first()
  const readyAnchor = page.locator(READY_ANCHOR).first()
  const startedAt = Date.now()
  let dismissed = 0
  let readySeenAt: number | null = null
  // settling 期早挂载预检：模态已在场先收（就绪即返不吞已挂模态）
  if (await dismissButton.isVisible().catch(() => false)) {
    await dismissButton.click({ timeout: 10_000 })
    dismissed++
    await page.waitForTimeout(1_000)
  }
  for (;;) {
    if (await dismissButton.isVisible().catch(() => false)) {
      await dismissButton.click({ timeout: 10_000 })
      dismissed++
      await page.waitForTimeout(1_000)
      if (dismissed >= 3) return // 旧 3 轮上限保留（复挂失控防环）
      continue
    }
    if (dismissed > 0) return // 收起后不再复挂——即退（省全窗盲等；1.7 墙钟治理）
    if (readySeenAt === null && (await readyAnchor.isVisible().catch(() => false))) readySeenAt = Date.now()
    if (readySeenAt !== null) {
      if (Date.now() - readySeenAt >= readyGraceMs) {
        // 晚挂载观测窗净空——叠层预免/凭据在场的确定形态，即返留痕
        console.log(
          `[dismiss-onboarding] 就绪信号 ${String(readySeenAt - startedAt)}ms（phase hero/session）+ 晚挂载观测 ${String(readyGraceMs)}ms 净空——即返`,
        )
        return
      }
    } else if (Date.now() - startedAt >= readyTimeoutMs) break
    await page.waitForTimeout(500)
  }
  // 就绪信号超时（异常形态）——回退既有盲等窗
  console.log(`[dismiss-onboarding] 就绪信号超时（${String(readyTimeoutMs)}ms，异常形态）——回退 ${String(windowMs)}ms 盲等窗`)
  const deadline = Date.now() + windowMs
  while (Date.now() < deadline && !(await dismissButton.isVisible().catch(() => false))) {
    await page.waitForTimeout(500)
  }
  if (await dismissButton.isVisible().catch(() => false)) {
    await dismissButton.click({ timeout: 10_000 })
    await page.waitForTimeout(1_000)
    return
  }
  // 留痕（不失败）：窗口期内无模态 = provider 叠层预免/凭据在场的确定形态
  console.log(`[dismiss-onboarding] ${String(windowMs)}ms 窗口期内无 API Key onboarding——预免/在场凭据形态（留痕）`)
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
