// S8 spike：dsh 会话 id 在 tool 上下文可得性——主会话 + 子会话（匿名 executor subagent）
// 各调一次 s8_echo_ctx，dump ToolRunContext 身份面对比（M2 db-schema §7-14 排程，PRD 前）。
//
// 承重问题（SC6③ 与 task_records.session_id 追溯链的假设）：
//   ① 子会话的 tool exec ctx 是否携带 agent.session.id？形状与主会话一致吗？
//   ② 子会话 id 与主会话 id 是否可区分（executor 会话不隐没）？
//   ③ session.header.cwd 在两侧是否在场（cwd→工作区路由的依据）？
// 主会话半已有生产证据（knowledge 插件 recall_logs + dogfood e2e）——本跑双侧全采。
//
// 形态：产品宿主（dev profile）+ DSH_FORGE_PATCH_FILES 叠层注入 echo 插件 insert 行
// + dogfood 模型（真实模型往返）；隔离 userData + 隔离 DSH_HOME（凭据播种，同 flywheel）。
// 前置：echo 插件包已拷入 apps/host/profile.dev/node_modules/@dsh-s8/echo-ctx（README 记步骤）。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from '@playwright/test'
import { closeApp, launchHost, type Launched } from '../../e2e/support/launch.js'
import { realCredentials, seedDshHome } from '../../e2e/support/dogfood.js'
import { rmDirBestEffort, rmFileBestEffort } from '../../e2e/support/cleanup.js'
import { dirRow, enterDir } from '../../e2e/support/navigation.js'
import { COMPOSER_INPUT } from '../../e2e/support/anchors.js'

const PROMPT = [
  '严格按顺序完成下面两步操作，除此之外不要做任何别的事：',
  '第 1 步：调用工具 s8_echo_ctx，参数 why 填 main。',
  '第 2 步：用你的子代理工具（subagent，同步/阻塞方式）派发一个子任务，子任务的完整指令是：',
  '「调用工具 s8_echo_ctx，参数 why 填 subagent，把工具返回的内容原样贴出，然后立即结束，不要做任何其他事」。',
  '两步都完成后，只回复：DONE',
].join('\n')

/** 叠层：dogfood 模型行 + echo 插件 insert 行（spike 专用，不碰仓内 profile） */
function writeSpikeOverlay(): string {
  const target = join(tmpdir(), `dsh-s8-overlay-${process.pid}.yml`)
  writeFileSync(
    target,
    [
      '# S8 spike 叠层：dogfood 模型 + echo 插件 insert',
      '- id: llm-pi-ai',
      '  config:',
      '    providers:',
      '      zai-coding-cn:',
      '        apiKeyEnv: ZAI_CODING_CN_API_KEY',
      '- id: agent-default-model',
      '  config:',
      '    provider: zai-coding-cn',
      '    model: glm-5.3-flash',
      '- insert:',
      '    - id: dsh-s8-echo-ctx',
      "      name: '@dsh-s8/echo-ctx'",
      '',
    ].join('\n'),
    'utf8',
  )
  return target
}

interface EchoDump {
  why: string
  at: string
  agentSessionId: string | null
  headerCwd: string | null
  topCwd: string | null
  sessionKeys: string[]
  execKeys: string[]
  dumpError?: string
}

function readDumps(file: string): EchoDump[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as EchoDump)
}

/** 隔离 dshHome 会话目录清点（session-<id> 目录名 = 账本 id——子会话是否独立落盘的证据面） */
function listSessionDirs(dshHome: string): string[] {
  const sessionsRoot = join(dshHome, 'sessions')
  if (!existsSync(sessionsRoot)) return []
  const out: string[] = []
  for (const sanitized of readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!sanitized.isDirectory()) continue
    for (const entry of readdirSync(join(sessionsRoot, sanitized.name), { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('session-')) out.push(entry.name)
    }
  }
  return out
}

