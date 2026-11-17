// typert-remotes 单测（plugin-project 1.38——八族 forge:* 收编 Typert namespace 新增面）：
// ① marker 表 pin（remoteMethods 快照 = gateway SRC 发现面的端点真源——namespace/method/
//   exportName/mode 逐位断言）；② SRC 形参名单源 pin（wire 名 = JS 形参名——client descriptor
//   表 ui/remote.ts 与本表成对锁定）；③ followSeal 快照钩（baseline + 变化才 yield + abort 出
//   循环）；④ 注册装配（根 ctx plugin 捕获 + 缺族降级清单 + 降级诊断留痕）；⑤ fs listDir 与
//   typed unavailable 诚实拒绝。
import { describe, expect, it, vi } from 'vitest'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { unavailableMessage } from './typert-remotes.js'
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ForgeBugsRemote,
  ForgeDirsRemote,
  ForgeFeaturesRemote,
  ForgeFsRemote,
  ForgeProjectsRemote,
  ForgeWorktreeRemote,
  listDir,
  registerForgeTypertRemotes,
  selfProbeOf,
  SEAL_FOLLOW_INTERVAL_MS,
  type ForgeTypertDeps,
  type TypertAssemblyCtxFace,
} from './typert-remotes.js'

/** marker 端点表投影（namespace/method/exportName/mode 四面快照） */
function endpointsOf(service: object): string[] {
  return remoteMethods(service).map((m) => `${m.method}${m.exportName !== undefined ? `>${m.exportName}` : ''}${m.mode !== undefined ? `:${m.mode}` : ''}`)
}

/** 根 ctx plugin 捕获替身（真实 cordis 子 ctx——控制器构造走 reflect.provide） */
function captureRoot(): {
  face: TypertAssemblyCtxFace
  mounted: { name: string; scope: Context }[]
} {
  const mounted: { name: string; scope: Context }[] = []
  const face: TypertAssemblyCtxFace = {
    root: undefined,
    plugin(options: { name: string; apply: (scope: Context) => void }) {
      const scope = new Context()
      mounted.push({ name: options.name, scope })
      options.apply(scope)
      return scope
    },
  }
  return { face, mounted }
}

function fakeCtx(): Context {
  // 真实 cordis ctx（TypertRemoteService 构造期 super(ctx, key) 走 reflect.provide——shape
  // 替身不可满足；seams.test/anchors.cordis.test 同径）
  return new Context() as unknown as Context
}

describe('端点面 pin（gateway SRC 端点真源——strict 生成贡献锁定，手写 descriptor 表已退役）', () => {
  it('forgeProjects：list/register/deriveTaskStoreDir/update 四端点（一元直通；update = sidebar 五功能写面 1.6）', () => {
    const svc = new ForgeProjectsRemote(fakeCtx(), {})
    expect(endpointsOf(svc)).toEqual(['list', 'register', 'deriveTaskStoreDir', 'update'])
  })

  it('forgeBugs：list/commitFiles/fileDiff 三端点', () => {
    const svc = new ForgeBugsRemote(fakeCtx(), {})
    expect(endpointsOf(svc)).toEqual(['list', 'commitFiles', 'fileDiff'])
  })

  it('forgeFs：listDir 单端点', () => {
    const svc = new ForgeFsRemote(fakeCtx())
    expect(endpointsOf(svc)).toEqual(['listDir'])
  })

  it('forgeWorktree：十二端点——remove 以 exportName delete 投影 + followSeal mode:stream + resolve（1.6 归属解析）', () => {
    const svc = new ForgeWorktreeRemote(fakeCtx(), { worktrees: () => ({}) as never })
    expect(endpointsOf(svc)).toEqual([
      'list',
      'create',
      'remove>delete',
      'aheadBehind',
      'branches',
      'checks',
      'seal',
      'followSeal:stream',
      'select',
      'selected',
      'ensureWorkspace',
      'resolve',
    ])
  })

  it('forgeFeatures：list 单端点', () => {
    expect(endpointsOf(new ForgeFeaturesRemote(fakeCtx(), {}))).toEqual(['list'])
  })

  it('forgeDirs：facts 单端点（基本信息区五行——host 侧解析下发）', () => {
    expect(endpointsOf(new ForgeDirsRemote(fakeCtx(), {}))).toEqual(['facts'])
  })
})

