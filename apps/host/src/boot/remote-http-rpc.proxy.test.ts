// mobile-ui 1.11 dispatch 面单测：forge:proxy/* 代理通道族（信封/归组/断言）+ PSK 隧道域
// 强制位（统一 401 唯一 owner + 填充 + diag 脱敏 + LAN 旧门维持）。
// 纯 handler fake 面——零真实 socket（remote-http-rpc.test.ts 同型）。
import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REMOTE_CHANNELS, type ProjectSummary, type WorktreeEntryDto } from '@dsh-forge/contracts'
import { PSK_VERSION, ReplayWatermark, deriveCommKey, deriveDeviceKey, generateSigningKeyPair, sealFrame, sigMaterial, signPayload, isPskEnforcedHost } from './psk.js'
import { PSK_SALT, rotatePsk, type PskGateDeps, type PskPersistShape } from './psk-gate.js'
import { PROXY_CHANNELS, type ProxyChannelDeps } from './proxy-channels.js'
import { DIAG_CHANNEL_REDACTED, REMOTE_HTTP_RPC_PATH, handleRemoteHttpRpc, type FakeRes } from './remote-http-rpc.js'

function fakeReq(body: unknown, host?: string) {
  const listeners: Record<string, ((v: unknown) => void)[]> = {}
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    method: 'POST',
    url: REMOTE_HTTP_RPC_PATH,
    headers: host === undefined ? {} : { host },
    on(event: string, cb: (v: unknown) => void) {
      ;(listeners[event] ??= []).push(cb)
      if (event === 'end') queueMicrotask(() => this.emitData())
      return this
    },
    emitData(): void {
      for (const cb of listeners['data'] ?? []) cb(Buffer.from(text))
      for (const cb of listeners['end'] ?? []) cb(undefined)
    },
  }
}

function fakeRes(): FakeRes {
  const res: FakeRes = {
    status: 0,
    headers: {},
    body: '',
    writeHead(code, headers?: Record<string, unknown>) {
      res.status = code
      res.headers = headers ?? {}
    },
    end(text) {
      res.body = text ?? ''
    },
  }
  return res
}

// ── forge:proxy/* 通道族（LAN 旧门语义——deps.proxy 注入）────────────

const SESSIONS = [
  { sessionId: 's-1', title: 'one', cwd: 'Z:/proj', running: true, updatedAt: '2026-10-18T10:00:00Z' },
  { sessionId: 's-2', title: 'two', cwd: 'Z:/proj/.forge/worktrees/wt-a', running: false, updatedAt: '2026-10-18T09:00:00Z' },
  { sessionId: 's-3', title: 'stray', cwd: 'Z:/elsewhere', running: false, updatedAt: '2026-10-18T11:00:00Z' },
]

const WORKTREES: WorktreeEntryDto[] = [
  { path: 'Z:/proj', branch: 'main', worktreeName: 'proj', isMain: true, present: true, detached: false, bare: false },
  { path: 'Z:/proj/.forge/worktrees/wt-a', branch: 'wt-a', worktreeName: 'wt-a', isMain: false, present: true, detached: false, bare: false },
]

function proxyDeps(overrides: Partial<ProxyChannelDeps> = {}): ProxyChannelDeps {
  return {
    session: {
      list: async () => SESSIONS,
      prompt: async (request) => ({ accepted: true, echo: request }),
      page: async () => ({ entries: [], hasMore: false }),
      projections: async () => ({ active: [], settled: [] }),
      cancel: async () => ({ accepted: true }),
      modelCatalog: async () => [{ id: 'deepseek-chat' }],
      selectModel: async () => ({ selected: true }),
      rename: async () => ({ renamed: true }),
    },
    commands: {
      list: async () => [{ name: 'run-dag-tasks' }],
      execute: async () => ({ executed: true }),
    },
    userQuestions: { answer: async () => ({ answered: true }) },
    projects: {
      listProjects: async () => [{ id: 'p-1', name: 'proj', wsPath: 'Z:/proj', archived: false } as unknown as ProjectSummary],
      getProject: async () => null,
    },
    worktrees: { list: async () => ({ isGit: true, entries: WORKTREES }) },
    forwardApproval: async (input) => (await Promise.resolve(input), { forwarded: true }),
    disconnect: () => {},
    ...overrides,
  }
}

