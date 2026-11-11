// official-rpc host 半单测（plugin-project 1.33——官方缝双面注册 feature-detect 择优 +
// 降级 emitDiag + 端点分发音封投影三面覆盖）。
import { describe, expect, it, vi } from 'vitest'
import type { BugsServicePort, ProjectsServicePort } from '@dsh-forge/lib-api'
import {
  registerOfficialRpcChannels,
  type OfficialRpcCtxFace,
  type OfficialRpcHandler,
  type OfficialWorktreeRpcFace,
} from './official-rpc.js'

/** projects 端口替身（listProjects/getProject 全实现 + register typed error 投影面） */
function projectsPort(overrides: Partial<ProjectsServicePort> = {}): ProjectsServicePort {
  return {
    registerProject: vi.fn(async () => {
      const err = Object.assign(new Error('写入失败'), { code: 'ERR_PROJECT_WRITE', data: { compensated: false } })
      throw err
    }),
    listProjects: vi.fn(async () => [{ id: 'p1' }] as never),
    getProject: vi.fn(async (id: string) => ({ id }) as never),
    updateProject: vi.fn(),
    reconcileAtStartup: vi.fn(),
    ...overrides,
  } as ProjectsServicePort
}

/** bugs 端口替身（仅 listBugs 消费切片） */
function bugsPort(): BugsServicePort {
  return {
    registerBug: vi.fn(),
    resolveBug: vi.fn(),
    listBugs: vi.fn(async () => [{ bugId: 'b1' }] as never),
    getBug: vi.fn(),
    aggregateByErrorType: vi.fn(),
  } as unknown as BugsServicePort
}

/** worktree RPC 服务替身（remove 投影 delete 动词验证面） */
function worktreeSvc(): OfficialWorktreeRpcFace {
  return {
    list: vi.fn(async () => ({ isGit: true, entries: [] })),
    create: vi.fn(),
    remove: vi.fn(async () => ({ removed: true })),
    aheadBehind: vi.fn(),
    branches: vi.fn(),
    checks: vi.fn(),
    seal: vi.fn(),
    select: vi.fn(),
    selected: vi.fn(),
    resolve: vi.fn(),
    ensureWorkspace: vi.fn(),
  }
}

/** ctx 替身：handle spy（记录通道 + 返回注册 handler 表——供端点直呼验证） */
function ctxWithHandle(): { ctx: OfficialRpcCtxFace; channels: string[]; handlers: Map<string, OfficialRpcHandler> } {
  const channels: string[] = []
  const handlers = new Map<string, OfficialRpcHandler>()
  const ctx: OfficialRpcCtxFace = {
    connection: {
      rpc: {
        handle: vi.fn((channel: string, handler: OfficialRpcHandler) => {
          channels.push(channel)
          handlers.set(channel, handler)
          return async () => undefined
        }),
      },
    },
  }
  return { ctx, channels, handlers }
}

