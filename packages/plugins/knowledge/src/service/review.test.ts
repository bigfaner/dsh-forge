// knowledge-review-ui 1.4 人工裁决写面服务面单测：
// confirmBatch（集合升格 + already-confirmed 幂等 + cas-failed/not-found 逐条回执）、
// rejectBatch（三表零残留 + 热度史保留 + rejected-confirmed/precheck-failed）、
// moveEntry（文件落点推导 + status 不变 + 深度/不存在拒收）、updateEntry（版本链前进 +
// 指针前移 + 旧版降 superseded + 派生列从文件重解析）、createDomain（mkdir+域行 upsert +
// 超层拒收）、listEntries statusFilter（服务端过滤 + browse 徽记未过滤口径）、
// 四事件域成败两径 emit（注入发射面 spy）。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import matter from 'gray-matter'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DiagEventPayload } from '@dsh-forge/contracts'
import { openKnowledgeDatabase } from '../storage/index.js'
import { createKnowledgeService } from './service.js'
import type { BrowseKnowledgeService } from './types.js'

let home: string
let service: BrowseKnowledgeService
let db: import('better-sqlite3').Database
let wsDir: string
let knowledgeDir: string
const diag: DiagEventPayload[] = []

const fmOf = (file: string): Record<string, unknown> => matter(readFileSync(file, 'utf8')).data as Record<string, unknown>

const entryFile = (id: string): string | undefined => {
  const row = db.prepare<[string], { file_path: string }>(
    `SELECT file_path FROM knowledge_entry_versions WHERE id = ? ORDER BY version_ts DESC LIMIT 1`,
  ).get(id)
  return row?.file_path
}

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-review-'))
  wsDir = join(home, 'ws')
  knowledgeDir = join(wsDir, '.knowledge')
  mkdirSync(join(knowledgeDir, 'sub'), { recursive: true })
  const ok = (rel: string, fm: string, body = '正文内容') =>
    writeFileSync(join(knowledgeDir, rel), `---\n${fm}\n---\n${body}`, 'utf8')
  // unconfirmed A（根域）
  ok('kb-ua.md', 'title: 待审甲\nid: kb-ua\nsummary: 摘要甲\nkeywords: [k1]\nversion_ts: 2026-01-01T00:00:00.000Z')
  // unconfirmed B（sub 域——move 径）
  ok('sub/kb-ub.md', 'title: 待审乙\nid: kb-ub\nsummary: 摘要乙\nkeywords: [k2]\nversion_ts: 2026-01-01T00:00:00.000Z')
  // unconfirmed C（reject 径）
  ok('kb-uc.md', 'title: 待审丙\nid: kb-uc\nsummary: 摘要丙\nkeywords: [k3]\nversion_ts: 2026-01-01T00:00:00.000Z')
  // unconfirmed D（precheck 径——注册后删文件）
  ok('kb-ud.md', 'title: 待审丁\nid: kb-ud\nsummary: 摘要丁\nkeywords: [k4]\nversion_ts: 2026-01-01T00:00:00.000Z')
  // unconfirmed M（cas 径——注册后注入 merged_into）
  ok('kb-um.md', 'title: 待审戊\nid: kb-um\nsummary: 摘要戊\nkeywords: [k5]\nversion_ts: 2026-01-01T00:00:00.000Z')
  // confirmed A（reject 混入拒收 + confirm 幂等径）
  ok('kb-ca.md', 'title: 已确认甲\nid: kb-ca\nsummary: 摘要已甲\nkeywords: [k6]\nstatus: confirmed\nconfirmed_at: 2026-01-02T00:00:00.000Z\nversion_ts: 2026-01-01T00:00:00.000Z')
  // confirmed C（updateEntry 径——已确认条目编辑）
  ok('kb-cc.md', 'title: 已确认丙\nid: kb-cc\nsummary: 摘要已丙\nkeywords: [k7]\nstatus: confirmed\nconfirmed_at: 2026-01-02T00:00:00.000Z\nversion_ts: 2026-01-01T00:00:00.000Z')
  db = openKnowledgeDatabase(join(home, 'knowledge.db'))
  service = createKnowledgeService({ db, resolveWsPath: () => undefined, emit: (p) => diag.push(p) })
})