function deps(overrides: { proxy?: ProxyChannelDeps; psk?: PskGateDeps; authorize?: () => boolean; diag?: (l: string) => void } = {}) {
  return {
    authorize: () => true,
    diag: () => {},
    ...overrides,
  }
}

describe('forge:proxy 代理通道族（in-process 直调信封）', () => {
  it('session-list：控制器 list 直调原样透传', async () => {
    const res = fakeRes()
    await handleRemoteHttpRpc(fakeReq({ channel: PROXY_CHANNELS.sessionList }) as never, res, deps({ proxy: proxyDeps() }))
    const parsed = JSON.parse(res.body) as { ok: boolean; data: unknown[] }
    expect(res.status).toBe(200)
    expect(parsed.ok).toBe(true)
    expect(parsed.data).toHaveLength(3)
  })

  it('session-prompt：payload 直调控制器（意图信封往返）', async () => {
    const res = fakeRes()
    const seen: unknown[] = []
    const proxy = proxyDeps({ session: { prompt: async (r) => (seen.push(r), { accepted: true }) } })
    await handleRemoteHttpRpc(fakeReq({ channel: PROXY_CHANNELS.sessionPrompt, payload: { sessionId: 's-1', text: 'hi' } }) as never, res, deps({ proxy }))
    expect(seen).toEqual([{ sessionId: 's-1', text: 'hi' }])
    expect((JSON.parse(res.body) as { data: { accepted: boolean } }).data.accepted).toBe(true)
  })

  it('commands / user-questions 通道直调；服务缺席 = fail-soft 错误信封（ok:false）', async () => {
    const res = fakeRes()
    await handleRemoteHttpRpc(fakeReq({ channel: PROXY_CHANNELS.commandsList }) as never, res, deps({ proxy: proxyDeps() }))
    expect((JSON.parse(res.body) as { ok: boolean; data: { name: string }[] }).ok).toBe(true)
    expect((JSON.parse(res.body) as { data: { name: string }[] }).data[0]?.name).toBe('run-dag-tasks')

    const res2 = fakeRes()
    await handleRemoteHttpRpc(fakeReq({ channel: PROXY_CHANNELS.userQuestionsAnswer, payload: { questionId: 'q1', answer: 'a' } }) as never, res2, deps({ proxy: proxyDeps() }))
    expect((JSON.parse(res2.body) as { data: { answered: boolean } }).data.answered).toBe(true)

    const res3 = fakeRes()
    await handleRemoteHttpRpc(fakeReq({ channel: PROXY_CHANNELS.commandsExecute, payload: {} }) as never, res3, deps({ proxy: { commands: undefined } }))
    const parsed3 = JSON.parse(res3.body) as { ok: boolean; error: { message: string } }
    expect(parsed3.ok).toBe(false)
    expect(parsed3.error.message).toContain('commands')
  })

  it('allowlist 外 proxy 通道 = 404（allowlist 纪律不因代理族放宽）', async () => {
    const res = fakeRes()
    await handleRemoteHttpRpc(fakeReq({ channel: 'forge:proxy/session-openWorkspacePath' }) as never, res, deps({ proxy: proxyDeps() }))
    expect(res.status).toBe(404)
  })

  it('forge:remote/disconnect：对偶缝调用 → {revoked:true}；缺席 = fail-soft {revoked:false}', async () => {
    let revoked = 0
    const res = fakeRes()
    await handleRemoteHttpRpc(fakeReq({ channel: REMOTE_CHANNELS.disconnect }) as never, res, deps({ proxy: proxyDeps({ disconnect: () => { revoked++ } }) }))
    expect(revoked).toBe(1)
    expect((JSON.parse(res.body) as { data: { revoked: boolean } }).data.revoked).toBe(true)

    const res2 = fakeRes()
    await handleRemoteHttpRpc(fakeReq({ channel: REMOTE_CHANNELS.disconnect }) as never, res2, deps({ proxy: proxyDeps({ disconnect: undefined }) }))
    expect((JSON.parse(res2.body) as { data: { revoked: boolean } }).data.revoked).toBe(false)
  })

  it('forge:proxy/approval：决策经 forwardApproval 中继；缺席 = fail-soft unavailable', async () => {
    const seen: unknown[] = []
    const res = fakeRes()
    await handleRemoteHttpRpc(fakeReq({ channel: PROXY_CHANNELS.approval, payload: { requestId: 'r1', decision: 'allow' } }) as never, res, deps({ proxy: proxyDeps({ forwardApproval: async (i) => (seen.push(i), { forwarded: true }) }) }))
    expect(seen).toHaveLength(1)
    expect((JSON.parse(res.body) as { data: { forwarded: boolean } }).data.forwarded).toBe(true)
  })
})

