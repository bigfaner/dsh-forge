// 真机 UI e2e：非 git 项目零差异——官方原流照常（零拒绝、零 worktree UI 注入）。
// 语义（binding-derivation 绑定推导制）：会话创建 = 官方 session.create({workspaceId})
// 直通，非 git 域官方原路径不变（零 host 介入）；git 能力缺席拒绝面不存在的域——
// git 项目矩阵（W2 判定核本体）由 host 单测 worktree-rpc.test.ts absentRig 承载。
// data 锚：chip = [data-dswt-hero-trigger]；composer = [data-composer-input]；发送钮 =
// role button「发送消息」。
// e2e-fast-shared-launch 存量迁移（批次三a）：共享 launch fixture——launchHost 整 spec 一次，
// 夹具工作区即真·非 git 目录（seedWorkspace 播种基准态）；发送落盘判读经支撑层单源定位
//（SharedLaunchHandle.udDir 透传——魔法前缀扫描退役）内
// dsh-home/sessions，以夹具工作区目录末段唯一锚定（官方会话分组目录名 = cwd 扁平化，
// 分隔符归一为「-」——全路径段含分隔符永不命中，k3 同族锚定缺陷）。
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSharedLaunchFixture, wsSegment as wsSegmentOf } from '../support/fixtures.js'
import { expect, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/session-binding-guarantee/1.7/003-capability-absent-matrix'

/** 真·非 git 目录夹具（零 git init——官方探针 null 路对象）。
 *  共享 launch 形态：夹具工作区本体即 plain dir（首启/重播种统一播种同参基准态）。 */
function makePlainDir(dir: string): void {
  writeFileSync(join(dir, 'notes.txt'), '1.7 k5 plain (non-git) fixture\n')
}

// ── 共享 launch fixture（夹具工作区 = 非 git plain 目录；项目注册由 fixture 层首注册承载）──
const { test } = createSharedLaunchFixture({
  seedWorkspace: makePlainDir,
  workspaceName: 'k5-plain-ws',
})

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

/** 发送重试环（1.29 同款）：以会话日志落盘为唯一发送成功证据。
 *  已知产品红（bug bc81f4b8——非 git 工作区 composer 发送无效零落账）：两种手势均
 *  不消费 composer 文本、会话日志零追加，本用例在缺陷修复前恒红——triage 定谳在案。 */
async function sendUntilLanded(page: Page, udDir: string, wsDir: string, since: number): Promise<string> {
  const composer = page.locator('[data-composer-input]').first()
  const sendButton = page.getByRole('button', { name: '发送消息' })
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await composer.click()
    const enabled = await sendButton.isEnabled().catch(() => false)
    if (enabled) {
      await sendButton.click().catch(() => {})
    } else {
      await page.keyboard.press('Enter')
    }
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      const hit = findSessionDir(udDir, wsDir, since)
      if (hit !== undefined) return hit
      await page.waitForTimeout(1_000)
    }
  }
  throw new Error(`发送未落盘（wsDir=${wsDir}）——发送链路证据缺席`)
}

/** 会话日志落盘定位：支撑层单源定位（udDir 透传——本 worker 独立持有）下 dsh-home/sessions，
 *  取 cwd 分组目录（目录名 = cwd 扁平化）含夹具工作区末段、mtime ≥ since 的日志。 */
function findSessionDir(udDir: string, wsDir: string, since: number): string | undefined {
  const fragment = wsSegmentOf(wsDir).toLowerCase()
  const root = join(udDir, 'dsh-home', 'sessions')
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
      if (row.endsWith('.jsonl.zstd') && stat.mtimeMs >= since && dir.replaceAll('\\', '/').toLowerCase().includes(fragment)) {
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

test('真非 git UI：官方原流零拒绝（照常）', async ({ sharedLaunch }) => {
  test.setTimeout(300_000)
  const { page, wsDir, udDir } = sharedLaunch
  const consoleLog: string[] = []
  page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`))
  try {
    // 真·非 git：官方原流零拒绝（照常）——选中 → 首条消息发送落盘
    await selectWorkspace(page, 'k5-plain-ws')
    const MARKER_A = '1-7-k5-plain-first-message'
    await typeDraft(page, MARKER_A)
    const sendStartA = Date.now() - 5_000
    let dirA: string
    try {
      dirA = await sendUntilLanded(page, udDir, wsDir, sendStartA)
    } catch (cause) {
      // 缺陷取证：发送无效态截图（composer 有文、零落账——bug bc81f4b8 证据帧）
      await snap(page, 'send-ineffective-state.png')
      throw cause
    }
    console.log('[k5-scene-a] plain message landed at', dirA)
    // 非 git 零差异：零拒绝呈现（官方原路径不变，零 host 介入）
    await expect(page.getByText('能力缺席'), '非 git 项目零拒绝呈现（照常）').toHaveCount(0)
    await snap(page, 'scene-a-plain-unaffected.png')
  } finally {
    // 判读留痕：runner stdout（Tee 日志）+ 证据目录双落（app/夹具清理归 fixture 层收尾）
    console.log('[renderer-console]\n' + consoleLog.join('\n'))
    try {
      writeFileSync(join(EVIDENCE_DIR, `renderer-console-${Date.now()}.log`), consoleLog.join('\n'), 'utf8')
    } catch {
      // 留痕失败不影响收尾
    }
  }
})
