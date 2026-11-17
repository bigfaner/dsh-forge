// host-integration-fixes 官方宿主舞台支撑层（1.10 脚本任务——overview/dual-form 与
// knowledge/backfill spec 共用的任意包 plugin-manager 安装通道）。
//
// 复用核销：舞台读取 / 页面打开 / forge 桥软通道直接复用
// tests/project/support/official-host.ts 既有单源（零复制）；本层只补「任意插件包」
// 的打包与安装面——official-host 的 buildProjectTarball/installViaPluginManager
// 硬编码 @dsh-forge/project，不覆盖 task-loop / knowledge 两件被测包。
// UI 词汇同源移植（插件页 → 添加插件 → 包路径 → 安装 → 允许/信任 → 关闭 → 启用）。
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page } from '@playwright/test'
import { officialHostStage, openOfficialPage, tryForgeInvoke, type OfficialHostStage } from '../../project/support/official-host.js'

export { officialHostStage, openOfficialPage, tryForgeInvoke }
export type { OfficialHostStage }

/** ① 打包任意插件包最新版本：`pnpm pack`（run-once，禁 --watch 形态）→ tarball 绝对路径 */
export function buildPkgTarball(pkgDir: string, log: string[]): { tarball: string; version: string } {
  const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as { version: string }
  // shell:true——Windows 下 pnpm 实体 = pnpm.cmd，无 shell 即 ENOENT（runner 侧既判）；
  // 包路径与目的地均无空白字符，shell 拼接安全。
  const out = execFileSync('pnpm', ['pack', '--pack-destination', pkgDir], {
    cwd: pkgDir,
    encoding: 'utf8',
    timeout: 300_000,
    shell: true,
  })
  const filename = out.trim().split(/\r?\n/).at(-1) ?? ''
  const tarball = join(pkgDir, filename)
  expect(existsSync(tarball), `① 打包产物在盘（pnpm pack → ${filename}）`).toBe(true)
  log.push(`pack ${pkgDir}: ${filename} (manifest ${manifest.version})`)
  return { tarball, version: manifest.version }
}

/**
 * ②③ 任意插件包 plugin-manager 正式安装 + 启用 + manifest 版本一致断言
 * （official-host.installViaPluginManager 的参数化移植——pkgDir/pkgBareName 可变）。
 * 实体包双校验：{E2E_OFFICIAL_DSH_HOME} 有界深搜 node_modules/@dsh-forge/<short>/package.json。
 */
