// plugin-project 1.20 · J2 worktree 生命周期旅程 Playwright spec（journey =
// worktree-lifecycle-journey，module = project——tests/<moduleName>/<journey>/ 约定树，
// Playwright project desktop-journeys 发现）。
//
// 断言-契约溯源：每条断言注 CT-J2-* 条目 id（契约 =
// .forge/docs/proposals/plugin-project/testing/worktree-lifecycle-journey/contracts/contracts.md，
// 待实现锚已回填实锚并盖 last_anchor_sync——2026-11-05；意向锚 data-dswf-wt-* 前缀族
// 未由实现提供，实锚 = data-dswt-* 族，锚漂移记录见契约回填节）。断言锚（实锚）：
//   触发 chip = [data-dswt-hero-trigger]；弹层卡 = .dswt-hero-menu；行键（非主树）=
//   [data-dswt-del="<ws_path>"]（主树行无删除 affordance）；创建弹窗 =
//   data-dswt-branch-input / data-dswt-base-trigger / data-dswt-create-submit +
//   同名冲突行 data-dswt-conflict-*；删除弹窗 = [data-dswt-delete-confirm] +
//   行勾选 data-dswt-check={ok|warn|block}；会话绑定 chip = [data-dswt-session-chip]
//   （sealed 变体 data-dswt-session-chip="sealed"）。不锁文案、不锁 DOM 层级；
//   断言带状态后效（git worktree list 事实 / project.db 关系行 / 行集合收敛）。
//
// 留痕 skip（通道缺失/环境门槛记账——非退役候选）：
//   - CT-J2-B4 删除失败注入：e2e 无 git 故障注入缝（目录占用构造对平台时序脆弱）——留痕 skip；
//   - CT-J2-B5/R5 封存拒发：发送零写入断言需真实模型凭据（零凭据形态发送路径不可达）；
//     封存态呈现面（chip sealed 变体 + SealNotice）由外部删树径在 CT-J2-B7 邻域承载；
//   - CT-J2-B8 project.db 降级态：库不可用注入无缝（fail-soft 装配面由单测 pin）——留痕 skip；
//   - CT-J2-G2 O-row-deferred-selfheal / O-git-fail：registry/关系行失败注入无缝——留痕 skip。
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { ROOT, closeApp, launchHost } from '../../../e2e/support/launch.js'
import { forgeInvoke } from '../../../e2e/support/rpc.js'
import { rmDirBestEffort } from '../../../e2e/support/cleanup.js'

// ── project.db 直查面（{dshHome}/forge/db/project/project.db） ──
const requireFromCore = createRequire(join(ROOT, 'packages', 'core', 'package.json'))

interface ProjectDb {
  prepare(sql: string): { get(...args: unknown[]): unknown; all(...args: unknown[]): unknown[] }
  close(): void
}

function workspaceRowFor(dshHome: string, wsPath: string): { member_role: string } | undefined {
  const file = join(dshHome, 'forge', 'db', 'project', 'project.db')
  if (!existsSync(file)) return undefined
  const db = new (requireFromCore('@dsh-forge/lib-db') as new (path: string) => ProjectDb)(file)
  try {
    return db.prepare('SELECT member_role FROM project_workspaces WHERE ws_path = ?').get(wsPath) as
      | { member_role: string }
      | undefined
  } finally {
    db.close()
  }
}

// ── git 事实面（真 git CLI——CT-J2 副作用事实锚） ──
function gitWorktreePaths(repo: string): readonly string[] {
  return execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: repo, encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length).trim())
}

// ── 夹具 ──
interface Fixture {
  readonly userData: string
  readonly dshHome: string
  readonly repo: string
}

function makeRepoFixture(tag: string): Fixture {
  const root = mkdtempSync(join(tmpdir(), `dsh-j2-${tag}-fx-`))
  const repo = join(root, 'repo')
  execFileSync('git', ['init', '-q', '-b', 'main', repo])
  writeFileSync(join(repo, 'README.md'), 'j2 fixture\n')
  const g = (args: string[]): void => {
    execFileSync('git', ['-c', 'user.email=j2@test', '-c', 'user.name=j2', ...args], { cwd: repo, stdio: 'pipe' })
  }
  g(['add', '.'])
  g(['commit', '-q', '-m', 'init'])
  g(['branch', 'feat-a'])
  const userData = mkdtempSync(join(tmpdir(), `dsh-j2-${tag}-ud-`))
  return { userData, dshHome: join(userData, 'dsh-home'), repo }
}

interface Boot {
  readonly app: Awaited<ReturnType<typeof launchHost>>['app']
  readonly page: Page
  readonly fixture: Fixture
}

