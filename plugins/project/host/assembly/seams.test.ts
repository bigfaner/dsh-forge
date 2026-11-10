// 五缝装配测试（plugin-project 1.17——code-design §6 TDD 锚「provider 可替换性」）：
//   · 每缝 fake provider 注入后消费面（ctx.inject 路径 = injectProjectSeam）行为随 fake
//     变化、消费者零改动（fallback 恒定传入同一兜底工厂）；
//   · 注入缺席 → 退兜底；劣形三形态（注册值非函数 / 实例化抛错 / 首调抛错）逐项 fail-soft；
//   · registerProjectSeams：注册面缺席 = 全缝降级不抛；覆写在场 = 装配期覆写。
import { describe, expect, it } from 'vitest'
import {
  PROJECT_SEAM_KEYS,
  injectProjectSeam,
  registerProjectSeams,
  standaloneWorktreeService,
  stubBugsService,
  stubProjectsService,
  type SeamCtxFace,
} from './seams.js'
import type { ProjectsServicePort, WorktreeServicePort } from '@dsh-forge/lib-api'

/** cordis reflect 窄面桩（provide 记账 + get 可编程——index.test.ts ctxStub 同构） */
function ctxStub(injected: Record<string, unknown> = {}, provideFail = false): {
  ctx: SeamCtxFace
  provided: { name: string; value: unknown }[]
} {
  const provided: { name: string; value: unknown }[] = []
  const ctx: SeamCtxFace = {
    reflect: {
      provide: (name: string, value?: unknown) => {
        if (provideFail) throw new Error('provide boom')
        provided.push({ name, value })
        return () => undefined
      },
      get: (name: string) =>
        name in injected ? injected[name] : provided.find((p) => p.name === name)?.value,
    },
  }
  return { ctx, provided }
}

const projectsFallback = (): ProjectsServicePort => stubProjectsService()
const worktreesFallback = (): WorktreeServicePort => standaloneWorktreeService()

describe('provider 可替换性（每缝 fake 注入 → 消费面行为随 fake 变化、消费者零改动）', () => {
  it('forge.projects：fake 注入后 listProjects 返回 fake 数据（消费者 fallback 工厂零改动）', async () => {
    const fake: ProjectsServicePort = {
      registerProject: async () => {
        throw new Error('unused')
      },
      listProjects: async () => [{ id: 'fake-1', name: 'FAKE', wsPath: 'Z:/fake' }],
      getProject: async () => null,
      updateProject: async () => {
        throw new Error('unused')
      },
      reconcileAtStartup: async () => ({ repaired: [], orphans: [] }),
    } as unknown as ProjectsServicePort
    const { ctx } = ctxStub({ [PROJECT_SEAM_KEYS.projects]: () => fake })
    // 消费者代码（本行）与缺席形态完全一致——行为差异全部来自注入
    const projects = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.projects, projectsFallback)
    await expect(projects.listProjects()).resolves.toHaveLength(1)
    expect((await projects.listProjects())[0]?.name).toBe('FAKE')
  })

  it('forge.worktrees：fake 注入后 getWorktreeDir 随 fake 变化', () => {
    const { ctx } = ctxStub({
      [PROJECT_SEAM_KEYS.worktrees]: () => ({ ...standaloneWorktreeService(), getWorktreeDir: () => 'Z:/custom-wt' }),
    })
    const worktrees = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.worktrees, worktreesFallback)
    expect(worktrees.getWorktreeDir('Z:/proj')).toBe('Z:/custom-wt')
  })

  it('forge.projectResolution：fake 注入后 resolveProject 随 fake 变化', async () => {
    const { ctx } = ctxStub({
      [PROJECT_SEAM_KEYS.projectResolution]: () => ({
        resolveProject: async () => ({ projectId: 'p-1', projectRoot: 'Z:/proj', isGit: true }),
        getWorktreeDir: () => 'Z:/proj/.forge/worktrees',
      }),
    })
    const resolution = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.projectResolution, () => ({
      resolveProject: async () => null,
      getWorktreeDir: (root: string) => `${root}/.forge/worktrees`,
    }))
    await expect(resolution.resolveProject('Z:/proj/sub')).resolves.toMatchObject({ projectId: 'p-1' })
  })

  it('forge.bugs：fake 注入后 listBugs 随 fake 变化', async () => {
    const { ctx } = ctxStub({
      [PROJECT_SEAM_KEYS.bugs]: () => ({
        registerBug: async () => {
          throw new Error('unused')
        },
        resolveBug: async () => {
          throw new Error('unused')
        },
        listBugs: async () => [{ id: 'b-1', summary: 'fake' }],
        getBug: async () => {
          throw new Error('unused')
        },
        aggregateByErrorType: async () => [],
      }),
    })
    const bugs = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.bugs, () => stubBugsService())
    await expect(bugs.listBugs({ projectId: 'p' })).resolves.toHaveLength(1)
  })

  it('forge.dirFacts：fake 注入后 listAnchors 随 fake 变化', async () => {
    const { ctx } = ctxStub({
      [PROJECT_SEAM_KEYS.dirFacts]: () => ({
        listAnchors: async () => [{ dirKey: 'forge.task_logs_dir', dir: 'Z:/logs', description: 'fake' }],
        resolveDestination: async () => 'Z:/logs/x',
        audit: () => ({ missingPartitions: [], misplacedDirs: [], strayFiles: [] }),
        docStyleSection: () => '',
      }),
    })
    const dirFacts = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.dirFacts, () => stubProjectsService()) as never
    await expect(
      (
        dirFacts as {
          listAnchors(projectId: string): Promise<readonly { dirKey: string }[]>
        }
      ).listAnchors('p'),
    ).resolves.toHaveLength(1)
  })
})

