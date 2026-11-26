// register 五步补偿链测试（plugin-project 1.10，TDD 锚②）——:memory: 真 repo + fake registry
// 构造注入（S3 单测态）：R4 单事务双行 / R1 撞键判据（错误码级指 project_workspaces）/
// 补偿边界（挂接/既有实体永不补偿）/ 碰撞复检零副作用 / 幂等归并与悬空自愈。
import { describe, expect, it } from 'vitest'
import { basename, dirname, join } from 'node:path'
import { mkdtempSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { openDomainDb, PROJECT_DB_PREFIX, type DomainDb } from '../db/connection.js'
import type { ProjectRow, WorkspaceRow } from '../db/row-types.js'
import { classifyRegistrationCollision, projectKeyOf, resolveProjectKey } from '@dsh-forge/lib-path'
import { ProjectsRegisterService, isWsPathUniqueCollision } from './register.js'
import type { ProjectRegistryPort } from './registry-adapter.js'
import { SuspectedMoveError, WorkspaceCreateError, ProjectWriteError, CompensationError } from './errors.js'

const NOW = '2026-01-01T00:00:00.000Z'
let idSeq = 0

function mem(): DomainDb {
  return openDomainDb('.', { prefix: PROJECT_DB_PREFIX, file: ':memory:' })
}

/** fake registry（find-or-create by path + delete/get/list/resolveByPath 捕获——补偿链两态测试面）。 */
function fakeRegistry(initial: { workspaceId: string; wsPath: string; title: string }[] = []) {
  const entries = new Map(initial.map((e) => [e.wsPath, { ...e }]))
  const byId = new Map(initial.map((e) => [e.workspaceId, { ...e }]))
  const state = {
    deleted: [] as string[],
    createCalls: 0,
    setTitleCalls: [] as { workspaceId: string; title: string }[],
  }
  const withSetter = (e: { workspaceId: string; wsPath: string; title: string }): RegistryEntryMutable => ({
    ...e,
    setTitle: async (t) => {
      state.setTitleCalls.push({ workspaceId: e.workspaceId, title: t })
    },
  })
  return {
    get deleted() {
      return state.deleted
    },
    get createCalls() {
      return state.createCalls
    },
    get setTitleCalls() {
      return state.setTitleCalls
    },
    list: async () => [...byId.values()],
    get: async (workspaceId: string) => {
      const hit = byId.get(workspaceId)
      return hit ? withSetter(hit) : undefined
    },
    create: async (wsPath: string, title?: string) => {
      state.createCalls += 1
      const hit = entries.get(wsPath)
      if (hit !== undefined) return withSetter(hit)
      idSeq += 1
      const entry = { workspaceId: `ws-fake-${idSeq}`, wsPath, title: title ?? `ws-${idSeq}` }
      entries.set(wsPath, entry)
      byId.set(entry.workspaceId, entry)
      return withSetter(entry)
    },
    delete: async (workspaceId: string) => {
      state.deleted.push(workspaceId)
      const e = byId.get(workspaceId)
      if (e !== undefined) {
        byId.delete(workspaceId)
        entries.delete(e.wsPath)
      }
    },
    resolveByPath: async (wsPath: string) => {
      const hit = entries.get(wsPath)
      return hit ? withSetter(hit) : undefined
    },
  }
}

/** repo 方法桩：真 repo 方法绑真实例（私有字段安全）+ 指定方法覆写（竞态/故障注入面）。 */
function stubRepo<T extends object>(base: T, overrides: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(base))) {
    const value = (base as unknown as Record<string, unknown>)[name]
    if (typeof value === 'function') out[name] = (value as (this: T, ...a: unknown[]) => unknown).bind(base)
  }
  return Object.assign(out, overrides) as T
}

function seedProject(domain: DomainDb, patch: Partial<ProjectRow> = {}): ProjectRow {
  idSeq += 1
  const row: ProjectRow = {
    id: `p-${idSeq}`,
    projectKey: `key-${idSeq}`,
    title: `proj-${idSeq}`,
    forgeDir: 'Z:\\forge\\x',
    forgeDirExternal: false,
    worktreeDir: '',
    sortOrder: null,
    archived: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  }
  domain.repos.projects.insert(row)
  return row
}