/** 冷启 + RPC 直注注册 + 项目上下文选定（hero chip 挂载前置——worktree-risk-confirmation 同径） */
async function bootRegistered(tag: string): Promise<Boot> {
  const fixture = makeRepoFixture(tag)
  const launched = await launchHost({ userData: fixture.userData })
  const { page } = launched
  await forgeInvoke(page, 'forge:projects/register', {
    workspaceDir: fixture.repo,
    name: 'repo',
    forgeDir: join(fixture.repo, '.forge'),
  })
  await page.locator('button[aria-label="选择工作区"]').first().click()
  await page.locator('.dswf-hero-picker-list').getByText('repo', { exact: false }).first().click()
  await expect(page.locator('[data-dswt-hero-trigger]'), 'hero worktree chip 注入（git 项目）').toBeVisible({ timeout: 30_000 })
  return { app: launched.app, page, fixture }
}

async function openPicker(page: Page): Promise<void> {
  await page.locator('[data-dswt-hero-trigger]').first().click()
  await expect(page.locator('.dswt-hero-menu')).toBeVisible({ timeout: 10_000 })
}

/** 非主树行删除 affordance 锚（行键 = ws_path 词锚） */
function delRow(page: Page, wsPath: string): ReturnType<Page['locator']> {
  return page.locator(`[data-dswt-del="${wsPath}"]`)
}

/** picker 内非主树行键集（data-dswt-del 值 = ws_path） */
async function pickerDelPaths(page: Page): Promise<string[]> {
  return page
    .locator('.dswt-hero-menu [data-dswt-del]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-dswt-del') ?? ''))
}

async function openCreateDialog(page: Page): Promise<ReturnType<Page['locator']>> {
  await openPicker(page)
  await page.locator('.dswt-hero-menu [role="menuitem"]').last().click()
  const dialog = page.getByRole('dialog', { name: '新建 worktree' })
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  return dialog
}

/** 默认基准分支径创建（跨分支径走 CT-J2-B1 确认门） */
async function createWorktree(page: Page, branch: string): Promise<void> {
  const dialog = await openCreateDialog(page)
  await dialog.locator('[data-dswt-branch-input]').fill(branch)
  await dialog.locator('[data-dswt-create-submit]').click()
}

/** 断言三方一致：git worktree 在册 + project.db worktree 关系行登记（CT-J2-G2） */
function expectTripleConsistent(fixture: Fixture, wsPath: string): void {
  expect(gitWorktreePaths(fixture.repo), 'CT-J2-G2：git worktree 在册').toContain(wsPath)
  expect(workspaceRowFor(fixture.dshHome, wsPath), 'CT-J2-G2：project.db 关系行登记').toEqual({ member_role: 'worktree' })
}

// ─────────────────────────────────────────────────────────────────────────────

test('@project-e2e @worktree-lifecycle CT-J2-G1 picker 列表与 git 事实一致（含主树行、无幽灵行）', async () => {
  test.setTimeout(240_000)
  const boot = await bootRegistered('g1')
  try {
    await openPicker(boot.page)
    // CT-J2-G1 O-list-consistent：非主树行键集合 == git worktree list 非主树集合（路径键比对，顺序不锁）
    const gitNonMain = gitWorktreePaths(boot.fixture.repo).filter((p) => p !== boot.fixture.repo)
    expect(await pickerDelPaths(boot.page), '非主树行集合与 git 事实一致').toEqual(gitNonMain)
    // 主树行判别：无删除 affordance（触发 chip 默认锚定主树检出分支——数据值词锚）
    expect(await delRow(boot.page, boot.fixture.repo).count(), '主树行无删除 affordance').toBe(0)
    await expect(boot.page.locator('[data-dswt-hero-trigger]').first()).toContainText('main', { timeout: 10_000 })
  } finally {
    await closeApp(boot.app)
  }
})

