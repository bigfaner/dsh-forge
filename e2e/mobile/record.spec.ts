// @feature:mobile-ui
// 1.1 录制首跑（R12 改形）：隔离 boot + dogfood 低成本真实模型 + 配对链（connection-probe
// 历史锚点——回环 authority 改写 + cookie 手工入域复用）→ WireRecorder 驱动三腿抓样：
//   ① mobile 消费面：POST /remote/__rpc forge:proxy/* 全通道集 + forge:remote/{approval,disconnect}
//      （LAN 裸形态全录；PSK v3 信封头形态录代表通道——tunnel-psk §4）
//   ② forge-stream SSE 逐帧（snapshot/event 命名事件）+ 官方 /api/session/stream（prompt 腿事件帧）
//   ③ 官方 /api typert 端点腿 = 协议形状参照（R12#4：session/list SessionSummary 字段清单原样钉、
//      commands catalog/execute、userQuestions answer）
// 必钉项：SessionSummary 字段清单原样入 fixtures；session-prompt/commands-execute 完整 args。
// 门：显式 E2E_MOBILE_RECORD=1 才跑（录制首跑门）；零模型只读面不需要凭据——prompt 腿（真实模型
// + ask 三题型）凭据缺席 = 留痕降级（只读面照常产出 fixtures，不伪造）。回放消费面 = replay-smoke。
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
import { PROXY_CHANNELS, REMOTE_PROXY_CHANNELS } from './wire.js'

const FIXTURE_DIR = join(fileURLToPath(import.meta.url), '..', '..', 'fixtures', 'mobile')

/** ask 驱动提示词（三题型一次到位——F2 判别集：multiSelect + options[recommended] + 自由文本 custom） */
const ASK_PROMPT = [
  '请立即使用 ask 工具向我提出一次提问，要求恰好包含三道题：',
  '1) 单选题：题干「选择部署目标」，选项 local/cloud/hybrid，其中 cloud 标记 recommended；',
  '2) 多选题（multiSelect）：题干「选择启用的功能」，选项 auth/logging/metrics；',
  '3) 自由文本题：题干「补充说明」，不提供选项（期望我用文本回答）。',
  '提出后等待我的回答，不要自行继续。',
].join('\n')

/** forge:proxy/session-prompt 完整 args（必钉项——mobile 消费面载荷钉死；官方 SessionPromptRequest
 *  strict schema 同形：requestId/sessionId/mode/content/clientTimeZone） */
function promptArgs(sessionId: string, text: string): Record<string, unknown> {
  return {
    requestId: `rec-${Math.random().toString(36).slice(2, 10)}`,
    sessionId,
    mode: 'steer',
    content: [{ type: 'text', text }],
    clientTimeZone: 'Asia/Shanghai',
  }
}

/** forge:proxy/commands-execute 完整 args（必钉项——官方 commands 服务 wire 形） */
function executeArgs(sessionId: string, line: string): Record<string, unknown> {
  return { sessionId, line, submittedAttachments: [] }
}

/** ask 催促提示词（flash 模型未调用 ask 时的重发驱动——仍钉三题型语义） */
const RETRY_ASK_PROMPT = '你上一轮没有调用 ask 工具。请立即调用 ask 工具，按此前要求一次性提出三道题（单选含 recommended、multiSelect 多选、自由文本），然后停下等待我的回答，不要自行继续。'

function unwrap<T>(env: { readonly ok: boolean; readonly value?: unknown; readonly error?: unknown }, what: string): T {
  if (env.ok !== true) throw new Error(`录制驱动失败（${what}）：${JSON.stringify(env)?.slice(0, 400)}`)
  return env.value as T
}

