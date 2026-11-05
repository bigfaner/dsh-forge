// rebuild 再生单测（stage② A1 文档权威对账）：从 md frontmatter 逐行重建等价（含
// merged_into/redirect 与四档 effective_rank）、作用域白名单（业务账零波及）、文件亡
// → 记录亡（purge 分级埋点 + 无孤儿中间态）、幂等、id 缺席跳过、成败事件面。
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { openKnowledgeDatabase } from './open.js'
import { createKnowledgeRegistry } from './registry.js'
import { rebuildKnowledgeIndex, deriveEffectiveRank } from './rebuild.js'
import { KNOWLEDGE_PURGE_EVENT, KNOWLEDGE_REBUILD_EVENT, type DiagEmitter } from './index.js'
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

function setup(root: string): { db: Database.Database; wsPath: string; knowledgeDir: string } {
  const wsPath = join(root, 'ws')
  const knowledgeDir = join(wsPath, '.knowledge')
  const db = openKnowledgeDatabase(join(root, 'knowledge', 'knowledge.db'))
  createKnowledgeRegistry(db).upsert(wsPath, knowledgeDir)
  return { db, wsPath, knowledgeDir }
}

function collector(): { emit: DiagEmitter; events: DiagEventPayload[] } {
  const events: DiagEventPayload[] = []
  return { events, emit: (p) => events.push(p) }
}

/** stage② corpus：四档 rank 各态 + id 缺席 + 坏文件 */
function buildCorpus(knowledgeDir: string): { files: Record<string, string> } {
  mkdirSync(join(knowledgeDir, 'conventions'), { recursive: true })
  const files: Record<string, string> = {
    // confirmed 1.0（type=conventions + procedure 形态标签 + 域子目录）
    'conventions/auth-1-v1.md':
      `---\nid: auth-1\ntitle: Authority Entry\nsummary: 权威条目\nkeywords: [auth, term]\n` +
      `status: confirmed\ntype: conventions\nprocedure: true\nversion_ts: 2026-01-01T00:00:00.000Z\n---\n\n正文。`,
    // merged_into redirect → 0.2（redirect 沉底，压过 confirmed）
    'loser-1-v1.md':
      `---\nid: loser-1\ntitle: Loser\nsummary: 归并败者\nkeywords: [loser]\n` +
      `status: confirmed\nmerged_into: auth-1\nversion_ts: 2026-01-02T00:00:00.000Z\n---\n\n正文。`,
    // 纯新 unconfirmed → 0.6（status 缺席归一 unconfirmed；version_ts 缺席回退 mtime）
    'fresh-1-v1.md': `---\nid: fresh-1\ntitle: Fresh\nsummary: 纯新条目\nkeywords: [fresh]\n---\n\n正文。`,
    // 版本链双版本均 superseded，supersedes 锚链内版本 → 0.2
    'chain-1-v1.md':
      `---\nid: chain-1\ntitle: Chain Old\nsummary: 旧版\nkeywords: [chain]\n` +
      `status: superseded\nversion_ts: 2026-01-01T00:00:00.000Z\n---\n\n正文。`,
    'chain-1-v2.md':
      `---\nid: chain-1\ntitle: Chain New\nsummary: 新版\nkeywords: [chain]\n` +
      `status: superseded\nsupersedes: 2026-01-01T00:00:00.000Z\nversion_ts: 2026-02-01T00:00:00.000Z\n---\n\n正文。`,
    // supersedes 悬空锚（语义冲突）→ 0.4
    'broken-1-v1.md':
      `---\nid: broken-1\ntitle: Broken\nsummary: 冲突条目\nkeywords: [broken]\n` +
      `status: superseded\nsupersedes: 2025-12-31T00:00:00.000Z\nversion_ts: 2026-03-01T00:00:00.000Z\n---\n\n正文。`,
    // id 缺席（存量收编前）→ skipped
    'no-id.md': `---\ntitle: No Id\nsummary: 无 id\nkeywords: [x]\n---\n\n正文。`,
    // 契约不过（缺 summary）→ skipped
    'bad-no-summary.md': `---\nid: bad-1\nkeywords: [x]\n---\n`,
  }
  for (const [rel, content] of Object.entries(files)) {
    writeFileSync(join(knowledgeDir, ...rel.split('/')), content)
  }
  return { files }
}

interface EntryProjection {
  id: string
  title: string
  title_norm: string
  type: string | null
  procedure_tag: number
  status: string
  effective_rank: number
  confirmed_version_id: string | null
  merged_into: string | null
  domain: string
}

function entryRows(db: Database.Database): EntryProjection[] {
  return db
    .prepare<unknown[], EntryProjection>(
      `SELECT id, title, title_norm, type, procedure_tag, status, effective_rank,
              confirmed_version_id, merged_into, domain
         FROM knowledge_entries ORDER BY id`,
    )
    .all()
}

