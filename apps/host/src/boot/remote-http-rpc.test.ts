// fix-25 webserver HTTP RPC 桥单测（纯 handler——fake req/res，零真实 socket）：
// 会话门（authorize=false 不触服务）/ 通道 allowlist / progress 装配 / approval 转发 /
// diag 落链 / 错误归一信封。
import { describe, expect, it } from 'vitest'
import {
  REMOTE_CHANNELS,
  type ForgeTasksService,
  type ProjectService,
  type ProjectSummary,
  type RemoteProgressSnapshot,
  type TaskCard,
  type TaskStats,
} from '@dsh-forge/contracts'
import {
  REMOTE_HTTP_RPC_PATH,
  authorizeRemoteRpc,
  handleRemoteHttpRpc,
  hasRemoteViewCookie,
  isRemoteHttpRpcRequest,
  type FakeRes,
} from './remote-http-rpc.js'

/** fake 请求（EventEmitter 最小面——handler 只消费 data/end 事件与 url/method） */
function fakeReq(body: unknown, url = REMOTE_HTTP_RPC_PATH, method = 'POST') {
  const listeners: Record<string, ((v: unknown) => void)[]> = {}
  return {
    method,
    url,
    headers: {},
    on(event: string, cb: (v: unknown) => void) {
      ;(listeners[event] ??= []).push(cb)
      if (event === 'end') queueMicrotask(() => this.emitData()) // body 自动到达（订阅 end 即流毕）
      return this
    },
    emitData(): void {
      const text = body === undefined ? '' : JSON.stringify(body)
      for (const cb of listeners['data'] ?? []) cb(Buffer.from(text))
      for (const cb of listeners['end'] ?? []) cb(undefined)
    },
  }
}

/** fake 响应（writeHead/end 捕获面） */
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

const TASKS: Pick<ForgeTasksService, 'listTasks' | 'taskStats'> = {
  listTasks: async () => [{ taskId: 't-1', title: 'X', taskStatus: 'in_progress' } as TaskCard],
  taskStats: async () => ({ total: 1, byStatus: { in_progress: 1 } as TaskStats['byStatus'], unmetPending: 0 }),
}
const PROJECTS: Pick<ProjectService, 'listProjects'> = {
  listProjects: async () => [{ id: 'p-1', name: 'demo' } as ProjectSummary],
}

function deps(overrides: Partial<Parameters<typeof handleRemoteHttpRpc>[2]> = {}) {
  return {
    tasks: TASKS,
    projects: PROJECTS,
    authorize: () => true,
    diag: () => {},
    ...overrides,
  }
}

describe('isRemoteHttpRpcRequest', () => {
  it('POST /remote/__rpc 命中；GET/静态路径不命中', () => {
    expect(isRemoteHttpRpcRequest('POST', '/remote/__rpc')).toBe(true)
    expect(isRemoteHttpRpcRequest('GET', '/remote/index.html')).toBe(false)
    expect(isRemoteHttpRpcRequest('GET', REMOTE_HTTP_RPC_PATH)).toBe(false)
  })
})

