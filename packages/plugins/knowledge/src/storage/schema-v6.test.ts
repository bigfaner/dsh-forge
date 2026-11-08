// DDL v6 单测（stage③ 1.3——提案 §2.2 KNOWLEDGE_DOMAINS）：v5→v6 迁移与降级往返、
// rebuild 域对账三径（补行/简介保留/超集清除——与 entries 重建同事务）、register 首跑
// 同径批量初始化、注销径应用层级联（registry.remove 手删 ws_path 域行）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { openKnowledgeDatabase } from './open.js'
import { downgradeKnowledgeSchema } from './schema.js'
import { createKnowledgeRegistry } from './registry.js'
import { rebuildKnowledgeIndex } from './rebuild.js'
import { createScanRegister } from '../service/scan-register.js'

const roots: string[] = []
function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'knowledge-v6-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

function setup(root: string): { db: Database.Database; wsPath: string; knowledgeDir: string } {
  const wsPath = join(root, 'ws')
  const knowledgeDir = join(wsPath, '.knowledge')
  const db = openKnowledgeDatabase(join(root, 'knowledge', 'knowledge.db'))
  createKnowledgeRegistry(db).upsert(wsPath, knowledgeDir)
  return { db, wsPath, knowledgeDir }
}

interface DomainRow {
  ws_path: string
  domain: string
  description: string | null
  updated_at: string
}

function domainRows(db: Database.Database, wsPath?: string): DomainRow[] {
  return wsPath === undefined
    ? db
        .prepare<unknown[], DomainRow>(
          `SELECT ws_path, domain, description, updated_at FROM knowledge_domains ORDER BY ws_path, domain`,
        )
        .all()
    : db
        .prepare<[string], DomainRow>(
          `SELECT ws_path, domain, description, updated_at FROM knowledge_domains WHERE ws_path = ? ORDER BY domain`,
        )
        .all(wsPath)
}

function entryFile(id: string): string {
  return (
    `---\nid: ${id}\ntitle: T ${id}\nsummary: s\nkeywords: [k]\nversion_ts: 2026-01-0${id.length}-01T00:00:00.000Z\n---\n\n正文。`
  )
}

function writeEntry(knowledgeDir: string, domainDir: string, file: string, id: string): void {
  const dir = join(knowledgeDir, domainDir)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, file), entryFile(id))
}

describe('DDL v6（KNOWLEDGE_DOMAINS 迁移线）', () => {
  it('空库直开 = v6 上限版本：knowledge_domains 建表在场 + schema_meta 行含 6', () => {
    const root = tmpRoot()
    const db = openKnowledgeDatabase(join(root, 'knowledge', 'knowledge.db'))
    expect(db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()).toEqual({ v: 7 }) // v7 起 6 为历史版本行（stage④ 1.3）
    const cols = db
      .prepare<unknown[], { name: string; notnull: number; pk: number }>(`PRAGMA table_info(knowledge_domains)`)
      .all()
    expect(cols.map((c) => `${c.name}:${c.notnull}:${c.pk}`).sort()).toEqual(
      ['ws_path:1:1', 'domain:1:2', 'description:0:0', 'updated_at:1:0'].sort(),
    )
    db.close()
  })

  it('v5→v6 前向补迁 + 往返降级（DROP TABLE + schema_meta 行删）', () => {
    const root = tmpRoot()
    const file = join(root, 'knowledge', 'knowledge.db')
    const db = openKnowledgeDatabase(file)
    // 回到 v5 形态（v5 版本线降级链逐版可用——v6 为最上单步）
    downgradeKnowledgeSchema(db, 5)
    expect(
      db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='knowledge_domains'`,
      ).get(),
    ).toEqual({ n: 0 })
    expect(db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()).toEqual({ v: 5 })
    db.close()

    // 重开 = 前向补迁至上限版本（v6 为历史版本行——knowledge_domains 在场即可）
    const db2 = openKnowledgeDatabase(file)
    expect(db2.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()).toEqual({ v: 7 })
    expect(domainRows(db2)).toEqual([])
    // 再降级 = DROP TABLE + schema_meta 行删
    downgradeKnowledgeSchema(db2, 5)
    expect(
      db2.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='knowledge_domains'`,
      ).get(),
    ).toEqual({ n: 0 })
    expect(db2.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()).toEqual({ v: 5 })
    db2.close()
  })
})

