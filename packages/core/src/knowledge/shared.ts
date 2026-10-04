// 知识域同构助手单源（fix-35 收编）：recall-service（3.2 检索面）与 browse-service（3.3
// 浏览面）五处同构拷贝（escapeLike/requireProject/rebuildMissingIndex/selectRows/insertKeyLog）
// 及 parseKeywords/isNonEmptyString/normalizeUpdated/热度语句单源化。定位：业务（域内共享
// ——铁律③ 只禁跨域 ../forge/，域内同层共享不破界）。零行为变化：SQL/消息文案/降级路径
// 逐字保留（rebuildMissingIndex 仅 scope 与触发面动词参数化——fix-31 存在性口径注释随迁）。
import type Database from 'better-sqlite3'
import type { IndexReport } from '@dsh-forge/contracts'
import { errMessage } from '../util.js'
import { IndexStaleError, InvalidKnowledgeDirError } from './errors.js'

/** 索引重建缝（结构形状 = Pick<KnowledgeIndexService, 'rebuildIndex'>：缺省 = 本域 index-service，注入缝供测试替身） */
export interface RebuildIndexSeam {
  rebuildIndex(projectId: string): Promise<IndexReport>
}

/** 关键日志记名域（ER APP_KEY_LOGS 记名域③ 知识域两面：recall = 检索面 3.2 / index = 浏览面 3.3） */
export type KnowledgeKeyLogScope = 'recall' | 'index'

/** 关键日志级别（ER CHECK level IN ('warn','error')） */
export type KnowledgeLogLevel = 'warn' | 'error'

/** 共享助手入参（两服务各自固定 keyLogScope/verb，其余面同构） */
export interface KnowledgeSharedDeps {
  /** SQLite 句柄（db/ 唯一产出；一切 SQL prepared） */
  db: Database.Database
  /** 索引重建缝实例（装配收口后共享同一 index-service） */
  indexService: RebuildIndexSeam
  /** 关键日志记名域（语句字面量 → 绑定参数，值域由 ER CHECK 保证） */
  keyLogScope: KnowledgeKeyLogScope
  /** 触发面动词（静默重建关键日志消息中的面名：search / listEntries） */
  verb: string
}

/** 知识域两服务共享面（工厂内一次性构造，方法零再准备语句） */
export interface KnowledgeSharedHelpers {
  /** projects 行存在性守卫（fail-loud 裸错——非六码，同 3.1 rebuildIndex / forge 域先例） */
  requireProject(projectId: string, verb: string): void
  /** 关键日志单条写入（只记关键：异常/失败/自动修复；成功路径不记） */
  writeKeyLog(level: KnowledgeLogLevel, message: string, data: Record<string, unknown>): void
  /** 索引缺失（项目级零行）静默重建联动（ERR_INDEX_STALE 语义——降级路径见原两服务块注） */
  rebuildMissingIndex(projectId: string): Promise<void>
}

/**
 * 共享助手工厂：两服务（recall / browse）同构面的单源构造。app_key_logs 写入为本域自备
 * 语句（forge/key-logs 同构 SQL，铁律③ 禁 import ../forge/——共享表经 db/ 句柄单写路径）。
 */