describe('handleRemoteHttpRpc 会话门', () => {
  it('authorize=false：不写响应体不触服务（官方 401 面已写毕）', async () => {
    const res = fakeRes()
    let touched = false
    await handleRemoteHttpRpc(
      fakeReq({ channel: REMOTE_CHANNELS.progress, payload: { projectId: 'p-1' } }) as never,
      res,
      deps({ authorize: () => (touched = true, false), tasks: undefined, projects: undefined }),
    )
    expect(touched).toBe(true)
    expect(res.status).toBe(0)
    expect(res.body).toBe('')
  })

  // fix-27 bug b9bfb9d3：401 静默零日志（诊断盲区）——会话门 false 分支必须落一行
  // diag（method/host/cookie 有无，不含值）后再静默返回（官方 401 面仍归官方面）。
  it('authorize=false：落 401 诊断行（method/host/cookie 有无——不含 cookie 值）', async () => {
    const res = fakeRes()
    const lines: string[] = []
    const req = fakeReq({ channel: REMOTE_CHANNELS.progress })
    req.headers = { host: 'tunnel.example', cookie: 'secret=value; other=1' }
    await handleRemoteHttpRpc(req as never, res, deps({ authorize: () => false, diag: (line) => lines.push(line) }))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('status=unauthorized')
    expect(lines[0]).toContain('method=POST')
    expect(lines[0]).toContain('tunnel.example')
    expect(lines[0]).toContain('cookie=present')
    expect(lines[0]).not.toContain('secret=value')
  })

  it('authorize=false 且无 cookie 头：诊断行 cookie=absent', async () => {
    const res = fakeRes()
    const lines: string[] = []
    await handleRemoteHttpRpc(
      fakeReq({ channel: REMOTE_CHANNELS.progress }) as never,
      res,
      deps({ authorize: () => false, diag: (line) => lines.push(line) }),
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('cookie=absent')
  })
})

describe('authorizeRemoteRpc（fix-27 自持兜底门——POST __rpc 专供）', () => {
  const res = fakeRes()
  it('官方 authorizeIndex true → 放行（零自持语义保持）', () => {
    expect(authorizeRemoteRpc({ headers: {} } as never, res, () => true)).toBe(true)
  })
  it('官方 false + dswf_forge_remote cookie 在场 → 放行（配对握手已认证语义）', () => {
    expect(authorizeRemoteRpc({ headers: { cookie: 'dswf_forge_remote=1; other=x' } } as never, res, () => false)).toBe(true)
  })
  it('官方 false 且 dswf cookie 缺席 → 拒绝', () => {
    expect(authorizeRemoteRpc({ headers: { cookie: 'other=x' } } as never, res, () => false)).toBe(false)
    expect(authorizeRemoteRpc({ headers: {} } as never, res, () => false)).toBe(false)
  })
})

describe('hasRemoteViewCookie（dswf 受限视图 cookie 在场判定）', () => {
  it('命中/缺席/无 cookie 头', () => {
    expect(hasRemoteViewCookie({ cookie: 'dswf_forge_remote=1' })).toBe(true)
    expect(hasRemoteViewCookie({ cookie: 'a=b; dswf_forge_remote=1; c=d' })).toBe(true)
    expect(hasRemoteViewCookie({ cookie: 'a=b' })).toBe(false)
    expect(hasRemoteViewCookie({})).toBe(false)
    expect(hasRemoteViewCookie(undefined)).toBe(false)
  })
})

describe('handleRemoteHttpRpc progress 通道', () => {
  it('listTasks+taskStats 装配只读快照信封（forge:remote/progress 同语义）', async () => {
    const res = fakeRes()
    await handleRemoteHttpRpc(
      fakeReq({ channel: REMOTE_CHANNELS.progress, payload: { projectId: 'p-1' } }) as never,
      res,
      deps(),
    )
    expect(res.status).toBe(200)
    const parsed = JSON.parse(res.body) as { ok: boolean; data: RemoteProgressSnapshot }
    expect(parsed.ok).toBe(true)
    expect(parsed.data.tasks).toHaveLength(1)
    expect(parsed.data.stats.total).toBe(1)
  })
})

describe('handleRemoteHttpRpc approval 通道', () => {
  it('决策转发到 forwarder（forge:remote/approval 同语义）', async () => {
    const res = fakeRes()
    const seen: unknown[] = []
    await handleRemoteHttpRpc(
      fakeReq({
        channel: REMOTE_CHANNELS.approval,
        payload: { requestId: 't-1', decision: 'allow' },
      }) as never,
      res,
      deps({ forwardApproval: async (input) => (seen.push(input), { forwarded: true }) }),
    )
    expect(seen).toHaveLength(1)
    expect((JSON.parse(res.body) as { data: { forwarded: boolean } }).data.forwarded).toBe(true)
  })

  it('forwarder 缺席 = fail-soft unavailable（信封 ok + forwarded:false）', async () => {
    const res = fakeRes()
    await handleRemoteHttpRpc(
      fakeReq({ channel: REMOTE_CHANNELS.approval, payload: { requestId: 't-1', decision: 'reject' } }) as never,
      res,
      deps({ forwardApproval: undefined }),
    )
    const parsed = JSON.parse(res.body) as { ok: boolean; data: { forwarded: boolean; reason: string } }
    expect(parsed.ok).toBe(true)
    expect(parsed.data.forwarded).toBe(false)
    expect(parsed.data.reason).toBe('unavailable')
  })
})

describe('handleRemoteHttpRpc projects 只读通道（受限视图 projectId 上下文）', () => {
  it('forge:projects/list → 项目清单信封', async () => {
    const res = fakeRes()
    await handleRemoteHttpRpc(fakeReq({ channel: 'forge:projects/list' }) as never, res, deps())
    const parsed = JSON.parse(res.body) as { ok: boolean; data: { id: string }[] }
    expect(parsed.ok).toBe(true)
    expect(parsed.data[0]?.id).toBe('p-1')
  })
})

describe('handleRemoteHttpRpc 边界', () => {
  it('allowlist 外通道 = 404', async () => {
    const res = fakeRes()
    await handleRemoteHttpRpc(fakeReq({ channel: 'forge:tasks/submitTask' }) as never, res, deps())
    expect(res.status).toBe(404)
  })

  it('畸形 body = 400', async () => {
    const res = fakeRes()
    await handleRemoteHttpRpc(fakeReq('not-json') as never, res, deps())
    expect(res.status).toBe(400)
  })

  it('服务抛错 = 信封 ok:false（HTTP 200 带内错误——rpc 信封同语义）', async () => {
    const res = fakeRes()
    await handleRemoteHttpRpc(
      fakeReq({ channel: REMOTE_CHANNELS.progress, payload: { projectId: 'p-x' } }) as never,
      res,
      deps({ tasks: { listTasks: async () => { throw new Error('store down') }, taskStats: async () => ({ total: 0, byStatus: {} as TaskStats['byStatus'], unmetPending: 0 }) } }),
    )
    expect(res.status).toBe(200)
    const parsed = JSON.parse(res.body) as { ok: boolean; error: { message: string } }
    expect(parsed.ok).toBe(false)
    expect(parsed.error.message).toBe('store down')
  })

  it('每次请求落一条 diag 行（/__rvdiag 同链——diag 桥 → harness.log）', async () => {
    const res = fakeRes()
    const lines: string[] = []
    await handleRemoteHttpRpc(
      fakeReq({ channel: REMOTE_CHANNELS.progress, payload: { projectId: 'p-1' } }) as never,
      res,
      deps({ diag: (line) => lines.push(line) }),
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('/remote/__rpc')
    expect(lines[0]).toContain(REMOTE_CHANNELS.progress)
  })
})