test('S8·主会话与子会话的 tool exec ctx 身份面对比（dogfood 真实模型）', async () => {
  test.setTimeout(600_000)
  const credentials = realCredentials()
  test.skip(credentials === undefined, 'dogfood 前置缺口：~/.dsh/.credentials.yaml 不在场——留痕 skip（同 flywheel 纪律）')

  const scratch = 'Z:\\project\\dsh\\tmp-redesign\\s8'
  rmSync(scratch, { recursive: true, force: true })
  mkdirSync(scratch, { recursive: true })
  const dumpFile = join(scratch, 'dumps.jsonl')
  // 夹具工作区（隔离 DSH_HOME 无工作区 → hero 空态无 composer——注册一个再选芯片，flywheel 同径）
  const wsRoot = mkdtempSync(join(tmpdir(), 'dsh-s8-wsroot-'))
  const wsFixture = join(wsRoot, 's8-ws')
  mkdirSync(wsFixture, { recursive: true })

  const userData = mkdtempSync(join(tmpdir(), 'dsh-s8-ud-'))
  const dshHome = join(userData, 'dsh-home')
  seedDshHome(dshHome, credentials as string)
  const overlay = writeSpikeOverlay()
  let launched: Launched | undefined
  try {
    launched = await launchHost({ userData, overlay, env: { S8_DUMP_FILE: dumpFile } })
    const page = launched.page

    // ── 注册夹具工作区（两段式：浏览器（Z: 段导航）→ 表单默认值确认） ──
    await page.locator('[data-dswf-cta="add-project"]').click()
    await page.locator('.dswf-ap[data-dswf-ap="browser"]').waitFor({ state: 'visible', timeout: 30_000 })
    for (const segment of ['AppData', 'Local', 'Temp', wsRoot.split('\\').at(-1) as string]) {
      await enterDir(page, segment)
    }
    await dirRow(page, 's8-ws').click()
    await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
    await page.locator('.dswf-ap[data-dswf-ap="form"]').waitFor({ state: 'visible', timeout: 30_000 })
    await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    await page.locator('.dswf-ap[data-dswf-ap="success"]').waitFor({ state: 'visible', timeout: 30_000 })
    await page.locator('.dswf-ap').first().waitFor({ state: 'hidden', timeout: 15_000 })

    // ── 会话即用（fix-24 后芯片 = 项目语义且唯一项目默认选中；S8 工具零 cwd 绑定——不选芯片） ──
    const composer = page.locator(COMPOSER_INPUT).last()
    await composer.waitFor({ state: 'visible', timeout: 60_000 })

    // ── 发送提示（真实模型往返） ──
    await composer.click()
    await page.keyboard.insertText(PROMPT)
    await page.keyboard.press('Enter')

    // 轮询 dump：等到 main + subagent 双份或超时（真实模型 + 子代理往返非瞬时）
    const deadline = Date.now() + 480_000
    let dumps: EchoDump[] = []
    while (Date.now() < deadline) {
      dumps = readDumps(dumpFile)
      const hasMain = dumps.some((d) => d.why === 'main')
      const hasSub = dumps.some((d) => d.why === 'subagent')
      if (hasMain && hasSub) break
      await page.waitForTimeout(5_000)
    }

    // ── 证据呈现（spike = 记录现实；断言只锁最低保障）──
    console.log('\n[S8] dump 全量：')
    for (const d of dumps) console.log('   ', JSON.stringify(d))
    console.log('[S8] 隔离 dshHome 会话目录：', JSON.stringify(listSessionDirs(dshHome)))
    console.log('[S8] 转录尾部（发送链核验）：', (await page.locator('[data-conversation-content]').first().textContent({ timeout: 10_000 }))?.slice(-400))

    const main = dumps.find((d) => d.why === 'main')
    const sub = dumps.find((d) => d.why === 'subagent')
    test.info().annotations.push({ type: 's8-dumps', description: JSON.stringify(dumps) })
    test.info().annotations.push({ type: 's8-session-dirs', description: JSON.stringify(listSessionDirs(dshHome)) })

    // 最低保障断言：主会话侧必得（生产证据复核）；子会话侧记录事实不设断言（spike 目的即测它）
    if (main === undefined && sub === undefined) {
      throw new Error('S8：两侧均无 dump——工具未被调用（检查转录与插件装载）')
    }
    if (main !== undefined) {
      if (main.agentSessionId === null) throw new Error('S8：主会话 agentSessionId 缺席——与生产证据矛盾，须排查')
    }
    if (main !== undefined && sub !== undefined) {
      console.log(
        `[S8·关键对比] main.id=${main.agentSessionId} sub.id=${sub.agentSessionId} 相异=${String(main.agentSessionId !== sub.agentSessionId)}；` +
          `main.headerCwd=${main.headerCwd} sub.headerCwd=${sub.headerCwd}；` +
          `main.sessionKeys=${main.sessionKeys.join(',')} sub.sessionKeys=${sub.sessionKeys.join(',')}`,
      )
    } else {
      console.warn('[S8] 单侧 dump（另一侧未发生）——见转录尾部分析')
    }
  } finally {
    if (launched !== undefined) await closeApp(launched.app)
    rmFileBestEffort(overlay)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(wsRoot)
  }
})