afterAll(() => {
  db.close()
  rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

const PROJECT = 'p-review'

async function entryIdOf(id: string): Promise<number> {
  const row = db.prepare<[string], { rid: number }>(`SELECT rowid AS rid FROM knowledge_entries WHERE id = ?`).get(id)
  if (row === undefined) throw new Error(`夹具条目缺失：${id}`)
  return row.rid
}

beforeAll(async () => {
  const r = await service.registerKnowledge({ wsPath: wsDir, projectId: PROJECT })
  if (r.outcome !== 'registered') throw new Error(`注册失败：${JSON.stringify(r)}`)
  // precheck 径：注册后删 kb-ud 版本文件
  const ud = entryFile('kb-ud')
  if (ud === undefined) throw new Error('kb-ud 版本行缺失')
  rmSync(ud)
  // cas 径：kb-um 注入 merged_into
  db.prepare(`UPDATE knowledge_entries SET merged_into = 'kb-other' WHERE id = 'kb-um'`).run()
})

describe('confirmBatch 集合升格', () => {
  it('批量通过：unconfirmed → confirmed（单事务）+ already-confirmed 幂等成功 + not-found 逐条回执', async () => {
    const [ua, ub, ca] = await Promise.all([entryIdOf('kb-ua'), entryIdOf('kb-ub'), entryIdOf('kb-ca')])
    const results = await service.confirmBatch({ projectId: PROJECT, entryIds: [ua, ub, ca, 999999] })
    expect(results).toHaveLength(4)
    const byId = new Map(results.map((r) => [r.entryId, r]))
    expect(byId.get(ua)).toMatchObject({ outcome: 'success' })
    expect(byId.get(ub)).toMatchObject({ outcome: 'success' })
    expect(byId.get(ca)).toMatchObject({ outcome: 'success' }) // already-confirmed 幂等等价
    expect(byId.get(999999)).toMatchObject({ outcome: 'failure', code: 'not-found' })
    const rows = db
      .prepare<unknown[], { id: string; status: string; effective_rank: number }>(
        `SELECT id, status, effective_rank FROM knowledge_entries WHERE id IN ('kb-ua', 'kb-ub')`,
      )
      .all()
    for (const row of rows) {
      expect(row.status).toBe('confirmed')
      expect(row.effective_rank).toBe(1)
    }
    // 文件面正本升格 + confirmed_at
    const fm = fmOf(entryFile('kb-ua')!)
    expect(fm.status).toBe('confirmed')
    expect(typeof fm.confirmed_at).toBe('string')
  })

  it('幂等重放零副作用（confirmed_at 不变）+ cas-failed（merged 注入条目）', async () => {
    const ua = await entryIdOf('kb-ua')
    const um = await entryIdOf('kb-um')
    const before = fmOf(entryFile('kb-ua')!).confirmed_at
    const results = await service.confirmBatch({ projectId: PROJECT, entryIds: [ua, um] })
    const byId = new Map(results.map((r) => [r.entryId, r]))
    expect(byId.get(ua)).toMatchObject({ outcome: 'success' })
    expect(byId.get(um)).toMatchObject({ outcome: 'failure', code: 'cas-failed' })
    expect(fmOf(entryFile('kb-ua')!).confirmed_at).toBe(before)
    expect(db.prepare<[string], { merged_into: string }>(`SELECT merged_into FROM knowledge_entries WHERE id = ?`).get('kb-um')!.merged_into).toBe('kb-other')
  })
})

describe('rejectBatch 驳回删除', () => {
  it('批量驳回：文件+版本行+FTS+主行零残留，recall_logs 热度史保留，confirmed 混入 = rejected-confirmed，precheck-failed 条目 DB 零变化', async () => {
    const [uc, ca, ud] = await Promise.all([entryIdOf('kb-uc'), entryIdOf('kb-ca'), entryIdOf('kb-ud')])
    // 热度史夹具：kb-uc 一条 recall_logs（事实流水——reject 不篡改）
    db.prepare(
      `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, entry_id, frontmatter_id, title_snap, domain_snap, query_json, hit_count, duration_ms, created_at)
       VALUES ('p-review', 'c1', '', 'search', ?, 'kb-uc', '待审丙', '', '{}', 1, 0, '2026-01-01T00:00:00.000Z')`,
    ).run(uc)
    const udVersionsBefore = (db.prepare<[string], { c: number }>(`SELECT COUNT(*) AS c FROM knowledge_entry_versions WHERE id = ?`).get('kb-ud')!).c
    const results = await service.rejectBatch({ projectId: PROJECT, entryIds: [uc, ca, ud] })
    const byId = new Map(results.map((r) => [r.entryId, r]))
    expect(byId.get(uc)).toMatchObject({ outcome: 'success' })
    expect(byId.get(ca)).toMatchObject({ outcome: 'failure', code: 'rejected-confirmed' })
    expect(byId.get(ud)).toMatchObject({ outcome: 'failure', code: 'precheck-failed' })
    // 三表零残留
    expect(db.prepare<[string], { c: number }>(`SELECT COUNT(*) AS c FROM knowledge_entries WHERE id = ?`).get('kb-uc')!.c).toBe(0)
    expect(db.prepare<[string], { c: number }>(`SELECT COUNT(*) AS c FROM knowledge_entry_versions WHERE id = ?`).get('kb-uc')!.c).toBe(0)
    expect(db.prepare<[string], { c: number }>(`SELECT COUNT(*) AS c FROM knowledge_fts WHERE id = ?`).get('kb-uc')!.c).toBe(0)
    // 热度史保留
    const heat = db.prepare<[number], { c: number }>(`SELECT COUNT(*) AS c FROM knowledge_recall_logs WHERE entry_id = ?`).get(uc)!
    expect(heat.c).toBe(1)
    // confirmed 条目零变化；precheck 失败条目 DB 行保留
    expect(db.prepare<[string], { c: number }>(`SELECT COUNT(*) AS c FROM knowledge_entries WHERE id = ?`).get('kb-ca')!.c).toBe(1)
    expect((db.prepare<[string], { c: number }>(`SELECT COUNT(*) AS c FROM knowledge_entry_versions WHERE id = ?`).get('kb-ud')!).c).toBe(udVersionsBefore)
    // 文件先删：kb-uc 文件亡
    expect(existsSync(join(knowledgeDir, 'kb-uc.md'))).toBe(false)
  })
})

describe('moveEntry / createDomain', () => {
  it('createDomain：目录+域行即时在场（description NULL）；超层拒收零落盘', async () => {
    const ok = await service.createDomain({ projectId: PROJECT, domain: 'sub2' })
    expect(ok).toEqual({ outcome: 'success' })
    expect(existsSync(join(knowledgeDir, 'sub2'))).toBe(true)
    const row = db.prepare<[string, string], { description: string | null }>(
      `SELECT description FROM knowledge_domains WHERE ws_path = ? AND domain = 'sub2'`,
    ).get(wsDir)!
    expect(row.description).toBeNull()
    const deep = await service.createDomain({ projectId: PROJECT, domain: 'a/b/c/d' })
    expect(deep).toMatchObject({ outcome: 'failure', code: 'domain-depth' })
    expect(existsSync(join(knowledgeDir, 'a'))).toBe(false)
  })

  it('moveEntry：文件 rename 先行、domain 由文件落点推导、status 不变；目标域不存在/超层拒收', async () => {
    const ub = await entryIdOf('kb-ub')
    const statusBefore = db.prepare<[string], { status: string }>(`SELECT status FROM knowledge_entries WHERE id = ?`).get('kb-ub')!.status
    const result = await service.moveEntry({ projectId: PROJECT, entryId: ub, targetDomain: 'sub2' })
    expect(result).toMatchObject({ outcome: 'success', entryId: ub })
    // 文件在新目录
    const versions = db.prepare<[string], { file_path: string }[]>(`SELECT file_path FROM knowledge_entry_versions WHERE id = ?`).all('kb-ub')
    expect(versions).toHaveLength(1)
    expect(versions[0]!.file_path.startsWith(knowledgeDir)).toBe(true)
    expect(versions[0]!.file_path.includes('sub2')).toBe(true)
    const row = db.prepare<[string], { domain: string; status: string }>(
      `SELECT domain, status FROM knowledge_entries WHERE id = ?`,
    ).get('kb-ub')!
    expect(row.domain).toBe('sub2')
    expect(row.status).toBe(statusBefore)
    const missing = await service.moveEntry({ projectId: PROJECT, entryId: ub, targetDomain: 'nope' })
    expect(missing).toMatchObject({ outcome: 'failure', code: 'not-found' })
    const deep = await service.moveEntry({ projectId: PROJECT, entryId: ub, targetDomain: 'a/b/c/d' })
    expect(deep).toMatchObject({ outcome: 'failure', code: 'domain-depth' })
  })
})

describe('updateEntry 元数据编辑', () => {
  it('confirmed 条目编辑：版本链前进 + 指针前移 + 旧版降 superseded + status 不变 + 派生列从文件重解析', async () => {
    const cc = await entryIdOf('kb-cc')
    const result = await service.updateEntry({
      projectId: PROJECT,
      entryId: cc,
      title: '已确认丙·改',
      keywords: ['k7', 'k8'],
      summary: '摘要已丙·改',
      body: '正文已丙·改',
    })
    expect(result).toMatchObject({ outcome: 'success', entryId: cc })
    const versions = db
      .prepare<unknown[], { version_ts: string; file_path: string }>(
        `SELECT version_ts, file_path FROM knowledge_entry_versions WHERE id = ? ORDER BY version_ts`,
      )
      .all('kb-cc')
    expect(versions).toHaveLength(2)
    const row = db.prepare<[string], { status: string; confirmed_version_id: string; title: string }>(
      `SELECT status, confirmed_version_id, title FROM knowledge_entries WHERE id = ?`,
    ).get('kb-cc')!
    expect(row.status).toBe('confirmed') // status 不变
    expect(row.confirmed_version_id).toBe(versions[1]!.version_ts) // 指针前移
    expect(row.title).toBe('已确认丙·改')
    const fts = db.prepare<[string], { summary: string; keywords: string }>(
      `SELECT summary, keywords FROM knowledge_fts WHERE id = ?`,
    ).get('kb-cc')!
    expect(fts.summary).toBe('摘要已丙·改') // FTS 从重写后文件重解析
    expect(fts.keywords).toContain('k8')
    // 旧版降 superseded（frontmatter），新版 confirmed + supersedes 锚
    const oldFm = fmOf(versions[0]!.file_path)
    expect(oldFm.status).toBe('superseded')
    expect((oldFm.confirmed_at as Date).toISOString()).toBe('2026-01-02T00:00:00.000Z') // 曾审标记保留
    const newFm = fmOf(versions[1]!.file_path)
    expect(newFm.status).toBe('confirmed')
    expect(newFm.supersedes).toBe(versions[0]!.version_ts)
  })

  it('unconfirmed 条目编辑：status 保持 unconfirmed + not-found 回执', async () => {
    const um = await entryIdOf('kb-um')
    const result = await service.updateEntry({
      projectId: PROJECT,
      entryId: um,
      title: '待审戊·改',
      keywords: ['k5'],
      summary: '摘要戊·改',
      body: '正文戊·改',
    })
    expect(result).toMatchObject({ outcome: 'success' })
    expect(db.prepare<[string], { status: string }>(`SELECT status FROM knowledge_entries WHERE id = ?`).get('kb-um')!.status).toBe('unconfirmed')
    const missing = await service.updateEntry({ projectId: PROJECT, entryId: 999999, title: 'x', keywords: ['x'], summary: 'x', body: 'x' })
    expect(missing).toMatchObject({ outcome: 'failure', code: 'not-found', entryId: 999999 })
  })
})

describe('statusFilter 与徽记口径', () => {
  it('statusFilter 服务端执行（unconfirmed/confirmed/all）；browse 徽记恒未过滤口径', async () => {
    const unconfirmed = await service.listEntries({ projectId: PROJECT, statusFilter: 'unconfirmed' })
    const confirmed = await service.listEntries({ projectId: PROJECT, statusFilter: 'confirmed' })
    const all = await service.listEntries({ projectId: PROJECT })
    expect(unconfirmed.length).toBeGreaterThan(0)
    expect(unconfirmed.every((c) => c.status === 'unconfirmed')).toBe(true)
    expect(confirmed.every((c) => c.status === 'confirmed')).toBe(true)
    expect(all.length).toBe(unconfirmed.length + confirmed.length)
    // kb-uc 已驳回：不在任何口径
    expect(all.some((c) => c.title === '待审丙')).toBe(false)
    // 徽记：browse 恒未过滤口径底表聚合（sub2 = confirmed 条目 1 + unconfirmed 0；域行计数不随过滤抖动）
    const tree = await service.browse({ projectId: PROJECT })
    const sub2 = tree.find((n) => n.domainPath === 'sub2')
    expect(sub2).toMatchObject({ entryCount: 1, unconfirmedCount: 0 })
  })
})

describe('诊断埋点（四事件域成败两径）', () => {
  it('knowledge-reject warn / knowledge-confirm info / knowledge-entry-move / knowledge-meta-edit 经注入发射面 emit', () => {
    const events = diag.map((d) => d.event)
    const reject = diag.filter((d) => d.event === 'knowledge-reject')
    expect(events).toContain('knowledge-confirm')
    expect(events).toContain('knowledge-entry-move')
    expect(events).toContain('knowledge-meta-edit')
    expect(reject.length).toBeGreaterThan(0)
    expect(reject.every((d) => d.level === 'warn')).toBe(true)
    expect(diag.find((d) => d.event === 'knowledge-confirm' && d.level === 'info')).toBeDefined()
    expect(diag.find((d) => d.event === 'knowledge-entry-move' && d.level === 'info')).toBeDefined()
    expect(diag.find((d) => d.event === 'knowledge-meta-edit' && d.level === 'info')).toBeDefined()
  })
})