function seedMain(domain: DomainDb, projectId: string, wsPath: string, workspaceId: string): WorkspaceRow {
  const row: WorkspaceRow = {
    id: null,
    projectId,
    workspaceId,
    wsPath,
    memberRole: 'main',
    boundAt: NOW,
    createdAt: NOW,
  }
  domain.repos.workspaces.insert(row)
  return row
}

function service(domain: DomainDb, registry: ProjectRegistryPort, extra: Record<string, unknown> = {}) {
  return new ProjectsRegisterService({
    projects: domain.repos.projects,
    workspaces: domain.repos.workspaces,
    registry,
    workspacesTable: domain.tables.workspaces,
    newId: () => {
      idSeq += 1
      return `p-new-${idSeq}`
    },
    now: () => NOW,
    ...extra,
  })
}

describe('ProjectsRegisterService（五步补偿链）', () => {
  it('RED 锚②·成功径：单事务双行落库——project_key = f(main ws_path)，registry.create 恰一次', async () => {
    const domain = mem()
    try {
      const registry = fakeRegistry()
      const svc = service(domain, registry, {
        onRegistered: (r) => {
          expect(r.attachedToExisting).toBe(false)
        },
      })
      const result = await svc.register({
        workspaceDir: 'Z:\\ws\\alpha',
        name: 'alpha',
        forgeDir: 'Z:\\ws\\alpha\\.forge',
      })
      expect(result.attachedToExisting).toBe(false)
      const row = domain.repos.projects.get(result.projectId)!
      expect(row.projectKey).toBe(projectKeyOf('Z:\\ws\\alpha'))
      expect(row.forgeDirExternal).toBe(false)
      const main = domain.repos.workspaces.getMain(result.projectId)!
      expect(main.workspaceId).toBe(result.workspaceId)
      expect(main.wsPath).toBe('Z:\\ws\\alpha')
      expect(registry.createCalls).toBe(1)
      expect(registry.deleted).toEqual([])
      // 标题对齐：registry title 与项目名一致（create 时点传入）——无补写
      expect(registry.setTitleCalls).toEqual([])
    } finally {
      domain.db.close()
    }
  })

  it('RED 锚②：撞 main UNIQUE——库内零残留且 registry 未删（R4 事务回滚 + R1 自愈归并）', async () => {
    const domain = mem()
    try {
      const registry = fakeRegistry()
      // 竞态模拟：另一个注册方在我们 insertProjectWithMain 前一瞬抢先把同 ws_path main 行落库
      // （同一 registry 实体——createdNow = false），我们的双行写撞 UNIQUE(project_workspaces.ws_path)。
      const base = domain.repos.workspaces
      const racy = stubRepo(base, {
        insertProjectWithMain: (project: ProjectRow, main: WorkspaceRow) => {
          // 竞态注入：先落对方行（健康 main 行，workspaceId 指既有 registry 实体），再走原双行写
          seedProject(domain, { id: 'p-race', projectKey: 'key-race' })
          seedMain(domain, 'p-race', main.wsPath, 'ws-race')
          base.insertProjectWithMain(project, main)
        },
      })
      const racySvc = new ProjectsRegisterService({
        projects: domain.repos.projects,
        workspaces: racy,
        registry,
        workspacesTable: domain.tables.workspaces,
        newId: () => 'p-new',
        now: () => NOW,
      })
      const result = await racySvc.register({ workspaceDir: 'Z:\\ws\\race', name: 'race', forgeDir: 'Z:\\f' })
      // R1：撞键 → 重入步骤 1 自愈归并——挂接既有健康 main 行
      expect(result.attachedToExisting).toBe(true)
      expect(result.projectId).toBe('p-race')
      // 库内零残留：我们的双行整体回滚
      expect(domain.repos.projects.get('p-new')).toBeUndefined()
      // registry 未删：既有实体不被补偿（createdNow = false 无补偿语义）
      expect(registry.deleted).toEqual([])
    } finally {
      domain.db.close()
    }
  })

  it('RED 锚②·变体：撞键且自愈不成（worktree 行占位）→ createdNow 补偿删除 + 零残留', async () => {
    const domain = mem()
    try {
      const registry = fakeRegistry()
      const base = domain.repos.workspaces
      const racy = stubRepo(base, {
        insertProjectWithMain: (project: ProjectRow, main: WorkspaceRow) => {
          // 竞态注入：同 ws_path 被另一项目抢先登记为 worktree 行（非 main——自愈归并不命中）
          seedProject(domain, { id: 'p-other', projectKey: 'key-other' })
          domain.repos.workspaces.insert({
            id: null,
            projectId: 'p-other',
            workspaceId: 'ws-other',
            wsPath: main.wsPath,
            memberRole: 'worktree',
            boundAt: NOW,
            createdAt: NOW,
          })
          base.insertProjectWithMain(project, main)
        },
      })
      const racySvc = new ProjectsRegisterService({
        projects: domain.repos.projects,
        workspaces: racy,
        registry,
        workspacesTable: domain.tables.workspaces,
        newId: () => 'p-new',
        now: () => NOW,
      })
      await expect(
        racySvc.register({ workspaceDir: 'Z:\\ws\\taken', name: 'taken', forgeDir: 'Z:\\f' }),
      ).rejects.toBeInstanceOf(ProjectWriteError)
      // 零残留 + createdNow 补偿（只回滚 registry——我们的新建实体）
      expect(domain.repos.projects.get('p-new')).toBeUndefined()
      expect(domain.repos.workspaces.findByWsPath('Z:\\ws\\taken')!.projectId).toBe('p-other')
      expect(registry.deleted.length).toBe(1)
    } finally {
      domain.db.close()
    }
  })

  it('R1 判据单源：SQLITE_CONSTRAINT_UNIQUE + 关系表名命中；其余错误不命中', () => {
    const hit = Object.assign(new Error('UNIQUE constraint failed: project_workspaces.ws_path'), {
      code: 'SQLITE_CONSTRAINT_UNIQUE',
    })
    expect(isWsPathUniqueCollision(hit, 'project_workspaces')).toBe(true)
    const otherTable = Object.assign(new Error('UNIQUE constraint failed: other_table.ws_path'), {
      code: 'SQLITE_CONSTRAINT_UNIQUE',
    })
    expect(isWsPathUniqueCollision(otherTable, 'project_workspaces')).toBe(false)
    const generic = new Error('boom')
    expect(isWsPathUniqueCollision(generic, 'project_workspaces')).toBe(false)
  })

  it('步骤 3 失败：registry.create 抛 → ERR_WORKSPACE_CREATE 零补偿零副作用', async () => {
    const domain = mem()
    try {
      const registry = fakeRegistry()
      registry.create = async () => {
        throw new Error('registry down')
      }
      const svc = service(domain, registry)
      await expect(svc.register({ workspaceDir: 'Z:\\ws\\x', name: 'x', forgeDir: 'Z:\\f' })).rejects.toBeInstanceOf(
        WorkspaceCreateError,
      )
      expect(registry.deleted).toEqual([])
      expect(domain.repos.projects.list({ includeArchived: true })).toEqual([])
    } finally {
      domain.db.close()
    }
  })

  it('步骤 4 非撞键失败且 createdNow → registry.delete 补偿 + ProjectWriteError.data.compensated', async () => {
    const domain = mem()
    try {
      const registry = fakeRegistry()
      const broken = stubRepo(domain.repos.workspaces, {
        insertProjectWithMain: () => {
          throw new Error('disk on fire')
        },
      })
      const svc = new ProjectsRegisterService({
        projects: domain.repos.projects,
        workspaces: broken,
        registry,
        workspacesTable: domain.tables.workspaces,
        newId: () => 'p-new',
        now: () => NOW,
      })
      const err = await svc
        .register({ workspaceDir: 'Z:\\ws\\y', name: 'y', forgeDir: 'Z:\\f' })
        .catch((e: unknown) => e as ProjectWriteError)
      expect(err).toBeInstanceOf(ProjectWriteError)
      expect((err as ProjectWriteError).data).toMatchObject({
        compensated: { workspaceId: registry.deleted[0], reason: expect.stringContaining('disk on fire') },
      })
      expect(registry.deleted.length).toBe(1)
    } finally {
      domain.db.close()
    }
  })

  it('补偿删除失败 → ERR_COMPENSATION + emitDiag error 留痕（交启动对账）', async () => {
    const domain = mem()
    try {
      const registry = fakeRegistry()
      registry.delete = async () => {
        throw new Error('delete failed')
      }
      const base = domain.repos.workspaces
      const broken = stubRepo(base, {
        insertProjectWithMain: () => {
          throw new Error('write failed')
        },
      })
      const diagPayloads: unknown[] = []
      const svc = new ProjectsRegisterService({
        projects: domain.repos.projects,
        workspaces: broken,
        registry,
        workspacesTable: domain.tables.workspaces,
        newId: () => 'p-new',
        now: () => NOW,
        onDiag: (p) => diagPayloads.push(p),
      })
      await expect(
        svc.register({ workspaceDir: 'Z:\\ws\\z', name: 'z', forgeDir: 'Z:\\f' }),
      ).rejects.toBeInstanceOf(CompensationError)
      expect(diagPayloads).toMatchObject([{ level: 'error', event: 'project-register-compensation' }])
    } finally {
      domain.db.close()
    }
  })

  it('碰撞复检：suspected-move / present 未确认 → 拒绝零副作用（registry 不动、库零行）', async () => {
    const domain = mem()
    try {
      for (const state of ['suspected-move', 'present'] as const) {
        const registry = fakeRegistry()
        const svc = service(domain, registry, {
          tasksHome: 'Z:\\tasks',
          classifyCollision: () => ({
            state,
            dir: 'Z:\\tasks\\x@aaaaaaaa',
            data: { existingDir: 'Z:\\tasks\\x@bbbbbbbb', derivedDir: 'Z:\\tasks\\x@aaaaaaaa', guidance: '指引' },
          }),
        })
        const err = await svc
          .register({ workspaceDir: 'Z:\\ws\\moved', name: 'moved', forgeDir: 'Z:\\f' })
          .catch((e: unknown) => e)
        expect(err).toBeInstanceOf(SuspectedMoveError)
        expect(((err as SuspectedMoveError).data as { guidance: string }).guidance).toBe('指引')
        expect(registry.createCalls).toBe(0)
        expect(registry.deleted).toEqual([])
        expect(domain.repos.projects.list({ includeArchived: true })).toEqual([])
      }
    } finally {
      domain.db.close()
    }
  })

  it('步骤 0/1 幂等归并：main 行健康 → attachedToExisting，零新建零补偿 + 标题对齐', async () => {
    const domain = mem()
    try {
      const registry = fakeRegistry([{ workspaceId: 'ws-1', wsPath: 'Z:\\ws\\alpha', title: '旧标题' }])
      seedProject(domain, { id: 'p-1', projectKey: 'key-1' })
      seedMain(domain, 'p-1', 'Z:\\ws\\alpha', 'ws-1')
      const svc = service(domain, registry)
      const result = await svc.register({ workspaceDir: 'Z:\\ws\\alpha', name: 'alpha', forgeDir: 'Z:\\f' })
      expect(result).toEqual({ projectId: 'p-1', workspaceId: 'ws-1', attachedToExisting: true })
      expect(registry.createCalls).toBe(0)
      expect(registry.deleted).toEqual([])
      // 标题对齐：registry title 落后于项目名 → setTitle 对齐
      expect(registry.setTitleCalls).toEqual([{ workspaceId: 'ws-1', title: 'alpha' }])
    } finally {
      domain.db.close()
    }
  })

  it('悬空自愈：workspace_id 悬空 → resolveByPath 找回 relink / 找不回 recreate，均幂等归并', async () => {
    const domain = mem()
    try {
      // relink 径：registry.get(ws-stale) 缺席，resolveByPath 命中 ws-fresh
      const registry = fakeRegistry([{ workspaceId: 'ws-fresh', wsPath: 'Z:\\ws\\beta', title: 'beta' }])
      seedProject(domain, { id: 'p-2', projectKey: 'key-2' })
      seedMain(domain, 'p-2', 'Z:\\ws\\beta', 'ws-stale')
      const svc = service(domain, registry)
      const result = await svc.register({ workspaceDir: 'Z:\\ws\\beta', name: 'beta', forgeDir: 'Z:\\f' })
      expect(result).toEqual({ projectId: 'p-2', workspaceId: 'ws-fresh', attachedToExisting: true })
      expect(domain.repos.workspaces.getMain('p-2')!.workspaceId).toBe('ws-fresh')
      expect(registry.createCalls).toBe(0)

      // recreate 径：resolveByPath 也不命中 → registry.create 幂等重建再修引用
      const registry2 = fakeRegistry()
      seedProject(domain, { id: 'p-3', projectKey: 'key-3' })
      seedMain(domain, 'p-3', 'Z:\\ws\\gamma', 'ws-gone')
      const svc2 = service(domain, registry2)
      const result2 = await svc2.register({ workspaceDir: 'Z:\\ws\\gamma', name: 'gamma', forgeDir: 'Z:\\f' })
      expect(result2).toEqual({ projectId: 'p-3', workspaceId: expect.any(String), attachedToExisting: true })
      expect(domain.repos.workspaces.getMain('p-3')!.workspaceId).toBe(result2.workspaceId)
      expect(registry2.createCalls).toBe(1)
    } finally {
      domain.db.close()
    }
  })

  it('默认分类器接线：classifyRegistrationCollision 单源缺省注入（冒烟——normal 放行）', async () => {
    const domain = mem()
    try {
      const registry = fakeRegistry()
      // 缺省构造走 lib-path 单源（tasksHome 缺席目录 → normal）
      const svcDefault = new ProjectsRegisterService({
        projects: domain.repos.projects,
        workspaces: domain.repos.workspaces,
        registry,
        workspacesTable: domain.tables.workspaces,
        tasksHome: 'Z:\\tasks-nonexistent',
        newId: () => 'p-d',
        now: () => NOW,
      })
      const result = await svcDefault.register({ workspaceDir: 'Z:\\ws\\delta', name: 'delta', forgeDir: 'Z:\\f' })
      expect(result.attachedToExisting).toBe(false)
    } finally {
      domain.db.close()
    }
  })

  it('真实 sqlite 撞键经真实 repo 命中 R1 判据（classifyRegistrationCollision 同源冒烟）', async () => {
    const domain = mem()
    try {
      expect(classifyRegistrationCollision('Z:\\nonexistent-tasks', 'Z:\\ws\\x').state).toBe('normal')
    } finally {
      domain.db.close()
    }
  })

  it('写行 projectKey 口径（bug 3467e146）：登记路径拼写与磁盘大小写不同 → 库行键 = resolveProjectKey 规范化后同键', async () => {
    const real = mkdtempSync(join(tmpdir(), 'projkey-case-'))
    try {
      // 造与磁盘大小写不同的拼写段（realpathSync.native 收敛真实大小写）
      const base = basename(real)
      const flipped = base === base.toLowerCase() ? base.toUpperCase() : base.toLowerCase()
      const spelled = join(dirname(real), flipped)
      expect(realpathSync.native(spelled)).not.toBe(spelled) // 前置：拼写确与真实路径不同
      const domain = mem()
      try {
        const svc = service(domain, fakeRegistry())
        const result = await svc.register({ workspaceDir: spelled, name: 'case', forgeDir: join(spelled, '.forge') })
        const row = domain.repos.projects.get(result.projectId)!
        const consumed = resolveProjectKey(spelled, { registryQuery: () => spelled }).key
        expect(row.projectKey).toBe(consumed)
      } finally {
        domain.db.close()
      }
    } finally {
      rmSync(real, { recursive: true, force: true })
    }
  })
})
