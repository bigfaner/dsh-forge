// DDL 快照锚锁（plugin-project 1.9）：锁「前缀参数 + 表名模板」——已发布迁移语句禁改
// （docs/conventions/db-migrations.md），快照防前缀抖动：异前缀必须逐字同模板、仅表名前缀替换。
import { describe, expect, it } from 'vitest'
import { makeProjectMigrations } from './migrations.js'

function statementsOf(prefix: string): string[] {
  const migrations = makeProjectMigrations(prefix)
  expect(migrations).toHaveLength(1)
  expect(migrations[0]!.version).toBe(1)
  return migrations[0]!.statements.map((s) => (typeof s === 'string' ? s : s.sql))
}

describe('DDL 快照锚（前缀参数 + 表名模板）', () => {
  it('project 前缀 DDL 快照（防抖动）', () => {
    expect(statementsOf('project')).toMatchSnapshot()
  })

  it('模板机制：异前缀 = 同模板逐字、仅表名前缀替换（防前缀抖动）', () => {
    const project = statementsOf('project')
    const demo = statementsOf('demo')
    expect(demo.map((s) => s.replaceAll('demo_', 'project_'))).toEqual(project)
  })

  it('模板完备性：三表 + 两索引 + bugs 状态索引全部模板化（无游离硬编码表名）', () => {
    const all = statementsOf('project').join('\n')
    for (const table of ['project_projects', 'project_workspaces', 'project_bugs']) {
      expect(all).toContain(`CREATE TABLE ${table} `)
    }
    for (const index of [
      'CREATE UNIQUE INDEX idx_project_workspaces_main',
      'CREATE INDEX idx_project_workspaces_ws',
      'CREATE INDEX idx_project_bugs_status',
    ]) {
      expect(all).toContain(index)
    }
    // 列名锚（title / member_role——不占关键字）
    expect(all).toContain('title                TEXT NOT NULL')
    expect(all).toContain('member_role          TEXT NOT NULL CHECK (member_role IN')
  })
})
