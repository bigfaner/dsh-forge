// @feature:mobile-ui
// 1.1 录制首跑（tech-design T3——真实 host 响应钉进回放 fixtures）：隔离 boot + dogfood
// 低成本真实模型 + LAN 配对链（remote-pair-cookie-chain 同径）→ WireRecorder 驱动
// /api/rpc 全清单 + /api/session/stream 命名事件帧 + /remote/__rpc 桥信封 + 官方指令
// catalog/execute RPC + interaction.pending ask 三题型载荷 → e2e/fixtures/mobile/ 三 JSONL。
// 门（对齐 m2 dogfood 生产者制）：显式 E2E_MOBILE_RECORD=1 才跑——自动套件零真实模型；
// 回放消费面 = replay-smoke.spec.ts。凭据缺席 = 留痕 skip（不伪造，Hard Rule）。
// 产物即测试资产进 git（AC）；cookie/凭据零落盘（fixture 只含 wire 体）。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type ElectronApplication } from '@playwright/test'
import { closeApp, launchHost } from '../support/launch.js'
import { rmDirBestEffort } from '../support/cleanup.js'
import { realCredentials, seedDshHome, writeDogfoodOverlay } from '../support/dogfood.js'
import { cookieHeaderOf, WireRecorder } from './recorder.js'

const FIXTURE_DIR = join(fileURLToPath(import.meta.url), '..', '..', 'fixtures', 'mobile')

/** ask 驱动提示词（三题型一次到位——R9 #2 判别集：multiSelect + custom 自由文本 + recommended） */
const ASK_PROMPT = [
  '请立即使用 ask 工具向我提出一次提问，要求恰好包含三道题：',
  '1) 单选题：题干「选择部署目标」，选项 local/cloud/hybrid，其中 cloud 标记 recommended；',
  '2) 多选题（multiSelect）：题干「选择启用的功能」，选项 auth/logging/metrics；',
  '3) 自由文本题：题干「补充说明」，不提供选项（期望我用文本回答）。',
  '提出后等待我的回答，不要自行继续。',
].join('\n')

interface SessionSummaryLike {
  readonly sessionId: string
  readonly running?: boolean
  readonly workspaceId?: string
}

interface WorkspaceItemLike {
  readonly workspaceId: string
  readonly sessionIds?: readonly string[]
}

function unwrap<T>(env: { readonly ok: boolean; readonly value?: unknown; readonly error?: unknown }, what: string): T {
  if (!env.ok) throw new Error(`录制驱动失败（${what}）：${JSON.stringify(env.error)}`)
  return env.value as T
}