export function createKnowledgeSharedHelpers(deps: KnowledgeSharedDeps): KnowledgeSharedHelpers {
  const selectProject = deps.db.prepare<unknown[], { id: string }>(`SELECT id FROM projects WHERE id = ?`)
  const insertKeyLog = deps.db.prepare(
    `INSERT INTO app_key_logs (level, scope, message, data_json, created_at) VALUES (?, ?, ?, ?, ?)`,
  )

  const writeKeyLog = (level: KnowledgeLogLevel, message: string, data: Record<string, unknown>): void => {
    insertKeyLog.run(level, deps.keyLogScope, message, JSON.stringify(data), new Date().toISOString())
  }

  return {
    requireProject(projectId, verb) {
      if (selectProject.get(projectId) === undefined) {
        throw new Error(`项目不存在：${verb}(${projectId})——id 未命中 projects 行`)
      }
    },

    writeKeyLog,

    /**
     * 索引缺失（项目级零行）静默重建联动（原两服务逐字收编，仅 verb 参数化）：
     * · 成功 → warn 记自动修复事件（单事件单条）后由调用方直读新索引（空目录合法 = 空结果）
     * · 失败 → 按因降级：目录不可达原样上抛 InvalidKnowledgeDirError（Hard Rule 2 六码面）；
     *   其余异常包装 IndexStaleError（索引仍缺失，检索中止）——均先落 app_key_logs(error)
     */
    async rebuildMissingIndex(projectId) {
      try {
        const report = await deps.indexService.rebuildIndex(projectId)
        writeKeyLog('warn', `${deps.verb} 索引缺失触发静默重建`, { projectId, indexed: report.indexed, skipped: report.skipped })
      } catch (cause) {
        if (cause instanceof InvalidKnowledgeDirError) {
          writeKeyLog('error', `${deps.verb} 静默重建失败：知识目录不可达`, { projectId, reason: cause.message })
          throw cause
        }
        const reason = errMessage(cause)
        writeKeyLog('error', `${deps.verb} 静默重建失败（索引仍缺失）`, { projectId, reason })
        throw new IndexStaleError({ projectId, reason }, cause)
      }
    },
  }
}

// ── 纯函数助手（零语句、零库依赖——两服务共同消费的口径单源） ──

/** LIKE 通配转义（% _ \）——域前缀 SQL 段匹配防通配符注入（Security Mitigations：prepared + 输入规整） */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/**
 * 域前缀可选的缓存行读取（undefined = 全域；空串 = 根域；尾 '/' 归一——search 与
 * listEntries 同口径：= 前缀 或 前缀/… 子域，段前缀不做子串误匹配）。语句由调用方
 * prepared（行形状各异），本函数只单源匹配口径。
 */
export function selectRowsByDomain<R>(
  selectAll: { all(projectId: string): R[] },
  selectByDomain: { all(projectId: string, prefix: string, pattern: string): R[] },
  q: { projectId: string; domainPrefix?: string },
): R[] {
  if (q.domainPrefix === undefined) return selectAll.all(q.projectId)
  const prefix = q.domainPrefix.replace(/\/+$/, '')
  return selectByDomain.all(q.projectId, prefix, `${escapeLike(prefix)}/%`)
}

/** 索引行 keywords 列解码（存储态 JSON 字符串 → string[]——写入面（3.1）单一来源保证形状可解析） */
export function parseKeywords(stored: string): string[] {
  return JSON.parse(stored) as string[]
}

/** 非空字符串判定（空串/纯空白视同缺失——parser 必填/可选口径与 browse authors 缺省同源） */
export function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

/** updated 展示位归一：非空串直传 / Date 字面量（js-yaml 产物）ISO-8601 化 / 其余取缺省（fallbackMs 毫秒） */
export function normalizeUpdated(value: unknown, fallbackMs: number): string {
  if (isNonEmptyString(value)) return value
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  return new Date(fallbackMs).toISOString()
}

/**
 * 事件热度语句（heatByEntry 同口径单表计数：search 命中与 read-abstract 各计一次、哨兵行
 * entry_id NULL 天然排除——recall 热度面与 browse 热度徽章共享；ORDER BY entry_id 确定性）。
 */
export function prepareHeatByEntry(
  db: Database.Database,
): Database.Statement<unknown[], { entry_id: number; heat: number }> {
  return db.prepare<unknown[], { entry_id: number; heat: number }>(
    `SELECT entry_id, COUNT(*) AS heat FROM knowledge_recall_logs
     WHERE project_id = ? AND entry_id IS NOT NULL GROUP BY entry_id ORDER BY entry_id`,
  )
}