describe('registerOfficialRpcChannels（官方缝双面注册——feature-detect 择优）', () => {
  it('connection.rpc.handle 在场 → 三族官方通道全注册（通道名 = /forge-{projects,bugs,worktree}）', () => {
    const { ctx, channels } = ctxWithHandle()
    const result = registerOfficialRpcChannels(ctx, {
      projects: projectsPort,
      bugs: bugsPort,
      worktrees: worktreeSvc(),
    })
    expect(channels).toEqual(['/forge-projects', '/forge-bugs', '/forge-worktree'])
    expect(result.registered).toEqual(['/forge-projects', '/forge-bugs', '/forge-worktree'])
    expect(result.degraded).toEqual([])
  })

  it('缺族不空挂：deps 无 bugs → 只注册两通道', () => {
    const { ctx, channels } = ctxWithHandle()
    const result = registerOfficialRpcChannels(ctx, { projects: projectsPort, worktrees: worktreeSvc() })
    expect(channels).toEqual(['/forge-projects', '/forge-worktree'])
    expect(result.registered).toHaveLength(2)
  })

  it('feature-detect 缺席（ctx.connection.rpc.handle 非 function）→ 零注册 + 诚实降级（onDiag + emitDiag 负载留痕）', () => {
    const onDiag = vi.fn()
    const diag = vi.fn()
    const result = registerOfficialRpcChannels(
      {} as OfficialRpcCtxFace,
      { projects: projectsPort, worktrees: worktreeSvc(), onDiag, diag },
    )
    expect(result.registered).toEqual([])
    expect(result.degraded).toEqual(['official'])
    expect(onDiag).toHaveBeenCalledWith(expect.stringContaining('ctx.connection.rpc.handle 缺席'))
    expect(diag).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'official-rpc-register', level: 'warn' }),
    )
  })

  it('单族注册抛错只降本族（fail-soft 不阻其余族）', () => {
    const channels: string[] = []
    const ctx: OfficialRpcCtxFace = {
      connection: {
        rpc: {
          handle: (channel) => {
            channels.push(channel)
            if (channel === '/forge-bugs') throw new Error('route conflict')
            return async () => undefined
          },
        },
      },
    }
    const result = registerOfficialRpcChannels(ctx, {
      projects: projectsPort,
      bugs: bugsPort,
      worktrees: worktreeSvc(),
    })
    expect(result.registered).toEqual(['/forge-projects', '/forge-worktree'])
    expect(result.degraded).toEqual(['/forge-bugs'])
  })

  it('端点分发：projects list 负载透传 + {ok:true,value} 信封', async () => {
    const { ctx, handlers } = ctxWithHandle()
    const port = projectsPort()
    registerOfficialRpcChannels(ctx, { projects: () => port, worktrees: worktreeSvc() })
    const handler = handlers.get('/forge-projects')!
    const result = await handler('list', undefined)
    expect(result).toEqual({ ok: true, value: [{ id: 'p1' }] })
    expect(port.listProjects).toHaveBeenCalledExactlyOnceWith()
  })

  it('端点分发：get 载荷透传服务方法（payload → getProject 入参）', async () => {
    const { ctx, handlers } = ctxWithHandle()
    const port = projectsPort()
    registerOfficialRpcChannels(ctx, { projects: () => port })
    const result = await handlers.get('/forge-projects')!('get', { id: 'p9' })
    expect(result).toMatchObject({ ok: true, value: { id: 'p9' } })
    expect(port.getProject).toHaveBeenCalledExactlyOnceWith('p9')
  })

  it('typed error 投影：服务抛 {code,message,data} → {ok:false,error} 信封（code 原样带出）', async () => {
    const { ctx, handlers } = ctxWithHandle()
    registerOfficialRpcChannels(ctx, { projects: projectsPort })
    const result = await handlers.get('/forge-projects')!('register', { name: 'x' })
    expect(result).toEqual({
      ok: false,
      error: { code: 'ERR_PROJECT_WRITE', message: '写入失败', details: { compensated: false } },
    })
  })

  it('未承载端点 typed unavailable（deriveTaskStoreDir 归 core 服务——官方宿主诚实拒绝不 404 裸抛）', async () => {
    const { ctx, handlers } = ctxWithHandle()
    registerOfficialRpcChannels(ctx, { projects: projectsPort, bugs: bugsPort })
    const derive = await handlers.get('/forge-projects')!('deriveTaskStoreDir', { workspaceDir: 'Z:/p' })
    expect(derive).toMatchObject({ ok: false, error: { code: 'internal' } })
    expect((derive as { error: { message: string } }).error.message).toContain('deriveTaskStoreDir unavailable')
    const diff = await handlers.get('/forge-bugs')!('fileDiff', {})
    expect((diff as { error: { message: string } }).error.message).toContain('fileDiff unavailable')
  })

  it('未知端点 typed 拒绝（不裸抛断 transport）', async () => {
    const { ctx, handlers } = ctxWithHandle()
    registerOfficialRpcChannels(ctx, { projects: projectsPort })
    const result = await handlers.get('/forge-projects')!('evil', {})
    expect(result).toMatchObject({ ok: false, error: { code: 'internal' } })
  })

  it('worktree 端点表：delete → remove 投影 + list 全形服务消费', async () => {
    const { ctx, handlers } = ctxWithHandle()
    const svc = worktreeSvc()
    registerOfficialRpcChannels(ctx, { worktrees: svc })
    const deleted = await handlers.get('/forge-worktree')!('delete', { path: 'Z:/wt' })
    expect(deleted).toEqual({ ok: true, value: { removed: true } })
    expect(svc.remove).toHaveBeenCalledExactlyOnceWith({ path: 'Z:/wt' })
    const listed = await handlers.get('/forge-worktree')!('list', { projectRoot: 'Z:/p' })
    expect(listed).toEqual({ ok: true, value: { isGit: true, entries: [] } })
  })
})