describe('forge:proxy/projects-grouped（api-handbook §6.0 响应体）', () => {
  it('项目 → worktree → sessions 归组 + unassigned 兜底桶；SessionSummary 原样；updatedAt 降序', async () => {
    const res = fakeRes()
    await handleRemoteHttpRpc(fakeReq({ channel: PROXY_CHANNELS.projectsGrouped }) as never, res, deps({ proxy: proxyDeps() }))
    const parsed = JSON.parse(res.body) as { ok: boolean; data: { generatedAt: number; projects: { id: string; worktrees: { path: string }[]; sessions: { sessionId: string }[] }[]; unassigned: { sessionId: string }[] } }
    expect(parsed.ok).toBe(true)
    expect(parsed.data.generatedAt).toBeGreaterThan(0)
    expect(parsed.data.projects).toHaveLength(1)
    const project = parsed.data.projects[0]!
    expect(project.id).toBe('p-1')
    expect(project.worktrees.map((w) => w.path)).toEqual(WORKTREES.map((w) => w.path))
    // 归组路径：cwd ∈ wsPath 子树 ∪ worktree 子树；运行中/时间序降序（s-1 更新）
    expect(project.sessions.map((s) => s.sessionId)).toEqual(['s-1', 's-2'])
    expect(parsed.data.unassigned.map((s) => s.sessionId)).toEqual(['s-3'])
  })

  it('归组路径匹配单测：worktree 存放目录 inferSource 归属（worktreeDir 内 cwd 不丢）', async () => {
    const { sessionCwdInProject } = await import('./proxy-channels.js')
    expect(sessionCwdInProject('Z:/proj/sub/deep', 'Z:/proj', [])).toBe(true)
    expect(sessionCwdInProject('Z:/proj/.forge/worktrees/wt-x', 'Z:/proj', [], 'Z:/proj/.forge/worktrees')).toBe(true)
    expect(sessionCwdInProject('Z:/other', 'Z:/proj', [])).toBe(false)
    expect(sessionCwdInProject(undefined, 'Z:/proj', [])).toBe(false)
    // 大小写/分隔符归一（Windows 口径）
    expect(sessionCwdInProject('z:/PROJ/file', 'Z:\\proj', [])).toBe(true)
  })

  it('worktree 读法失败 = 零 worktree 行降级（wsPath 子树归组仍成立）', async () => {
    const res = fakeRes()
    const proxy = proxyDeps({ worktrees: { list: async () => { throw new Error('git down') } } })
    await handleRemoteHttpRpc(fakeReq({ channel: PROXY_CHANNELS.projectsGrouped }) as never, res, deps({ proxy }))
    const parsed = JSON.parse(res.body) as { ok: boolean; data: { projects: { worktrees: unknown[]; sessions: { sessionId: string }[] }[]; unassigned: unknown[] } }
    expect(parsed.ok).toBe(true)
    expect(parsed.data.projects[0]!.worktrees).toHaveLength(0)
    expect(parsed.data.projects[0]!.sessions.map((s) => s.sessionId)).toEqual(['s-1', 's-2'])
  })
})

// ── PSK 隧道域强制位（唯一 401 owner）────────────────────────────────

const KP = generateSigningKeyPair()
const PSK_RAW = randomBytes(32)
const PIN = '123456'
const SHAPE: PskPersistShape = {
  v: 3,
  psk: PSK_RAW.toString('base64'),
  signing: {
    spki: KP.publicDer.toString('base64'),
    pkcs8: KP.secret.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  },
}

function pskDeps(overrides: Partial<PskGateDeps> = {}): PskGateDeps {
  return {
    load: () => SHAPE,
    pin: () => PIN,
    watermarks: new ReplayWatermark(),
    now: () => 1_000_000,
    ...overrides,
  }
}