describe('ForgeDirsRemote.facts（fix-1——core 缺席插件自装配：workspaceRoot 自官方工作区面、forgeDir 插件派生）', () => {
  const WS = 'Z:\\ws\\demo'
  const wsRootOf = (ws: string | null) => () => (async () => ws) as never

  it('core 缺席：workspaceRoot 经插件工作区面 + forgeDir = wsPath/.forge 插件内派生（零 core face）', async () => {
    const svc = new ForgeDirsRemote(fakeCtx(), {
      dirsWorkspaceRoot: wsRootOf(WS),
      dirFacts: () =>
        ({
          listAnchors: async (_id: string, dirKey?: string) => [{ dirKey: dirKey ?? '', dir: `dir:${dirKey}`, description: 'd' }],
        }) as never,
    })
    const rows = await svc.facts({ projectId: 'p-1' })
    expect(rows.map((r) => r.dirKey)).toEqual(['workspaceRoot', 'forgeDir', 'forge.docs_root', 'forge.task_home', 'forge.worktrees'])
    expect(rows[0]).toEqual({ dirKey: 'workspaceRoot', dir: WS, description: '项目工作区根' })
    expect(rows[1]).toEqual({ dirKey: 'forgeDir', dir: `${WS}\\.forge`, description: '本工作区 .forge 目录' })
    expect(rows[2]).toEqual({ dirKey: 'forge.docs_root', dir: 'dir:forge.docs_root', description: 'd' })
  })

  it('逐键 fail-soft：锚解析抛 / dirFacts 缺席 / 工作区根缺席 = 该行 dir null，不阻断其余行不抛', async () => {
    const svc = new ForgeDirsRemote(fakeCtx(), {
      dirsWorkspaceRoot: wsRootOf(null),
      dirFacts: () =>
        ({
          listAnchors: async () => {
            throw new Error('anchors unavailable')
          },
        }) as never,
    })
    const rows = await svc.facts({ projectId: 'p-x' })
    expect(rows.every((r) => r.dir === null)).toBe(true)
    expect(rows.map((r) => r.dirKey)).toHaveLength(5)
    const noFacts = new ForgeDirsRemote(fakeCtx(), { dirsWorkspaceRoot: wsRootOf(WS) })
    const bare = await noFacts.facts({ projectId: 'p-1' })
    expect(bare.slice(2).every((r) => r.dir === null)).toBe(true)
    expect(bare[0]?.dir).toBe(WS)
    const throws = new ForgeDirsRemote(fakeCtx(), {
      dirsWorkspaceRoot: () =>
        (async () => {
          throw new Error('boom')
        }) as never,
      dirFacts: () =>
        ({
          listAnchors: async () => {
            throw new Error('anchors unavailable')
          },
        }) as never,
    })
    const safe = await throws.facts({ projectId: 'p-1' })
    expect(safe.slice(0, 2).every((r) => r.dir === null)).toBe(true)
  })

  it('双面全缺 → typed unavailable（诚实拒绝）', async () => {
    const svc = new ForgeDirsRemote(fakeCtx(), {})
    await expect(svc.facts({ projectId: 'p-1' })).rejects.toThrow(unavailableMessage('facts', 'dirs'))
  })
})