test('@project-e2e @worktree-lifecycle CT-J2-G2 创建 worktree：三方一致落成（含同名冲突拒绝零残留）', async () => {
  test.setTimeout(300_000)
  const boot = await bootRegistered('g2')
  const wtPath = join(boot.fixture.repo, 'wt-proj')
  try {
    await createWorktree(boot.page, 'feat/proj')
    // CT-J2-G2 O-success：三方一致（git / project.db 关系行——registry 面由 create 链承载）
    await expect
      .poll(() => gitWorktreePaths(boot.fixture.repo).includes(wtPath), { timeout: 30_000, message: 'git worktree 在册' })
      .toBe(true)
    await expect
      .poll(() => workspaceRowFor(boot.fixture.dshHome, wtPath) !== undefined, {
        timeout: 30_000,
        message: 'project.db 关系行登记（I3 随动）',
      })
      .toBe(true)
    // Output：picker 列表新树行呈现（行键 = ws_path）+ 触发 chip 切到新选中行（状态语义）
    await openPicker(boot.page)
    expect(await pickerDelPaths(boot.page), 'picker 新树行呈现').toContain(wtPath)
    await expect(boot.page.locator('[data-dswt-hero-trigger]').first()).toContainText('proj', { timeout: 15_000 })
    // O-duplicate-conflict：同名分支再建 → 表单内告警行 + 三方零残留（B2）
    const dialog = await openCreateDialog(boot.page)
    await dialog.locator('[data-dswt-branch-input]').fill('feat/proj')
    await dialog.locator('[data-dswt-create-submit]').click()
    await expect(dialog.locator('[data-dswt-conflict-branch]').first(), '同名冲突告警行呈现').toBeVisible({ timeout: 10_000 })
    expect(gitWorktreePaths(boot.fixture.repo).filter((p) => p === wtPath), 'git 零残留（单树）').toHaveLength(1)
    expect(workspaceRowFor(boot.fixture.dshHome, wtPath), '关系行零重复').toEqual({ member_role: 'worktree' })
  } finally {
    await closeApp(boot.app)
  }
})

test('@project-e2e @worktree-lifecycle CT-J2-B1 跨分支创建确认门：取消零副作用 / 确认才创建（I2）', async () => {
  test.setTimeout(300_000)
  const boot = await bootRegistered('b1')
  const wtPath = join(boot.fixture.repo, 'wt-cross')
  try {
    const dialog = await openCreateDialog(boot.page)
    await dialog.locator('[data-dswt-branch-input]').fill('feat/cross')
    // 基准分支 ≠ 主树当前检出分支（feat-a）
    await dialog.locator('[data-dswt-base-trigger]').click()
    await boot.page.locator('.dswt-base-branch-menu').getByText('feat-a', { exact: false }).first().click()
    // O-cancel：确认门呈现 → 取消 → 三方零副作用
    await dialog.locator('[data-dswt-create-submit]').click()
    const risk = boot.page.getByRole('dialog', { name: '基准分支跨分支确认' })
    await expect(risk, 'CT-J2-B1：跨分支确认门呈现').toBeVisible({ timeout: 10_000 })
    await risk.getByRole('button', { name: '取消', exact: true }).click()
    await expect(risk).toBeHidden()
    expect(gitWorktreePaths(boot.fixture.repo), '取消零副作用（git 零新树）').not.toContain(wtPath)
    expect(workspaceRowFor(boot.fixture.dshHome, wtPath), '取消零副作用（关系行零登记）').toBeUndefined()
    // O-confirm：确认（勾选知悉）→ 才真正创建
    await dialog.locator('[data-dswt-create-submit]').click()
    await expect(risk).toBeVisible()
    await risk.locator('input[type="checkbox"]').first().check()
    await risk.getByRole('button', { name: '确认继续' }).click()
    await expect
      .poll(() => gitWorktreePaths(boot.fixture.repo).includes(wtPath), { timeout: 30_000, message: '确认后才创建' })
      .toBe(true)
    expectTripleConsistent(boot.fixture, wtPath)
  } finally {
    await closeApp(boot.app)
  }
})

