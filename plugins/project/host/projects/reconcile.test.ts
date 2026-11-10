// reconcile 启动对账测试（plugin-project 1.10，design-key-flows §3 矩阵逐格）——
// 真 repo :memory: + fake registry / pathPresent 构造注入：relink / recreate / 孤儿降级保留
// 不自动清理 / 三层防御永不抛断启动。
import { describe, expect, it } from 'vitest'
import { openDomainDb, PROJECT_DB_PREFIX, type DomainDb } from '../db/connection.js'
import type { ProjectRow, WorkspaceRow } from '../db/row-types.js'
import { reconcileAtStartup } from './reconcile.js'
import type { ProjectRegistryPort, RegistryEntryMutable } from './registry-adapter.js'

const NOW = '2026-01-01T00:00:00.000Z'

function mem(): DomainDb {
  return openDomainDb('.', { prefix: PROJECT_DB_PREFIX, file: ':memory:' })
}

/** fake registry（可注入故障——降级面测试）。 */
function fakeRegistry(
  entries: { workspaceId: string; wsPath: string; title: string }[] = [],
  opts: { failGetFor?: string; failList?: boolean } = {},
): ProjectRegistryPort {
  const byId = new Map(entries.map((e) => [e.workspaceId, { ...e } as RegistryEntryMutable]))
  const byPath = new Map(entries.map((e) => [e.wsPath, { ...e } as RegistryEntryMutable]))
  return {
    list: async () => {
      if (opts.failList) throw new Error('registry list boom')
      return [...byId.values()]
    },
    get: async (workspaceId) => {
      if (workspaceId === opts.failGetFor) throw new Error('registry get boom')
      return byId.get(workspaceId)
    },
    create: async (wsPath, title) => {
      const hit = byPath.get(wsPath)
      if (hit !== undefined) return hit
      const entry = { workspaceId: `ws-new-${Math.random().toString(36).slice(2)}`, wsPath, title: title ?? 'ws' }
      byId.set(entry.workspaceId, entry)
      byPath.set(wsPath, entry)
      return entry
    },
    delete: async () => {},
    resolveByPath: async (wsPath) => byPath.get(wsPath),
  }
}