describe('SRC 形参名单源 pin（wire 名 = JS 形参名——client descriptor 表 wire 成对锁定）', () => {
  it('worktree 各方法首形参名 = query；followSeal 尾参 = signal（cancellation 注入位）', () => {
    const svc = Object.create(ForgeWorktreeRemote.prototype) as Record<string, (...args: unknown[]) => unknown>
    for (const method of ['list', 'create', 'aheadBehind', 'branches', 'checks', 'seal', 'followSeal', 'select', 'selected', 'ensureWorkspace', 'resolve']) {
      expect(methodParameterNames(svc[method]), method).toEqual(['query', 'signal'])
    }
    expect(methodParameterNames(svc['remove'] as never), 'remove').toEqual(['query', 'signal'])
  })

  it('forgeProjects 形参名：list(signal)/register(input)/deriveTaskStoreDir(workspaceDir)/update(id,patch)', () => {
    const svc = Object.create(ForgeProjectsRemote.prototype) as Record<string, (...args: unknown[]) => unknown>
    expect(methodParameterNames(svc['list'] as never)).toEqual(['signal'])
    expect(methodParameterNames(svc['register'] as never)).toEqual(['input', 'signal'])
    expect(methodParameterNames(svc['deriveTaskStoreDir'] as never)).toEqual(['workspaceDir', 'signal'])
    expect(methodParameterNames(svc['update'] as never)).toEqual(['id', 'patch', 'signal'])
  })

  it('forgeFs.listDir 形参名 = (dirPath, signal)', () => {
    const svc = Object.create(ForgeFsRemote.prototype) as Record<string, (...args: unknown[]) => unknown>
    expect(methodParameterNames(svc['listDir'] as never)).toEqual(['dirPath', 'signal'])
  })

  /** 函数形参名抽取（gateway methodParameterNames 同径——纯标识符源码解析） */
  function methodParameterNames(fn: (...args: unknown[]) => unknown): string[] {
    const source = Function.prototype.toString.call(fn)
    const head = source.slice(source.indexOf('(') + 1, source.indexOf(')'))
    return head
      .split(',')
      .map((part) => part.trim().split(/[?:]/)[0]?.trim() ?? '')
      .filter((name) => name !== '')
  }
})

describe('followSeal 快照钩（baseline + 变化才 yield + abort 出循环）', () => {
  it('首帧 = baseline 原样；快照不变不重发；变化才逐帧增量', async () => {
    const baseline = { isGit: true, sealed: false, binding: { worktreePath: '/w', branch: 'main' } }
    const queue = [baseline, baseline, { ...baseline, sealed: true }]
    let cursor = 0
    const svc = new ForgeWorktreeRemote(fakeCtx(), {
      worktrees: () => ({ seal: async () => queue[Math.min(cursor++, queue.length - 1)] }) as never,
      followIntervalMs: 0,
    })
    const frames: unknown[] = []
    const controller = new AbortController()
    for await (const frame of svc.followSeal({ sessionId: 's-1' }, controller.signal)) {
      frames.push(frame)
      // baseline 重复帧零重发（快照钩 JSON 比对）；sealed 翻转帧到达即 abort 出循环
      if ((frame as { sealed: boolean }).sealed) controller.abort()
    }
    expect(frames).toHaveLength(2)
    expect(frames[0]).toEqual(baseline)
    expect((frames[1] as { sealed: boolean }).sealed).toBe(true)
  })

  it('重估间隔常量 pin（轮询节拍单源——诊断/调参锚）', () => {
    expect(SEAL_FOLLOW_INTERVAL_MS).toBe(3_000)
  })
})

// ── inject 生命周期缝替身（1.12 conversation-views-face 同径——服务在场同步激活、缺席挂起、provide 后补激活） ──

