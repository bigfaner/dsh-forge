// 知识域索引服务（3.1：rebuildIndex 整表事务重建）。定位：业务。
// 语义（tech-design §Interface 2 + ER KNOWLEDGE_ENTRIES）：按需一次性重建——扫描
// projects.knowledge_dir → 逐文件 frontmatter 契约解析 → 单事务删旧插新（幂等：重跑零重复
// 零漂移）；IndexReport 容错计数（不合格条目不入索引不硬拒，硬拒收归 M4 写入面）。
// 派生缓存口径（Hard Rule 2 / SC2 豁免）：缓存只落应用库 knowledge_entries，知识目录零写入。
// 服务面：本任务仅 rebuildIndex（Pick 收窄）；search/readAbstract 归 3.2，浏览面归 3.3，
// 届时并齐 contracts KnowledgeService 全七法后由 service.ts 装配注册 ctx.forgeKnowledge。
import { readFileSync } from 'node:fs'
import type Database from 'better-sqlite3'
import type { IndexReport, KnowledgeService } from '@dsh-forge/contracts'
import { withTransaction } from '../db/index.js'
import { parseKnowledgeFile } from './parser.js'
import { scanKnowledgeDir } from './scan.js'

export interface KnowledgeIndexServiceDeps {
  /** SQLite 句柄（db/ 唯一产出；一切 SQL prepared） */
  db: Database.Database
}

/** 3.1 服务面：仅 rebuildIndex（Interface 2 首法） */
export type KnowledgeIndexService = Pick<KnowledgeService, 'rebuildIndex'>

/** knowledge_entries 行值（插入参数序 = 列序） */
type EntryRowParams = readonly [
  projectId: string,
  frontmatterId: string | null,
  relPath: string,
  domainPath: string,
  title: string,
  summary: string,
  keywords: string, // JSON 编码
  status: string,
  digest: string,
  indexedAt: string,
]

/**
 * rebuildIndex(projectId)：读 projects.knowledge_dir → 扫描 → 解析 → 事务内
 * DELETE + INSERT 全量行。文件读取/解析失败（权限等）计入 skipped（容错不硬拒）；
 * 知识目录不可达抛 InvalidKnowledgeDirError；projectId 未命中抛错 fail-loud（非六码）。
 */
export function createKnowledgeIndexService(deps: KnowledgeIndexServiceDeps): KnowledgeIndexService {
  const { db } = deps
  const selectKnowledgeDir = db.prepare<unknown[], { knowledge_dir: string }>(
    `SELECT knowledge_dir FROM projects WHERE id = ?`,
  )
  const deleteByProject = db.prepare(`DELETE FROM knowledge_entries WHERE project_id = ?`)
  const insertEntry = db.prepare(
    `INSERT INTO knowledge_entries (
       project_id, frontmatter_id, rel_path, domain_path, title, summary, keywords, status, digest, indexed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  return {
    async rebuildIndex(projectId: string): Promise<IndexReport> {
      const project = selectKnowledgeDir.get(projectId)
      if (project === undefined) {
        // 非六码 typed error（Error Handling 表无 project-not-found 行）：fail-loud 原样上抛（同 forge 域先例）
        throw new Error(`项目不存在：rebuildIndex(${projectId})——id 未命中 projects 行`)
      }
      const candidates = scanKnowledgeDir(project.knowledge_dir) // 不可达 → InvalidKnowledgeDirError

      const indexedAt = new Date().toISOString() // 本次重建统一索引时间
      const rows: EntryRowParams[] = []
      let skipped = 0
      for (const f of candidates) {
        try {
          const content = readFileSync(f.absPath, 'utf8')
          const outcome = parseKnowledgeFile({
            relPath: f.relPath,
            domainPath: f.domainPath,
            domainDepth: f.domainDepth,
            content,
            mtime: new Date(f.mtimeMs),
          })
          if (!outcome.ok) {
            skipped += 1
            continue
          }
          const { frontmatter: fm } = outcome.entry
          rows.push([
            projectId,
            fm.id ?? null, // 稳定 ID 存而不强求（M6 转正）
            f.relPath,
            outcome.entry.domainPath,
            fm.title, // 缺省已由解析器应用（文件名去扩展名）
            fm.summary,
            JSON.stringify(fm.keywords), // 数组 JSON 编码存储（ER 口径）
            fm.status, // 缺省已由解析器应用（draft）
            outcome.entry.digest, // 全文 sha256——外部修改变更检测
            indexedAt,
          ])
        } catch {
          skipped += 1 // 读取失败（权限/编码）：容错跳过，不硬拒（M4 才拒收）
        }
      }

      // 整表事务重建：删旧插新原子生效（幂等——重跑零重复零漂移）
      withTransaction(db, () => {
        deleteByProject.run(projectId)
        for (const row of rows) insertEntry.run(...row)
      })

      return { indexed: rows.length, skipped }
    },
  }
}
