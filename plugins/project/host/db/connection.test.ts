// host/db/connection.ts 行为面（plugin-project 1.9）：
// RED 锚① 转正式测试——I4 逐连接 foreign_keys 断言（openDomainDb 打开后 PRAGMA 回读非 1 即不可用）；
// 前缀参数化（恒 'project'）+ 归属键谓词 DAO 单点（repositories 唯一持 SQL）。
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { domainDbFileName, openDomainDb, PROJECT_DB_PREFIX } from './connection.js'

describe('I4 foreign_keys（RED 锚① 转正式测试）', () => {
  it('openDomainDb 打开的连接：PRAGMA foreign_keys 回读 = 1', () => {
    const domain = openDomainDb('.', { prefix: PROJECT_DB_PREFIX, file: ':memory:' })
    try {
      expect(domain.db.pragma('foreign_keys', { simple: true })).toBe(1)
    } finally {
      domain.db.close()
    }
  })

  it('FK 实际生效：workspace 行悬空 project_id 拒写（非静默）', () => {
    const domain = openDomainDb('.', { prefix: PROJECT_DB_PREFIX, file: ':memory:' })
    try {
      expect(() =>
        domain.db
          .prepare(
            `INSERT INTO project_workspaces (project_id, workspace_id, ws_path, member_role, bound_at, created_at)
             VALUES ('no-such-project', 'ws-1', 'Z:\\x', 'worktree', '2026-01-01', '2026-01-01')`,
          )
          .run(),
      ).toThrowError(/FOREIGN KEY/)
    } finally {
      domain.db.close()
    }
  })
})

describe('域前缀表名（前缀参数化，恒 project）', () => {
  it('默认前缀 project → 三表 project_projects / project_workspaces / project_bugs', () => {
    const domain = openDomainDb('.', { prefix: PROJECT_DB_PREFIX, file: ':memory:' })
    try {
      const names = (
        domain.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as Array<{
          name: string
        }>
      )
        .map((r) => r.name)
        .filter((n) => !n.startsWith('schema_') && n !== 'migration_digests' && n !== 'sqlite_sequence')
      expect(names).toEqual(['project_bugs', 'project_projects', 'project_workspaces'])
      expect(domain.tables).toEqual({
        projects: 'project_projects',
        workspaces: 'project_workspaces',
        bugs: 'project_bugs',
      })
    } finally {
      domain.db.close()
    }
  })

  it('前缀参数化：异前缀替换全部表名（模板机制面）', () => {
    const domain = openDomainDb('.', { prefix: 'demo', file: ':memory:' })
    try {
      const names = (
        domain.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as Array<{
          name: string
        }>
      )
        .map((r) => r.name)
        .filter((n) => !n.startsWith('schema_') && n !== 'migration_digests' && n !== 'sqlite_sequence')
      expect(names).toEqual(['demo_bugs', 'demo_projects', 'demo_workspaces'])
    } finally {
      domain.db.close()
    }
  })
})

describe('库文件落点', () => {
  it('home → {home}/forge/db/project/project.db（开库即落盘）', () => {
    const home = mkdtempSync(join(tmpdir(), 'project-db-conn-'))
    const file = domainDbFileName(home)
    expect(file).toBe(join(home, 'forge', 'db', 'project', 'project.db'))
    const domain = openDomainDb(home, { prefix: PROJECT_DB_PREFIX })
    try {
      expect(existsSync(file)).toBe(true)
    } finally {
      domain.db.close()
    }
  })
})
