// repositories 行级读写门测试（plugin-project 1.9）——:memory: 域逻辑：
// 三 repo（projects / workspaces / bugs）唯一持 SQL；R2 RED 锚⑥（updateMainPath 同事务随动）
// 与 R4 先行面（insertProjectWithMain 同事务双行）在此锁死。
import { describe, expect, it } from 'vitest'
import { deriveDirName } from '@dsh-forge/lib-path'
import { openDomainDb, PROJECT_DB_PREFIX, type DomainDb } from './connection.js'
import type { ProjectRow, WorkspaceRow, BugRow } from './row-types.js'

function mem(): DomainDb {
  return openDomainDb('.', { prefix: PROJECT_DB_PREFIX, file: ':memory:' })
}

let seq = 0
function projectRow(patch: Partial<ProjectRow> = {}): ProjectRow {
  seq += 1
  return {
    id: `p-${seq}`,
    projectKey: `key-${seq}`,
    title: `proj-${seq}`,
    forgeDir: 'Z:\\forge\\projects\\x',
    forgeDirExternal: false,
    worktreeDir: '',
    sortOrder: null,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  }
}

function workspaceRow(projectId: string, patch: Partial<WorkspaceRow> = {}): WorkspaceRow {
  seq += 1
  return {
    id: null,
    projectId,
    workspaceId: `ws-${seq}`,
    wsPath: `Z:\\ws\\${seq}`,
    memberRole: 'worktree',
    boundAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  }
}

function bugRow(patch: Partial<BugRow> = {}): BugRow {
  seq += 1
  return {
    id: `bug-${seq}`,
    projectKey: 'key-1',
    summary: `bug-${seq}`,
    bugDesc: 'd',
    triggerDesc: 't',
    expected: 'e',
    actual: 'a',
    suspected: null,
    errorType: null,
    bugStatus: 'open',
    commitHash: null,
    worktree: null,
    branch: null,
    unresolvedReason: null,
    fixApproach: null,
    sourceTaskId: null,
    recurrenceOf: null,
    containerSlug: null,
    reportSessionId: null,
    fixSessionId: null,
    fixer: null,
    reporter: 'agent',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  }
}