test('@project-e2e @worktree-lifecycle CT-J2-G3/G5/B3 绑定与删除：WYSIWYG 归属 + fail-closed 守卫 + 三方一致删除', async () => {
  test.setTimeout(300_000)
  const boot = await bootRegistered('g5')
  const wtPath = join(boot.fixture.repo, 'wt-del')
  try {
    // 前置：创建树 + 选中 + 创建会话（会话归属该树 → CT-J2-B3 Preconditions）
    await createWorktree(boot.page, 'feat/del')
    await expect
      .poll(() => gitWorktreePaths(boot.fixture.repo).includes(wtPath), { timeout: 30_000, message: '前置树建成' })
      .toBe(true)
    await openPicker(boot.page)
    await boot.page.locator('.dswt-hero-menu [role="menuitem"]').first().click() // 点选 feat/del 行（纯选中态——1.29 零弹框）
    await expect(boot.page.locator('[data-dswt-hero-trigger]').first()).toContainText('del', { timeout: 15_000 })
    await boot.page
      .locator('button[aria-label="打开侧边栏"], button[title="打开侧边栏"]')
      .first()
      .click()
      .catch(() => undefined)
    await boot.page.locator('[data-dswf-project]').first().hover()
    await boot.page.locator('[data-dswf-project-action="new-session"]').first().click({ force: true })
    await boot.page.locator('[data-dswf-session]').first().waitFor({ state: 'visible', timeout: 30_000 })
    // CT-J2-G3 O-bound-as-shown：选中树 = 会话归属（chip live 变体 + branch 数据值词锚）
    const chip = boot.page.locator('[data-dswt-session-chip]').first()
    await expect(chip, 'CT-J2-G3：会话头 chip 呈现选中树归属').toBeVisible({ timeout: 30_000 })
    await expect(chip).toHaveAttribute('data-dswt-session-chip', 'live')
    await expect(chip).toContainText('feat/del')
    // CT-J2-B3：仍有活跃会话归属 → 删除确认面 fail-closed（确认禁用，零部分删除态）
    await openPicker(boot.page)
    await delRow(boot.page, wtPath).click()
    const delDialog = boot.page.getByRole('dialog', { name: /删除/ })
    await expect(delDialog, 'CT-J2-B3：删除确认面呈现风险语义').toBeVisible({ timeout: 10_000 })
    await expect(delDialog.locator('[data-dswt-check="block"]').first(), '阻断级勾选行呈现（会话归属）').toBeVisible({ timeout: 10_000 })
    await expect(delDialog.locator('[data-dswt-delete-confirm]'), '确认钮禁用（fail-closed）').toBeDisabled()
    await delDialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(delDialog).toBeHidden()
    // O-cancel-noop：取消 → 三方原状
    expect(gitWorktreePaths(boot.fixture.repo), '取消后树原状').toContain(wtPath)
    expect(workspaceRowFor(boot.fixture.dshHome, wtPath), '取消后关系行原状').toEqual({ member_role: 'worktree' })
    // CT-J2-G5 O-deleted-consistent：条件满足删除 → git 零在册 + 关系行清理 + 列表移除
    await openPicker(boot.page)
    await delRow(boot.page, wtPath).click()
    const delDialog2 = boot.page.getByRole('dialog', { name: /删除/ })
    await expect(delDialog2).toBeVisible({ timeout: 10_000 })
    await expect(delDialog2.locator('[data-dswt-delete-confirm]')).toBeEnabled({ timeout: 30_000 })
    await delDialog2.locator('[data-dswt-delete-confirm]').click()
    await expect
      .poll(() => gitWorktreePaths(boot.fixture.repo).includes(wtPath), { timeout: 30_000, message: 'git worktree 已删' })
      .toBe(false)
    await expect
      .poll(() => workspaceRowFor(boot.fixture.dshHome, wtPath), { timeout: 30_000, message: '关系行清理（I3）' })
      .toBeUndefined()
    await openPicker(boot.page)
    expect(await pickerDelPaths(boot.page), 'picker 列表移除 T 行').not.toContain(wtPath)
  } finally {
    await closeApp(boot.app)
  }
})

test('@project-e2e @worktree-lifecycle CT-J2-B7 选中树外部删除后陈旧自愈（行隐藏收敛、无幽灵行）', async () => {
  test.setTimeout(300_000)
  const boot = await bootRegistered('b7')
  const wtPath = join(boot.fixture.repo, 'wt-stale')
  try {
    await createWorktree(boot.page, 'feat/stale')
    await expect
      .poll(() => gitWorktreePaths(boot.fixture.repo).includes(wtPath), { timeout: 30_000, message: '前置树建成' })
      .toBe(true)
    await expect
      .poll(() => workspaceRowFor(boot.fixture.dshHome, wtPath) !== undefined, { timeout: 30_000, message: '前置关系行登记' })
      .toBe(true)
    // 外部（shell 事实）删除树目录——真机文件系统事实
    rmDirBestEffort(wtPath)
    // Input：打开/刷新 picker → Output：列表与 git 事实收敛（失配行隐藏——O-stale-healed）
    await openPicker(boot.page)
    expect(await pickerDelPaths(boot.page), '陈旧行自愈隐藏（无幽灵行）').not.toContain(wtPath)
  } finally {
    await closeApp(boot.app)
  }
})

// ── 留痕 skip（通道缺失/环境门槛记账——见文件头注记） ──
test('CT-J2 留痕 skip（占位）', () => {
  test.skip(true, 'CT-J2-B4 删除失败注入（e2e 无 git 故障注入缝）/ CT-J2-B5+R5 封存拒发（发送零写入断言需真实模型凭据）/ CT-J2-B8 project.db 降级态（库不可用注入无缝）/ CT-J2-G2 O-row-deferred-selfheal+O-git-fail（registry 失败注入无缝）——留痕 skip')
})
