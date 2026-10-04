// 知识域三测试（3.1 index / 3.2 recall / 3.3 browse）共享语料与夹具（fix-35 收编：
// fixture/writeCorpus/writeMd/entryIdByTitle 及行读取助手三份近似拷贝单源化——各域口径
// 差异以参数承载，语料口径头注保留在各 CORPUS 声明处）。定位：测试专用支撑件（非生产面，
// 与 registry-stub 同目录同口径——本目录不进任何生产 import 图）。
// 环境口径：每用例独占临时 SQLite（openDatabase，schema v1 迁移即建表）+ 临时知识目录；
// projects 行直插（注册链路归 forge 域 2.2 已测）。生命周期：本模块登记 dirs/dbs，各测试
// 文件 afterAll 调 disposeKnowledgeCorpus 收尾（vitest 按文件隔离——每测试文件独立模块实例）。
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { openDatabase } from '../db/index.js'
import { createKnowledgeIndexService, type KnowledgeIndexService } from '../knowledge/index-service.js'

/** 语料条目（writeMd 同参：relPath + frontmatter 块文本 + 可选正文） */
export interface CorpusEntry {
  relPath: string
  frontmatter: string
  body?: string
}

/**
 * recall 口径语料（3.2）：前端 / 后端 / 编程-java 三域六条目
 * （title/summary/keywords 差异供过滤与打分断言）。
 */
export const RECALL_CORPUS: readonly CorpusEntry[] = [
  {
    relPath: '前端/框架选型.md',
    frontmatter: ['title: 框架选型', 'id: kb-fe-001', 'status: published', 'summary: 前端框架选型基线', 'keywords: [react, frontend]'].join('\n'),
  },
  { relPath: '前端/样式令牌.md', frontmatter: 'summary: 设计令牌与主题联动\nkeywords: [css, frontend]' },
  { relPath: '后端/API规范.md', frontmatter: 'title: API 规范\nid: kb-be-001\nsummary: 接口设计规范\nkeywords: [api, backend]' },
  { relPath: '后端/安全编码规范.md', frontmatter: 'summary: 服务端输入校验与输出编码基线\nkeywords: [security, backend]' },
  { relPath: '后端/网关.md', frontmatter: 'summary: API 网关路由规则\nkeywords: [api, backend]' },
  { relPath: '编程/java/并发手册.md', frontmatter: 'summary: Java 并发实践\nkeywords: [java, concurrency]' },
]

/**
 * browse 口径语料（3.3）：前端 2 / 后端 3 / 编程-java 1 / 根域 1
 * （较 recall 语料多根域条目与 updated/authors 变体——展示位与域树断言载体）。
 */
export const BROWSE_CORPUS: readonly CorpusEntry[] = [
  {
    relPath: '前端/框架选型.md',
    frontmatter: [
      'title: 框架选型', 'id: kb-fe-001', 'status: published',
      'summary: 前端框架选型基线', 'keywords: [react, frontend]',
      'updated: "2026-01-15T00:00:00.000Z"',
    ].join('\n'),
  },
  { relPath: '前端/样式令牌.md', frontmatter: 'summary: 设计令牌与主题联动\nkeywords: [css, frontend]' },
  { relPath: '后端/API规范.md', frontmatter: 'title: API 规范\nid: kb-be-001\nauthors: 平台组\nsummary: 接口设计规范\nkeywords: [api, backend]', body: '正文-接口细则' },
  { relPath: '后端/安全编码规范.md', frontmatter: 'summary: 服务端输入校验与输出编码基线\nkeywords: [security, backend]' },
  { relPath: '后端/网关.md', frontmatter: 'summary: API 网关路由规则\nkeywords: [api, backend]' },
  { relPath: '编程/java/并发手册.md', frontmatter: 'summary: Java 并发实践\nkeywords: [java, concurrency]\nupdated: 2026-02-01' },
  { relPath: '指南.md', frontmatter: 'summary: 新手指引\nkeywords: [guide]' },
]

/** 夹具产物（库 + 知识目录 + projects 行 id） */
export interface KnowledgeFixture {
  db: Database.Database
  knowledgeDir: string
  projectId: string
}

