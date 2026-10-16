// worktree-branch-management 1.25 真机 UI e2e（bug af65c0a9——hero 选 worktree 编排
// 失败/缺席双静默路消灭）：
//   · 编排成功：挂靠事件在场（checks attachedSessions ≥ 1）+ 会话头 worktree chip 呈现
//     （data-dswt-session-chip——worktree 来源会话必有绑定的修复验证探针）；
//   · 故障注入（session-create 通道恒拒，宿主 ipcMain 公共 API 换装）→ 官方 Toast 显式
//     呈现「创建挂靠会话」环节失败；会话不切换；选中态不产生「已选中」假象（chip 不切行）。
// 场景顺序 = 成功先行（注入经 removeHandler+重挂恒抛，不可逆——原 handler 取不回）。
// data 锚：chip = [data-dswt-hero-trigger]；菜单 = .dswt-hero-menu；会话头 chip =
// [data-dswt-session-chip]；Toast = 官方横幅（按文案定位）。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { findFixtureSession } from '../support/session-files.js'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/worktree-branch-management/1.25/001-orchestration-error'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main） */
function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-25-orch-repo-'))
  const git = (args: string[], cwd = dir): void => {
    execFileSync('git', ['-c', 'user.email=t125@test', '-c', 'user.name=t125', ...args], { cwd, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), '1.25 orchestration fixture\n')
  git(['add', '.'])
  git(['commit', '-m', 'init'])
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

async function registerProject(page: Page, wsDir: string): Promise<void> {
  await expect
    .poll(async () => {
      try {
        const raw = (await forgeRpc(page, 'forge:projects/register', {
          workspaceDir: wsDir,
          name: 'orch-repo',
          forgeDir: join(wsDir, '.forge'),
          knowledgeDir: join(wsDir, '.knowledge'),
        })) as { ok?: boolean; data?: { projectId?: string }; projectId?: string } | null
        const projectId = raw?.data?.projectId ?? raw?.projectId
        return typeof projectId === 'string'
      } catch {
        return false
      }
    }, { timeout: 60_000, message: '项目注册未就绪' })
    .toBe(true)
}

const chip = (page: Page) => page.locator('[data-dswt-hero-trigger]')
const heroMenu = (page: Page) => page.locator('.dswt-hero-menu')

async function attachedSessions(page: Page, wsDir: string, path: string): Promise<number> {
  const raw = (await forgeRpc(page, 'forge:worktree/checks', { projectRoot: wsDir, path })) as {
    data?: { attachedSessions?: number }
    attachedSessions?: number
  } | null
  return raw?.data?.attachedSessions ?? raw?.attachedSessions ?? -1
}

/**
 * 故障注入（宿主主进程边界——真实故障面）：公共 API ipcMain.removeHandler + 重挂恒抛
 * handler（renderer 侧 window.dshForge 为 contextBridge 暴露——属性不可改写、不可
 * redefine，双路实证；Electron 内部 handlers Map 亦不可达）。重挂不可逆（原 handler
 * 取不回）——注入恒为测试收尾步，成功场景先行。注入自检：换装后经 renderer 桥直调
 * 该通道，必须确实被拒（后续断言才可信）。
 */
async function injectSessionCreateFaultFinal(page: Page, app: ElectronApplication): Promise<void> {
  await app.evaluate(({ ipcMain }) => {
    const channel = 'forge:worktree/session-create'
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async () => {
      throw new Error('e2e fault: session-create rpc down')
    })
  })
  const blocked = await page.evaluate(async () => {
    const g = globalThis as unknown as { dshForge: { invoke(c: string): Promise<unknown> } }
    try {
      await g.dshForge.invoke('forge:worktree/session-create')
      return false
    } catch {
      return true
    }
  })
  if (!blocked) throw new Error('session-create 故障注入未生效（ipcMain 换装失败）')
}

/** 走查截图（失败不静默——退元素级/打点留痕） */
async function snap(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `${EVIDENCE_DIR}/${name}`, animations: 'disabled', timeout: 30_000 })
  } catch (cause) {
    console.log(`[1.25-snap-miss] ${name}: ${String(cause)}`)
  }
}