test('mobile-ui 1.1 录制首跑（R12）：__rpc proxy 通道集 + forge-stream + /api 参照腿', async () => {
  test.setTimeout(900_000)
  test.skip(
    process.env.E2E_MOBILE_RECORD !== '1',
    '录制首跑门：显式 E2E_MOBILE_RECORD=1 才连真实 host（回放消费面 = replay-smoke.spec.ts）',
  )
  const credentials = realCredentials()
  const promptLeg = credentials !== undefined

  const userData = mkdtempOf('dsh-forge-e2e-mobile-record-ud-')
  const dshHome = join(userData, 'dsh-home')
  if (credentials !== undefined) seedDshHome(dshHome, credentials)
  const overlay = writeDogfoodOverlay()
  // 装配期 remoteApproval 读数源：预写配置 = 首启即全卡绑定 + /pair 缝注册（既有锚点同径）
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
    const pairUrl = await app!
      .context()
      .pages()[0]!
      .evaluate(async () => {
        const forge = (globalThis as { dshForge?: { getBootManifest(): Promise<{ remotePairUrl?: string }> } }).dshForge
        if (forge === undefined) throw new Error('dshForge preload 面缺席')
        return (await forge.getBootManifest()).remotePairUrl
      })
    expect(pairUrl, 'boot manifest 携官方配对地址').toBeTruthy()

    // ── 配对链（connection-probe 历史锚点：/pair 302 → 302 → 303，每跳 location 强制回环
    // authority 改写；cookie 手工入域——303 set-cookie 经 addCookies + 显式 Cookie 头双落） ──
    const pairUrlObj = new URL(pairUrl as string)
    const base = `http://127.0.0.1:${pairUrlObj.port}`
    const loopPairUrl = `${base}/pair?token=${pairUrlObj.searchParams.get('token') ?? ''}`
    const jar = app!.context().request
    const toLoopback = (url: string): string => {
      const u = new URL(url, base)
      return `${base}${u.pathname}${u.search}`
    }
    const pairRes = await jar.get(loopPairUrl, { maxRedirects: 0 })
    expect(pairRes.status(), '/pair 校验通过 = 302').toBe(302)
    const exchangeRes = await jar.get(toLoopback(pairRes.headers()['location'] as string), { maxRedirects: 0 })
    expect(exchangeRes.status(), '/remote/ 携 token → 302 官方根交换').toBe(302)
    const authRes = await jar.get(toLoopback(exchangeRes.headers()['location'] as string), { maxRedirects: 0 })
    expect(authRes.status(), 'BrowserAuth 兑现 = 303').toBe(303)
    const setCookie = authRes.headers()['set-cookie'] ?? ''
    const m = /^([^=;\s]+)=([^;]*)/.exec(setCookie)
    expect(m, '303 携 dsh-auth set-cookie').toBeTruthy()
    const authCookie = { name: m![1]!, value: m![2]!, url: `${base}/` }
    await app!.context().addCookies([authCookie])
    const cookie = cookieHeaderOf([authCookie])
    expect(cookie, '配对 cookie 在 jar（dsh-auth 会话 cookie）').toContain('dsh-auth-')

    const rec = new WireRecorder({ base, cookie, dir: FIXTURE_DIR })
    let sessionId = '(probe)'

    // ── ① mobile 消费面：forge:proxy 通道集（LAN 裸形态——真实响应原样入 fixture） ──
    await rec.proxyRpc(PROXY_CHANNELS.sessionList, {})
    await rec.proxyRpc(PROXY_CHANNELS.sessionGrouped, {})
    await rec.proxyRpc(PROXY_CHANNELS.sessionModelCatalog, {})
    await rec.proxyRpc(PROXY_CHANNELS.sessionPage, { sessionId, cursor: null })
    await rec.proxyRpc(PROXY_CHANNELS.sessionProjections, { sessionId })
    await rec.proxyRpc(PROXY_CHANNELS.sessionSelectModel, { sessionId, modelId: '(probe)' })
    await rec.proxyRpc(PROXY_CHANNELS.sessionRename, { sessionId, title: '(probe)' })
    await rec.proxyRpc(PROXY_CHANNELS.sessionCancel, { sessionId })
    await rec.proxyRpc(PROXY_CHANNELS.sessionPrompt, promptArgs(sessionId, '(probe) pin'))
    await rec.proxyRpc(PROXY_CHANNELS.commandsList, { sessionId })
    await rec.proxyRpc(PROXY_CHANNELS.commandsExecute, executeArgs(sessionId, '/help'))
    await rec.proxyRpc(PROXY_CHANNELS.userQuestionsAnswer, {
      sessionId,
      callId: '(probe)',
      answer: { answers: [{ id: '(probe)', selected: ['(probe)'], custom: '(probe)' }] },
    })
    await rec.proxyRpc(REMOTE_PROXY_CHANNELS.progress, {})
    await rec.proxyRpc(REMOTE_PROXY_CHANNELS.approval, { requestId: '(probe)', decision: 'allow' })
    evidence.push('proxyChannels=15(plain)')

    // PSK v3 信封头形态（tunnel-psk §4——代表通道；宿主未布 PSK 时旧门真实响应即证据）
    await rec.proxyRpc(PROXY_CHANNELS.sessionList, {}, 'psk')
    await rec.proxyRpc(PROXY_CHANNELS.sessionModelCatalog, {}, 'psk')
    evidence.push('pskForm=2')

    // ── ③ 官方 /api 参照腿（协议形状参照——R12#4）：SessionSummary 字段清单原样钉 ──
    const listEnv = await rec.apiRpc('session/list', { _request: {} })
    const sessions = unwrap<{ items: Array<{ sessionId?: string; running?: boolean }> }>(listEnv, 'session/list')
    sessionId = sessions.items[0]?.sessionId ?? sessionId
    evidence.push(`apiSessionList ok=${String(listEnv.ok)} items=${String(sessions.items.length)}`)
    await rec.apiRpc('session/modelCatalog', {})
    await rec.apiRpc('commands/list', { agentId: sessionId })
    await rec.apiRpc('commands/execute', { agentId: sessionId, line: '/help', submittedAttachments: [] })
    evidence.push('apiRefLeg=4')

    // ── ② forge-stream SSE 抓帧（mobile 推送面——宿主未布端点时状态行即形状证据） ──
    const forgeFrames = await rec.tapStream('/remote/forge-stream', 6_000)
    evidence.push(`forgeStream frames=${String(forgeFrames.length)}`)

    // ── prompt 腿（真实模型——凭据门）：建会话 + 官方流开窗 + ask 三题型往返 ──
    if (promptLeg) {
      const wsEnv = await rec.apiRpc('workspace/list', { _request: {} })
      const ws = wsEnv.ok ? (wsEnv.value as { items?: Array<{ workspaceId?: string }> } | undefined) : undefined
      const workspaceId = ws?.items?.[0]?.workspaceId
      const created = unwrap<{ sessionId: string }>(
        await rec.apiRpc('session/create', workspaceId === undefined ? { request: {} } : { request: { workspaceId } }),
        'session/create',
      )
      sessionId = created.sessionId
      evidence.push(`created=${sessionId}`)
      // 选强模型（ask 工具服从性——flash 档三轮实证不调用；官方 selectModel 形状同步钉进参照腿）
      unwrap(
        await rec.apiRpc('session/selectModel', { request: { sessionId, provider: 'zai-coding-cn', model: 'glm-5.3' } }),
        'session/selectModel',
      )

      // 官方实时流抓帧：WS mux（/api/remote.mux——本宿主真身实时通道）经页内 WebSocket
      // 采集（cookie/origin 同源自携；Node 全局 WS 无 cookie 头 = admission 拒 close(1006)
      // 实证）。窗内 Node 侧轮询取回、按 forge-stream SSE 形状转写落盘（首帧 snapshot）。
      const windowReady = app!.waitForEvent('window')
      await app!.evaluate(({ BrowserWindow }, url) => {
        const win = new BrowserWindow({ show: false, width: 390, height: 844 })
        void win.loadURL(url)
      }, `${base}/remote/`)
      const muxPage = await windowReady
      await muxPage
        .waitForFunction(() => typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'function', undefined, { timeout: 60_000 })
        .catch(() => undefined)
      const muxState = await muxPage
        .evaluate(() => {
          const g = globalThis as unknown as Record<string, unknown>
          const frames: string[] = []
          const ws = new (g['WebSocket'] as typeof WebSocket)(`ws://${(globalThis as unknown as { location: { host: string } }).location.host}/api/remote.mux`)
          g['__muxFrames'] = frames
          g['__muxWs'] = ws
          ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'open', streamId: 'rec-control', endpoint: 'session/control', payload: { args: {} } }))
          }
          ws.onmessage = (ev) => {
            frames.push(typeof ev.data === 'string' ? ev.data : String(ev.data))
          }
          ws.onerror = () => frames.push(JSON.stringify({ muxDiag: 'error' }))
          ws.onclose = (ev) => frames.push(JSON.stringify({ muxDiag: `close:${String(ev.code)}` }))
          return 'installed'
        })
        .catch((e) => `install-failed:${String(e).slice(0, 100)}`)
      evidence.push(`mux=${muxState}`)
      let muxFrames = 0
      const drainMux = async (): Promise<{ snapshot: boolean; event: boolean }> => {
        const got = (await muxPage.evaluate(() => {
          const g = globalThis as unknown as { __muxFrames?: string[] }
          const out = g['__muxFrames'] ?? []
          g['__muxFrames'] = []
          return out
        }).catch(() => [] as string[])) as string[]
        let snapshot = false
        let event = false
        for (const text of got) {
          try {
            const parsed = JSON.parse(text) as { type?: string }
            if (parsed.type !== 'item') continue
          } catch {
            continue
          }
          rec.writeSseFrame(muxFrames === 0 ? 'snapshot' : 'event', text)
          if (muxFrames === 0) snapshot = true
          else event = true
          muxFrames++
        }
        return { snapshot, event }
      }

      // ask 三题型驱动（flash 模型服从性兜底：未调用 ask 即催促重发，≤3 轮）；每次
      // prompt/轮询交换原样入 api-ref fixtures（interaction pending 投影真身）
      let ask: Awaited<ReturnType<typeof waitForAsk>> = { callId: '(unfound)', questionData: undefined }
      for (let attempt = 0; attempt < 3; attempt++) {
        unwrap(
          await rec.apiRpc('session/prompt', { request: promptArgs(sessionId, attempt === 0 ? ASK_PROMPT : RETRY_ASK_PROMPT) }),
          'session/prompt',
        )
        ask = await waitForAsk(rec, sessionId, 120_000, drainMux)
        if (ask.questionData !== undefined) break
      }
      evidence.push(`askPinned=${String(ask.questionData !== undefined)} callId=${ask.callId}`)
      if (ask.questionData !== undefined) {
        const questions = ask.questionData.questions as Array<{ id: string; multiSelect?: boolean; options?: Array<{ label: string }> }>
        const answers = questions.map((q) => {
          if (q.multiSelect === true) return { id: q.id, selected: (q.options ?? []).map((o) => o.label) }
          if ((q.options ?? []).length > 0) return { id: q.id, selected: [q.options![0]!.label] }
          return { id: q.id, selected: [], custom: '录制驱动自由文本回答' }
        })
        // mobile 消费面 answer 通道（完整 args 钉死）+ 官方参照腿真实 answer 驱动模型继续
        await rec.proxyRpc(PROXY_CHANNELS.userQuestionsAnswer, { sessionId, callId: ask.callId, answer: { answers } })
        unwrap(
          await rec.apiRpc('userQuestions/answer', { agentId: sessionId, callId: ask.callId, answer: { answers } }),
          'userQuestions/answer',
        )
        evidence.push(`answers=${String(answers.length)}`)
      }
      // turn 终态（running 收敛——事件帧成对流关窗）
      const runDeadline = Date.now() + 240_000
      for (;;) {
        const env = await rec.apiRpc('session/list', { _request: {} })
        const row = env.ok ? (env.value as { items: Array<{ sessionId: string; running?: boolean }> }).items.find((s) => s.sessionId === sessionId) : undefined
        await drainMux()
        if (row?.running !== true || Date.now() > runDeadline) break
        await sleep(3_000)
      }
      await drainMux()
      evidence.push(`controlFrames=${String(muxFrames)}`)
      // SessionSummary 必钉补录：真实会话行在册后的 session/list 原样（字段清单钉进 fixture）
      await rec.apiRpc('session/list', { _request: {} })
    } else {
      evidence.push('promptLeg=skipped(凭据缺席——只读面照常产出)')
    }

    // ── disconnect 最后录（撤配对缝——写动词，录制面收尾动作） ──
    await rec.proxyRpc(REMOTE_PROXY_CHANNELS.disconnect, {})

    mkdirSync(FIXTURE_DIR, { recursive: true })
    writeFileSync(join(FIXTURE_DIR, 'README.md'), renderReadme(evidence), 'utf8')
    console.log(`[mobile-record] 完成：${evidence.join('；')}`)
  } finally {
    if (app !== undefined) await closeApp(app)
    await rmDirBestEffort(userData)
  }
})