const dirs: string[] = []
const dbs: Database.Database[] = []
const wsSeq = { n: 0 }

/** 收尾（各测试文件 afterAll 调用——关库 + 删临时目录） */
export function disposeKnowledgeCorpus(): void {
  for (const db of dbs) db.close()
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
}

/**
 * 一套「库 + 知识目录 + projects 行（+ 可选语料/先行重建）」夹具：
 * rebuild = 是否先行重建索引；默认否——静默重建联动用例需要零行索引。
 */
export function knowledgeFixture(o: { prefix: string; corpus?: readonly CorpusEntry[]; rebuild?: boolean }): KnowledgeFixture {
  const home = mkdtempSync(join(tmpdir(), o.prefix))
  dirs.push(home)
  const db = openDatabase(join(home, 'state.db'))
  dbs.push(db)
  const knowledgeDir = join(home, 'knowledge')
  mkdirSync(knowledgeDir)
  const projectId = randomUUID()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO projects (id, workspace_id, ws_path, name, forge_dir, forge_dir_external, knowledge_dir, archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?)`,
  ).run(projectId, randomUUID(), `C:\\ws-${++wsSeq.n}`, `p${wsSeq.n}`, join(home, '.forge'), knowledgeDir, now, now)
  for (const entry of o.corpus ?? []) writeMd(knowledgeDir, entry.relPath, entry.frontmatter, entry.body)
  if (o.rebuild) {
    // rebuildIndex 函数体全同步（better-sqlite3 无 await 路径）——同步落库后即返回
    void createKnowledgeIndexService({ db }).rebuildIndex(projectId)
  }
  return { db, knowledgeDir, projectId }
}

/** 写一篇知识条目文件（frontmatter 块 + 正文，目录按需建） */
export function writeMd(knowledgeDir: string, relPath: string, frontmatter: string, body = '正文'): void {
  const abs = join(knowledgeDir, ...relPath.split('/'))
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, `---\n${frontmatter}\n---\n${body}`, 'utf8')
}

// ── 行读取助手（recall/browse 两测试同收；超集行形状——断言按需取列） ──

/** knowledge_recall_logs 全列行 */
export interface RecallLogRow {
  id: number
  project_id: string
  call_id: string
  session_id: string
  verb: string
  entry_id: number | null
  frontmatter_id: string | null
  title_snap: string | null
  domain_snap: string | null
  query_json: string | null
  hit_count: number
  duration_ms: number | null
  created_at: string
}

export const recallLogsOf = (db: Database.Database, projectId: string): RecallLogRow[] =>
  db.prepare<unknown[], RecallLogRow>(`SELECT * FROM knowledge_recall_logs WHERE project_id = ? ORDER BY id`).all(projectId)

/** app_key_logs 行（data_json 随行——降级断言取结构化附载） */
export interface KeyLogRow {
  level: string
  scope: string
  message: string
  data_json: string | null
}

export const keyLogsOf = (db: Database.Database): KeyLogRow[] =>
  db.prepare<unknown[], KeyLogRow>(`SELECT level, scope, message, data_json FROM app_key_logs ORDER BY id`).all()

export const entryIdByTitle = (db: Database.Database, projectId: string): Map<string, number> =>
  new Map(
    db.prepare<unknown[], { id: number; title: string }>(`SELECT id, title FROM knowledge_entries WHERE project_id = ?`).all(projectId)
      .map((r) => [r.title, r.id] as const),
  )

export const titles = (items: readonly { title: string }[]): string[] => items.map((x) => x.title)

/** rebuild 计数器缝（fix-31 零重建断言）：包真实 index-service，计数 rebuildIndex 实际调用 */
export function countingIndexService(db: Database.Database): { service: Pick<KnowledgeIndexService, 'rebuildIndex'>; calls(): number } {
  const real = createKnowledgeIndexService({ db })
  let n = 0
  return {
    service: {
      async rebuildIndex(projectId: string) {
        n += 1
        return real.rebuildIndex(projectId)
      },
    },
    calls: () => n,
  }
}