describe('deriveEffectiveRank（派生优先级链——全档组合钉死，INV-D 单测面）', () => {
  it('优先级链逐档：merged_into 0.2 ＞ confirmed 1.0 ＞ unconfirmed 0.6 ＞ 冲突 0.4 ＞ superseded 0.2', () => {
    expect(deriveEffectiveRank('confirmed', undefined, false)).toBe(1.0)
    expect(deriveEffectiveRank('confirmed', undefined, true)).toBe(1.0) // 冲突不压 confirmed
    expect(deriveEffectiveRank('unconfirmed', undefined, false)).toBe(0.6)
    expect(deriveEffectiveRank('unconfirmed', undefined, true)).toBe(0.6) // 冲突不压 unconfirmed
    expect(deriveEffectiveRank('superseded', undefined, true)).toBe(0.4) // 冲突隔离
    expect(deriveEffectiveRank('superseded', undefined, false)).toBe(0.2)
    // merged_into 全态沉底 0.2（redirect 承载——最高优先）
    for (const status of ['unconfirmed', 'confirmed', 'superseded'] as const) {
      expect(deriveEffectiveRank(status, 'winner-id', false)).toBe(0.2)
      expect(deriveEffectiveRank(status, 'winner-id', true)).toBe(0.2)
    }
    expect(deriveEffectiveRank('confirmed', '', false)).toBe(1.0) // 空串 = 无 redirect
  })
})