describe('rebuild 域对账三径（与 entries 重建同事务）', () => {
  it('① 新域补行 description NULL（存量域初始化）；② 简介行保留且不洗 updated_at；③ 无条目且无简介的超集行清除', () => {
    const root = tmpRoot()
    const { db, wsPath, knowledgeDir } = setup(root)
    writeEntry(knowledgeDir, 'conventions', 'a-1.md', 'a-1')
    writeEntry(knowledgeDir, 'lessons', 'b-1.md', 'b-1')

    rebuildKnowledgeIndex(db)
    expect(domainRows(db, wsPath)).toEqual([
      { ws_path: wsPath, domain: 'conventions', description: null, updated_at: expect.any(String) },
      { ws_path: wsPath, domain: 'lessons', description: null, updated_at: expect.any(String) },
    ])

    // 人工简介落行（模拟 setDomainDescription 产物）+ 域外悬空行两种
    const at = '2026-01-01T00:00:00.000Z'
    db.prepare(
      `UPDATE knowledge_domains SET description = ?, updated_at = ? WHERE ws_path = ? AND domain = 'conventions'`,
    ).run('声明性约束与惯例', at, wsPath)
    db.prepare(
      `INSERT INTO knowledge_domains (ws_path, domain, description, updated_at) VALUES (?, 'ghost', NULL, ?)`,
    ).run(wsPath, at)
    db.prepare(
      `INSERT INTO knowledge_domains (ws_path, domain, description, updated_at) VALUES (?, 'retired', '有简介无条目', ?)`,
    ).run(wsPath, at)

    // lessons 域条目亡 → 无简介行应在下一次 rebuild 清除；conventions 简介保留
    rmSync(join(knowledgeDir, 'lessons'), { recursive: true, force: true })
    rebuildKnowledgeIndex(db)
    expect(domainRows(db, wsPath)).toEqual([
      { ws_path: wsPath, domain: 'conventions', description: '声明性约束与惯例', updated_at: at },
      { ws_path: wsPath, domain: 'retired', description: '有简介无条目', updated_at: at },
    ])
    db.close()
  })

  it('注册行已删的悬空 ws_path 域行同径清算（无简介空行清除、有简介行保留）', () => {
    const root = tmpRoot()
    const { db, wsPath, knowledgeDir } = setup(root)
    writeEntry(knowledgeDir, 'conventions', 'a-1.md', 'a-1')
    rebuildKnowledgeIndex(db)
    const at = '2026-01-01T00:00:00.000Z'
    db.prepare(
      `INSERT INTO knowledge_domains (ws_path, domain, description, updated_at) VALUES (?, 'legacy', '旧库简介', ?)`,
    ).run(wsPath, at)
    // 直接删注册行（非正门注销）：悬空 ws_path 交由 rebuild 清算
    db.prepare(`DELETE FROM knowledge_registry WHERE ws_path = ?`).run(wsPath)
    rmSync(knowledgeDir, { recursive: true, force: true })
    mkdirSync(knowledgeDir, { recursive: true })
    db.prepare(`INSERT INTO knowledge_registry (ws_path, knowledge_dir, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .run(join(root, 'other'), join(root, 'other', '.knowledge'), at, at)
    writeEntry(join(root, 'other', '.knowledge'), 'pitfalls', 'c-1.md', 'c-1')
    rebuildKnowledgeIndex(db)
    expect(domainRows(db)).toEqual([
      { ws_path: join(root, 'other'), domain: 'pitfalls', description: null, updated_at: expect.any(String) },
      { ws_path: wsPath, domain: 'legacy', description: '旧库简介', updated_at: at },
    ])
    db.close()
  })
})

describe('register 首跑同径（存量域批量初始化）', () => {
  it('registerKnowledge 注册即补行（description NULL）+ rebuild 同对账', async () => {
    const root = tmpRoot()
    const wsPath = join(root, 'ws-r')
    writeEntry(join(wsPath, '.knowledge'), 'conventions', 'a-1.md', 'a-1')
    writeEntry(join(wsPath, '.knowledge'), 'conventions/frontend', 'a-2.md', 'a-2')
    const db = openKnowledgeDatabase(join(root, 'knowledge', 'knowledge.db'))
    const { registerKnowledge } = createScanRegister({ db })
    const outcome = await registerKnowledge({ wsPath })
    expect(outcome.outcome).toBe('registered')
    if (outcome.outcome !== 'registered') throw new Error('unreachable')
    expect(domainRows(db, outcome.wsPath).map((r) => [r.domain, r.description])).toEqual([
      ['conventions', null],
      ['conventions/frontend', null],
    ])
    db.close()
  })
})

describe('注销径应用层级联（registry.remove 手删 ws_path 域行）', () => {
  it('remove 单事务删注册行 + 全部域行；缺席键 false 幂等', () => {
    const root = tmpRoot()
    const { db, wsPath, knowledgeDir } = setup(root)
    writeEntry(knowledgeDir, 'conventions', 'a-1.md', 'a-1')
    rebuildKnowledgeIndex(db)
    expect(domainRows(db, wsPath)).toHaveLength(1)
    const registry = createKnowledgeRegistry(db)
    expect(registry.remove(wsPath)).toBe(true)
    expect(domainRows(db)).toEqual([])
    expect(registry.findByWsPath(wsPath)).toBeUndefined()
    expect(registry.remove(wsPath)).toBe(false)
    db.close()
  })
})
