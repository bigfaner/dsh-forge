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
const PROJECTS: Pick<ProjectService, 'listProjects' | 'getProject'> = {
  listProjects: async () => [{ id: 'p-1', name: 'demo' } as ProjectSummary],
  getProject: async () => null,
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
  it('bug 7e5ef681：diag 行分域标记——隧道 Host=[tunnel]、回环/LAN=[lan]', async () => {
    const lines: string[] = []
    const tunnelReq = fakeReq({ channel: REMOTE_CHANNELS.progress, payload: { projectId: 'p-1' } })
    tunnelReq.headers.host = 'x.trycloudflare.com'
    await handleRemoteHttpRpc(tunnelReq as never, fakeRes(), deps({ diag: (l) => lines.push(l) }))
    expect(lines[0]).toContain('[tunnel]')
    const lanReq = fakeReq({ channel: REMOTE_CHANNELS.progress, payload: { projectId: 'p-1' } })
    lanReq.headers.host = '192.168.1.7:3000'
    await handleRemoteHttpRpc(lanReq as never, fakeRes(), deps({ diag: (l) => lines.push(l) }))
    expect(lines[1]).toContain('[lan]')
    const loopReq = fakeReq({ channel: REMOTE_CHANNELS.progress, payload: { projectId: 'p-1' } })
    loopReq.headers.host = '127.0.0.1:19440'
    await handleRemoteHttpRpc(loopReq as never, fakeRes(), deps({ diag: (l) => lines.push(l) }))
    expect(lines[2]).toContain('[lan]')
  })

  it('authorize=false：不写响应体不触服务（官方 401 面已写毕）', async () => {    const res = fakeRes()
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
    // bug 8b97047a：准入后通道 ∈ allowlist 白名单常量集——diag 落真实通道名（可归因）
    expect(lines[0]).toContain(`channel=${REMOTE_CHANNELS.progress}`)
    expect(lines[0]).toContain('status=ok')
  })

  it('bug 7d26b074：handler 抛错 diag 行必带错误消息 + 通道名（真机连发 error 可归因）', async () => {
    const res = fakeRes()
    const lines: string[] = []
    await handleRemoteHttpRpc(
      fakeReq({ channel: REMOTE_CHANNELS.progress, payload: { projectId: 'p-x' } }) as never,
      res,
      deps({
        diag: (line) => lines.push(line),
        tasks: { listTasks: async () => { throw new Error('store down') }, taskStats: async () => ({ total: 0, byStatus: {} as TaskStats['byStatus'], unmetPending: 0 }) },
      }),
    )
    expect(lines[0]).toContain('status=error')
    expect(lines[0]).toContain('store down')
    expect(lines[0]).toContain(`channel=${REMOTE_CHANNELS.progress}`)
  })
})

describe('bug 12f3590f 二次派发防护（响应已写出 = 静默返回，绝无二次写出）', () => {
  it('headersSent=true：零写出零抛错（上游路由二次派发不撞已发头）', async () => {
    const res = fakeRes()
    let wrote = false
    const guarded = {
      ...res,
      headersSent: true,
      writeHead: (code: number, headers?: Record<string, unknown>) => {
        wrote = true
        return res.writeHead(code, headers)
      },
      end: (text?: string) => {
        wrote = true
        return res.end(text)
      },
    }
    const lines: string[] = []
    await expect(
      handleRemoteHttpRpc(
        fakeReq({ channel: REMOTE_CHANNELS.progress, payload: { projectId: 'p-1' } }) as never,
        guarded as never,
        deps({ diag: (line) => lines.push(line) }),
      ),
    ).resolves.toBeUndefined()
    expect(wrote).toBe(false)
    expect(lines.some((l) => l.includes('status=already-sent'))).toBe(true)
  })

  it('bug fc7741a8：并发双派发（写头前才翻 headersSent）= 后到写静默跳过，绝不抛错穿出', async () => {
    // 真实 ServerResponse.headersSent 在首次 writeHead 才翻转——入口守卫拦不住并发窗口
    const res = fakeRes()
    let writeCalls = 0
    const racing = {
      ...res,
      get headersSent() {
        return writeCalls > 0
      },
      writeHead: (code: number, headers?: Record<string, unknown>) => {
        writeCalls += 1
        if (writeCalls > 1) throw new Error('ERR_HTTP_HEADERS_SENT') // 真身同款抛错
        return res.writeHead(code, headers)
      },
      end: (text?: string) => res.end(text),
    }
    let releaseTasks: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      releaseTasks = resolve
    })
    const listTasks = async () => {
      await gate
      return []
    }
    const lines: string[] = []
    const depsWith = () => deps({ diag: (line) => lines.push(line), tasks: { listTasks, taskStats: async () => ({}) } })
    const p1 = handleRemoteHttpRpc(fakeReq({ channel: REMOTE_CHANNELS.progress, payload: {} }) as never, racing as never, depsWith())
    const p2 = handleRemoteHttpRpc(fakeReq({ channel: REMOTE_CHANNELS.progress, payload: {} }) as never, racing as never, depsWith())
    releaseTasks!()
    // 修复前：后到写头在 catch 内二次抛 ERR_HTTP_HEADERS_SENT 穿出（宿主 fatal）
    await expect(p1).resolves.toBeUndefined()
    await expect(p2).resolves.toBeUndefined()
    expect(lines.some((l) => l.includes('status=already-sent'))).toBe(true)
  })

  it('not-found diag 落真实通道名（allowlist miss 可归因——404 本就暴露无泄露面）', async () => {
    const res = fakeRes()
    const lines: string[] = []
    await handleRemoteHttpRpc(
      fakeReq({ channel: 'forge:proxy/session-openWorkspacePath' }) as never,
      res,
      deps({ diag: (line) => lines.push(line) }),
    )
    expect(res.status).toBe(404)
    expect(lines[0]).toContain('channel=forge:proxy/session-openWorkspacePath')
    expect(lines[0]).toContain('status=not-found')
  })
})