function captureInjectLifecycle(initial?: { forgeFeatures?: unknown }): {
  face: TypertAssemblyCtxFace
  mounted: { name: string; scope: Context }[]
  provide: (key: 'forgeFeatures', svc: unknown) => void
  pendingCount: () => number
} {
  const mounted: { name: string; scope: Context }[] = []
  const pending: Array<{ key: string; cb: (scope: Record<string, unknown>) => void }> = []
  const services: Record<string, unknown> = { ...initial }
  const face: TypertAssemblyCtxFace = {
    plugin(options: { name: string; apply: (scope: Context) => void }) {
      const scope = new Context()
      mounted.push({ name: options.name, scope })
      options.apply(scope)
      return scope
    },
    inject(deps: readonly string[], cb: (scope: Record<string, unknown>) => void) {
      const key = deps[0]
      if (services[key] !== undefined) {
        cb({ [key]: services[key] })
      } else {
        pending.push({ key, cb })
      }
      return () => {}
    },
  } as TypertAssemblyCtxFace
  return {
    face,
    mounted,
    pendingCount: () => pending.length,
    provide: (key, svc) => {
      services[key] = svc
      for (const entry of pending.splice(0)) {
        if (entry.key === key) entry.cb({ [key]: svc })
        else pending.push(entry)
      }
    },
  }
}

describe('registerForgeTypertRemotes（根 ctx plugin 装配）', () => {
  it('全族在场 → 六 plugin 挂根 ctx，各 scope 构造控制器（registered 清单）', () => {
    const { face, mounted } = captureRoot()
    const deps: ForgeTypertDeps = {
      projects: () => ({}) as never,
      bugs: () => ({}) as never,
      worktrees: () => ({}) as never,
      features: () => ({}),
      dirFacts: () => ({}) as never,
    }
    const result = registerForgeTypertRemotes(face, deps)
    expect(result.registered).toEqual(['forgeProjects', 'forgeBugs', 'forgeFs', 'forgeWorktree', 'forgeFeatures', 'forgeDirs'])
    expect(result.degraded).toEqual([])
    expect(mounted.map((m) => m.name)).toEqual([
      'project-typert-forgeProjects',
      'project-typert-forgeBugs',
      'project-typert-forgeFs',
      'project-typert-forgeWorktree',
      'project-typert-forgeFeatures',
      'project-typert-forgeDirs',
    ])
    // 根 ctx 取法：face.root 在场 = 挂 root 而非插件子 ctx 自身
    const rootFace: TypertAssemblyCtxFace = { root: face, plugin: face.plugin }
    const nested = registerForgeTypertRemotes(rootFace, deps)
    expect(nested.registered).toHaveLength(6)
  })

  it('缺族降级（projects/bugs/worktrees/features/dirs 缺席）→ 仅 forgeFs 注册 + degraded 清单', () => {
    const { face, mounted } = captureRoot()
    const result = registerForgeTypertRemotes(face, {})
    expect(result.registered).toEqual(['forgeFs'])
    expect(result.degraded).toEqual(['forgeProjects', 'forgeBugs', 'forgeWorktree', 'forgeFeatures', 'forgeDirs'])
    expect(mounted.map((m) => m.name)).toEqual(['project-typert-forgeFs'])
  })

  it('ctx.plugin 缺席（非 cordis 宿主）→ assembly 降级 + 诊断留痕', () => {
    const diag = vi.fn()
    const result = registerForgeTypertRemotes({}, { diag })
    expect(result.registered).toEqual([])
    expect(result.degraded).toEqual(['assembly'])
    expect(diag).toHaveBeenCalledWith(expect.stringContaining('ctx.plugin 缺席'))
  })

  it('注册后自探针（boot 竞速根治 R2 host 半）：forgeProjects 注册在场 → selfProbe(forgeProjects, list) 直探一次，ok/失败各落诊断', async () => {
    const diag = vi.fn()
    const selfProbe = vi.fn<(ns: string, method: string) => Promise<unknown>>()
    const fullDeps: ForgeTypertDeps = {
      projects: () => ({}) as never,
      selfProbe,
      diag,
    }
    // ok 腿：完成行先落、自探针随后 ok 行
    selfProbe.mockResolvedValueOnce(undefined)
    const { face } = captureRoot()
    registerForgeTypertRemotes(face, fullDeps)
    await vi.waitFor(() => {
      expect(selfProbe).toHaveBeenCalledWith('forgeProjects', 'list')
      expect(diag).toHaveBeenCalledWith(expect.stringContaining('注册后自探针 ok'))
    })
    const lines = diag.mock.calls.map((call) => String(call[0]))
    expect(lines.findIndex((l) => l.includes('注册完成'))).toBeLessThan(
      lines.findIndex((l) => l.includes('注册后自探针 ok')),
    )
    // 失败腿：探针抛错 → 失败因诊断行（fail-soft 不阻载）
    const diag2 = vi.fn()
    registerForgeTypertRemotes(captureRoot().face, {
      projects: () => ({}) as never,
      selfProbe: () => Promise.reject(new Error('typertGateway 服务缺席')),
      diag: diag2,
    })
    await vi.waitFor(() => {
      expect(diag2).toHaveBeenCalledWith(expect.stringContaining('注册后自探针失败'))
      expect(diag2).toHaveBeenCalledWith(expect.stringContaining('typertGateway 服务缺席'))
    })
  })

  it('自探针缺席缝 / forgeProjects 降级 → 不触发直探（零调用）', async () => {
    const selfProbe = vi.fn<(ns: string, method: string) => Promise<unknown>>()
    // 缝缺席（deps 无 selfProbe）→ 无从调用
    registerForgeTypertRemotes(captureRoot().face, { projects: () => ({}) as never })
    // forgeProjects 降级（projects 缺）→ 不探
    registerForgeTypertRemotes(captureRoot().face, { selfProbe })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(selfProbe).not.toHaveBeenCalled()
  })
})