function seedProject(domain: DomainDb, patch: Partial<ProjectRow> = {}): ProjectRow {
  const id = patch.id ?? `p-${Math.random().toString(36).slice(2)}`
  const row: ProjectRow = {
    id,
    projectKey: patch.projectKey ?? `key-${id}`,
    title: 'proj',
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

function seedRow(domain: DomainDb, patch: Partial<WorkspaceRow> & { projectId: string }): WorkspaceRow {
  const row: WorkspaceRow = {
    id: null,
    workspaceId: `ws-${Math.random().toString(36).slice(2)}`,
    wsPath: `Z:\\ws\\${Math.random().toString(36).slice(2)}`,
    memberRole: 'main',
    boundAt: NOW,
    createdAt: NOW,
    ...patch,
  }
  domain.repos.workspaces.insert(row)
  const stored = domain.repos.workspaces.findByWsPath(row.wsPath)!
  return stored
}

const present = () => (p: string) => p !== 'Z:\\ws\\missing-dir'

describe('reconcileAtStartup（对账矩阵）', () => {
  it('main 行健康（get 命中且 path 一致）→ 通过（零修复）', async () => {
    const domain = mem()
    try {
      seedProject(domain, { id: 'p1' })
      seedRow(domain, { projectId: 'p1', wsPath: 'Z:\\ws\\ok', workspaceId: 'ws-1' })
      const report = await reconcileAtStartup({
        projects: domain.repos.projects,
        workspaces: domain.repos.workspaces,
        registry: fakeRegistry([{ workspaceId: 'ws-1', wsPath: 'Z:\\ws\\ok', title: 't' }]),
        pathPresent: present(),
      })
      expect(report).toEqual({ repaired: [], orphans: [] })
    } finally {
      domain.db.close()
    }
  })

  it('workspace_id 悬空 + ws_path 找回 → relink（单向修应用侧引用）', async () => {
    const domain = mem()
    try {
      seedProject(domain, { id: 'p1' })
      const row = seedRow(domain, { projectId: 'p1', wsPath: 'Z:\\ws\\beta', workspaceId: 'ws-stale' })
      const report = await reconcileAtStartup({
        projects: domain.repos.projects,
        workspaces: domain.repos.workspaces,
        registry: fakeRegistry([{ workspaceId: 'ws-fresh', wsPath: 'Z:\\ws\\beta', title: 't' }]),
        pathPresent: present(),
      })
      expect(report.repaired).toEqual([{ projectId: 'p1', workspaceId: 'ws-fresh', action: 'relinked' }])
      expect(domain.repos.workspaces.get(row.id!)!.workspaceId).toBe('ws-fresh')
    } finally {
      domain.db.close()
    }
  })

  it('悬空找不回 → recreate（registry.create 幂等重建）再修引用', async () => {
    const domain = mem()
    try {
      seedProject(domain, { id: 'p1' })
      const row = seedRow(domain, { projectId: 'p1', wsPath: 'Z:\\ws\\lost', workspaceId: 'ws-gone' })
      const report = await reconcileAtStartup({
        projects: domain.repos.projects,
        workspaces: domain.repos.workspaces,
        registry: fakeRegistry(),
        pathPresent: present(),
      })
      expect(report.repaired).toHaveLength(1)
      expect(report.repaired[0]).toMatchObject({ projectId: 'p1', action: 'recreated' })
      expect(domain.repos.workspaces.get(row.id!)!.workspaceId).toBe(report.repaired[0].workspaceId)
    } finally {
      domain.db.close()
    }
  })

  it('main 行 ws_path 目录消失 → 记账提示不删（零修复零清理）', async () => {
    const domain = mem()
    try {
      seedProject(domain, { id: 'p1' })
      seedRow(domain, { projectId: 'p1', wsPath: 'Z:\\ws\\missing-dir', workspaceId: 'ws-1' })
      const diags: unknown[] = []
      const report = await reconcileAtStartup({
        projects: domain.repos.projects,
        workspaces: domain.repos.workspaces,
        registry: fakeRegistry([{ workspaceId: 'ws-1', wsPath: 'Z:\\ws\\missing-dir', title: 't' }]),
        pathPresent: present(),
        onDiag: (p) => diags.push(p),
      })
      expect(report.repaired).toEqual([])
      expect(diags).toMatchObject([{ level: 'warn', event: 'project-reconcile-degraded' }])
    } finally {
      domain.db.close()
    }
  })

  it('worktree 行：registry 缺席 → 行保留 degraded 禁删禁自动重挂；盘上目录消失 → 行保留 + warn', async () => {
    const domain = mem()
    try {
      seedProject(domain, { id: 'p1' })
      const degraded = seedRow(domain, {
        projectId: 'p1',
        wsPath: 'Z:\\ws\\wt-degraded',
        workspaceId: 'ws-gone',
        memberRole: 'worktree',
      })
      const vanished = seedRow(domain, {
        projectId: 'p1',
        wsPath: 'Z:\\ws\\missing-dir',
        workspaceId: 'ws-present',
        memberRole: 'worktree',
      })
      const diags: unknown[] = []
      const report = await reconcileAtStartup({
        projects: domain.repos.projects,
        workspaces: domain.repos.workspaces,
        registry: fakeRegistry([{ workspaceId: 'ws-present', wsPath: 'Z:\\ws\\missing-dir', title: 't' }]),
        pathPresent: present(),
        onDiag: (p) => diags.push(p),
      })
      // 行保留：零修复零删除
      expect(report.repaired).toEqual([])
      expect(domain.repos.workspaces.get(degraded.id!)).toBeDefined()
      expect(domain.repos.workspaces.get(vanished.id!)).toBeDefined()
      expect(diags).toMatchObject([
        { level: 'info', event: 'project-reconcile-degraded' },
        { level: 'warn', event: 'project-reconcile-degraded' },
      ])
    } finally {
      domain.db.close()
    }
  })

  it('registry 有实体而两表无行 → 孤儿只提示不删（orphans 报告）', async () => {
    const domain = mem()
    try {
      const report = await reconcileAtStartup({
        projects: domain.repos.projects,
        workspaces: domain.repos.workspaces,
        registry: fakeRegistry([{ workspaceId: 'ws-orphan', wsPath: 'Z:\\ws\\orphan', title: 't' }]),
        pathPresent: present(),
      })
      expect(report.orphans).toEqual([{ workspaceId: 'ws-orphan', wsPath: 'Z:\\ws\\orphan' }])
    } finally {
      domain.db.close()
    }
  })

  it('单项降级：某行 registry.get 抛 → 该行放弃、其余行继续对账', async () => {
    const domain = mem()
    try {
      seedProject(domain, { id: 'p1' })
      seedRow(domain, { projectId: 'p1', wsPath: 'Z:\\ws\\bad', workspaceId: 'ws-poison' })
      seedProject(domain, { id: 'p2' })
      const good = seedRow(domain, { projectId: 'p2', wsPath: 'Z:\\ws\\good', workspaceId: 'ws-stale' })
      const diags: unknown[] = []
      const report = await reconcileAtStartup({
        projects: domain.repos.projects,
        workspaces: domain.repos.workspaces,
        registry: fakeRegistry([{ workspaceId: 'ws-fresh', wsPath: 'Z:\\ws\\good', title: 't' }], {
          failGetFor: 'ws-poison',
        }),
        pathPresent: present(),
        onDiag: (p) => diags.push(p),
      })
      // 毒行单项降级留原引用；好行照常 relink
      expect(domain.repos.workspaces.get(good.id!)!.workspaceId).toBe('ws-fresh')
      expect(report.repaired).toEqual([{ projectId: 'p2', workspaceId: 'ws-fresh', action: 'relinked' }])
      expect(diags).toMatchObject([{ level: 'warn', event: 'project-reconcile-item-degraded' }])
    } finally {
      domain.db.close()
    }
  })

  it('整体降级：registry.list 抛（孤儿扫描面）→ error 记账、永不抛断启动', async () => {
    const domain = mem()
    try {
      seedProject(domain, { id: 'p1' })
      seedRow(domain, { projectId: 'p1', wsPath: 'Z:\\ws\\ok', workspaceId: 'ws-1' })
      const diags: unknown[] = []
      const report = await reconcileAtStartup({
        projects: domain.repos.projects,
        workspaces: domain.repos.workspaces,
        registry: fakeRegistry([{ workspaceId: 'ws-1', wsPath: 'Z:\\ws\\ok', title: 't' }], { failList: true }),
        pathPresent: present(),
        onDiag: (p) => diags.push(p),
      })
      expect(report).toEqual({ repaired: [], orphans: [] })
      expect(diags).toMatchObject([{ level: 'error', event: 'project-reconcile-degraded' }])
    } finally {
      domain.db.close()
    }
  })
})