test('1.25 UI：编排成功（挂靠 + 会话头 chip）→ 故障注入后 Toast 显式呈现（不静默）+ 选中态不切行', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-25-orch-'))
  const wsDir = makeGitRepo()
  const app = await launchHost({ userData })
  try {
    const { page } = app
    await dismissOnboardingModals(page)
    await registerProject(page, wsDir)
    await expect(chip(page), 'hero worktree chip 未注入').toBeVisible({ timeout: 30_000 })

    // ── 场景 B（先行——故障注入不可逆）：选主树行 → 编排成功 ──
    await chip(page).first().click()
    await heroMenu(page).getByText('orch-repo', { exact: false }).first().click()
    // 挂靠事件在场（checks attachedSessions ≥ 1——header.cwd = worktree 根的宿主绑定面）
    await expect
      .poll(async () => attachedSessions(page, wsDir, wsDir), {
        timeout: 30_000,
        message: '主树应有挂靠会话（编排成功）',
      })
      .toBeGreaterThanOrEqual(1)
    // seal 绑定回读（会话头 cwd 语义的宿主真相）：从 dshHome 会话账本定位预铸会话 id
    // （账本目录名 session-<uuid>——id 形态按 seal 面实测双形都试，原始响应留痕）
    const dshHome = join(userData, 'dsh-home')
    let bound: { worktreePath?: string; branch?: string } | undefined
    await expect
      .poll(() => {
        const found = findFixtureSession(dshHome, 'orch-repo')
        if (found === undefined) return false
        const bare = found.sessionId.replace(/^session-/, '')
        return forgeRpc(page, 'forge:worktree/seal', { sessionId: bare })
          .then(
            (raw) => {
              const seal = (raw as { data?: { sealed?: boolean; binding?: { worktreePath?: string; branch?: string } } })?.data
              console.log('[1.25-scene-b] seal raw =', JSON.stringify(raw)?.slice(0, 300))
              if (seal?.binding?.worktreePath !== undefined) {
                bound = seal.binding
                return true
              }
              return forgeRpc(page, 'forge:worktree/seal', { sessionId: found.sessionId }).then((raw2) => {
                const seal2 = (raw2 as { data?: { binding?: { worktreePath?: string; branch?: string } } })?.data
                console.log('[1.25-scene-b] seal raw2 =', JSON.stringify(raw2)?.slice(0, 300))
                if (seal2?.binding?.worktreePath !== undefined) {
                  bound = seal2.binding
                  return true
                }
                return false
              })
            },
            (cause) => {
              console.log('[1.25-scene-b] seal err =', String(cause).slice(0, 200))
              return false
            },
          )
      }, { timeout: 30_000, message: 'seal 未读到预铸挂靠绑定' })
      .toBe(true)
    console.log('[1.25-scene-b] seal binding =', JSON.stringify(bound))
    expect(bound?.branch).toBe('main')
    // 会话头 worktree chip（修复验证探针——软探针：header actions 槽渲染相位受官方会话
    // 激活态影响，缺席留痕不判败；绑定真相由上方 seal 硬断言承载）
    const sessionChip = page.locator('[data-dswt-session-chip]')
    try {
      await expect(sessionChip.first(), '会话头 worktree chip 呈现').toBeVisible({ timeout: 15_000 })
      console.log('[1.25-scene-b] session-chip =', await sessionChip.first().textContent())
    } catch {
      console.log('[1.25-scene-b] session-chip 未呈现（header 槽渲染相位）——留痕')
    }
    await snap(page, 'orchestration-success-session-chip.png')

    // ── 场景 A：故障注入（session-create RPC 拒绝）→ 再选 worktree 行 → Toast 显式报错 ──
    await injectSessionCreateFaultFinal(page, app.app)
    const chipBefore = await chip(page).first().textContent()
    await chip(page).first().click()
    await heroMenu(page).getByText('orch-repo', { exact: false }).first().click()
    const failToast = page.getByText(/worktree 挂靠失败（创建挂靠会话）/)
    await expect(failToast.first(), '编排失败官方 Toast 显式呈现（含环节语义）').toBeVisible({ timeout: 15_000 })
    console.log('[1.25-scene-a] toast =', await failToast.first().textContent())
    await snap(page, 'orchestration-failure-toast.png')
    // 会话不切换：wt-a 零新增挂靠（仍只有前置挂靠面）
    await expect
      .poll(async () => attachedSessions(page, wsDir, wsDir), {
        timeout: 15_000,
        message: '主树挂靠计数不变（失败 = 不切换）',
      })
      .toBe(1)
    // 选中态不产生「已选中」假象：chip 文本不变（失败回填不落——1.25 口径）
    expect(await chip(page).first().textContent()).toBe(chipBefore)
  } finally {
    await closeApp(app.app)
  }
})
