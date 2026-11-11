// typert-remotes 单测（plugin-project 1.38——八族 forge:* 收编 Typert namespace 新增面）：
// ① marker 表 pin（remoteMethods 快照 = gateway SRC 发现面的端点真源——namespace/method/
//   exportName/mode 逐位断言）；② SRC 形参名单源 pin（wire 名 = JS 形参名——client descriptor
//   表 ui/remote.ts 与本表成对锁定）；③ followSeal 快照钩（baseline + 变化才 yield + abort 出
//   循环）；④ 注册装配（根 ctx plugin 捕获 + 缺族降级清单 + 降级诊断留痕）；⑤ fs listDir 与
//   typed unavailable 诚实拒绝。
import { describe, expect, it, vi } from 'vitest'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ForgeBugsRemote,
  ForgeFeaturesRemote,
  ForgeFsRemote,
  ForgeProjectsRemote,
  ForgeProposalsRemote,
  ForgeWorktreeRemote,
  listDir,
  registerForgeTypertRemotes,
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

describe('marker 端点表 pin（gateway SRC 端点真源——ui/remote.ts descriptor 表成对锁定）', () => {
  it('forgeProjects：list/register/deriveTaskStoreDir 三端点（一元直通）', () => {
    const svc = new ForgeProjectsRemote(fakeCtx(), {})
    expect(endpointsOf(svc)).toEqual(['list', 'register', 'deriveTaskStoreDir'])
  })

  it('forgeBugs：list/commitFiles/fileDiff 三端点', () => {
    const svc = new ForgeBugsRemote(fakeCtx(), {})
    expect(endpointsOf(svc)).toEqual(['list', 'commitFiles', 'fileDiff'])
  })

  it('forgeFs：listDir 单端点', () => {
    const svc = new ForgeFsRemote(fakeCtx())
    expect(endpointsOf(svc)).toEqual(['listDir'])
  })

  it('forgeWorktree：十一端点——remove 以 exportName delete 投影 + followSeal mode:stream', () => {
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
    ])
  })

  it('forge:{proposals,features}：list 单端点各一', () => {
    expect(endpointsOf(new ForgeProposalsRemote(fakeCtx(), {}))).toEqual(['list'])
    expect(endpointsOf(new ForgeFeaturesRemote(fakeCtx(), {}))).toEqual(['list'])
  })
})

describe('SRC 形参名单源 pin（wire 名 = JS 形参名——client descriptor 表 wire 成对锁定）', () => {
  it('worktree 各方法首形参名 = query；followSeal 尾参 = signal（cancellation 注入位）', () => {
    const svc = Object.create(ForgeWorktreeRemote.prototype) as Record<string, (...args: unknown[]) => unknown>
    for (const method of ['list', 'create', 'aheadBehind', 'branches', 'checks', 'seal', 'followSeal', 'select', 'selected', 'ensureWorkspace']) {
      expect(methodParameterNames(svc[method]), method).toEqual(['query', 'signal'])
    }
    expect(methodParameterNames(svc['remove'] as never), 'remove').toEqual(['query', 'signal'])
  })

  it('forgeProjects 形参名：list(signal)/register(input)/deriveTaskStoreDir(workspaceDir)', () => {
    const svc = Object.create(ForgeProjectsRemote.prototype) as Record<string, (...args: unknown[]) => unknown>
    expect(methodParameterNames(svc['list'] as never)).toEqual(['signal'])
    expect(methodParameterNames(svc['register'] as never)).toEqual(['input', 'signal'])
    expect(methodParameterNames(svc['deriveTaskStoreDir'] as never)).toEqual(['workspaceDir', 'signal'])
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

describe('registerForgeTypertRemotes（根 ctx plugin 装配）', () => {
  it('全族在场 → 六 plugin 挂根 ctx，各 scope 构造控制器（registered 清单）', () => {
    const { face, mounted } = captureRoot()
    const deps: ForgeTypertDeps = {
      projects: () => ({}) as never,
      bugs: () => ({}) as never,
      worktrees: () => ({}) as never,
      proposals: () => ({}),
      features: () => ({}),
    }
    const result = registerForgeTypertRemotes(face, deps)
    expect(result.registered).toEqual(['forgeProjects', 'forgeBugs', 'forgeFs', 'forgeWorktree', 'forgeProposals', 'forgeFeatures'])
    expect(result.degraded).toEqual([])
    expect(mounted.map((m) => m.name)).toEqual([
      'project-typert-forgeProjects',
      'project-typert-forgeBugs',
      'project-typert-forgeFs',
      'project-typert-forgeWorktree',
      'project-typert-forgeProposals',
      'project-typert-forgeFeatures',
    ])
    // 根 ctx 取法：face.root 在场 = 挂 root 而非插件子 ctx 自身
    const rootFace: TypertAssemblyCtxFace = { root: face, plugin: face.plugin }
    const nested = registerForgeTypertRemotes(rootFace, deps)
    expect(nested.registered).toHaveLength(6)
  })

  it('缺族降级（projects/bugs/worktrees/proposals/features 缺席）→ 仅 forgeFs 注册 + degraded 清单', () => {
    const { face, mounted } = captureRoot()
    const result = registerForgeTypertRemotes(face, {})
    expect(result.registered).toEqual(['forgeFs'])
    expect(result.degraded).toEqual(['forgeProjects', 'forgeBugs', 'forgeWorktree', 'forgeProposals', 'forgeFeatures'])
    expect(mounted.map((m) => m.name)).toEqual(['project-typert-forgeFs'])
  })

  it('ctx.plugin 缺席（非 cordis 宿主）→ assembly 降级 + 诊断留痕', () => {
    const diag = vi.fn()
    const result = registerForgeTypertRemotes({}, { diag })
    expect(result.registered).toEqual([])
    expect(result.degraded).toEqual(['assembly'])
    expect(diag).toHaveBeenCalledWith(expect.stringContaining('ctx.plugin 缺席'))
  })
})

describe('typed unavailable 与 fs listDir（诚实降级面）', () => {
  it('族服务缺席 → 调用期 typed unavailable（projects.list / worktree.* / proposals.list）', async () => {
    await expect(new ForgeProjectsRemote(fakeCtx(), {}).list()).rejects.toThrow('forge.projects list unavailable')
    await expect(new ForgeWorktreeRemote(fakeCtx(), {}).list({} as never)).rejects.toThrow('forge.worktree')
    await expect(new ForgeProposalsRemote(fakeCtx(), {}).list({})).rejects.toThrow('forge.proposals list unavailable')
    await expect(new ForgeFeaturesRemote(fakeCtx(), {}).list({})).rejects.toThrow('forge.features list unavailable')
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