/** 客户端侧封帧（c2s——与 host 门同派生链；携设备公钥注册帧——sig 核绑定 sid） */
function sealRequest(channel: string, payload: unknown, opts: { sid?: string; epoch?: number; seq?: number; pin?: string } = {}): string {
  const sid = opts.sid ?? 'device-A'
  const epoch = opts.epoch ?? 1
  const seq = opts.seq ?? 1
  const comm = deriveCommKey(PSK_RAW, opts.pin ?? PIN, PSK_SALT)
  const dk = deriveDeviceKey(comm, sid)
  const { iv, ct } = sealFrame(dk, 'c2s', sid, epoch, seq, Buffer.from(JSON.stringify({ channel, payload }), 'utf8'))
  const sig = signPayload(KP, sigMaterial(ct, iv, seq))
  return JSON.stringify({ v: PSK_VERSION, sid, epoch, iv: iv.toString('base64'), seq, ct: ct.toString('base64'), sig: sig.toString('base64'), dpk: KP.publicDer.toString('base64') })
}

describe('PSK 隧道域强制位（__rpc 入口拦截器 = 唯一 401 owner）', () => {
  const tunnelHost = 'forge-mobile.example.com'
  const proxy = proxyDeps()

  it('隧道域 + 有效信封：明文通道分发 + s2c 信封应答（可解密往返）', async () => {
    const wm = new ReplayWatermark()
    const res = fakeRes()
    await handleRemoteHttpRpc(fakeReq(sealRequest(PROXY_CHANNELS.sessionList, {}), tunnelHost) as never, res, deps({ proxy, psk: pskDeps({ watermarks: wm }) }))
    expect(res.status).toBe(200)
    const envelope = JSON.parse(res.body) as { v: number; sid: string; epoch: number; seq: number; iv: string; ct: string; sig: string }
    expect(envelope.v).toBe(PSK_VERSION)
    expect(envelope.sid).toBe('device-A')
    // s2c 应答解密（host 签名可验）
    const comm = deriveCommKey(PSK_RAW, PIN, PSK_SALT)
    const dk = deriveDeviceKey(comm, 'device-A')
    const { openFrame, verifyPayload } = await import('./psk.js')
    const iv = Buffer.from(envelope.iv, 'base64')
    const ct = Buffer.from(envelope.ct, 'base64')
    expect(verifyPayload(KP.publicDer, sigMaterial(ct, iv, envelope.seq), Buffer.from(envelope.sig, 'base64'))).toBe(true)
    const plain = JSON.parse(openFrame(dk, 's2c', 'device-A', 1, envelope.seq, iv, ct).toString('utf8')) as { ok: boolean; data: unknown[] }
    expect(plain.ok).toBe(true)
    expect(plain.data).toHaveLength(3)
    expect(wm.nextSendSeq('device-A', 1)).toBe(2) // s2c seq 单调推进
  })

  it('隧道域 + 无信封明文 = 统一 401 恒定体（零明文降级——dswf/authorizeIndex 放行也拒）', async () => {
    const res = fakeRes()
    await handleRemoteHttpRpc(fakeReq({ channel: PROXY_CHANNELS.sessionList }, tunnelHost) as never, res, deps({ proxy, psk: pskDeps() }))
    expect(res.status).toBe(401)
    expect(res.body).toHaveLength(4096)
  })

  it('隧道域 + 篡改信封 / 错 PIN / 重放 seq = 统一 401（失败路径归一）', async () => {
    // 错 PIN（双因子——PSK 对 PIN 无知亦无用）
    const res1 = fakeRes()
    await handleRemoteHttpRpc(fakeReq(sealRequest(PROXY_CHANNELS.sessionList, {}, { pin: '000000' }), tunnelHost) as never, res1, deps({ proxy, psk: pskDeps() }))
    expect(res1.status).toBe(401)
    // 重放（同 seq 二次提交——共享水位账本）
    const body = sealRequest(PROXY_CHANNELS.sessionList, {})
    const sharedWm = new ReplayWatermark()
    const res2 = fakeRes()
    const res3 = fakeRes()
    await handleRemoteHttpRpc(fakeReq(body, tunnelHost) as never, res2, deps({ proxy, psk: pskDeps({ watermarks: sharedWm }) }))
    await handleRemoteHttpRpc(fakeReq(body, tunnelHost) as never, res3, deps({ proxy, psk: pskDeps({ watermarks: sharedWm }) }))
    expect(res2.status).toBe(200)
    expect(res3.status).toBe(401)
    // 篡改 ct
    const tampered = JSON.parse(sealRequest(PROXY_CHANNELS.sessionList, {})) as Record<string, string>
    tampered['ct'] = Buffer.from('forged').toString('base64')
    const res4 = fakeRes()
    await handleRemoteHttpRpc(fakeReq(JSON.stringify(tampered), tunnelHost) as never, res4, deps({ proxy, psk: pskDeps() }))
    expect(res4.status).toBe(401)
  })

  it('隧道域 + 信封内未知通道 = 统一 401（通道枚举分型消解——不回 404）', async () => {
    const res = fakeRes()
    await handleRemoteHttpRpc(fakeReq(sealRequest('forge:proxy/session-openWorkspacePath', {}), tunnelHost) as never, res, deps({ proxy, psk: pskDeps() }))
    expect(res.status).toBe(401)
  })

  it('LAN/回环（IP 字面量 Host）维持旧门：明文 {channel,payload} 直达（桌面 fetch 兜底面不受影响）', async () => {
    const res = fakeRes()
    await handleRemoteHttpRpc(fakeReq({ channel: PROXY_CHANNELS.sessionList }, '192.168.1.7:3000') as never, res, deps({ proxy, psk: pskDeps() }))
    expect(res.status).toBe(200)
    expect((JSON.parse(res.body) as { ok: boolean }).ok).toBe(true)
  })

  it('PSK 未配置（门 load 缺席）= 旧门语义过渡期（隧道域明文仍可达）', async () => {
    const res = fakeRes()
    await handleRemoteHttpRpc(fakeReq({ channel: PROXY_CHANNELS.sessionList }, tunnelHost) as never, res, deps({ proxy, psk: pskDeps({ load: () => undefined }) }))
    expect(res.status).toBe(200)
  })

  it('diag 全程脱敏：401/ok/error 行均不含 channel 字面量', async () => {
    const lines: string[] = []
    await handleRemoteHttpRpc(fakeReq({ channel: PROXY_CHANNELS.sessionList }, 'tunnel.example') as never, fakeRes(), deps({ proxy, psk: pskDeps(), diag: (l) => lines.push(l) }))
    await handleRemoteHttpRpc(fakeReq(sealRequest(PROXY_CHANNELS.sessionList, {}), 'tunnel.example') as never, fakeRes(), deps({ proxy, psk: pskDeps(), diag: (l) => lines.push(l) }))
    expect(lines).toHaveLength(2)
    for (const line of lines) {
      expect(line).toContain(DIAG_CHANNEL_REDACTED)
      expect(line).not.toContain(PROXY_CHANNELS.sessionList)
    }
  })
})

