// session-binding-guarantee 1.6 口径 5 真机 UI e2e：W2 能力缺席矩阵——git 入口显式拒绝、
// 非 git 照常（零行为差异）。
//   · 场景 A（先行——场景 B 注入不可逆）：真非 git 目录注册 → 选中 → 首条消息照常发送
//     落盘（官方原流零拒绝），页面零「能力缺席」拒绝呈现（W2 拒绝面只对 git 项目生效）；
//   · 场景 B（typed 信封注入）：forge:worktree/session-create 通道换装返回
//     ERR_WORKTREE_CAPABILITY_ABSENT typed 信封（contracts RpcResult 带内返回——rpcEnvelope
//     同构；renderer 消费链真身 RpcClientError → 专用拒绝文案「能力缺席…拒绝」显式呈现，
//     fail-closed 用户可见面）→ git 项目零挂靠会话（attachedSessions 恒 0）。
// 范围注记：W2 判定核本体（resolveGitWorktree 缺席 + guardState 'absent' + core git 探针
// 表驱动矩阵）由 host 单测 worktree-rpc.test.ts absentRig 承载（缺席态无宿主注入缝，真机
// 不可达）；本 spec 承载真机可达面 = 非 git 零差异矩阵 + 拒绝呈现链（typed code → Toast/
// 错误条）。发送入口 prompt 拦截拒绝（SessionSealedError 同判）同属缺席态不可达面。
// data 锚：chip = [data-dswt-hero-trigger]；composer = [data-composer-input]；发送钮 =
// role button「发送消息」；拒绝面 = 文本「能力缺席」（hero-picker-model 专用文案）。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/session-binding-guarantee/1.7/003-capability-absent-matrix'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main；场景 B 拒绝面对象） */
function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-7-k5-git-'))
  const git = (args: string[], cwd = dir): void => {
    execFileSync('git', ['-c', 'user.email=t17k5@test', '-c', 'user.name=t17k5', ...args], { cwd, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), '1.7 k5 git fixture\n')
  git(['add', '.'])
  git(['commit', '-m', 'init'])
  return dir
}

/** 真·非 git 目录夹具（零 git init——W2 探针 null 路的场景 A 对象） */
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

const chip = (page: Page) => page.locator('[data-dswt-hero-trigger]')

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

/**
 * 场景 B 注入（宿主主进程边界，rpcEnvelope 带内信封同构——typed 拒绝走 renderer 消费链
 * 真身：invokeRpc → RpcClientError(code) → 专用拒绝文案）：session-create 通道换装恒返
 * ERR_WORKTREE_CAPABILITY_ABSENT。自检：换装后 renderer 桥直调必须收到 ok:false + 该码。
 */
async function injectCapabilityAbsentFinal(page: Page, app: ElectronApplication): Promise<void> {
  await app.evaluate(({ ipcMain }) => {
    const channel = 'forge:worktree/session-create'
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async () => ({
      ok: false,
      error: {
        code: 'ERR_WORKTREE_CAPABILITY_ABSENT',
        message: 'e2e fault: git 绑定能力缺席（W2 fail-closed 显式拒绝）',
      },
    }))
  })
  const injected = await page.evaluate(async () => {
    const g = globalThis as unknown as { dshForge: { invoke(c: string): Promise<unknown> } }
    const raw = (await g.dshForge.invoke('forge:worktree/session-create')) as {
      ok?: boolean
      error?: { code?: string }
    } | null
    return raw?.ok === false && raw?.error?.code === 'ERR_WORKTREE_CAPABILITY_ABSENT'
  })
  if (!injected) throw new Error('能力缺席 typed 注入未生效（ipcMain 换装失败）')
}

/** 挂靠会话计数（checks RPC——绑定判定共用源） */
async function attachedSessions(page: Page, wsDir: string, path: string): Promise<number> {
  const raw = (await forgeRpc(page, 'forge:worktree/checks', { projectRoot: wsDir, path })) as {
    data?: { attachedSessions?: number }
    attachedSessions?: number
  } | null
  return raw?.data?.attachedSessions ?? raw?.attachedSessions ?? -1
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

test('1.6 口径 5 UI：W2 能力缺席矩阵——非 git 照常（零拒绝零差异）+ git 入口显式拒绝（零挂靠）', async () => {
  test.setTimeout(360_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-7-k5-ud-'))
  const gitDir = makeGitRepo()
  const plainDir = makePlainDir()
  const app = await launchHost({ userData })
  const consoleLog: string[] = []
  try {
    const { page } = app
    page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`))
    await dismissOnboardingModals(page)
    await registerProject(page, gitDir, 'k5-git-repo')
    await registerProject(page, plainDir, 'k5-plain-ws')

    // ── 场景 A（先行——场景 B 注入不可逆）：真非 git → 官方原流零拒绝（照常）──
    await selectWorkspace(page, 'k5-plain-ws')
    const MARKER_A = '1-7-k5-plain-first-message'
    await typeDraft(page, MARKER_A)
    const sendStartA = Date.now() - 5_000
    const dirA = await sendUntilLanded(page, userData, 'k5-plain', sendStartA)
    console.log('[k5-scene-a] plain message landed at', dirA)
    // 非 git 零差异：零「能力缺席」拒绝呈现（W2 拒绝面不触碰非 git 项目）
    await expect(page.getByText('能力缺席'), '非 git 项目零能力缺席拒绝呈现（照常）').toHaveCount(0)
    await snap(page, 'scene-a-plain-unaffected.png')

    // ── 场景 B：typed 注入（ERR_WORKTREE_CAPABILITY_ABSENT）→ git 项目显式拒绝 ──
    await injectCapabilityAbsentFinal(page, app.app)
    console.log('[k5-scene-b] capability-absent typed injection active')
    await selectWorkspace(page, 'k5-git-repo')
    await expect.poll(async () => (await chip(page).count()) > 0 ? await chip(page).first().textContent() : '', {
      timeout: 30_000,
    }).toContain('main')
    const MARKER_B = '1-7-k5-git-first-message'
    await typeDraft(page, MARKER_B)
    // 显式拒绝呈现（fail-closed 用户可见面——专用文案含「能力缺席」语义，不静默、
    // 不套用「将落主树」误导文案）
    const rejectFace = page.getByText('能力缺席', { exact: false }).first()
    await expect(rejectFace, 'git 项目创建/首条消息应被显式拒绝（能力缺席文案呈现）').toBeVisible({ timeout: 90_000 })
    console.log('[k5-scene-b] reject face =', await rejectFace.textContent().catch(() => '?'))
    expect(await rejectFace.textContent().catch(() => ''), '拒绝文案不得含「将落主树」误导').not.toContain('将落主树')
    await snap(page, 'scene-b-git-explicit-reject.png')
    // fail-closed：git 项目零挂靠会话（拒绝 = 不落树、不假绑定）
    await page.waitForTimeout(10_000)
    expect(await attachedSessions(page, gitDir, gitDir), '显式拒绝后 git 项目零挂靠会话（不假绑定）').toBe(0)
  } finally {
    // eslint-disable-next-line no-console -- 判读留痕：runner stdout（Tee 日志）+ 证据目录双落
    console.log('[renderer-console]\n' + consoleLog.join('\n'))
    try {
      writeFileSync(join(EVIDENCE_DIR, 'renderer-console.log'), consoleLog.join('\n'), 'utf8')
    } catch {
      // 留痕失败不影响清理
    }
    await closeApp(app.app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(gitDir, { recursive: true, force: true })
    rmSync(plainDir, { recursive: true, force: true })
  }
})
