// 真机 UI e2e：非 git 项目零差异——官方原流照常（零拒绝、零 worktree UI 注入）。
// 语义（binding-derivation 绑定推导制）：会话创建 = 官方 session.create({workspaceId})
// 直通，非 git 域官方原路径不变（零 host 介入）；git 能力缺席拒绝面不存在的域——
// git 项目矩阵（W2 判定核本体）由 host 单测 worktree-rpc.test.ts absentRig 承载。
// data 锚：chip = [data-dswt-hero-trigger]；composer = [data-composer-input]；发送钮 =
// role button「发送消息」。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/session-binding-guarantee/1.7/003-capability-absent-matrix'

/** 真·非 git 目录夹具（零 git init——官方探针 null 路对象） */
function makePlainDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-7-k5-plain-'))
  writeFileSync(join(dir, 'notes.txt'), '1.7 k5 plain (non-git) fixture\n')
  return dir
}

/** renderer 侧 forge RPC（preload 面真身——window.dshForge.invoke） */
async function forgeRpc(page: Page, channel: string, payload?: unknown): Promise<unknown> {
  return page.evaluate(
    ([ch, payload]) =>
      (window as unknown as { dshForge: { invoke(c: string, p?: unknown): Promise<unknown> } }).dshForge.invoke(ch, payload),
    [channel, payload] as const,
  )
}

/** 注册项目（轮询至就绪——1.17 同配方） */
async function registerProject(page: Page, wsDir: string, name: string): Promise<void> {
  await expect
    .poll(async () => {
      try {
        const raw = (await forgeRpc(page, 'forge:projects/register', {
          workspaceDir: wsDir,
          name,
          forgeDir: join(wsDir, '.forge'),
          knowledgeDir: join(wsDir, '.knowledge'),
        })) as { ok?: boolean; data?: { projectId?: string }; projectId?: string } | null
        const projectId = raw?.data?.projectId ?? raw?.projectId
        return typeof projectId === 'string'
      } catch {
        return false
      }
    }, { timeout: 60_000, message: `项目注册未就绪（${name}）` })
    .toBe(true)
}

/** 选中项目工作区（hero picker——1.27 同配方） */
async function selectWorkspace(page: Page, projectName: string): Promise<void> {
  await page.locator('button[aria-label="选择工作区"]').first().click()
  await page.locator('.dswf-hero-picker-list').getByText(projectName, { exact: false }).first().click()
}

/** composer 键入（Lexical 配方：contenteditable 收敛门 + insertText + 回显重试） */
async function typeDraft(page: Page, text: string): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const els = document.querySelectorAll<HTMLElement>('[data-composer-input]')
        return els.length > 0 && [...els].every((el) => el.isContentEditable)
      },
      undefined,
      { timeout: 60_000 },
    )
    .catch(() => undefined)
  const composer = page.locator('[data-composer-input]').first()
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await composer.click()
    await page.keyboard.insertText(text)
    const echoed = await composer.evaluate((el) => (el as HTMLElement).textContent ?? '')
    if (echoed.includes(text)) return
    await page.waitForTimeout(5_000)
  }
}

/** 发送重试环（1.29 同款）：以会话日志落盘为唯一发送成功证据 */
async function sendUntilLanded(page: Page, userData: string, dirFragment: string, since: number): Promise<string> {
  const composer = page.locator('[data-composer-input]').first()
  const sendButton = page.getByRole('button', { name: '发送消息' })
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await composer.click()
    const enabled = await sendButton.isEnabled().catch(() => false)
    if (enabled) await sendButton.click().catch(() => {})
    else await page.keyboard.press('Enter')
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      const hit = findSessionDir(userData, dirFragment, since)
      if (hit !== undefined) return hit
      await page.waitForTimeout(1_000)
    }
  }
  throw new Error(`发送未落盘（dirFragment=${dirFragment}）——发送链路证据缺席`)
}

/** 会话日志落盘定位：{dshHome}/sessions 下 dirFragment 段 cwd 分组目录内 mtime ≥ since 的日志 */
function findSessionDir(userData: string, dirFragment: string, since: number): string | undefined {
  const root = join(userData, 'dsh-home', 'sessions')
  if (!existsSync(root)) return undefined
  let hit: string | undefined
  const visit = (dir: string, depth: number): void => {
    if (hit !== undefined || depth > 6) return
    let rows: string[] = []
    try {
      rows = readdirSync(dir)
    } catch {
      return
    }
    for (const row of rows) {
      const full = join(dir, row)
      let stat
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        visit(full, depth + 1)
        if (hit !== undefined) return
        continue
      }
      if (row.endsWith('.jsonl.zstd') && stat.mtimeMs >= since && dir.replaceAll('\\', '/').toLowerCase().includes(dirFragment)) {
        hit = dir
        return
      }
    }
  }
  visit(root, 0)
  return hit
}

/** 走查截图（失败不静默——打点留痕） */
async function snap(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `${EVIDENCE_DIR}/${name}`, animations: 'disabled', timeout: 30_000 })
  } catch (cause) {
    console.log(`[k5-snap-miss] ${name}: ${String(cause)}`)
  }
}

/** 收尾统一面（判读留痕双落 + app/夹具清理） */
async function teardown(
  app: { readonly app: ElectronApplication },
  consoleLog: readonly string[],
  userData: string,
  fixtureDirs: readonly string[],
): Promise<void> {
  // eslint-disable-next-line no-console -- 判读留痕：runner stdout（Tee 日志）+ 证据目录双落
  console.log('[renderer-console]\n' + consoleLog.join('\n'))
  try {
    writeFileSync(join(EVIDENCE_DIR, `renderer-console-${Date.now()}.log`), consoleLog.join('\n'), 'utf8')
  } catch {
    // 留痕失败不影响清理
  }
  await closeApp(app.app)
  rmSync(userData, { recursive: true, force: true })
  for (const dir of fixtureDirs) rmSync(dir, { recursive: true, force: true })
}

test('真非 git UI：官方原流零拒绝（照常）', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-7-k5-ud-a-'))
  const plainDir = makePlainDir()
  const app = await launchHost({ userData })
  const consoleLog: string[] = []
  try {
    const { page } = app
    page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`))
    await dismissOnboardingModals(page)
    await registerProject(page, plainDir, 'k5-plain-ws')
    // 真·非 git：官方原流零拒绝（照常）——选中 → 首条消息发送落盘
    await selectWorkspace(page, 'k5-plain-ws')
    const MARKER_A = '1-7-k5-plain-first-message'
    await typeDraft(page, MARKER_A)
    const sendStartA = Date.now() - 5_000
    const dirA = await sendUntilLanded(page, userData, 'k5-plain', sendStartA)
    console.log('[k5-scene-a] plain message landed at', dirA)
    // 非 git 零差异：零拒绝呈现（官方原路径不变，零 host 介入）
    await expect(page.getByText('能力缺席'), '非 git 项目零拒绝呈现（照常）').toHaveCount(0)
    await snap(page, 'scene-a-plain-unaffected.png')
  } finally {
    await teardown(app, consoleLog, userData, [plainDir])
  }
})