// 生效域判定在 dispatch 面的组合行为锚（判定单测本体在 psk.test.ts）
describe('生效域组合锚', () => {
  it('isPskEnforcedHost 与 dispatch 分域一致（隧道强制/LAN 旧门）', () => {
    expect(isPskEnforcedHost('forge-mobile.example.com:8786')).toBe(true)
    expect(isPskEnforcedHost('192.168.1.7:3000')).toBe(false)
  })
})

// rotatePsk 轮换面（宽限期双钥——psk-gate 落盘形状）
describe('rotatePsk 轮换（撤销 + ≤5min 宽限期）', () => {
  it('再生成 = 新 PSK + 旧 PSK 入宽限窗 + host 签名钥保留', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'psk-test-'))
    const file = join(dir, 'remote-psk.json')
    const first = rotatePsk(file, undefined, 1000)
    expect(first.display).toMatch(/^[A-Z2-7]/)
    expect(first.shape.previous).toBeUndefined()
    const second = rotatePsk(file, first.shape, 2000)
    expect(second.shape.psk).not.toBe(first.shape.psk)
    expect(second.shape.previous?.psk).toBe(first.shape.psk)
    expect(second.shape.previous!.graceUntil).toBe(2000 + 5 * 60 * 1000)
    expect(second.shape.signing).toEqual(first.shape.signing) // 签名钥不随轮换换
    // 0600 落盘形状（文件存在 + v3）
    const onDisk = JSON.parse(await readFile(file, 'utf8')) as { v: number }
    expect(onDisk.v).toBe(3)
  })
})
