// 临时诊断探针（fix-19 诊断轮 v3，不提交）：对齐 uf3 测试 2 尾部时序（突击头标 + 延迟 close）
// 分层取证 quit 挂点。挂死时：30s 采样 main 进程活性（evaluate 响应性）+ 进程清单。
import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { launchHost } from '../support/launch.js'
import { registerProject, selectWorkspaceViaChip } from '../support/rpc.js'
import { createBridgeDriver } from '../support/replay/executor.js'
import { openOverviewDock } from '../support/navigation.js'
import { CONVERSATION_CONTENT, ovSubtabOf } from '../support/anchors.js'
import { awaitPresetHeaderLabel } from '../support/m3.js'

const WS_NAME = 'ws-uf3'
const PROP = 'uf3-blitz-prop'

test('probe v3: test2 tail timing → close hang forensics', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-probe3-uf3-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-probe3-uf3-ud-'))
  const launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page } = launched
  const t0 = Date.now()
  const mark = (label: string): void => console.log(`[probe] +${String(Date.now() - t0).padStart(6)}ms ${label}`)
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const driver = createBridgeDriver(app)
    await driver.call('forgeProposals', 'createProposal', { projectId, slug: PROP, title: '探针突击容器', mode: 'blitz' })
    await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'proposal', slug: PROP }, title: '探针突击任务', type: 'doc',
    })
    await selectWorkspaceViaChip(page, WS_NAME)
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await page.locator('[data-dswf-tt-contpill]').first().click()
    await page.locator(`[data-dswf-tt-mcont="proposal:${PROP}"]`).first().click()
    const dispatchOn = page.locator('[data-dswf-tt-dispatch="on"]').first()
    await expect(dispatchOn, '派发按钮亮起').toBeVisible({ timeout: 30_000 })
    await dispatchOn.click()
    await expect(page.locator(CONVERSATION_CONTENT).first()).toContainText(`/run-dag-tasks ${PROP}`, { timeout: 30_000 })
    await awaitPresetHeaderLabel(page, '突击模式')
    mark('test2 tail reached; idling 40s (baseline closed ~60s post-dispatch)')
    await page.waitForTimeout(40_000)

    // quit 生命周期探针挂载
    await app.evaluate((electron) => {
      const a = electron.app as unknown as { on(e: string, l: () => void): void }
      a.on('before-quit', () => console.log('[probe-main] before-quit'))
      a.on('will-quit', () => console.log('[probe-main] will-quit'))
      a.on('window-all-closed', () => console.log('[probe-main] window-all-closed'))
    })
    const proc = app.process()
    const closed = app.close().then(() => 'close-resolved', (e) => `close-rejected:${String(e)}`)
    const winner = await Promise.race([
      closed,
      new Promise<string>((r) => setTimeout(() => r('TIMEOUT-45s'), 45_000)),
    ])
    mark(`race winner = ${winner}; proc.exitCode=${String(proc.exitCode)} killed=${String(proc.killed)}`)
    if (winner === 'TIMEOUT-45s') {
      // 挂死取证：main 进程 evaluate 响应性 30s 采样 + 进程清单
      for (const i of [1, 2, 3]) {
        const respond = await Promise.race([
          app.evaluate(() => 'alive').then(() => 'evaluate-alive', (e) => `evaluate-err:${String(e).slice(0, 80)}`),
          new Promise<string>((r) => setTimeout(() => r('evaluate-TIMEOUT'), 8_000)),
        ]).catch(() => 'evaluate-threw')
        mark(`forensics#${i}: ${respond} proc.exitCode=${String(proc.exitCode)}`)
        if (respond.startsWith('evaluate-alive')) {
          await app.evaluate(() => {
            const a = (globalThis as { process?: { _getActiveHandles?: () => unknown[] } }).process
            const handles = a?._getActiveHandles?.() ?? []
            const kinds = (handles as unknown[]).map((h) => (h as { constructor?: { name?: string } })?.constructor?.name)
            console.log('[probe-main] active handles:', JSON.stringify(kinds))
          }).catch(() => undefined)
        }
        try {
          mark('electron processes:\n' + execSync('tasklist /FI "IMAGENAME eq electron.exe" /FO CSV', { encoding: 'utf8', timeout: 20_000 }))
        } catch { mark('tasklist failed') }
        await new Promise((r) => setTimeout(r, 3_000))
      }
      try {
        execSync(`taskkill /PID ${proc.pid} /T /F`, { timeout: 15_000 })
        mark('taskkill tree done')
      } catch (e) {
        mark(`taskkill failed: ${String(e)}`)
      }
      expect(winner, 'app.close 限时完成').not.toBe('TIMEOUT-45s')
    }
  } finally {
    mark('finally: cleanup fixture dirs')
    const { rmDirBestEffort } = await import('../support/cleanup.js')
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