/** ask 载荷等待：session/list projections 轮询（每次交换原样入 api-ref fixtures）——
 *  userQuestions.active 在场即 ask 到达；载荷与 callId 递归提取（官方投影形状不预假设） */
async function waitForAsk(
  rec: WireRecorder,
  sessionId: string,
  windowMs: number,
  drain: () => Promise<unknown>,
): Promise<{ callId: string; questionData: { questions: unknown[]; rpcId?: string } | undefined }> {
  const deadline = Date.now() + windowMs
  for (;;) {
    const env = await rec.apiRpc('session/list', { _request: {} })
    if (env.ok) {
      const row = (env.value as { items?: Array<Record<string, unknown>> }).items?.find((s) => s['sessionId'] === sessionId)
      if (row !== undefined) {
        const hit = extractQuestions(row)
        if (hit !== undefined) return { callId: findCallId(row), questionData: { questions: hit.questions as unknown[], rpcId: hit.rpcId } }
      }
    }
    await drain()
    if (Date.now() > deadline) return { callId: '(unfound)', questionData: undefined }
    await sleep(2_000)
  }
}

function extractQuestions(node: unknown): { questions: unknown; rpcId?: string } | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = extractQuestions(item)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  if (typeof node !== 'object' || node === null) return undefined
  const obj = node as Record<string, unknown>
  if (Array.isArray(obj['questions']) && obj['questions'].length > 0) {
    return { questions: obj['questions'], rpcId: typeof obj['rpcId'] === 'string' ? obj['rpcId'] : undefined }
  }
  for (const value of Object.values(obj)) {
    const hit = extractQuestions(value)
    if (hit !== undefined) return hit
  }
  return undefined
}

