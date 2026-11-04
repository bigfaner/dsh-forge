// 首用 rebuild 再生单测（CT-seed-migration-4 单测面）：entries 零迁后自知识目录再生全集、
// 幂等、零 corpus 空转、静默重建 warn / 显式 info / 失败 error 事件、注册行缺席 fail-loud。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { openKnowledgeDatabase } from './open.js'
import { createKnowledgeRegistry } from './registry.js'
import { rebuildKnowledgeIndex } from './rebuild.js'
import { KNOWLEDGE_REBUILD_EVENT, type DiagEmitter } from './index.js'
import type { DiagEventPayload } from '@dsh-forge/contracts'

const roots: string[] = []
function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'knowledge-rebuild-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

/** corpus fixture：合法两条 + 缺 summary 一条（skipped）+ dot 文件（不收） */
function buildCorpus(knowledgeDir: string): void {
  mkdirSync(join(knowledgeDir, 'conventions'), { recursive: true })
  writeFileSync(
    join(knowledgeDir, 'conventions', 'safe-coding.md'),
    `---\ntitle: 安全编码规范\nsummary: 强制口径\nkeywords: [安全, 编码]\nstatus: active\n---\n\n正文。`,
  )
  writeFileSync(
    join(knowledgeDir, 'lesson-1.md'),
    `---\nsummary: 一次教训\nkeywords: []\n---\n\n正文。`,
  )
  writeFileSync(join(knowledgeDir, 'bad-no-summary.md'), `---\nkeywords: [x]\n---\n`)
  writeFileSync(join(knowledgeDir, '.dotfile.md'), `---\nsummary: 脏文件\nkeywords: []\n---\n`)
}

function setup(root: string): { db: Database.Database; wsPath: string } {
  const wsPath = join(root, 'ws')
  const db = openKnowledgeDatabase(join(root, 'knowledge', 'knowledge.db'))
  const registry = createKnowledgeRegistry(db)
  registry.upsert(wsPath, join(wsPath, '.knowledge'))
  return { db, wsPath }
}

function collector(): { emit: DiagEmitter; events: DiagEventPayload[] } {
  const events: DiagEventPayload[] = []
  return { events, emit: (p) => events.push(p) }
}

describe('rebuildKnowledgeIndex（entries 零迁 → 首用再生全集）', () => {
  it('迁移后 entries 零行 → rebuild 再生 corpus 全集（fixture 驱动），成功事件 info', () => {
    const root = tmpRoot()
    const { db, wsPath } = setup(root)
    buildCorpus(join(wsPath, '.knowledge'))
    expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM knowledge_entries`).get()).toEqual({ n: 0 })

    const { emit, events } = collector()
    const report = rebuildKnowledgeIndex(db, wsPath, { emit })
    expect(report).toEqual({ indexed: 2, skipped: 1 })

    const rows = db.prepare<{ rel_path: string; title: string; status: string }[]>(
      `SELECT rel_path, title, status FROM knowledge_entries ORDER BY rel_path`,
    ).all()
    expect(rows).toEqual([
      { rel_path: 'conventions/safe-coding.md', title: '安全编码规范', status: 'active' },
      { rel_path: 'lesson-1.md', title: 'lesson-1', status: 'draft' }, // title/status 缺省
    ])
    expect(events).toHaveLength(1)
    expect(events[0]!.event).toBe(KNOWLEDGE_REBUILD_EVENT)
    expect(events[0]!.level).toBe('info')
    db.close()
  })

  it('幂等：二次 rebuild 零重复零漂移', () => {
    const root = tmpRoot()
    const { db, wsPath } = setup(root)
    buildCorpus(join(wsPath, '.knowledge'))
    rebuildKnowledgeIndex(db, wsPath)
    rebuildKnowledgeIndex(db, wsPath)
    expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM knowledge_entries`).get()).toEqual({ n: 2 })
    db.close()
  })

  it('静默重建（首用）→ warn 级事件；零 corpus 空转成功（indexed=0）不报错', () => {
    const root = tmpRoot()
    const empty = tmpRoot()
    const { db, wsPath } = setup(root)
    const { emit, events } = collector()
    // 零 corpus：注册行指向空目录（不存在目录先建）
    mkdirSync(join(empty, 'kd'))
    db.prepare(`UPDATE projects SET knowledge_dir = ? WHERE ws_path = ?`).run(join(empty, 'kd'), wsPath)
    const report = rebuildKnowledgeIndex(db, wsPath, { emit, silent: true })
    expect(report).toEqual({ indexed: 0, skipped: 0 })
    expect(events).toHaveLength(1)
    expect(events[0]!.level).toBe('warn') // 静默重建 warn
    db.close()
  })

  it('失败路径：知识目录不可达 → error 事件 + InvalidKnowledgeDirError 上抛', () => {
    const root = tmpRoot()
    const { db, wsPath } = setup(root)
    const { emit, events } = collector()
    // knowledge_dir 指向不存在路径（scan 只读零建目录——不可达收口）
    db.prepare(`UPDATE projects SET knowledge_dir = ? WHERE ws_path = ?`).run(join(root, 'missing'), wsPath)
    expect(() => rebuildKnowledgeIndex(db, wsPath, { emit })).toThrow(/知识目录/)
    expect(events).toHaveLength(1)
    expect(events[0]!.level).toBe('error')
    expect(events[0]!.event).toBe(KNOWLEDGE_REBUILD_EVENT)
    db.close()
  })

  it('注册行缺席 → fail-loud 裸错（非注册项目不重建）', () => {
    const root = tmpRoot()
    const db = openKnowledgeDatabase(join(root, 'knowledge', 'knowledge.db'))
    expect(() => rebuildKnowledgeIndex(db, join(root, 'unknown'))).toThrow(/未命中自持注册表/)
    db.close()
  })
})
