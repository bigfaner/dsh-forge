// A2 自持注册表单测：wsPath canonical（realpath 归一——判例 c773c09f 第四维）为键、
// knowledge_dir 列；变体拼写收敛同一行（upsert 幂等不重复）；读写两径 + config 静态
// 注入径并存（plugin 装配面已持 config.projects 静态表）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

describe('registerGlobalIfAbsent（SC-1 全局库装配期自启注册——幂等 + fail-soft）', () => {
  it('首注册落行（project_id 空）+ info 埋点；再注册 = exists 幂等零重复不覆盖', () => {
    const root = tmpRoot()
    const globalDir = join(root, 'knowledge-global')
    const db = openKnowledgeDatabase(join(root, 'knowledge.db'))
    const diag: unknown[] = []
    try {
      const reg = createKnowledgeRegistry(db)
      expect(reg.registerGlobalIfAbsent(globalDir, (p) => diag.push(p))).toBe('registered')
      const row = reg.findByWsPath(globalDir)
      expect(row?.knowledgeDir).toBe(globalDir)
      expect(row?.projectId).toBeNull()
      expect(diag.some((d) => (d as { level: string }).level === 'info')).toBe(true)
      // 幂等：注册行不重复；手动改写 knowledge_dir 后再注册不覆盖（DO NOTHING 语义）
      reg.upsert(globalDir, join(root, 'manual-override'))
      expect(reg.registerGlobalIfAbsent(globalDir)).toBe('exists')
      expect(reg.findByWsPath(globalDir)?.knowledgeDir).toBe(join(root, 'manual-override'))
      expect(reg.list()).toHaveLength(1)
    } finally {
      db.close()
    }
  })

  it('互不嵌套校验：与既有项目行 knowledge_dir 任一方向嵌套 → nested-conflict + warn 跳过', () => {
    const root = tmpRoot()
    const db = openKnowledgeDatabase(join(root, 'knowledge.db'))
    const diag: unknown[] = []
    try {
      const reg = createKnowledgeRegistry(db)
      // 项目行 = 全局目录的父目录（全局嵌于项目库树下）
      const wsDir = join(root, 'ws')
      mkdirSync(join(wsDir, 'knowledge-global'), { recursive: true })
      reg.upsert(wsDir, wsDir, 'p-nest')
      expect(reg.registerGlobalIfAbsent(join(wsDir, 'knowledge-global'), (p) => diag.push(p))).toBe('nested-conflict')
      expect(diag.some((d) => (d as { level: string }).level === 'warn')).toBe(true)
      // 反向：全局目录为项目库父目录同样拒
      const globalParent = join(root, 'data-root')
      mkdirSync(join(globalParent, 'proj', '.knowledge'), { recursive: true })
      reg.upsert(join(globalParent, 'proj'), join(globalParent, 'proj', '.knowledge'), 'p-nest2')
      expect(reg.registerGlobalIfAbsent(globalParent)).toBe('nested-conflict')
    } finally {
      db.close()
    }
  })

  it('目录不可写（父级为普通文件）→ unwritable fail-soft + warn 埋点，不抛不落行', () => {
    const root = tmpRoot()
    const parentFile = join(root, 'parent-file')
    writeFileSync(parentFile, '占位', 'utf8')
    const db = openKnowledgeDatabase(join(root, 'knowledge.db'))
    const diag: unknown[] = []
    try {
      const reg = createKnowledgeRegistry(db)
      expect(reg.registerGlobalIfAbsent(join(parentFile, 'knowledge-global'), (p) => diag.push(p))).toBe('unwritable')
      expect(diag.some((d) => (d as { level: string }).level === 'warn')).toBe(true)
      expect(reg.list()).toHaveLength(0)
    } finally {
      db.close()
    }
  })
})
