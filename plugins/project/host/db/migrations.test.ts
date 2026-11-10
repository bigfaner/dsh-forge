// migrations v1 lineage 测试（plugin-project 1.9）：project.db 新库 version 1 起新线
// （独立于中央 state.db 版本线），打开幂等，DDL 约束负样例（部分唯一索引 / UNIQUE(ws_path) /
// CHECK / CASCADE）——数据库级不变量非应用层自检。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PROJECT_MIGRATIONS, PROJECT_DB_SCHEMA_VERSION, makeProjectMigrations } from './migrations.js'
import { openDomainDb } from './connection.js'

const homes: string[] = []

function fileDb() {
  const home = mkdtempSync(join(tmpdir(), 'project-db-mig-'))
  homes.push(home)
  return openDomainDb(home, { prefix: 'project' })
}

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

describe('新线 lineage（version 1 起新线）', () => {
  it('v1 = 唯一迁移，schema 版本上限 = 1', () => {
    expect(PROJECT_MIGRATIONS).toEqual(makeProjectMigrations('project'))
    expect(PROJECT_MIGRATIONS).toHaveLength(1)
    expect(PROJECT_MIGRATIONS[0]!.version).toBe(1)
    expect(PROJECT_DB_SCHEMA_VERSION).toBe(1)
  })

  it('全新库：schema_meta 落 version 1（新线，不继承中央版本线数值）', () => {
    const domain = fileDb()
    try {
      const rows = domain.db.prepare(`SELECT version FROM schema_meta ORDER BY version`).all() as Array<{
        version: number
      }>
      expect(rows.map((r) => r.version)).toEqual([1])
    } finally {
      domain.db.close()
    }
  })

  it('打开幂等：重开不重迁移、版本仍为 1、数据保留', () => {
    const home = mkdtempSync(join(tmpdir(), 'project-db-mig-idem-'))
    homes.push(home)
    const first = openDomainDb(home, { prefix: 'project' })
    first.db
      .prepare(
        `INSERT INTO project_projects (id, project_key, title, forge_dir, created_at, updated_at)
         VALUES ('p1', 'k1', 't', 'd', '2026-01-01', '2026-01-01')`,
      )
      .run()
    first.db.close()
    const second = openDomainDb(home, { prefix: 'project' })
    try {
      const rows = second.db.prepare(`SELECT version FROM schema_meta ORDER BY version`).all() as Array<{
        version: number
      }>
      expect(rows.map((r) => r.version)).toEqual([1])
      expect(second.db.prepare(`SELECT id FROM project_projects`).all()).toEqual([{ id: 'p1' }])
    } finally {
      second.db.close()
    }
  })
})

describe('DDL 约束负样例（数据库级不变量）', () => {
  it('部分唯一索引：同 project 第二条 main 行拒写（双主树分叉挡死）', () => {
    const domain = fileDb()
    try {
      domain.db
        .prepare(
          `INSERT INTO project_projects (id, project_key, title, forge_dir, created_at, updated_at)
           VALUES ('p1', 'k1', 't', 'd', '2026-01-01', '2026-01-01')`,
        )
        .run()
      const insertMain = domain.db.prepare(
        `INSERT INTO project_workspaces (project_id, workspace_id, ws_path, member_role, bound_at, created_at)
         VALUES ('p1', ?, ?, 'main', '2026-01-01', '2026-01-01')`,
      )
      insertMain.run('ws-1', 'Z:\\a')
      expect(() => insertMain.run('ws-2', 'Z:\\b')).toThrowError(/UNIQUE/)
      // worktree 行不受该索引约束
      domain.db
        .prepare(
          `INSERT INTO project_workspaces (project_id, workspace_id, ws_path, member_role, bound_at, created_at)
           VALUES ('p1', 'ws-3', 'Z:\\c', 'worktree', '2026-01-01', '2026-01-01')`,
        )
        .run()
    } finally {
      domain.db.close()
    }
  })

  it('UNIQUE(ws_path)：同一工作区重挂异 project 拒写（防重挂）', () => {
    const domain = fileDb()
    try {
      const insertProject = domain.db.prepare(
        `INSERT INTO project_projects (id, project_key, title, forge_dir, created_at, updated_at)
         VALUES (?, ?, 't', 'd', '2026-01-01', '2026-01-01')`,
      )
      insertProject.run('p1', 'k1')
      insertProject.run('p2', 'k2')
      const insertWs = domain.db.prepare(
        `INSERT INTO project_workspaces (project_id, workspace_id, ws_path, member_role, bound_at, created_at)
         VALUES (?, 'ws-1', 'Z:\\shared', 'worktree', '2026-01-01', '2026-01-01')`,
      )
      insertWs.run('p1')
      expect(() => insertWs.run('p2')).toThrowError(/UNIQUE/)
    } finally {
      domain.db.close()
    }
  })

  it('CHECK 负样例：member_role 越界 / forge_dir_external 越界拒写', () => {
    const domain = fileDb()
    try {
      domain.db
        .prepare(
          `INSERT INTO project_projects (id, project_key, title, forge_dir, created_at, updated_at)
           VALUES ('p1', 'k1', 't', 'd', '2026-01-01', '2026-01-01')`,
        )
        .run()
      expect(() =>
        domain.db
          .prepare(
            `INSERT INTO project_workspaces (project_id, workspace_id, ws_path, member_role, bound_at, created_at)
             VALUES ('p1', 'ws-1', 'Z:\\x', 'root', '2026-01-01', '2026-01-01')`,
          )
          .run(),
      ).toThrowError(/CHECK/)
      expect(() =>
        domain.db
          .prepare(
            `INSERT INTO project_projects (id, project_key, title, forge_dir, forge_dir_external, created_at, updated_at)
             VALUES ('p2', 'k2', 't', 'd', 2, '2026-01-01', '2026-01-01')`,
          )
          .run(),
      ).toThrowError(/CHECK/)
    } finally {
      domain.db.close()
    }
  })

  it('project_key 列级 UNIQUE：撞归属键拒写（隐式唯一索引，无另建单列索引）', () => {
    const domain = fileDb()
    try {
      const insert = domain.db.prepare(
        `INSERT INTO project_projects (id, project_key, title, forge_dir, created_at, updated_at)
         VALUES (?, ?, 't', 'd', '2026-01-01', '2026-01-01')`,
      )
      insert.run('p1', 'dup-key')
      expect(() => insert.run('p2', 'dup-key')).toThrowError(/UNIQUE/)
    } finally {
      domain.db.close()
    }
  })

  it('域内 FK CASCADE：删 project 行 → workspaces 行随删（I4 生效证据）', () => {
    const domain = fileDb()
    try {
      domain.db
        .prepare(
          `INSERT INTO project_projects (id, project_key, title, forge_dir, created_at, updated_at)
           VALUES ('p1', 'k1', 't', 'd', '2026-01-01', '2026-01-01')`,
        )
        .run()
      domain.db
        .prepare(
          `INSERT INTO project_workspaces (project_id, workspace_id, ws_path, member_role, bound_at, created_at)
           VALUES ('p1', 'ws-1', 'Z:\\a', 'main', '2026-01-01', '2026-01-01')`,
        )
        .run()
      domain.db.prepare(`DELETE FROM project_projects WHERE id = 'p1'`).run()
      expect(domain.db.prepare(`SELECT COUNT(*) AS n FROM project_workspaces`).get()).toEqual({ n: 0 })
    } finally {
      domain.db.close()
    }
  })
})
