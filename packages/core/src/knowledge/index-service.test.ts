// 任务 3.1 集成测试 —— rebuildIndex 整表事务重建（删旧插新）+ IndexReport 容错计数。
// 环境口径：每用例独占临时 SQLite（openDatabase，schema v1 迁移即建表）+ 临时知识目录；
// projects 行直插（本任务只消费 knowledge_dir，注册链路归 forge 域 2.2 已测）。
// 夹具/写文件经 testutil/knowledge-corpus 单源（fix-35 收编，无语料——本域逐用例手写变体）。
// AC 对照：AC1 全字段/缺省/UK；AC2 容错计数；AC3 幂等零漂移；AC4 digest 变更检测；
// Hard Rule 2：索引缓存只落应用库（知识目录零写入自证）。
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { createKnowledgeIndexService } from './index-service.js'
import { InvalidKnowledgeDirError } from './errors.js'
import { disposeKnowledgeCorpus, knowledgeFixture, writeMd } from '../testutil/knowledge-corpus.js'

// ── 测试环境 ──

afterAll(disposeKnowledgeCorpus)

/** 夹具（index 域口径：无语料——索引内容逐用例手写，断言聚焦解析/重建行为） */
const fixture = () => knowledgeFixture({ prefix: 'dsh-forge-knidx-' })

interface EntryRow {
  id: number
  project_id: string
  frontmatter_id: string | null
  rel_path: string
  domain_path: string
  title: string
  summary: string
  keywords: string
  status: string
  digest: string
  indexed_at: string
}

const rowsOf = (db: Database.Database, projectId: string): EntryRow[] =>
  db.prepare<unknown[], EntryRow>(`SELECT * FROM knowledge_entries WHERE project_id = ? ORDER BY rel_path`).all(projectId)

const FULL_FM = [
  'title: 安全编码规范',
  'summary: 服务端输入校验与输出编码基线',
  'keywords: [security, backend]',
  'status: published',
  'id: kb-sec-001',
  'authors: 安全组',
  'updated: 2026-01-02T03:04:05.000Z',
].join('\n')

// ── AC1：合法条目全字段入 knowledge_entries ──