describe('rebuildKnowledgeIndex（stage② 文档权威对账）', () => {
  it('再生等价：四档 effective_rank 派生 + merged_into/redirect + 版本链 + FTS + 派生指针，id 缺席/坏文件 skipped，成功事件 info', () => {
    const root = tmpRoot()
    const { db, knowledgeDir } = setup(root)
    buildCorpus(knowledgeDir)

    const { emit, events } = collector()
    const report = rebuildKnowledgeIndex(db, { emit })
    expect(report.indexed).toBe(5) // auth-1 / loser-1 / fresh-1 / chain-1 / broken-1
    expect(report.skipped).toBe(2) // no-id + bad-no-summary
    expect(report.purged).toBe(0)

    const ranks = Object.fromEntries(entryRows(db).map((r) => [r.id, r.effective_rank]))
    expect(ranks).toEqual({
      'auth-1': 1.0, // confirmed
      'loser-1': 0.2, // merged_into redirect 沉底（压过 confirmed）
      'fresh-1': 0.6, // 纯新 unconfirmed
      'chain-1': 0.2, // superseded（supersedes 锚链内版本）
      'broken-1': 0.4, // supersedes 悬空锚 → 冲突隔离
    })

    const auth = entryRows(db).find((r) => r.id === 'auth-1')!
    expect(auth.title_norm).toBe('authority entry') // title_norm 归一
    expect(auth.type).toBe('conventions')
    expect(auth.procedure_tag).toBe(1) // 形态标签
    expect(auth.domain).toBe('conventions') // 域 = 目录相对路径派生
    expect(auth.confirmed_version_id).toBe('2026-01-01T00:00:00.000Z') // 派生指针免扫版本链
    const loser = entryRows(db).find((r) => r.id === 'loser-1')!
    expect(loser.merged_into).toBe('auth-1') // redirect 再生
    expect(loser.confirmed_version_id).toBe('2026-01-02T00:00:00.000Z')

    // 版本链：chain-1 双版本 + auth-1 权威投影；版本行 = 全部 6 个 id 化文件
    const chainVersions = db
      .prepare<unknown[], { version_ts: string }>(`SELECT version_ts FROM knowledge_entry_versions WHERE id = 'chain-1' ORDER BY version_ts`)
      .all()
    expect(chainVersions.map((r) => r.version_ts)).toEqual(['2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'])
    const versionCount = db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM knowledge_entry_versions`).get()
    expect(versionCount).toEqual({ n: 6 })
    const chainNew = db
      .prepare<unknown[], { file_path: string }>(`SELECT file_path FROM knowledge_entry_versions WHERE id = 'chain-1' AND version_ts = '2026-02-01T00:00:00.000Z'`)
      .get()
    expect(chainNew!.file_path).toBe(join(knowledgeDir, 'chain-1-v2.md')) // file_path 对账锚

    // FTS5 虚表：entries 数一致（superseded 版本轻量索引同承载）
    const fts = db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM knowledge_fts`).get()
    expect(fts).toEqual({ n: 5 })

    expect(events).toHaveLength(1)
    expect(events[0]!.event).toBe(KNOWLEDGE_REBUILD_EVENT)
    expect(events[0]!.level).toBe('info')
    db.close()
  })

  it('作用域白名单：业务账（supersede_ledger / recall_logs）不受 rebuild 波及（测试钉死）', () => {
    const root = tmpRoot()
    const { db, knowledgeDir } = setup(root)
    buildCorpus(knowledgeDir)
    db.prepare(
      `INSERT INTO knowledge_supersede_ledger (winner_id, loser_id, reason, actor, merged_at) VALUES ('auth-1', 'loser-1', 'dup', 'agent', '2026-01-05T00:00:00Z')`,
    ).run()
    db.prepare(
      `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, entry_id, hit_count, created_at)
       VALUES ('pid', 'c1', 's1', 'search', NULL, 3, '2026-01-06T00:00:00Z')`,
    ).run()

    rebuildKnowledgeIndex(db)
    rebuildKnowledgeIndex(db) // 二连 rebuild 也不波及
    const ledger = db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM knowledge_supersede_ledger`).get()
    const recalls = db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM knowledge_recall_logs`).get()
    expect(ledger).toEqual({ n: 1 })
    expect(recalls).toEqual({ n: 1 })
    db.close()
  })

  it('幂等：二次 rebuild 零重复零漂移（entries/versions/FTS 行数稳定）', () => {
    const root = tmpRoot()
    const { db, knowledgeDir } = setup(root)
    buildCorpus(knowledgeDir)
    rebuildKnowledgeIndex(db)
    const first = rebuildKnowledgeIndex(db)
    expect(first).toEqual({ indexed: 5, skipped: 2, purged: 0 })
    for (const t of ['knowledge_entries', 'knowledge_entry_versions', 'knowledge_fts']) {
      const n = db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM ${t}`).get()
      expect(n!.n).toBeGreaterThan(0)
    }
    const ranks = Object.fromEntries(entryRows(db).map((r) => [r.id, r.effective_rank]))
    expect(Object.keys(ranks)).toHaveLength(5)
    db.close()
  })

  it('文件亡 → 记录亡：confirmed 文件缺失 = warn 级 knowledge-entry-purge + unconfirmed = info 级；entries/版本行零残留（无孤儿中间态）', () => {
    const root = tmpRoot()
    const { db, knowledgeDir } = setup(root)
    const { files } = buildCorpus(knowledgeDir)
    rebuildKnowledgeIndex(db)

    unlinkSync(join(knowledgeDir, ...'conventions/auth-1-v1.md'.split('/'))) // confirmed 意外缺失
    unlinkSync(join(knowledgeDir, ...'fresh-1-v1.md'.split('/'))) // unconfirmed 主动删除
    const { emit, events } = collector()
    const report = rebuildKnowledgeIndex(db, { emit })

    expect(report.purged).toBe(2)
    const purgeEvents = events.filter((e) => e.event === KNOWLEDGE_PURGE_EVENT)
    expect(purgeEvents).toHaveLength(2)
    // 分级：confirmed → warn；unconfirmed → info
    expect(purgeEvents.some((e) => e.level === 'warn' && e.message.includes('auth-1'))).toBe(true)
    expect(purgeEvents.some((e) => e.level === 'info' && e.message.includes('fresh-1'))).toBe(true)

    // 零残留：亡 id 的 entries 行与版本行同删
    const ids = entryRows(db).map((r) => r.id)
    expect(ids).not.toContain('auth-1')
    expect(ids).not.toContain('fresh-1')
    const versionResidue = db
      .prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM knowledge_entry_versions WHERE id IN ('auth-1', 'fresh-1')`,
      )
      .get()
    expect(versionResidue).toEqual({ n: 0 })
    // 存活条目不受波及
    expect(ids).toEqual(['broken-1', 'chain-1', 'loser-1'])
    void files
    db.close()
  })

  it('静默重建（首用）→ warn 级事件；零注册行/零 corpus 空转不报错', () => {
    const root = tmpRoot()
    const { db, knowledgeDir } = setup(root)
    const { emit, events } = collector()
    mkdirSync(knowledgeDir, { recursive: true })
    const report = rebuildKnowledgeIndex(db, { emit, silent: true })
    expect(report).toEqual({ indexed: 0, skipped: 0, purged: 0 })
    expect(events).toHaveLength(1)
    expect(events[0]!.level).toBe('warn')
    db.close()
  })

  it('失败路径：注册行知识目录不可达 → error 事件 + InvalidKnowledgeDirError 上抛', () => {
    const root = tmpRoot()
    const { db, wsPath } = setup(root)
    const { emit, events } = collector()
    db.prepare(`UPDATE knowledge_registry SET knowledge_dir = ? WHERE ws_path = ?`).run(join(root, 'missing'), wsPath)
    expect(() => rebuildKnowledgeIndex(db, { emit })).toThrow(/知识目录/)
    expect(events).toHaveLength(1)
    expect(events[0]!.level).toBe('error')
    expect(events[0]!.event).toBe(KNOWLEDGE_REBUILD_EVENT)
    db.close()
  })
})
