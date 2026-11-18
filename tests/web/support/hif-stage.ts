// host-integration-fixes 官方宿主舞台支撑层（1.10 脚本任务——overview/dual-form 与
// knowledge/backfill spec 共用的任意包 plugin-manager 安装通道）。
//
// 复用核销：舞台读取 / 页面打开 / forge 桥软通道直接复用
// tests/project/support/official-host.ts 既有单源（零复制）；本层只补「任意插件包」
// 的打包与安装面——official-host 的 buildProjectTarball/installViaPluginManager
// 硬编码 @dsh-forge/project，不覆盖 task-loop / knowledge 两件被测包。
// UI 词汇同源移植（插件页 → 添加插件 → 包路径 → 安装 → 允许/信任 → 立即启用/关闭 → 启用）。
// fix-8 补运行期卸载面（uninstallPkgViaPluginManager——ui-plugin-manager 实锚词汇）
// 与右栏展开驱动单源复用（expandRightSidebar——official-host 单源，本层转出口）。
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page } from '@playwright/test'
import { expandRightSidebar, officialHostStage, openOfficialPage, tryForgeInvoke, type OfficialHostStage } from '../../project/support/official-host.js'

export { expandRightSidebar, officialHostStage, openOfficialPage, tryForgeInvoke }
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
  // 「添加插件」点击有界重试（official-host.installViaPluginManager fix-8 同修口）
  const input = page.locator('input[aria-label="包名或地址"]')
  for (let i = 0; i < 3 && (await input.count()) === 0; i++) {
    const addEntry = page.getByText('添加插件', { exact: true }).first()
    if ((await addEntry.count()) > 0) {
      await addEntry.evaluate((el) => (el as HTMLElement).click()).catch(() => {})
      await page.waitForTimeout(3_000)
    } else {
      await page.getByRole('button', { name: '插件', exact: true }).first().click({ force: true }).catch(() => {})
      await page.waitForTimeout(5_000)
    }
  }
  await input.waitFor({ state: 'visible', timeout: 30_000 })
  await input.fill(tarball)
  await page.getByRole('button', { name: '安装', exact: true }).first().click({ force: true })
  let resultText = ''
  let alreadyInstalled = false
  let enabledViaDialog = false
  let installRetries = 0
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
    // 安装收敛弹窗主操作「立即启用」（官方宿主 0.2.2-rc.2 启用控件词汇——
    // ui-plugin-manager locales installEnableNow；行内 ^启用$ 钮在 rc.2 不再出现，
    // 不处置该主操作 = 插件停留「已关闭」、dsh.profile.bundles 零 bundle 条目）。
    const enableNow = page.getByRole('button', { name: '立即启用', exact: true }).first()
    if ((await enableNow.count()) > 0) {
      log.push('install dialog -> 立即启用（0.2.2-rc.2 安装弹窗主操作）')
      await enableNow.click({ force: true }).catch(() => {})
      enabledViaDialog = true
      await page.waitForTimeout(3_000)
      resultText = (await dialog.count()) > 0 ? await dialog.first().innerText() : '(dialog closed)'
      break
    }
    if (/这个包已经安装/.test(resultText)) {
      alreadyInstalled = true
      log.push(`install ${pkgBareName}: already installed (same version) — 收敛跳过安装`)
      break
    }
    // 失败态重试（「没有写入权限，无法安装」等瞬态失败弹窗自带「重试」主操作——
    // 有界 6 次 × 20s 退避，成功/终态词汇仍走下方收敛）
    const failRetry = page.locator('[role="dialog"]').getByRole('button', { name: '重试', exact: true }).first()
    if (/失败/.test(resultText) && (await failRetry.count()) > 0 && installRetries < 6) {
      installRetries++
      log.push(`install ${pkgBareName}: 失败弹窗重试 (round ${String(installRetries)})`)
      await failRetry.evaluate((el) => (el as HTMLElement).click()).catch(() => {})
      await page.waitForTimeout(20_000) // 退避重试（EPERM 类文件锁瞬态——立即重试同锁复现）
      continue
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

  // 启用兜底（核验制——同 official-host.installViaPluginManager fix-8 修口：点击路径
  // 不信任，以 Switch aria-checked 真值核验收口；「立即启用」已点击仍可能被吞）
  const enableSwitch = page.getByRole('switch', { name: /^启用/ }).first()
  if ((await enableSwitch.count()) > 0 && (await enableSwitch.getAttribute('aria-checked')) !== 'true') {
    await enableSwitch.evaluate((el) => (el as HTMLElement).click())
    log.push(`enable ${pkgBareName}: 详情页 Switch DOM click（aria-checked 未落定→补击）`)
    await page.waitForTimeout(3_000)
  } else if (enabledViaDialog) {
    log.push(`enable ${pkgBareName}: 立即启用 done（弹窗主操作）`)
  }
  if ((await enableSwitch.count()) > 0) {
    await expect(
      enableSwitch,
      `④ ${pkgBareName} 启用态落定（Switch aria-checked=true）`,
    ).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 })
    log.push(`enable ${pkgBareName}: Switch aria-checked=true 核验通过`)
  } else {
    // 旧宿主词汇 = 行内「启用」钮兜底
    const enableButton = page.getByRole('button', { name: /^启用$/ }).first()
    if ((await enableButton.count()) > 0) {
      await enableButton.evaluate((el) => (el as HTMLElement).click())
      await page.waitForTimeout(3_000)
      log.push('enable clicked')
    } else {
      log.push(`enable ${pkgBareName}: 启用控件缺席（详情词汇：${(await page.locator('body').innerText()).includes('已关闭') ? '已关闭——启用通道未收敛' : '非已关闭'})`)
    }
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
  // 插件详情面整页路由（back() 主视图钮在底层可见——r4 判例：详情覆盖层未离场即归位
  // 误判）——展开右栏前无条件离场（返回插件钮在场即点，DOM click 直发）
  const leaveDetail = page.getByRole('button', { name: '返回插件' }).first()
  if ((await leaveDetail.count()) > 0) {
    await leaveDetail.evaluate((el) => (el as HTMLElement).click())
    log.push('return-to-main: 返回插件 clicked（详情面离场前置）')
    await page.waitForTimeout(3_000)
  }
  // 插件页整页路由（列表页——back() 主视图钮在底层可见误判归位，r13 判例）：浏览器历史
  // 后退归位（探针实证通道——Escape/新会话均不达插件整页）
  if ((await page.getByText('添加插件', { exact: true }).count()) > 0) {
    await page.goBack({ timeout: 15_000 }).catch(() => {})
    log.push('return-to-main: goBack 兜底（插件列表整页离场）')
    await page.waitForTimeout(3_000)
  }
  // 右栏归位（主视图回位后右栏可能处于收起态——概览 tab 归 rightbar dock strip；
  // 展开驱动 = official-host.expandRightSidebar 单源——展开态实锚断言，非钮存在性）
  await expandRightSidebar(page, log)
}