describe('rebuildIndex 合法路径（AC1）', () => {
  it('全字段入库：契约列逐一断言（含 keywords JSON 编码与 digest）', async () => {
    const f = fixture()
    writeMd(f.knowledgeDir, '安全/安全编码规范.md', FULL_FM)
    const report = await createKnowledgeIndexService({ db: f.db }).rebuildIndex(f.projectId)
    expect(report).toEqual({ indexed: 1, skipped: 0 })
    const rows = rowsOf(f.db, f.projectId)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row).toMatchObject({
      project_id: f.projectId,
      frontmatter_id: 'kb-sec-001',
      rel_path: '安全/安全编码规范.md',
      domain_path: '安全',
      title: '安全编码规范',
      summary: '服务端输入校验与输出编码基线',
      status: 'published',
    })
    expect(JSON.parse(row.keywords)).toEqual(['security', 'backend'])
    expect(row.digest).toMatch(/^[0-9a-f]{64}$/)
    expect(row.indexed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('title 缺省 = 文件名去扩展名（仅缺 title 仍入索引——AC2 正例）', async () => {
    const f = fixture()
    writeMd(f.knowledgeDir, '安全编码规范.md', 'summary: 摘要\nkeywords: [a]')
    const report = await createKnowledgeIndexService({ db: f.db }).rebuildIndex(f.projectId)
    expect(report).toEqual({ indexed: 1, skipped: 0 })
    expect(rowsOf(f.db, f.projectId)[0]).toMatchObject({ title: '安全编码规范', frontmatter_id: null, status: 'draft' })
  })

  it('重跑 UK(project_id, rel_path) 不冲突（事务内删旧插新）', async () => {
    const f = fixture()
    writeMd(f.knowledgeDir, 'a.md', FULL_FM)
    const svc = createKnowledgeIndexService({ db: f.db })
    await expect(svc.rebuildIndex(f.projectId)).resolves.toEqual({ indexed: 1, skipped: 0 })
    await expect(svc.rebuildIndex(f.projectId)).resolves.toEqual({ indexed: 1, skipped: 0 })
  })
})

// ── AC2：容错口径（不入索引 + IndexReport 计数） ──

describe('rebuildIndex 容错计数（AC2）', () => {
  it('缺 summary / 缺 keywords / 域超 3 层 → 不入索引且 skipped 计数；合法条目照常入', async () => {
    const f = fixture()
    writeMd(f.knowledgeDir, 'ok.md', 'summary: s\nkeywords: [a]')
    writeMd(f.knowledgeDir, '缺summary.md', 'keywords: [a]')
    writeMd(f.knowledgeDir, '缺keywords.md', 'summary: s')
    writeMd(f.knowledgeDir, 'a/b/c/d/超层.md', 'summary: s\nkeywords: [a]')
    const report = await createKnowledgeIndexService({ db: f.db }).rebuildIndex(f.projectId)
    expect(report).toEqual({ indexed: 1, skipped: 3 })
    const rows = rowsOf(f.db, f.projectId)
    expect(rows.map((r) => r.rel_path)).toEqual(['ok.md'])
  })

  it('无 frontmatter 块 / 坏 YAML → 计数不入', async () => {
    const f = fixture()
    writeFileSync(join(f.knowledgeDir, '裸文.md'), '# 无分隔块\n正文', 'utf8')
    writeMd(f.knowledgeDir, '坏yaml.md', 'title: [unclosed\nsummary: s\nkeywords: [a]')
    const report = await createKnowledgeIndexService({ db: f.db }).rebuildIndex(f.projectId)
    expect(report).toEqual({ indexed: 0, skipped: 2 })
    expect(rowsOf(f.db, f.projectId)).toHaveLength(0)
  })
})

// ── AC3：rebuild 幂等（重跑零重复零漂移） ──

describe('rebuildIndex 幂等（AC3）', () => {
  it('重跑零重复：行集（除自增 id / indexed_at 外）逐字段一致', async () => {
    const f = fixture()
    writeMd(f.knowledgeDir, 'a.md', FULL_FM)
    writeMd(f.knowledgeDir, 'b/c.md', 'summary: s2\nkeywords: [b]')
    const svc = createKnowledgeIndexService({ db: f.db })
    await svc.rebuildIndex(f.projectId)
    const snapshot = (r: EntryRow) => {
      const { id: _id, indexed_at: _at, ...rest } = r
      void _id
      void _at
      return rest
    }
    const first = rowsOf(f.db, f.projectId).map(snapshot)
    await svc.rebuildIndex(f.projectId)
    const second = rowsOf(f.db, f.projectId).map(snapshot)
    expect(second).toEqual(first)
    expect(rowsOf(f.db, f.projectId).map((r) => r.rel_path)).toEqual(['a.md', 'b/c.md']) // 无重复
  })

  it('零漂移：外部删/增文件后重跑精确反映目录现状', async () => {
    const f = fixture()
    writeMd(f.knowledgeDir, '旧.md', FULL_FM)
    const svc = createKnowledgeIndexService({ db: f.db })
    await svc.rebuildIndex(f.projectId)
    expect(rowsOf(f.db, f.projectId).map((r) => r.rel_path)).toEqual(['旧.md'])

    // unlinkSync 而非单文件 rmSync：Node 24.9.0/Windows 下 rmSync(<含 CJK 文件名>) 会原生崩溃
    //（本机实测；unlinkSync 与递归 rmSync 均安全）——环境坑见执行记录
    unlinkSync(join(f.knowledgeDir, '旧.md'))
    writeMd(f.knowledgeDir, '新/新条目.md', 'summary: 新\nkeywords: [n]')
    await svc.rebuildIndex(f.projectId)
    const rows = rowsOf(f.db, f.projectId)
    expect(rows.map((r) => r.rel_path)).toEqual(['新/新条目.md']) // 旧行已随删旧插新消失
    expect(rows[0]).toMatchObject({ title: '新条目', domain_path: '新' })
  })
})

// ── AC4：digest 变更检测（场景⑦ 数据侧） ──

describe('rebuildIndex digest 变更检测（AC4）', () => {
  it('外部修改文件后 digest 变化可识别（frontmatter 元数据不变亦然）', async () => {
    const f = fixture()
    writeMd(f.knowledgeDir, 'a.md', FULL_FM, '旧正文')
    const svc = createKnowledgeIndexService({ db: f.db })
    await svc.rebuildIndex(f.projectId)
    const before = rowsOf(f.db, f.projectId)[0]!

    writeMd(f.knowledgeDir, 'a.md', FULL_FM, '外部修改后的正文')
    await svc.rebuildIndex(f.projectId)
    const after = rowsOf(f.db, f.projectId)[0]!
    expect(after.digest).not.toBe(before.digest)
    expect(after.title).toBe(before.title) // 元数据未动
  })
})

// ── Hard Rule 2：索引缓存不落知识目录（SC2 豁免口径：缓存只在应用库） ──

describe('缓存零落知识目录（Hard Rule 2）', () => {
  it('rebuild 后知识目录文件集合不变（无索引副产物写入）', async () => {
    const f = fixture()
    writeMd(f.knowledgeDir, 'a.md', FULL_FM)
    writeMd(f.knowledgeDir, 'd/e.md', 'summary: s\nkeywords: [a]')
    const before = new Set(readdirSync(f.knowledgeDir, { recursive: true }).map(String))
    await createKnowledgeIndexService({ db: f.db }).rebuildIndex(f.projectId)
    await createKnowledgeIndexService({ db: f.db }).rebuildIndex(f.projectId) // 重跑亦不落
    const after = new Set(readdirSync(f.knowledgeDir, { recursive: true }).map(String))
    expect(after).toEqual(before)
  })
})

// ── 失败口径 ──

describe('rebuildIndex 失败口径', () => {
  it('projectId 未命中 projects 行 → fail-loud 抛错（非六码，同 forge 域先例）', async () => {
    const f = fixture()
    await expect(createKnowledgeIndexService({ db: f.db }).rebuildIndex(randomUUID())).rejects.toThrowError(/项目不存在/)
  })

  it('fix-39 存量行自愈：知识目录缺失 → mkdir 递归重建后继续（空报告不报错，验收③前半）', async () => {
    const f = fixture()
    rmSync(f.knowledgeDir, { recursive: true, force: true }) // 目录递归删除：内部逐文件 unlink，安全
    const report = await createKnowledgeIndexService({ db: f.db }).rebuildIndex(f.projectId)
    expect(report).toEqual({ indexed: 0, skipped: 0 }) // 空索引不报错——知识视图即扫即用
    expect(existsSync(f.knowledgeDir), '目录已在盘重建（fix-39 前存量行免重注册即愈）').toBe(true)
  })

  it('知识目录为普通文件 → 仍 InvalidKnowledgeDirError（语义收窄验证：真非法不吞，验收③后半）', async () => {
    const f = fixture()
    rmSync(f.knowledgeDir, { recursive: true, force: true })
    writeFileSync(f.knowledgeDir, '占位文件', 'utf8') // 同路径落普通文件——mkdir EEXIST 交还 scan 收口
    const err = await createKnowledgeIndexService({ db: f.db })
      .rebuildIndex(f.projectId)
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(InvalidKnowledgeDirError)
    expect(err).toMatchObject({ code: 'ERR_INVALID_KNOWLEDGE_DIR' })
  })
})