describe('selfProbeOf（bug a99a7293——官方 gateway 2.x invoke 必携 owner Peer）', () => {
  it('invoke 请求携 owner Peer（principal.kind = owner + AbortSignal）；结算后 Peer dispose（signal aborted）', async () => {
    const requests: unknown[] = [];
    // 类形态桩（invoke 走原型链——receiver 解绑即红：bare extraction 调用丢 this）
    class GatewayStub {
      async invoke(request: unknown) {
        requests.push(request);
        return { ok: true };
      }
    }
    const ctx = new Context()
    ctx.provide('typertGateway', new GatewayStub() as never)
    const probe = selfProbeOf({ root: ctx })
    await expect(probe('forgeProjects', 'list')).resolves.toEqual({ ok: true })
    expect(requests).toHaveLength(1)
    const req = requests[0] as { namespace: string; method: string; args: Record<string, never>; peer: { principal: { kind: string }; signal: AbortSignal; dispose(): Promise<void> } }
    expect(req.namespace).toBe('forgeProjects')
    expect(req.method).toBe('list')
    expect(req.args).toEqual({})
    expect(req.peer.principal.kind).toBe('owner')
    expect(req.peer.signal).toBeInstanceOf(AbortSignal)
    // 探针结算即 dispose——零悬空 Peer（scope fiber 回收判据 = lifetime signal aborted）
    await vi.waitFor(() => expect(req.peer.signal.aborted).toBe(true))
  })

  it('gateway 缺席 → 缺席错误（fail-soft 语义由注册面诊断承担，本缝只如实抛错）', async () => {
    const probe = selfProbeOf({ root: new Context() })
    await expect(probe('forgeProjects', 'list')).rejects.toThrow('typertGateway 服务缺席')
  })
})