describe('ProjectsRepo（行级门）', () => {
  it('insert → get/getByKey/list 往返（布尔列 0/1 映射）', () => {
    const domain = mem()
    try {
      const row = projectRow({ forgeDirExternal: true, sortOrder: 3, archived: true })
      domain.repos.projects.insert(row)
      expect(domain.repos.projects.get(row.id)).toEqual(row)
      expect(domain.repos.projects.getByKey(row.projectKey)).toEqual(row)
      expect(domain.repos.projects.list({ includeArchived: true })).toEqual([row])
    } finally {
      domain.db.close()
    }
  })

  it('list 默认滤归档 + 四键字典序（sort_order→created_at→id，NULL 垫底）', () => {
    const domain = mem()
    try {
      const r = domain.repos.projects
      r.insert(projectRow({ id: 'pa', projectKey: 'ka', sortOrder: 2, createdAt: '2026-01-02' }))
      r.insert(projectRow({ id: 'pb', projectKey: 'kb', sortOrder: 1, createdAt: '2026-01-03' }))
      r.insert(projectRow({ id: 'pc', projectKey: 'kc', sortOrder: null, createdAt: '2026-01-01' }))
      r.insert(projectRow({ id: 'pd', projectKey: 'kd', sortOrder: null, createdAt: '2026-01-01', archived: true }))
      expect(r.list().map((p) => p.id)).toEqual(['pb', 'pa', 'pc'])
      expect(r.list({ includeArchived: true }).map((p) => p.id)).toEqual(['pb', 'pa', 'pc', 'pd'])
    } finally {
      domain.db.close()
    }
  })

  it('updateTitle / setArchived / updateWorktreeDir 刷新 updated_at', () => {
    const domain = mem()
    try {
      const row = projectRow()
      const r = domain.repos.projects
      r.insert(row)
      r.updateTitle(row.id, '新标题', '2026-02-01')
      r.setArchived(row.id, true, '2026-02-02')
      r.updateWorktreeDir(row.id, 'Z:\\wt', '2026-02-03')
      const got = r.get(row.id)!
      expect(got.title).toBe('新标题')
      expect(got.archived).toBe(true)
      expect(got.worktreeDir).toBe('Z:\\wt')
      expect(got.updatedAt).toBe('2026-02-03')
    } finally {
      domain.db.close()
    }
  })

  it('R2 RED 锚⑥：updateMainPath 同事务随动——key = f(新路径)；中途失败双双不变', () => {
    const domain = mem()
    try {
      const p = projectRow({ id: 'p-main', projectKey: 'Z-project-old@aaaaaaaa' })
      const r = domain.repos.projects
      r.insert(p)
      domain.repos.workspaces.insert(
        workspaceRow('p-main', {
          workspaceId: 'ws-main',
          wsPath: 'Z:\\project\\old',
          memberRole: 'main',
        }),
      )
      // 成功路径：key 随 main 路径重算（R2：读回 key 必为 f(新路径)）
      const newKey = deriveDirName('Z:\\project\\new')
      r.updateMainPath('p-main', 'Z:\\project\\old', 'Z:\\project\\new', '2026-03-01')
      expect(r.get('p-main')!.projectKey).toBe(newKey) // key = f(新路径)，f 单源 lib-path
      const main = domain.repos.workspaces.getMain('p-main')!
      expect(main.wsPath).toBe('Z:\\project\\new')
      // 失败路径：新 ws_path 撞既有 UNIQUE → 事务整体回滚，key 与路径双双不变
      domain.repos.projects.insert(projectRow({ id: 'p-other', projectKey: 'k-other' }))
      domain.repos.workspaces.insert(workspaceRow('p-other', { wsPath: 'Z:\\occupied' }))
      expect(() => r.updateMainPath('p-main', 'Z:\\project\\new', 'Z:\\occupied', '2026-03-02')).toThrowError()
      expect(r.get('p-main')!.projectKey).toBe(newKey)
      expect(r.get('p-main')!.updatedAt).toBe('2026-03-01')
      expect(domain.repos.workspaces.getMain('p-main')!.wsPath).toBe('Z:\\project\\new')
    } finally {
      domain.db.close()
    }
  })
})

describe('WorkspacesRepo（行级门）', () => {
  it('R4 先行面：insertProjectWithMain 同事务双行——撞 main 唯一索引整体回滚零残留', () => {
    const domain = mem()
    try {
      const r = domain.repos
      const p1 = projectRow({ id: 'p1', projectKey: 'k1' })
      r.workspaces.insertProjectWithMain(p1, workspaceRow('p1', { wsPath: 'Z:\\main', memberRole: 'main' }))
      expect(r.projects.get('p1')).toBeDefined()
      expect(r.workspaces.getMain('p1')).toBeDefined()
      // 撞 UNIQUE(ws_path)（重挂判据 R1 同源）→ 双行整体回滚（库内零残留）
      const p2 = projectRow({ id: 'p2', projectKey: 'k2' })
      expect(() =>
        r.workspaces.insertProjectWithMain(
          p2,
          workspaceRow('p2', { wsPath: 'Z:\\main', memberRole: 'main' }),
        ),
      ).toThrowError()
      expect(r.projects.get('p2')).toBeUndefined()
      expect(r.workspaces.listByProject('p2')).toEqual([])
    } finally {
      domain.db.close()
    }
  })

  it('findByWsPath / listByProject / getKeyByMainPath（归属键谓词 DAO 单点）', () => {
    const domain = mem()
    try {
      const r = domain.repos
      const p = projectRow({ id: 'p1', projectKey: 'k1' })
      r.projects.insert(p)
      r.workspaces.insert(
        workspaceRow('p1', { wsPath: 'Z:\\main', memberRole: 'main', workspaceId: 'ws-main' }),
      )
      r.workspaces.insert(workspaceRow('p1', { wsPath: 'Z:\\leaf', workspaceId: 'ws-leaf' }))
      expect(r.workspaces.findByWsPath('Z:\\leaf')!.workspaceId).toBe('ws-leaf')
      expect(r.workspaces.findByWsPath('Z:\\absent')).toBeUndefined()
      expect(r.workspaces.listByProject('p1').map((w) => w.wsPath)).toEqual(['Z:\\main', 'Z:\\leaf'])
      expect(r.workspaces.getKeyByMainPath('Z:\\main')).toBe('k1')
      // 非 main 行不作归属锚
      expect(r.workspaces.getKeyByMainPath('Z:\\leaf')).toBeUndefined()
    } finally {
      domain.db.close()
    }
  })

  it('deleteByWsPath / deleteByProject（行级删除门）', () => {
    const domain = mem()
    try {
      const r = domain.repos
      const p = projectRow({ id: 'p1', projectKey: 'k1' })
      r.projects.insert(p)
      r.workspaces.insert(workspaceRow('p1', { wsPath: 'Z:\\a' }))
      r.workspaces.insert(workspaceRow('p1', { wsPath: 'Z:\\b' }))
      r.workspaces.deleteByWsPath('Z:\\a')
      expect(r.workspaces.listByProject('p1').map((w) => w.wsPath)).toEqual(['Z:\\b'])
      r.workspaces.deleteByProject('p1')
      expect(r.workspaces.listByProject('p1')).toEqual([])
    } finally {
      domain.db.close()
    }
  })
})

