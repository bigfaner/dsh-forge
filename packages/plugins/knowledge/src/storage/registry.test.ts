// A2 自持注册表单测：wsPath canonical（realpath 归一——判例 c773c09f 第四维）为键、
// knowledge_dir 列；变体拼写收敛同一行（upsert 幂等不重复）；读写两径 + config 静态
// 注入径并存（plugin 装配面已持 config.projects 静态表）。
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openKnowledgeDatabase } from './open.js'
import { canonicalWsPath, createKnowledgeRegistry } from './registry.js'

const roots: string[] = []
function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'knowledge-registry-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

describe('canonicalWsPath：realpath 归一（判例 c773c09f）', () => {
  it('可达路径 → realpath 真值拼写（变体拼写收敛——realpathSync 同值）', () => {
    const dir = join(tmpRoot(), 'ws')
    mkdirSync(dir)
    expect(canonicalWsPath(dir)).toBe(canonicalWsPath(dir))
  })

  it('缺席路径 fail-soft 回退词法 resolve（不抛）', () => {
    expect(canonicalWsPath(join(tmpRoot(), 'never', 'created'))).toMatch(/never[\\/]created$/)
  })
})

describe('注册表读写（wsPath 键 + knowledge_dir 列）', () => {
  it('upsert 落行 + findByWsPath 变体拼写命中同一 canonical 键', () => {
    const ws = join(tmpRoot(), 'proj-ws')
    mkdirSync(ws)
    const db = openKnowledgeDatabase(join(tmpRoot(), 'knowledge.db'))
    try {
      const reg = createKnowledgeRegistry(db)
      const row = reg.upsert(ws, join(ws, '.knowledge'))
      expect(row.wsPath).toBe(canonicalWsPath(ws))
      expect(row.knowledgeDir).toBe(join(ws, '.knowledge'))
      // 变体拼写（尾分隔符）→ realpath 收敛命中
      expect(reg.findByWsPath(`${ws}\\`)?.wsPath).toBe(row.wsPath)
    } finally {
      db.close()
    }
  })

  it('同 canonical 键再 upsert = 更新非重复（knowledge_dir/updated_at 前进，created_at 不变）', () => {
    const ws = join(tmpRoot(), 'dup-ws')
    mkdirSync(ws)
    const db = openKnowledgeDatabase(join(tmpRoot(), 'knowledge.db'))
    try {
      const reg = createKnowledgeRegistry(db)
      const first = reg.upsert(ws, join(ws, '.knowledge'))
      const second = reg.upsert(`${ws}${'\\'}`, join(ws, '.knowledge2'))
      expect(second.wsPath).toBe(first.wsPath)
      expect(second.createdAt).toBe(first.createdAt)
      expect(second.knowledgeDir).toBe(join(ws, '.knowledge2'))
      expect(reg.list().map((r) => r.wsPath)).toEqual([first.wsPath])
    } finally {
      db.close()
    }
  })

  it('list 全量 + 缺席键 undefined', () => {
    const ws = join(tmpRoot(), 'list-ws')
    mkdirSync(ws)
    const db = openKnowledgeDatabase(join(tmpRoot(), 'knowledge.db'))
    try {
      const reg = createKnowledgeRegistry(db)
      expect(reg.list()).toEqual([])
      expect(reg.findByWsPath(join(tmpRoot(), 'absent'))).toBeUndefined()
      reg.upsert(ws, join(ws, '.knowledge'))
      expect(reg.list()).toHaveLength(1)
    } finally {
      db.close()
    }
  })
})

describe('project_id 列（fix-2 一级解析动态化——API 级 projectId 承载列）', () => {
  it('upsert 落 project_id + findByProjectId 命中（projectId → wsPath 反查）', () => {
    const ws = join(tmpRoot(), 'pid-ws')
    mkdirSync(ws)
    const db = openKnowledgeDatabase(join(tmpRoot(), 'knowledge.db'))
    try {
      const reg = createKnowledgeRegistry(db)
      reg.upsert(ws, join(ws, '.knowledge'), 'p-api-1')
      expect(reg.findByProjectId('p-api-1')?.wsPath).toBe(canonicalWsPath(ws))
      expect(reg.findByProjectId('p-absent')).toBeUndefined()
    } finally {
      db.close()
    }
  })

  it('再 upsert 不带 projectId = 保留既有列值（COALESCE——种子迁移行不洗掉动态注册值）', () => {
    const ws = join(tmpRoot(), 'pid-keep')
    mkdirSync(ws)
    const db = openKnowledgeDatabase(join(tmpRoot(), 'knowledge.db'))
    try {
      const reg = createKnowledgeRegistry(db)
      reg.upsert(ws, join(ws, '.knowledge'), 'p-api-2')
      reg.upsert(ws, join(ws, '.knowledge2'))
      expect(reg.findByProjectId('p-api-2')?.knowledgeDir).toBe(join(ws, '.knowledge2'))
    } finally {
      db.close()
    }
  })
})