describe('forgeFeatures inject 生命周期绑（迟到重绑——bug 253b8265）', () => {
  const featureSvc = { listFeatures: async () => [] }

  it('迟到场景钉：apply 时 core 服务未提供 = 挂起不注册（pending 记录）；provide 后补激活注册认领 + 迟到重绑诊断行', () => {
    const diag = vi.fn()
    const { face, mounted, provide, pendingCount } = captureInjectLifecycle()

    const result = registerForgeTypertRemotes(face, { diag })

    // apply 时点：注入族挂起（零 mount），degraded 如实记录、pending 面可观测
    expect(result.registered).not.toContain('forgeFeatures')
    expect(result.pending).toEqual(['forgeFeatures'])
    expect(result.degraded).toContain('forgeFeatures')
    expect(pendingCount()).toBe(1)

    // 服务后到（cordis inject 补激活）→ 控制器注册进根 ctx、registered 补入、诊断留痕
    provide('forgeFeatures', featureSvc)
    expect(mounted.map((m) => m.name)).toContain('project-typert-forgeFeatures')
    expect(result.registered).toContain('forgeFeatures')
    expect(diag).toHaveBeenCalledWith(expect.stringContaining('迟到重绑'))
  })

  it('服务在场：apply 即注册认领（cordis inject 同步激活——boot log registered 形态）', () => {
    const { face, mounted } = captureInjectLifecycle({ forgeFeatures: featureSvc })

    const result = registerForgeTypertRemotes(face, {})

    expect(result.registered).toContain('forgeFeatures')
    expect(mounted.map((m) => m.name)).toContain('project-typert-forgeFeatures')
  })

  it('真缺席（官方 web 舞台回归语义）：inject 永不激活 → 注入族端点不认领（诚实降级不变）', () => {
    const { face, mounted } = captureInjectLifecycle()

    const result = registerForgeTypertRemotes(face, {})

    expect(result.registered).not.toContain('forgeFeatures')
    expect(mounted.map((m) => m.name)).not.toContain('project-typert-forgeFeatures')
    expect(result.degraded).toEqual(expect.arrayContaining(['forgeFeatures']))
  })

  it('激活时控制器构造抛错 → fail-soft 不炸 inject 缝（诊断留痕，他族不受影响）', () => {
    const diag = vi.fn()
    const { face, provide } = captureInjectLifecycle()
    const originPlugin = face.plugin!.bind(face)
    face.plugin = (options: { name: string; apply: (scope: Context) => void }) => {
      if (options.name === 'project-typert-forgeFeatures') throw new Error('mount 炸')
      return originPlugin(options)
    }

    const result = registerForgeTypertRemotes(face, { diag })
    provide('forgeFeatures', featureSvc)

    expect(result.registered).not.toContain('forgeFeatures')
    expect(diag).toHaveBeenCalledWith(expect.stringContaining('forgeFeatures 激活失败'))
  })

  it('inject 激活后控制器调用期现查 core 服务（list 走注入所得服务——惰性语义不回归）', async () => {
    const { face } = captureInjectLifecycle({ forgeFeatures: featureSvc })
    registerForgeTypertRemotes(face, {})
    const row = await new ForgeFeaturesRemote(new Context() as never, { features: () => featureSvc }).list({})
    expect(row).toEqual([])
  })
})