function findCallId(node: unknown): string {
  if (typeof node !== 'object' || node === null) return '(unfound)'
  const obj = node as Record<string, unknown>
  for (const key of ['callId', 'rpcId', 'id']) {
    if (typeof obj[key] === 'string' && (obj[key] as string).length > 0 && obj[key] !== '(probe)') return obj[key] as string
  }
  for (const value of Object.values(obj)) {
    const hit = findCallId(value)
    if (hit !== '(unfound)') return hit
  }
  return '(unfound)'
}

function mkdtempOf(prefix: string): string {
  // E2E_USER_DATA_ROOT：userData 基目录覆盖（宿主派生会话 %TEMP% chromium 锁写拒实证）
  const base = process.env.E2E_USER_DATA_ROOT ?? tmpdir()
  return mkdtempSync(join(base, prefix))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** fixtures README（AC 证据面：录制来源、驱动序列、三 JSONL 清单——不含凭据/cookie） */
function renderReadme(evidence: readonly string[]): string {
  return [
    '# mobile 回放 fixtures（1.1 录制首跑产物——测试资产，R12 形状）',
    '',
    '来源：真实 host（隔离 boot + 配对链回环 authority + dogfood 低成本模型）录制。',
    `驱动证据：${evidence.join('；')}`,
    '',
    '| 文件 | 内容 |',
    '|---|---|',
    '| `proxy-rpc.jsonl` | POST /remote/__rpc 交换（{channel,payload} → RPC 信封）——forge:proxy/* 全通道集 + forge:remote/{progress,approval,disconnect}；LAN 裸形态 + PSK v3 信封头形态（envelope 字段） |',
    '| `api-ref.jsonl` | 官方 /api typert 端点交换（client-request 信封）——协议形状参照（R12#4）：session/list SessionSummary 字段清单原样、commands list/execute、userQuestions/answer |',
    '| `forge-stream.jsonl` | SSE 逐帧（snapshot/event 命名事件，t = 毫秒偏移）——/remote/forge-stream 状态行 + 官方 WS mux（/api/remote.mux session/control）页内采集帧按 forge-stream 形状转写（首帧 snapshot、后续 event，数据真实） |',
    '',
    '回放消费：`e2e/mobile/replay.ts` installReplay（page.route + timed SSE 重放）；冒烟 = `replay-smoke.spec.ts`。',
    '',
  ].join('\n')
}