/**
 * 运行期卸载驱动（ui-plugin-manager 实锚词汇——fix-8 移植，与安装通道同源对偶）：
 * 插件页行卡 → 详情面（data-plugin-detail）→ 卸载钮（uninstallLabel「卸载 {name}」/
 * PluginManagerPage.tsx:789）→ 确认弹窗（confirmUninstallTitle「卸载「{name}」？」+
 * confirmUninstall 主操作「卸载」，:1535-1558）→ 收敛断言 = 行卡离场（卸载后包从列表
 * 掉卡——view 回列表，:1572）。同会话不重启（removeBundle 运行期通道）。
 */
export async function uninstallPkgViaPluginManager(
  page: Page,
  stage: OfficialHostStage,
  pkgBareName: string,
  log: string[],
): Promise<void> {
  await page.goto(stage.webUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(12_000)
  await clearDialogs(page)
  await page.getByRole('button', { name: '插件', exact: true }).first().click({ force: true })
  await page.waitForTimeout(5_000)
  const row = page.locator('[data-dockkit-row], [role="listitem"], li').filter({ hasText: pkgBareName }).first()
  await expect(row, `卸载前置：已安装插件行在场（${pkgBareName}）`).toBeVisible({ timeout: 30_000 })
  await row.click({ force: true })
  await page.waitForTimeout(2_000)
  const uninstallBtn = page.getByRole('button', { name: /^卸载/ }).first()
  await expect(uninstallBtn, `卸载钮在场（${pkgBareName} 详情面——uninstallLabel 词汇）`).toBeVisible({ timeout: 15_000 })
  await uninstallBtn.click({ force: true })
  // 确认弹窗主操作「卸载」（取消 = 取消，exact 区分——ConfirmDialog :1551-1554）
  const confirm = page.locator('[role="dialog"]').getByRole('button', { name: '卸载', exact: true }).first()
  await expect(confirm, `卸载确认弹窗在座（confirmUninstall——${pkgBareName}）`).toBeVisible({ timeout: 15_000 })
  await confirm.click({ force: true })
  // 收敛：行卡离场（卸载中 phase 后包掉卡；有界 90s）
  await expect(row, `卸载收敛：行卡离场（${pkgBareName}）`).not.toBeVisible({ timeout: 90_000 })
  log.push(`uninstall ${pkgBareName}: 确认弹窗已确认 + 行卡离场收敛`)
  await returnToMainView(page, log)
}

/**
 * 项目注册驱动（project 插件官方添加项目向导——fix-8 移植；web 宿主无原生目录桥 =
 * 内嵌浏览器相位回退形态，DirectoryBrowser.tsx:131 锚面）：
 * 入口（hero CTA/侧栏 nav）→ 内嵌目录浏览（上一级至根 → 逐段双击进入 targetDir）→
 * 「下一步」→ 表单（data-dswf-rf-name 填 projectName）→「确认」→ success 相位 +
 * 项目树行在座。单项目在座 = 概览主体锚数据面（forgeProjects 供数）前置。
 */
export async function registerProjectViaAddProjectFlow(
  page: Page,
  targetDir: string,
  projectName: string,
  log: string[],
): Promise<void> {
  // 零项目态入口（尚未注册项目段 + 添加项目钮；已注册态 = CTA/侧栏 nav 入口）
  const cta = page.locator('[data-dswf-cta="add-project"], [data-dswf-nav="add-project"]').first()
  if ((await cta.count()) > 0) {
    await cta.evaluate((el) => (el as HTMLElement).click())
  } else {
    const addBtn = page.getByRole('button', { name: '添加项目' }).first()
    await expect(addBtn, '添加项目入口在座（零项目态官方钮）').toBeVisible({ timeout: 15_000 })
    await addBtn.evaluate((el) => (el as HTMLElement).click())
  }
  await expect(
    page.locator('[data-dswf-fb="browser"]').first(),
    '内嵌目录浏览器在座（web 宿主原生目录桥缺席——回退形态）',
  ).toBeVisible({ timeout: 15_000 })
  // 导航：上一级至根（禁用态 = 根），再按全路径逐段双击进入（行锚 = data-dswf-path 全路径）
  const up = page.getByRole('button', { name: '上一级' }).first()
  for (let i = 0; i < 15 && (await up.getAttribute('disabled')) !== undefined; i++) {
    await up.evaluate((el) => (el as HTMLElement).click())
    await page.waitForTimeout(1_500)
  }
  log.push(`add-project: 已至根目录（target = ${targetDir}）`)
  // 逐段进入：行匹配按末段 basename（行锚 data-dswf-path 全路径）。盘符段不是子行
  // （up-nav 终点 = 盘符根，根列表已在其内）——丢弃盘符段。
  const segments = targetDir.split('\\').filter((s) => s !== '' && !/^[a-zA-Z]:$/.test(s))
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i] as string
    const isLast = i === segments.length - 1
    // 行查找 + 点击一体（evaluateAll 内直点——反斜杠路径不进 CSS 属性选择器）
    const clicked = await page.locator('[data-dswf-path]').evaluateAll((els, args) => {
      const norm = (p: string): string => p.replace(/\\$/, '').split('\\').pop() ?? ''
      const wantNorm = (args.seg as string).toLowerCase()
      const el = els.find((e) => norm(e.getAttribute('data-dswf-path') ?? '').toLowerCase() === wantNorm) as HTMLElement | undefined
      if (el === undefined) return false
      if (args.enter === true) el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      else el.click()
      return true
    }, { seg, enter: !isLast })
    if (!clicked) {
      const all = await page.locator('[data-dswf-path]').evaluateAll((els) => els.map((e) => e.getAttribute('data-dswf-path')).join(' | '))
      throw new Error(`add-project 导航失败：段 ${seg} 无匹配行（在场行：${all}）`)
    }
    await page.waitForTimeout(isLast ? 1_000 : 2_000)
  }
  // 选中目标目录 → 下一步 → 表单
  await page.locator('.dswf-fb-confirm').first().evaluate((el) => (el as HTMLElement).click())
  const nameField = page.locator('[data-dswf-rf-name]').first()
  await expect(nameField, '表单相位在座（name 字段）').toBeVisible({ timeout: 15_000 })
  await nameField.fill(projectName)
  await page.locator('.dswf-rf-confirm').first().evaluate((el) => (el as HTMLElement).click())
  // 收敛二相：success / failure（failure = typed 拒绝——registry face 缺席等装配降级，
  // 零副作用设计内行为；如实抛失败详情，调用侧记账降级）
  const outcome = await page.evaluate(async () => {
    const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
    for (let i = 0; i < 15; i++) {
      await wait(2_000)
      const phase = document.querySelector('[data-dswf-ap="success"], [data-dswf-ap="failure"]')
      if (phase !== null) return (phase as HTMLElement).getAttribute('data-dswf-ap') ?? ''
    }
    return 'timeout'
  })
  if (outcome !== 'success') {
    const detail = await page.locator('[data-dswf-ap="failure"]').first().innerText().catch(() => '(failure 文本不可读)')
    await page.keyboard.press('Escape').catch(() => {})
    throw new Error(`add-project 注册未收敛（phase=${outcome}）：${detail.replace(/\n/g, ' | ').slice(0, 200)}`)
  }
  await expect(
    page.locator('[data-dswf-project]').first(),
    '项目树新项目行呈现',
  ).toBeVisible({ timeout: 30_000 })
  log.push(`add-project: ${projectName} 注册收敛（${targetDir}）`)
  await page.waitForTimeout(2_000)
}