describe('ForgeProjectsRemote.deriveTaskStoreDir（bug 8de6b903——占位端点退役：core forgeProjects 真实现委托）', () => {
  it('core face 在场（宿主集成态）：委托 core deriveTaskStoreDir，结果逐字直返', async () => {
    const calls: unknown[] = []
    const core = {
      deriveTaskStoreDir: async (q: { readonly workspaceDir: string }) => {
        calls.push(q)
        return { dir: 'T:\\tasks\\demo@1a2b3c4d' }
      },
    }
    const svc = new ForgeProjectsRemote(fakeCtx(), { deriveTaskStoreDir: () => core })
    await expect(svc.deriveTaskStoreDir('Z:\\ws\\demo')).resolves.toEqual({ dir: 'T:\\tasks\\demo@1a2b3c4d' })
    expect(calls).toEqual([{ workspaceDir: 'Z:\\ws\\demo' }])
  })

  it('core face 缺席（单装态）：typed unavailable 诚实拒绝（语义不变）', async () => {
    await expect(new ForgeProjectsRemote(fakeCtx(), {}).deriveTaskStoreDir('Z:\\x')).rejects.toThrow(
      unavailableMessage('deriveTaskStoreDir', 'projects'),
    )
  })

  it('core face 劣形（缺 deriveTaskStoreDir 法）：typed unavailable 诚实拒绝', async () => {
    await expect(new ForgeProjectsRemote(fakeCtx(), { deriveTaskStoreDir: () => ({}) }).deriveTaskStoreDir('Z:\\x')).rejects.toThrow(
      unavailableMessage('deriveTaskStoreDir', 'projects'),
    )
  })

  it('core face 缺席 + selfDerive 在场（单装态兜底——1.32②）：兜底结果直返 + 降级 diag 留痕', async () => {
    const diag: string[] = []
    const svc = new ForgeProjectsRemote(fakeCtx(), {
      selfDerive: () => async (workspaceDir: string) => ({ dir: `T:\\tasks\\self@${workspaceDir.length}` }),
      diag: (line) => diag.push(line),
    })
    await expect(svc.deriveTaskStoreDir('Z:\\ws\\demo')).resolves.toEqual({ dir: 'T:\\tasks\\self@10' })
    expect(diag.join('\n')).toContain('self-derive 单装态兜底承接')
  })

  it('core face 在场时 selfDerive 不接管（优先级纪律——集成态派生根与注册闭包不分叉）', async () => {
    const calls: unknown[] = []
    const core = { deriveTaskStoreDir: async (q: { readonly workspaceDir: string }) => (calls.push(q), { dir: 'core-dir' }) }
    const svc = new ForgeProjectsRemote(fakeCtx(), {
      deriveTaskStoreDir: () => core,
      selfDerive: () => async () => ({ dir: 'fallback-dir' }),
    })
    await expect(svc.deriveTaskStoreDir('Z:\\x')).resolves.toEqual({ dir: 'core-dir' })
    expect(calls).toHaveLength(1)
  })

  it('core face 抛错时不落兜底（真失败不遮蔽——bug 8de6b903 教训同径）', async () => {
    const core = { deriveTaskStoreDir: async () => { throw new Error('tasksHome 未注入') } }
    const svc = new ForgeProjectsRemote(fakeCtx(), {
      deriveTaskStoreDir: () => core,
      selfDerive: () => async () => ({ dir: 'fallback-dir' }),
    })
    await expect(svc.deriveTaskStoreDir('Z:\\x')).rejects.toThrow('tasksHome 未注入')
  })

  it('core 与 selfDerive 双缺：typed unavailable 诚实拒绝（语义不变）', async () => {
    await expect(new ForgeProjectsRemote(fakeCtx(), {}).deriveTaskStoreDir('Z:\\x')).rejects.toThrow(
      unavailableMessage('deriveTaskStoreDir', 'projects'),
    )
  })
})

describe('typed unavailable 与 fs listDir（诚实降级面）', () => {
  it('族服务缺席 → 调用期 typed unavailable（projects.list / worktree.* / features.list）', async () => {
    await expect(new ForgeProjectsRemote(fakeCtx(), {}).list()).rejects.toThrow(unavailableMessage('list', 'projects'))
    await expect(new ForgeWorktreeRemote(fakeCtx(), {}).list({} as never)).rejects.toThrow(unavailableMessage('*', 'worktree'))
    await expect(new ForgeFeaturesRemote(fakeCtx(), {}).list({})).rejects.toThrow(unavailableMessage('list', 'features'))
  })

  it('listDir：真实目录只读列举（子目录名序 + canonical path；文件不入列）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'forge-typert-fs-'))
    try {
      await mkdir(join(root, 'b-dir'))
      await mkdir(join(root, 'a-dir'))
      await import('node:fs/promises').then((fs) => fs.writeFile(join(root, 'file.txt'), 'x'))
      const listing = await listDir(root)
      expect(listing.path).toBe(root)
      expect(listing.parentPath).not.toBeNull()
      expect(listing.entries.map((e) => e.name)).toEqual(['a-dir', 'b-dir'])
      expect(listing.entries[0]?.path).toBe(join(root, 'a-dir'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('listDir：不可达路径 = 预期运行条件（Error 包装 canonical 路径，非 typed 码位）', async () => {
    const err = await listDir(join(rootAbsent(), 'gone')).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('目录不可达')
  })

  function rootAbsent(): string {
    return join(tmpdir(), `forge-typert-absent-${Math.random().toString(36).slice(2)}`)
  }
})