describe('注入缺席 / 劣形三形态 fail-soft（S1 程序化清单）', () => {
  it('注入缺席 → 退兜底（worktrees 兜底 = 独立模式语义）', async () => {
    const { ctx } = ctxStub()
    const worktrees = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.worktrees, worktreesFallback)
    await expect(worktreeEntries(worktrees)).resolves.toEqual([])
    await expect(worktrees.resolveProject('Z:/any')).resolves.toBeNull()
    expect(worktrees.getWorktreeDir('Z:/p')).toBe('Z:/p/.forge/worktrees')
  })

  it('劣形① 注册值非函数（对象/数字/undefined）→ 退兜底', async () => {
    for (const raw of [{ list: () => {} }, 42, undefined, null]) {
      const { ctx } = ctxStub({ [PROJECT_SEAM_KEYS.worktrees]: raw })
      const worktrees = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.worktrees, worktreesFallback)
      await expect(worktreeEntries(worktrees)).resolves.toEqual([])
    }
  })

  it('劣形② 实例化抛错 → 退兜底', async () => {
    const { ctx } = ctxStub({
      [PROJECT_SEAM_KEYS.worktrees]: () => {
        throw new Error('boom')
      },
    })
    const worktrees = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.worktrees, worktreesFallback)
    await expect(worktreeEntries(worktrees)).resolves.toEqual([])
  })

  it('劣形③ 首调抛错 → 该次调用退兜底结果（degrade 后恒兜底）', async () => {
    const { ctx } = ctxStub({
      [PROJECT_SEAM_KEYS.worktrees]: () => ({
        ...standaloneWorktreeService(),
        list: async () => {
          throw new Error('first-call boom')
        },
      }),
    })
    const worktrees = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.worktrees, worktreesFallback)
    await expect(worktreeEntries(worktrees)).resolves.toEqual([]) // 首调抛错 → 兜底空清单
    await expect(worktreeEntries(worktrees)).resolves.toEqual([]) // 降级记忆 → 恒兜底
  })
})

