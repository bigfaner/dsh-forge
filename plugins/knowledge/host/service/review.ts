// knowledge-review-ui 1.4 人工裁决写面（提案 §2.1/§2.2——分文件惯例同 supersede/scan-register）：
// confirmBatch/rejectBatch 批量集合操作（单事务 set-based + IN(...)，非门面循环调用——裁决 #8）、
// moveEntry/updateEntry 单条原语、createDomain 树级操作。
// · confirm 批量：文件面正本升格先行（target 最新版 confirmed + 旧 confirmed 版降 superseded，
//   同 write.ts confirm 口径）→ 单 BEGIN IMMEDIATE 事务集合 UPDATE（WHERE id IN(...) AND
//   status='unconfirmed' 条件式——TOCTOU 防线）→ 逐条回执由行集差分取得（already-confirmed
//   = 幂等成功等价，零重复记账）。
// · reject 批量：文件前置逐例预检（失败条目不入 SQL 批、逐条失败回执）→ 文件先删 → 单事务
//   条件式删版本行+FTS+主行（事务序「文件先删→DB 删」，崩溃窗口唯一方向 = 文件亡记录亡，
//   与现役同步删除口径自愈兼容）；recall_logs 热度史保留（事实流水非条目附属物）。
// · moveEntry：文件 rename 先行 → 事务内 upsert（domain 由文件落点推导——崩溃自愈收敛到
//   文件实际位置）；updateEntry：新版本文件落盘 + 旧权威降 superseded（版本链前进 +
//   confirmed_version_id 指针前移）、status 不变、DB 派生列从重写后文件重新解析（不信任
//   入参副本）；createDomain：mkdir + 域行 upsert（description NULL，≤3 层校验共用 write
//   严契约 validateDomainPath）。
// 诊断：四事件域成败两径 emit（knowledge-confirm 复用 / knowledge-reject=warn /
// knowledge-entry-move / knowledge-meta-edit；createDomain 沿用 knowledge-domain-update），
// 经装配期注入发射面——零直落 console。回执 code 封闭字面量联合（contracts
// EntryActionFailureCode 单源；'stale' 码载荷无版本锚，CAS 锚待通道层扩展，暂不触发）。
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import matter from 'gray-matter'
import type Database from 'better-sqlite3'
import type { EntryActionFailureCode, EntryActionResult } from '@dsh-forge/contracts'
import { withImmediateTransaction } from '../storage/concurrency.js'
import { normalizeTitleNorm } from '../storage/rebuild.js'
import {
  KNOWLEDGE_CONFIRM_EVENT,
  KNOWLEDGE_DOMAIN_UPDATE_EVENT,
  KNOWLEDGE_ENTRY_MOVE_EVENT,
  KNOWLEDGE_META_EDIT_EVENT,
  KNOWLEDGE_REJECT_EVENT,
  emitStorageDiag,
  storageDiag,
  type DiagEmitter,
} from '../storage/diag.js'
import { validateDomainPath } from './internal.js'

/** 裁决面依赖（service 工厂注入） */
export interface ReviewGatewayDeps {
  readonly db: Database.Database
  readonly emit?: DiagEmitter
}

/** entries 行（裁决面消费列——rid 供逐条回执 entryId） */
interface ReviewEntryRow {
  rid: number
  id: string
  status: string
  merged_into: string | null
  confirmed_version_id: string | null
  domain: string
}

/** 版本行 */
interface ReviewVersionRow {
  version_ts: string
  file_path: string
}

/** 单条 slug id 回执集（门面按 entryId 序合并——review.ts 内以 slug id 为工作键） */
type SlugResults = Map<string, EntryActionResult>

/** IN(...) 占位符串（n>0——调用方保证非空） */
function placeholders(n: number): string {
  return `?${',?'.repeat(n - 1)}`
}

/** 失败回执构造 */
function failure(entryId: number, code: EntryActionFailureCode, message: string): EntryActionResult {
  return { entryId, outcome: 'failure', code, message }
}