test('mobile-ui 1.1 录制首跑：真实 host wire 抓样 → fixtures/mobile/', async () => {
  test.setTimeout(900_000)
  test.skip(
    process.env.E2E_MOBILE_RECORD !== '1',
    '录制生产者门：显式 E2E_MOBILE_RECORD=1 才连真实模型（回放消费面 = replay-smoke.spec.ts）',
  )
  const credentials = realCredentials()
  test.skip(
    credentials === undefined,
    'dogfood 前置缺口：真实模型凭据（~/.dsh/.credentials.yaml）不在场——留痕 skip（Hard Rule：不伪造凭据）',
  )

  const userData = mkdtempOf('dsh-forge-e2e-mobile-record-ud-')
  const dshHome = join(userData, 'dsh-home')
  seedDshHome(dshHome, credentials as string)
  const overlay = writeDogfoodOverlay()
  // 装配期 remoteApproval 读数源：预写配置 = 首启即全卡绑定 + /pair 缝注册（fix-22 同径）
  writeFileSync(join(userData, 'forge-settings.json'), JSON.stringify({ remoteApproval: { enabled: true } }), 'utf8')
  let app: ElectronApplication | undefined
  const evidence: string[] = []
  try {
    ;({ app } = await launchHost({
      userData,
      overlay,
      env: { DSH_FORGE_TEST_BRIDGE: '1' },
      timeouts: { firstWindow: 120_000, bootReady: 180_000, loaderLive: 120_000, workbenchVisible: 120_000 },
    }))
    const pairUrl = await app
      .context()
      .pages()[0]!
      .evaluate(async () => {
        const forge = (globalThis as { dshForge?: { getBootManifest(): Promise<{ remotePairUrl?: string }> } }).dshForge
        if (forge === undefined) throw new Error('dshForge preload 面缺席')
        return (await forge.getBootManifest()).remotePairUrl
      })
    expect(pairUrl, 'boot manifest 携官方配对地址').toBeTruthy()

    // ── 配对链（jar 同径 remote-pair-cookie-chain：/pair 302 → /remote/ 换官方根 → 303 → 认证） ──
    const jar = app.context().request
    const pairRes = await jar.get(pairUrl as string, { maxRedirects: 0 })
    expect(pairRes.status(), '/pair 校验通过 = 302').toBe(302)
    const remoteEntry = pairRes.headers()['location']
    const exchangeRes = await jar.get(remoteEntry as string, { maxRedirects: 0 })
    expect(exchangeRes.status(), '/remote/ 携 token → 302 官方根交换').toBe(302)
    const authRes = await jar.get(exchangeRes.headers()['location'] as string, { maxRedirects: 0 })
    expect(authRes.status(), 'BrowserAuth 兑现 = 303').toBe(303)
    const base = new URL(pairUrl as string).origin

    // cookie 头（录制面 Node fetch 直携——LAN origin host-only cookie 同源有效）
    const cookies = await app.context().cookies(`${base}/`)
    const cookie = cookieHeaderOf(cookies)
    expect(cookie, '配对 cookie 在 jar（dsh-auth 会话 cookie）').toContain('dsh-auth-')

    const rec = new WireRecorder({ base, cookie, dir: FIXTURE_DIR })

    // ── /api/rpc 只读清单（真实响应钉形状） ──
    const workspaces = unwrap<{ items: WorkspaceItemLike[] }>(await rec.apiRpc('workspace.list'), 'workspace.list')
    const sessions0 = unwrap<{ items: SessionSummaryLike[] }>(await rec.apiRpc('session.list'), 'session.list')
    unwrap(await rec.apiRpc('agentPreset.list'), 'agentPreset.list')
    evidence.push(`workspaces=${workspaces.items.length} sessions=${sessions0.items.length}`)

    // ── 建会话 + SSE 开流 + ask 三题型往返（真实模型） ──
    const workspaceId = workspaces.items[0]?.workspaceId
    expect(workspaceId, '至少一个工作区在场（ask 往返载体）').toBeTruthy()
    const created = unwrap<{ sessionId: string }>(
      await rec.apiRpc('session.create', { workspaceId }),
      'session.create',
    )
    const sessionId = created.sessionId
    unwrap(await rec.apiRpc('session.history', { sessionId, maxMessages: 100 }), 'session.history')

    // SSE 开流在前——prompt 链的事件帧（snapshot + event）全量入 fixture
    const sseDone = rec.tapSessionStream(sessionId, 240_000)
    unwrap(
      await rec.apiRpc('session.prompt', {
        sessionId,
        mode: 'steer',
        content: [{ type: 'text', text: ASK_PROMPT }],
        clientTimeZone: 'Asia/Shanghai',
      }),
      'session.prompt',
    )

    // interaction.pending 轮询（官方 150ms 防抖语义的录制面等价——等待 ask 到达）
    let pending: unknown
    const pendingDeadline = Date.now() + 240_000
    for (;;) {
      const env = await rec.apiRpc('interaction.pending', { sessionId })
      const value = env.ok ? (env.value as { pending?: unknown; questions?: unknown } | undefined) : undefined
      const hasQuestion =
        value !== undefined &&
        (Array.isArray((value as { questions?: unknown }).questions)
          ? (value as { questions: unknown[] }).questions.length > 0
          : (value as { pending?: unknown }).pending !== undefined && (value as { pending?: unknown }).pending !== null)
      if (hasQuestion) {
        pending = value
        break
      }
      if (Date.now() > pendingDeadline) throw new Error(`ask 未在时限内到达：interaction.pending=${JSON.stringify(env)}`)
      await sleep(3_000)
    }
    evidence.push(`pendingQuestions=${JSON.stringify(pending).length}B`)

    // 三题型答案（官方提交形状：{id, selected, custom?}——multiSelect 多选 / 自由文本 custom）
    const questions = ((pending as { questions?: Array<{ id: string; multiSelect?: boolean; options?: Array<{ label: string }> }> }).questions ?? []) as Array<{ id: string; multiSelect?: boolean; options?: Array<{ label: string }> }>
    const answers = questions.map((q) => {
      if (q.multiSelect) return { id: q.id, selected: (q.options ?? []).map((o) => o.label) }
      if ((q.options ?? []).length > 0) return { id: q.id, selected: [q.options![0]!.label] }
      return { id: q.id, selected: [], custom: '录制驱动自由文本回答' }
    })
    unwrap(await rec.apiRpc('interaction.answer', { rpcId: (pending as { rpcId: string }).rpcId, sessionId, answers }), 'interaction.answer')

    // turn 终态轮询（running 收敛——事件帧成对流关窗）
    const runDeadline = Date.now() + 240_000
    for (;;) {
      const list = unwrap<{ items: SessionSummaryLike[] }>(await rec.apiRpc('session.list'), 'session.list(poll)')
      const row = list.items.find((s) => s.sessionId === sessionId)
      if (row?.running !== true || Date.now() > runDeadline) break
      await sleep(3_000)
    }
    unwrap(await rec.apiRpc('session.history', { sessionId, maxMessages: 100 }), 'session.history(post)')
    const frames = await sseDone
    evidence.push(`sseFrames=${frames.length}`)

    // ── 官方指令执行 RPC（R9 #1 / F4 钉死：typert commands 服务 wire 暴露形态） ──
    const catalog = await rec.apiRpc('commands.list', { sessionId })
    evidence.push(`commands.list ok=${String(catalog.ok)}`)
    if (catalog.ok) {
      // 目录在场：执行首个非派发指令（dispatch 指令会拉起循环——录制面不真跑，形状钉死即可）
      const value = catalog.value as { commands?: Array<{ name?: string }>; items?: Array<{ name?: string }> }
      const catalogCommands = value?.commands ?? value?.items ?? []
      const safe = catalogCommands.map((c) => c.name ?? '').find((n) => n !== '' && !/run-dag|stop-dag/.test(n))
      const executed = await rec.apiRpc('commands.execute', { sessionId, name: safe ?? '(probe)', args: '' })
      evidence.push(`commands.execute ok=${String(executed.ok)} name=${safe ?? '(none)'}`)
    } else {
      // /api/rpc 不直达 typert（F4 证伪分支）——错误信封本身即钉死证据，落 remote 面探针
      const remoteCatalog = await rec.remoteRpc('commands.list', { sessionId })
      evidence.push(`remote commands.list ok=${String(remoteCatalog.ok)}`)
    }

    // ── /remote/__rpc 桥信封（真实只读通道） ──
    const progress = await rec.remoteRpc('forge:remote/progress', {})
    evidence.push(`forge:remote/progress ok=${String(progress.ok)}`)
    await rec.remoteRpc('forge:projects/list', {})

    mkdirSync(FIXTURE_DIR, { recursive: true })
    writeFileSync(
      join(FIXTURE_DIR, 'README.md'),
      renderReadme(evidence, sessionId),
      'utf8',
    )
    console.log(`[mobile-record] 完成：${evidence.join('；')}`)
  } finally {
    if (app !== undefined) await closeApp(app)
    await rmDirBestEffort(userData)
  }
})

function mkdtempOf(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** fixtures README（AC 证据面：录制来源、驱动序列、三类 JSONL 清单——不含凭据/cookie） */
function renderReadme(evidence: readonly string[], sessionId: string): string {
  return [
    '# mobile 回放 fixtures（1.1 录制首跑产物——测试资产）',
    '',
    `来源：真实 host（隔离 boot + dogfood 低成本模型）录制，录制会话 id = \`${sessionId}\`。`,
    `驱动证据：${evidence.join('；')}`,
    '',
    '| 文件 | 内容 |',
    '|---|---|',
    '| `api-rpc.jsonl` | POST /api/rpc 真实交换（{method,payload} → {ok,value\\|error}）——含 commands.list/execute 与 interaction.pending ask 题型载荷 |',
    '| `remote-rpc.jsonl` | POST /remote/__rpc 真实交换（{channel,payload} → RPC 信封） |',
    '| `sse-session-stream.jsonl` | GET /api/session/stream 命名事件帧（snapshot/event，t = 毫秒偏移） |',
    '',
    '回放消费：`e2e/mobile/replay.ts` installReplay（page.route + timed SSE 重放）；冒烟 = `replay-smoke.spec.ts`。',
    '',
  ].join('\n')
}