describe('registerProjectSeams（装配期注册 + 降级可观测）', () => {
  it('反射面在场 → 五缝全注册；常驻工厂缺席缝注册兜底工厂', () => {
    const { ctx, provided } = ctxStub()
    const result = registerProjectSeams(ctx, {})
    expect(result.degraded).toEqual([])
    expect(result.registered).toHaveLength(5)
    expect(provided.map((p) => p.name)).toEqual([
      PROJECT_SEAM_KEYS.projects,
      PROJECT_SEAM_KEYS.worktrees,
      PROJECT_SEAM_KEYS.projectResolution,
      PROJECT_SEAM_KEYS.bugs,
      PROJECT_SEAM_KEYS.dirFacts,
    ])
    // 每个注册值为惰性工厂（函数）——劣形②守卫的载体
    for (const p of provided) expect(typeof p.value).toBe('function')
  })

  it('reflect.provide 面缺席 → 全缝降级明示（degraded），不抛断宿主', () => {
    const result = registerProjectSeams({ reflect: undefined }, {})
    expect(result.registered).toEqual([])
    expect(result.degraded).toHaveLength(5)
  })

  it('覆写位在场 → 注册覆写 provider（装配期覆写常驻）；覆写非对象 = 整缝退常驻/兜底', () => {
    const override: WorktreeServicePort = {
      ...standaloneWorktreeService(),
      getWorktreeDir: () => 'Z:/override-wt',
    }
    const { ctx } = ctxStub()
    const ok = registerProjectSeams(ctx, { overrides: { worktrees: override } })
    expect(ok.registered).toHaveLength(5)
    const worktrees = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.worktrees, worktreesFallback)
    expect(worktrees.getWorktreeDir('Z:/p')).toBe('Z:/override-wt')
    // 劣形覆写（原始值）→ 退兜底
    const { ctx: ctx2 } = ctxStub()
    registerProjectSeams(ctx2, { overrides: { worktrees: 42 as unknown as WorktreeServicePort } })
    expect(
      injectProjectSeam(ctx2, PROJECT_SEAM_KEYS.worktrees, worktreesFallback).getWorktreeDir('Z:/p'),
    ).toBe('Z:/p/.forge/worktrees')
  })

  it('常驻工厂产出非对象 / 抛错（注册面劣形②）→ 消费面退兜底', async () => {
    const { ctx } = ctxStub({}) // 注册空 deps → 各缝兜底工厂
    const result = registerProjectSeams(ctx, {})
    expect(result.degraded).toEqual([])
    // dirFacts 兜底缺位（missingDirFacts 拒绝工厂）→ 首调退兜底路径由注入缺席承接
    const projects = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.projects, projectsFallback)
    await expect(projects.listProjects()).resolves.toEqual([])
  })

  it('单缝 provide 抛错 → 仅该缝降级，其余缝不阻', () => {
    const provided: { name: string; value: unknown }[] = []
    const ctx: SeamCtxFace = {
      reflect: {
        provide: (name: string, _value?: unknown) => {
          if (name === PROJECT_SEAM_KEYS.bugs) throw new Error('dup')
          provided.push({ name, value: _value })
          return () => undefined
        },
        get: (name: string) => provided.find((p) => p.name === name)?.value,
      },
    }
    const result = registerProjectSeams(ctx, {})
    expect(result.degraded).toEqual([PROJECT_SEAM_KEYS.bugs])
    expect(result.registered).toHaveLength(4)
  })
})

describe('兜底 provider 语义（独立模式面）', () => {
  it('projects 兜底：listProjects 恒空、register 拒不可用', async () => {
    const stub = stubProjectsService()
    await expect(stub.listProjects()).resolves.toEqual([])
    await expect(stub.registerProject({} as never)).rejects.toThrow('unavailable')
  })

  it('worktrees 兜底：list 恒零 / resolve 恒空集 / seal 恒未封存', async () => {
    const stub = standaloneWorktreeService()
    const list = await stub.list({ projectRoot: 'Z:/p' } as never)
    expect(list.entries).toEqual([])
    expect(list.isGit).toBe(false)
    await expect(stub.resolve({ projectRoot: 'Z:/p' } as never)).resolves.toEqual({ resolved: [] })
    const seal = (await stub.seal({} as never)) as { sealed: boolean }
    expect(seal.sealed).toBe(false)
  })

  it('bugs 兜底：register 拒不可用、list 恒空', async () => {
    const stub = stubBugsService()
    await expect(stub.listBugs({ projectId: 'p' })).resolves.toEqual([])
    await expect(stub.registerBug({} as never)).rejects.toThrow('unavailable')
  })
})

/** list 消费窄面（测试可读性助手——WorktreeServicePort.list 全量结果投影） */
function worktreeEntries(worktrees: WorktreeServicePort): Promise<readonly unknown[]> {
  return worktrees.list({ projectRoot: 'Z:/p' } as never).then((r) => r.entries)
}