describe('BugsRepo（行级门）', () => {
  it('insert → get/listByStatus 往返（蛇列映射 + 弱引用列零 FK）', () => {
    const domain = mem()
    try {
      const row = bugRow({
        id: 'b1',
        projectKey: 'k1',
        sourceTaskId: '9.9',
        recurrenceOf: 'root-bug',
        containerSlug: 'plugin-project',
        bugStatus: 'fixed',
        commitHash: 'c0ffee',
        fixApproach: 'x',
        fixer: 'dev',
      })
      const r = domain.repos.bugs
      r.insert(row)
      expect(r.get('b1')).toEqual(row)
      expect(r.listByStatus('fixed').map((b) => b.id)).toEqual(['b1'])
      expect(r.listByStatus('open')).toEqual([])
    } finally {
      domain.db.close()
    }
  })

  it('I5 行级归属键：project_key NOT NULL 派生失败拒写（无 default）', () => {
    const domain = mem()
    try {
      expect(() =>
        domain.db
          .prepare(
            `INSERT INTO project_bugs (id, project_key, summary, bug_desc, trigger_desc, expected, actual, reporter, created_at, updated_at)
             VALUES ('b1', NULL, 's', 'd', 't', 'e', 'a', 'r', 'x', 'x')`,
          )
          .run(),
      ).toThrowError(/NOT NULL/)
    } finally {
      domain.db.close()
    }
  })

  it('resolve 行级更新（终态回填 commit_hash / fix_approach / unresolved_reason）', () => {
    const domain = mem()
    try {
      const r = domain.repos.bugs
      r.insert(bugRow({ id: 'b1', projectKey: 'k1' }))
      r.resolve('b1', {
        bugStatus: 'fixed',
        commitHash: 'abc123',
        fixApproach: 'approach',
        fixer: 'dev',
        updatedAt: '2026-02-01',
      })
      const got = r.get('b1')!
      expect(got.bugStatus).toBe('fixed')
      expect(got.commitHash).toBe('abc123')
      expect(got.fixer).toBe('dev')
      r.resolve('b1', {
        bugStatus: 'unresolved',
        unresolvedReason: 'not-repro',
        updatedAt: '2026-02-02',
      })
      expect(r.get('b1')!.bugStatus).toBe('unresolved')
      expect(r.get('b1')!.unresolvedReason).toBe('not-repro')
    } finally {
      domain.db.close()
    }
  })

  it('countsByStatus 聚合（按 project_key 圈定）', () => {
    const domain = mem()
    try {
      const r = domain.repos.bugs
      r.insert(bugRow({ id: 'b1', projectKey: 'k1', bugStatus: 'open' }))
      r.insert(bugRow({ id: 'b2', projectKey: 'k1', bugStatus: 'fixed' }))
      r.insert(bugRow({ id: 'b3', projectKey: 'k2', bugStatus: 'open' }))
      expect(r.countsByStatus('k1')).toEqual({ open: 1, fixed: 1, unresolved: 0 })
      expect(r.countsByStatus()).toEqual({ open: 2, fixed: 1, unresolved: 0 })
    } finally {
      domain.db.close()
    }
  })
})