export async function installPkgViaPluginManager(
  page: Page,
  stage: OfficialHostStage,
  pkgDir: string,
  pkgBareName: string,
  log: string[],
): Promise<{ version: string; entityVerified: boolean }> {
  const { tarball, version } = buildPkgTarball(pkgDir, log)
  await page.goto(stage.webUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(12_000)
  await clearDialogs(page)
  await page.getByRole('button', { name: '插件', exact: true }).first().click({ force: true })
  await page.waitForTimeout(5_000)
  await page.getByText('添加插件', { exact: true }).first().click({ force: true })
  const input = page.locator('input[aria-label="包名或地址"]')
  await input.waitFor({ state: 'visible', timeout: 30_000 })
  await input.fill(tarball)
  await page.getByRole('button', { name: '安装', exact: true }).first().click({ force: true })
  let resultText = ''
  let alreadyInstalled = false
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(4_000)
    const dialog = page.locator('[role="dialog"]')
    resultText = (await dialog.count()) > 0 ? await dialog.first().innerText() : '(no dialog)'
    const allow = page.getByRole('button', { name: /允许|信任/ }).first()
    if ((await allow.count()) > 0) {
      log.push('build-auth dialog -> allow')
      await allow.click({ force: true }).catch(() => {})
      await page.waitForTimeout(2_000)
      const retry = page.getByRole('button', { name: /^重试$/ }).first()
      if ((await retry.count()) > 0) await retry.click({ force: true }).catch(() => {})
      continue
    }
    if (/这个包已经安装/.test(resultText)) {
      alreadyInstalled = true
      log.push(`install ${pkgBareName}: already installed (same version) — 收敛跳过安装`)
      break
    }
    if (/失败|成功|完成|已安装/.test(resultText) || resultText === '(no dialog)') break
  }
  if (!alreadyInstalled) {
    expect(resultText, `② ${pkgBareName} plugin-manager 正式安装收敛（末态：${resultText.slice(0, 120)}）`).not.toMatch(/失败/)
  }
  log.push(`install ${pkgBareName}: ${resultText.replace(/\n/g, ' | ').slice(0, 160)}`)
  const close = page.getByRole('button', { name: /关闭|知道了|确定|完成/ }).first()
  if ((await close.count()) > 0) await close.click({ force: true }).catch(() => {})
  await page.waitForTimeout(2_000)

  // ③-a UI 详情 manifest 版本断言（安装弹窗关闭后插件列表可能未刷新/视图未归位——
  // 行卡短窗未现即重开插件页语义：重新 goto → 收模态 → 进插件页，再定位行卡）
  const rowOf = (): ReturnType<Page['locator']> =>
    page.locator('[data-dockkit-row], [role="listitem"], li').filter({ hasText: pkgBareName }).first()
  let row = rowOf()
  try {
    await row.waitFor({ state: 'visible', timeout: 8_000 })
  } catch {
    log.push('③-a 行卡未现——重开插件页归位重试')
    await page.goto(stage.webUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(12_000)
    await clearDialogs(page)
    await page.getByRole('button', { name: '插件', exact: true }).first().click({ force: true })
    await page.waitForTimeout(5_000)
    row = rowOf()
  }
  await expect(row, `③-a 已安装插件行在场（${pkgBareName}）`).toBeVisible({ timeout: 30_000 })
  await row.click({ force: true })
  await page.waitForTimeout(2_000)
  await expect(page.locator('body'), `③-a UI manifest 版本一致（详情面 v${version}）`).toContainText(`v${version}`)

  // ③-b 实体包版本断言（env 缺席 = UI 单校形态，如实降级）
  let entityVerified = false
  if (stage.dshHome !== undefined) {
    const candidates = findEntityPackageJson(stage.dshHome, pkgBareName, 0)
    expect(candidates.length, `③-b profile 实体包 ${pkgBareName}/package.json 在盘（候选 ${String(candidates.length)}）`).toBeGreaterThan(0)
    const entityPkg = candidates[0] as string
    const entityVersion = (JSON.parse(readFileSync(entityPkg, 'utf8')) as { version: string }).version
    expect(entityVersion, `③-b 实体包版本一致（${entityVersion} = ${version}）`).toBe(version)
    entityVerified = true
    log.push(`entity: ${entityPkg} (${entityVersion})`)
  } else {
    log.push(`entity check skipped: E2E_OFFICIAL_DSH_HOME 缺席（${pkgBareName} UI 单校形态，如实标注）`)
  }

  const enable = page.getByRole('button', { name: /^启用$/ }).first()
  if ((await enable.count()) > 0) {
    await enable.click({ force: true })
    await page.waitForTimeout(3_000)
    log.push('enable clicked')
  }
  await returnToMainView(page, log)
  return { version, entityVerified }
}

/** 有界深搜实体包 package.json（深度 6 封顶——official-host.findInstalledPackageJsons 参数化移植） */
function findEntityPackageJson(root: string, pkgBareName: string, depth: number, acc: string[] = []): string[] {
  if (depth > 6) return acc
  let names: string[]
  try {
    names = readdirSync(root)
  } catch {
    return acc
  }
  if (names.includes('@dsh-forge')) {
    const candidate = join(root, '@dsh-forge', pkgBareName.replace('@dsh-forge/', ''), 'package.json')
    if (existsSync(candidate)) acc.push(candidate)
  }
  for (const name of names) {
    findEntityPackageJson(join(root, name), pkgBareName, depth + 1, acc)
  }
  return acc
}

/** 有界收模态（official-host.clearDialogs 同词汇移植） */
async function clearDialogs(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    if ((await page.locator('[role="dialog"]').count()) === 0) return
    let clicked = false
    for (const name of ['稍后配置', '继续', '知道了', '开始使用', '确定', '完成', '关闭']) {
      const button = page.getByRole('button', { name, exact: true }).first()
      if ((await button.count()) > 0) {
        await button.click({ force: true }).catch(() => {})
        clicked = true
        break
      }
    }
    if (!clicked) await page.keyboard.press('Escape')
    await page.waitForTimeout(2_000)
  }
}

/** 装载后回主视图（official-host.returnToMainView 同形移植） */
async function returnToMainView(page: Page, log: string[]): Promise<void> {
  const back = async (): Promise<boolean> =>
    (await page.locator('button').evaluateAll((els) =>
      els.some((b) => /默认工作区|选择工作区/.test((b.getAttribute('aria-label') || b.textContent || '').trim())),
    )) || (await page.locator('[data-dswf-hero]').count()) > 0
  let retried = false
  for (let i = 0; i < 5 && !(await back()); i++) {
    // 插件详情页归位（安装收尾停在行卡详情——「返回插件」先离场，新会话/Escape 均不达）
    const leavePlugin = page.getByRole('button', { name: '返回插件' }).first()
    if ((await leavePlugin.count()) > 0) {
      await leavePlugin.click({ force: true }).catch(() => {})
      log.push(`return-to-main: 返回插件 clicked (round ${String(i + 1)})`)
      await page.waitForTimeout(3_000)
      continue
    }
    // 重试告警横幅兜底（项目列表加载失败等——单次消费，不劫持归位轮次）
    const retry = page.getByRole('button', { name: '重试', exact: true }).first()
    if (!retried && (await retry.count()) > 0) {
      retried = true
      await retry.click({ force: true }).catch(() => {})
      log.push('return-to-main: 重试 clicked')
      await page.waitForTimeout(3_000)
      continue
    }
    if (i >= 1) {
      // 插件页整页路由（新会话/Escape 均不达）——浏览器历史后退归位（探针实证通道）
      await page.goBack({ timeout: 15_000 }).catch(() => {})
      log.push(`return-to-main: goBack 兜底 (round ${String(i + 1)})`)
    } else {
      await page.keyboard.press('Escape')
      log.push('return-to-main: 归位钮缺席——Escape 兜底')
    }
    await page.waitForTimeout(3_000)
  }
  // 右栏归位（主视图回位后右栏可能处于收起态——概览 tab 归 rightbar dock strip）
  const openRightbar = page.getByRole('button', { name: '打开右侧边栏' }).first()
  if ((await openRightbar.count()) > 0) {
    await openRightbar.click({ force: true }).catch(() => {})
    log.push('return-to-main: 打开右侧边栏 clicked')
    await page.waitForTimeout(3_000)
  }
}