/** 权威版本选择（confirmed 指针优先，缺省最新 version_ts——supersede.ts pickAuthority 同口径） */
function pickAuthority(versions: readonly ReviewVersionRow[], confirmedVersionId: string | null): ReviewVersionRow {
  const pool = confirmedVersionId !== null ? versions.filter((v) => v.version_ts === confirmedVersionId) : []
  const candidates = pool.length > 0 ? pool : versions
  return candidates.reduce((a, b) => (a.version_ts >= b.version_ts ? a : b))
}

/** round-trip 等值判定（键序不敏感深比较——write.ts 同口径局部副本） */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/** 人工裁决面工厂（service.ts 注入 db/emit；wsPath/knowledgeDir 每调用期传入——无缓存快照） */
export function createReviewGateway(deps: ReviewGatewayDeps) {
  const { db, emit } = deps
  const selectEntry = db.prepare<[string], ReviewEntryRow>(
    `SELECT rowid AS rid, id, status, merged_into, confirmed_version_id, domain FROM knowledge_entries WHERE id = ?`,
  )
  const selectVersions = db.prepare<[string], ReviewVersionRow>(
    `SELECT version_ts, file_path FROM knowledge_entry_versions WHERE id = ? ORDER BY version_ts`,
  )
  const selectDomainRow = db.prepare<[string, string], { domain: string }>(
    `SELECT domain FROM knowledge_domains WHERE ws_path = ? AND domain = ?`,
  )
  const selectStatusByIds = (ids: readonly string[]): Map<string, string> => {
    const rows = db
      .prepare<unknown[], { id: string; status: string }>(
        `SELECT id, status FROM knowledge_entries WHERE id IN (${placeholders(ids.length)})`,
      )
      .all(...ids)
    return new Map(rows.map((r) => [r.id, r.status]))
  }

  // ── confirm 批量（集合升格 + CAS + 幂等等价） ──

  async function confirmBatch(ids: readonly string[]): Promise<SlugResults> {
    const out: SlugResults = new Map()
    const deduped = [...new Set(ids)]
    const now = new Date().toISOString()
    const eligible: { id: string; rid: number; target: ReviewVersionRow; versions: ReviewVersionRow[] }[] = []
    const succeeded: number[] = []
    for (const id of deduped) {
      const row = selectEntry.get(id)
      if (row === undefined) continue // 门面按 entryId 序兜底 not-found 回执
      if (row.merged_into !== null && row.merged_into !== '') {
        out.set(id, failure(row.rid, 'cas-failed', `条目已归并至 ${row.merged_into}——confirm 拒绝（CAS 前置）`))
        continue
      }
      if (row.status === 'confirmed') {
        // already-confirmed = 幂等成功等价（零副作用——不进文件面与 SQL 批）
        out.set(id, { entryId: row.rid, outcome: 'success' })
        succeeded.push(row.rid)
        continue
      }
      if (row.status !== 'unconfirmed') {
        out.set(id, failure(row.rid, 'cas-failed', `条目状态为 ${row.status}——仅 unconfirmed 可升格`))
        continue
      }
      const versions = selectVersions.all(id)
      if (versions.length === 0) {
        out.set(id, failure(row.rid, 'not-found', `条目无版本行：${id}`))
        continue
      }
      eligible.push({ id, rid: row.rid, target: versions[versions.length - 1]!, versions })
    }
    // 文件面先行（正本权威——write.ts confirm 同口径）：target 升 confirmed + confirmed_at；
    // 其余 confirmed 版降 superseded（保 confirmed_at 曾审标记）。文件不可读 = 该条 cas-failed 出批。
    const batched: typeof eligible = []
    for (const item of eligible) {
      let ok = true
      for (const v of item.versions) {
        let raw: string
        try {
          raw = readFileSync(v.file_path, 'utf8')
        } catch {
          out.set(item.id, failure(item.rid, 'cas-failed', `版本文件不可读：${v.file_path}`))
          ok = false
          break
        }
        const parsed = matter(raw)
        const data = { ...parsed.data } as Record<string, unknown>
        if (v.version_ts === item.target.version_ts) {
          data.status = 'confirmed'
          data.confirmed_at = now
        } else if (data.status === 'confirmed') {
          data.status = 'superseded'
        } else {
          continue
        }
        writeFileSync(v.file_path, matter.stringify(parsed.content, data), 'utf8')
      }
      if (ok) batched.push(item)
    }
    // 单 BEGIN IMMEDIATE 事务集合升格（IN(...) + status='unconfirmed' 条件式——TOCTOU 防线）
    if (batched.length > 0) {
      const batchIds = batched.map((b) => b.id)
      withImmediateTransaction(db, () => {
        db.prepare(
          `UPDATE knowledge_entries SET status = 'confirmed', effective_rank = 1.0, updated_at = ?
           WHERE id IN (${placeholders(batchIds.length)}) AND status = 'unconfirmed'
             AND (merged_into IS NULL OR merged_into = '')`,
        ).run(now, ...batchIds)
        for (const item of batched) {
          // 权威指针前移（逐行值不同，不能并入集合语句）
          db.prepare(`UPDATE knowledge_entries SET confirmed_version_id = ? WHERE id = ?`).run(
            item.target.version_ts,
            item.id,
          )
          // FTS 权威面刷新（从 target 文件重解析）
          const tf = matter(readFileSync(item.target.file_path, 'utf8')).data as Record<string, unknown>
          db.prepare(`DELETE FROM knowledge_fts WHERE id = ?`).run(item.id)
          db.prepare(`INSERT INTO knowledge_fts (id, title, keywords, summary) VALUES (?, ?, ?, ?)`).run(
            item.id,
            typeof tf.title === 'string' ? tf.title : item.id,
            Array.isArray(tf.keywords) ? (tf.keywords as string[]).join(' ') : '',
            typeof tf.summary === 'string' ? tf.summary : '',
          )
        }
      })
    }
    // 逐条回执 = 行集差分（升格命中 → success；未命中 = 并发窗口漂移 → cas-failed）
    if (batched.length > 0) {
      const statuses = selectStatusByIds(batched.map((b) => b.id))
      for (const item of batched) {
        if (statuses.get(item.id) === 'confirmed') {
          out.set(item.id, { entryId: item.rid, outcome: 'success' })
          succeeded.push(item.rid)
        } else {
          out.set(item.id, failure(item.rid, 'cas-failed', `升格未生效（勾选与执行间状态漂移——TOCTOU 条件式更新未命中）：${item.id}`))
        }
      }
    }
    if (succeeded.length > 0) {
      emitStorageDiag(
        emit,
        storageDiag('info', KNOWLEDGE_CONFIRM_EVENT, `批量确认升格：${succeeded.length} 条（actor=human，单事务集合）`),
      )
    }
    const failedIds = [...out.entries()].filter(([, r]) => r.outcome === 'failure')
    if (failedIds.length > 0) {
      emitStorageDiag(
        emit,
        storageDiag('warn', KNOWLEDGE_CONFIRM_EVENT, `批量确认失败：${failedIds.map(([id]) => id).join(', ')}（actor=human）`),
      )
    }
    return out
  }

  // ── reject 批量（文件前置预检 + 文件先删 + 单事务条件式删除） ──

  async function rejectBatch(ids: readonly string[]): Promise<SlugResults> {
    const out: SlugResults = new Map()
    const deduped = [...new Set(ids)]
    const deletable: { id: string; rid: number; files: string[] }[] = []
    for (const id of deduped) {
      const row = selectEntry.get(id)
      if (row === undefined) continue // 门面按 entryId 序兜底 not-found 回执
      if (row.status !== 'unconfirmed') {
        // 仅 unconfirmed 可驳回（confirmed 处置走既有 supersede/归档径；redirect/superseded 同拒）
        out.set(id, failure(row.rid, 'rejected-confirmed', `条目状态为 ${row.status}——仅 unconfirmed 可驳回`))
        continue
      }
      const versions = selectVersions.all(id)
      if (versions.length === 0) {
        out.set(id, failure(row.rid, 'not-found', `条目无版本行：${id}`))
        continue
      }
      // 文件前置逐例预检：任一版本文件不可删/不可读 → 该条 precheck-failed，不入 SQL 批
      const files: string[] = []
      let precheckOk = true
      for (const v of versions) {
        if (!existsSync(v.file_path)) {
          out.set(id, failure(row.rid, 'precheck-failed', `版本文件缺失：${v.file_path}`))
          precheckOk = false
          break
        }
        try {
          readFileSync(v.file_path, 'utf8')
        } catch {
          out.set(id, failure(row.rid, 'precheck-failed', `版本文件不可读：${v.file_path}`))
          precheckOk = false
          break
        }
        files.push(v.file_path)
      }
      if (precheckOk) deletable.push({ id, rid: row.rid, files })
    }
    // 文件先删（事务序：文件先删 → DB 删——崩溃窗口唯一方向 = 文件亡记录亡）
    for (const item of deletable) {
      for (const f of item.files) unlinkSync(f)
    }
    // 单事务 set-based 删版本行 + FTS + 主行（主行条件式 status='unconfirmed'——TOCTOU 防线；
    // recall_logs 热度史不触碰——事实流水不篡改）
    if (deletable.length > 0) {
      const batchIds = deletable.map((d) => d.id)
      withImmediateTransaction(db, () => {
        db.prepare(`DELETE FROM knowledge_fts WHERE id IN (${placeholders(batchIds.length)})`).run(...batchIds)
        db.prepare(`DELETE FROM knowledge_entry_versions WHERE id IN (${placeholders(batchIds.length)})`).run(...batchIds)
        db.prepare(
          `DELETE FROM knowledge_entries WHERE id IN (${placeholders(batchIds.length)}) AND status = 'unconfirmed'`,
        ).run(...batchIds)
      })
    }
    // 逐条回执 = 行集差分（主行亡 → success；行存 = TOCTOU 状态漂移 → cas-failed）
    if (deletable.length > 0) {
      const remaining = selectStatusByIds(deletable.map((d) => d.id))
      for (const item of deletable) {
        if (!remaining.has(item.id)) {
          out.set(item.id, { entryId: item.rid, outcome: 'success' })
          emitStorageDiag(
            emit,
            storageDiag('warn', KNOWLEDGE_REJECT_EVENT, `驳回删除：${item.id}（文件+版本行+FTS 三处清，热度史保留；actor=human）`),
          )
        } else {
          out.set(item.id, failure(item.rid, 'cas-failed', `驳回未生效（勾选与执行间状态漂移——TOCTOU 条件式删除未命中）：${item.id}`))
        }
      }
    }
    const failedIds = [...out.entries()].filter(([, r]) => r.outcome === 'failure')
    if (failedIds.length > 0) {
      emitStorageDiag(
        emit,
        storageDiag('warn', KNOWLEDGE_REJECT_EVENT, `批量驳回失败：${failedIds.map(([id]) => id).join(', ')}（actor=human）`),
      )
    }
    return out
  }

  // ── moveEntry（文件 rename 先行 → 事务 upsert；domain 由文件落点推导） ──

  async function moveEntry(q: {
    id: string
    targetDomain: string
    wsPath: string
    knowledgeDir: string
  }): Promise<EntryActionResult> {
    const failResult = (code: EntryActionFailureCode, message: string): EntryActionResult => {
      emitStorageDiag(emit, storageDiag('warn', KNOWLEDGE_ENTRY_MOVE_EVENT, `改域拒收：${message}`, { cwd: q.id }))
      return failure(0, code, message)
    }
    const domain = q.targetDomain.replace(/\/+$/, '')
    if (domain !== '') {
      const invalid = validateDomainPath(domain)
      if (invalid !== undefined) {
        const code: EntryActionFailureCode = invalid.includes('层级超限') ? 'domain-depth' : 'not-found'
        return failResult(code, `目标域非法（${invalid}）：${domain}`)
      }
      if (selectDomainRow.get(q.wsPath, domain) === undefined) {
        return failResult('not-found', `目标域不存在：${domain}`)
      }
    }
    const row = selectEntry.get(q.id)
    if (row === undefined) return failResult('not-found', `条目未命中：${q.id}`)
    const versions = selectVersions.all(q.id)
    if (versions.length === 0) return failResult('not-found', `条目无版本行：${q.id}`)
    const authority = pickAuthority(versions, row.confirmed_version_id)
    const targetDir = join(q.knowledgeDir, ...domain.split('/').filter((s) => s !== ''))
    // 文件 rename 先行（domain 唯一事实源 = 文件落点）
    try {
      mkdirSync(targetDir, { recursive: true })
      for (const v of versions) renameSync(v.file_path, join(targetDir, basename(v.file_path)))
    } catch (cause) {
      return failResult('precheck-failed', `文件移动失败：${String(cause)}`)
    }
    // domain 由文件落点推导（不信任入参——authority 新落点反解）
    const authorityNew = join(targetDir, basename(authority.file_path))
    const relDir = dirname(relative(q.knowledgeDir, authorityNew))
    const derivedDomain = relDir === '.' ? '' : relDir.split(/[\\/]+/).join('/')
    const movedAt = new Date().toISOString()
    withImmediateTransaction(db, () => {
      for (const v of versions) {
        db.prepare(`UPDATE knowledge_entry_versions SET file_path = ? WHERE id = ? AND version_ts = ?`).run(
          join(targetDir, basename(v.file_path)),
          q.id,
          v.version_ts,
        )
      }
      db.prepare(`UPDATE knowledge_entries SET domain = ?, updated_at = ? WHERE id = ?`).run(derivedDomain, movedAt, q.id)
    })
    emitStorageDiag(
      emit,
      storageDiag('info', KNOWLEDGE_ENTRY_MOVE_EVENT, `条目改域：${q.id} ${row.domain || '(根)'} → ${derivedDomain || '(根)'}（文件落点推导；status 不变；actor=human）`, { cwd: authorityNew }),
    )
    return { entryId: row.rid, outcome: 'success' }
  }

  // ── updateEntry（元数据重写：版本链前进 + 指针前移；status 不变；派生列从重写后文件重解析） ──

  async function updateEntry(q: {
    id: string
    title: string
    keywords: readonly string[]
    summary: string
    body: string
    knowledgeDir: string
  }): Promise<EntryActionResult> {
    const failResult = (code: EntryActionFailureCode, message: string): EntryActionResult => {
      emitStorageDiag(emit, storageDiag('warn', KNOWLEDGE_META_EDIT_EVENT, `元数据编辑拒收：${message}`, { cwd: q.id }))
      return failure(0, code, message)
    }
    const row = selectEntry.get(q.id)
    if (row === undefined) return failResult('not-found', `条目未命中：${q.id}`)
    const versions = selectVersions.all(q.id)
    if (versions.length === 0) return failResult('not-found', `条目无版本行：${q.id}`)
    const authority = pickAuthority(versions, row.confirmed_version_id)
    let raw: string
    try {
      raw = readFileSync(authority.file_path, 'utf8')
    } catch {
      return failResult('not-found', `权威文件不可读：${authority.file_path}`)
    }
    // frontmatter 重写：保留 id/status/confirmed_at/type/procedure 等既有键；title/summary/
    // keywords 换新；version_ts 前进 + supersedes 锚旧权威（版本链前进）
    const parsed = matter(raw)
    const fm = { ...parsed.data } as Record<string, unknown>
    const versionTs = new Date().toISOString()
    fm.title = q.title
    fm.summary = q.summary
    fm.keywords = [...q.keywords]
    fm.version_ts = versionTs
    fm.updated = versionTs
    fm.supersedes = authority.version_ts
    // 对象形态 stringify（bug c21a3d0c）：matter.stringify(string, fm) 对 string 入参先 matter(body)
    // 解析——正文以 --- 开头时正文被误当 frontmatter（正文丢失 + 字符序号键污染 fm）→ 误拒 yaml-invalid
    const serialized = matter.stringify({ content: q.body }, fm)
    let roundtripOk = false
    try {
      const reparsed = matter(serialized)
      roundtripOk = deepEqual(reparsed.data, fm) && reparsed.content.trim() === q.body.trim()
    } catch {
      roundtripOk = false
    }
    if (!roundtripOk) return failResult('yaml-invalid', `YAML round-trip 不等值（注入拒收）：${q.id}`)
    // 新版本文件落盘（同域目录）+ 旧权威降 superseded（保 confirmed_at 曾审标记）
    const fileTs = versionTs.replace(/[-:]/g, '').replace(/\./g, '')
    const newPath = join(dirname(authority.file_path), `${fileTs}.md`)
    writeFileSync(newPath, serialized, 'utf8')
    const oldParsed = matter(raw)
    const oldFm = { ...oldParsed.data } as Record<string, unknown>
    oldFm.status = 'superseded'
    // 同缝对象形态（旧正文可能以 --- 开头——string 形态误解析，见上注）
    writeFileSync(authority.file_path, matter.stringify({ content: oldParsed.content }, oldFm), 'utf8')
    const digest = createHash('sha256').update(serialized, 'utf8').digest('hex')
    // DB 派生列从重写后文件重新解析（不信任入参副本）
    const nf = matter(readFileSync(newPath, 'utf8')).data as Record<string, unknown>
    const newTitle = typeof nf.title === 'string' ? nf.title : q.id
    const newKeywords = Array.isArray(nf.keywords) ? (nf.keywords as string[]).join(' ') : ''
    const newSummary = typeof nf.summary === 'string' ? nf.summary : ''
    const editedAt = new Date().toISOString()
    withImmediateTransaction(db, () => {
      db.prepare(
        `INSERT INTO knowledge_entry_versions (id, version_ts, file_path, content_hash, recorded_at) VALUES (?, ?, ?, ?, ?)`,
      ).run(q.id, versionTs, newPath, digest, versionTs)
      // status 不变（人工裁决 = 终审当场完成）；confirmed_version_id 指针前移
      db.prepare(
        `UPDATE knowledge_entries SET title = ?, title_norm = ?, confirmed_version_id = ?, updated_at = ? WHERE id = ?`,
      ).run(newTitle, normalizeTitleNorm(newTitle), versionTs, editedAt, q.id)
      db.prepare(`DELETE FROM knowledge_fts WHERE id = ?`).run(q.id)
      db.prepare(`INSERT INTO knowledge_fts (id, title, keywords, summary) VALUES (?, ?, ?, ?)`).run(
        q.id,
        newTitle,
        newKeywords,
        newSummary,
      )
    })
    emitStorageDiag(
      emit,
      storageDiag('info', KNOWLEDGE_META_EDIT_EVENT, `元数据编辑：${q.id}@${versionTs}（版本链前进 supersedes ${authority.version_ts}，status 保持 ${row.status}；actor=human）`, { cwd: newPath }),
    )
    return { entryId: row.rid, outcome: 'success' }
  }

  // ── createDomain（mkdir + 域行 upsert；description NULL；≤3 层校验与 write 严契约同函数） ──

  async function createDomain(q: { domain: string; wsPath: string; knowledgeDir: string }): Promise<{
    outcome: 'success'
  } | { outcome: 'failure'; code: EntryActionFailureCode; message: string }> {
    const invalid = validateDomainPath(q.domain)
    if (invalid !== undefined) {
      const message = `域路径拒收（${invalid}）：${q.domain}`
      emitStorageDiag(emit, storageDiag('warn', KNOWLEDGE_DOMAIN_UPDATE_EVENT, `新建域拒收：${message}`))
      return { outcome: 'failure', code: 'domain-depth', message }
    }
    const domain = q.domain.replace(/\/+$/, '')
    try {
      mkdirSync(join(q.knowledgeDir, ...domain.split('/')), { recursive: true })
    } catch (cause) {
      const message = `目录创建失败：${q.domain}（${String(cause)}）`
      emitStorageDiag(emit, storageDiag('warn', KNOWLEDGE_DOMAIN_UPDATE_EVENT, `新建域失败：${message}`))
      return { outcome: 'failure', code: 'domain-depth', message }
    }
    const updatedAt = new Date().toISOString()
    withImmediateTransaction(db, () => {
      // upsert：已存在域幂等（保留既有 description，仅刷新 updated_at）；新建 description NULL
      db.prepare(
        `INSERT INTO knowledge_domains (ws_path, domain, description, updated_at) VALUES (?, ?, NULL, ?)
         ON CONFLICT(ws_path, domain) DO UPDATE SET updated_at = excluded.updated_at`,
      ).run(q.wsPath, domain, updatedAt)
    })
    emitStorageDiag(emit, storageDiag('info', KNOWLEDGE_DOMAIN_UPDATE_EVENT, `新建域落位：${q.wsPath} / ${domain}（description NULL）`, { cwd: q.wsPath }))
    return { outcome: 'success' }
  }

  return { confirmBatch, rejectBatch, moveEntry, updateEntry, createDomain }
}
