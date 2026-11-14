// stage② 写入门（提案 §2.3/§2.4）：write（严契约 + 三问闸 + 查重归并建议 + slug id
// 生成链 + 版本化复用）/ read（准入三分支）/ confirm（CAS + 事务内旧版降级 + 指针前移）。
// 正本权威 = 文件 frontmatter（§2.2）：write 产物 = `<id>-<version_ts>.md` + frontmatter
// 回写元数据；DB（entries 投影 + 版本行 + FTS）同事务维护派生列。严契约三拒收
// （路径非法 / YAML round-trip 失真 / 缺字段）逐例 knowledge-write-reject 埋点零残留
//（INV-B）。查重三通道：title_norm 精确 + FTS5 归一分 ≥0.8 近似 + keywords Jaccard 缩围
// ——只给归并建议不拒收；「同 id 版本化」与 candidate_of 挂起互斥（§2.3）。
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import matter from 'gray-matter'
import type Database from 'better-sqlite3'
import { withImmediateTransaction } from '../storage/concurrency.js'
import { parseKnowledgeFile } from '../storage/index.js'
import { deriveEffectiveRank, normalizeTitleNorm } from '../storage/rebuild.js'
import {
  KNOWLEDGE_CONFIRM_EVENT,
  KNOWLEDGE_WRITE_EVENT,
  KNOWLEDGE_WRITE_REJECT_EVENT,
  emitStorageDiag,
  storageDiag,
  type DiagEmitter,
} from '../storage/diag.js'
import { validateDomainPath } from './internal.js'
import type {
  KnowledgeConfirmOutcome,
  KnowledgeConfirmQuery,
  KnowledgeReadOutcome,
  KnowledgeReadQuery,
  KnowledgeType,
  KnowledgeWriteOutcome,
  KnowledgeWriteQuery,
  MergeSuggestion,
} from './types.js'
import { KNOWLEDGE_TYPES } from './types.js'

/** 写入门依赖（service 工厂注入） */
export interface WriteGatewayDeps {
  readonly db: Database.Database
  readonly emit?: DiagEmitter
}

// ── slug id 生成链（§2.2 身份层） ──

/** slug 规范化：小写 + 空白折叠为连字符 + 非法字符（非英文数字连字符）转连字符 + 折叠 */
export function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug
}

/** id 合法字符集（英文+数字+连字符——§2.2） */
export function isValidSlugId(id: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)
}

/** title 是否含 ASCII 字母/数字（纯中文 title 走 slug_hint/keywords/hash 回退链） */
function hasAsciiWord(s: string): boolean {
  return /[a-z0-9]/i.test(slugify(s))
}

/** 短 hash 兜底（title+summary sha256 前 8 位） */
function hashFallback(seed: string): string {
  return createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 8)
}

/**
 * slug id 生成链（§2.2：title ASCII 规范化 → slug_hint → keywords → 短 hash 兜底）。
 * 每级产物过字符集校验，非法/空产物落下一级。
 */
export function generateSlugBase(q: { title: string; slugHint?: string; keywords: readonly string[] }): string {
  if (hasAsciiWord(q.title)) return slugify(q.title)
  if (q.slugHint !== undefined && slugify(q.slugHint) !== '') return slugify(q.slugHint)
  const fromKeywords = slugify(q.keywords.join('-'))
  if (fromKeywords !== '') return fromKeywords
  return hashFallback(`${q.title}\u0000${q.keywords.join(',')}`)
}

// ── 五类 type 机器预判（五句判定式——§2.1/§2.3；1.6 v3：结构化加权） ──
//
// v1 词面命中取最高在存量 121 篇对人工定标一致率仅 32.5%（1.6 抽检驱动修订）；
// v3 改结构化加权：五类各一路主证据（规范性密度/失败叙事链/复盘归纳/决策论证/
// 机制陈述），词频 ×2 + 小节头结构性证据 ×2，并列按 §2.1 重要性序断序。
// 判定式是入闸预判非语义终审：低置信/与 agent 申报不符 → procedure 默认 + 待定
// 标记（升格审核面消费），存量收编最终归类以人工定标为准（台账留痕）。

/** 全局匹配计数（g 标志归一） */
function countMatches(pattern: RegExp, text: string): number {
  return (text.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)) ?? []).length
}

/** 判定式词面（每类一句——§2.1 五句主证据） */
const TYPE_SIGNALS: ReadonlyArray<readonly [KnowledgeType, readonly RegExp[]]> = [
  ['conventions', [/必须|禁止|不允许|不得|一律|禁用|铁律|红线|先于|违反即错|唯一正道|正门|规范|守则|硬约束|纪律|白名单|判据/]],
  ['pitfalls', [/坑|误诊|误判|复发|根因|症状|排查|崩溃|强杀|污染|漂移|失效|阻断|漏网|翻车|中招|踩|bug|缺陷|故障|意外|误伤|弯路|反例|盲区/]],
  ['lessons', [/复盘|归纳|事后|总结|经验|教训|方法论|范式|沉淀|对照|闭环验证|最小形态|可复用|判例对照/]],
  ['decisions', [/为什么|为何|取舍|裁决|选型|定案|终局|推翻|改用|决策|设计考量|方案[AB12二一]/]],
  ['facts', [/当前为|事实上|现状|机制为|结构为|字段|生命周期|落位|位于|存储在|承载|进程名|目录为|路径为|版本|表结构|数据模型|架构/]],
]

/** 判定式次级词面（机制行为陈述 / 设计论证措辞——facts/decisions 词面稀疏的补强） */
const FACT_EXTRA = /生效条件|语义为|定义为|表现为|时序|行为|机制上|实质上|事实上是|落盘|触发的|才会|仅在|上限|配额|限制为|落定|定格|时点|触发一轮|环境为|当前环境/
const DECISION_EXTRA = /全序|排序|镜像|增量化|key 前缀|设计为|此设计|该方案|这样设计|权衡|定位为|界定为|口径为/

/** 结构性小节头证据（失败叙事链「现象→避免方式/处置」与复盘/规范小节） */
const PITFALL_SECTION = /^#{2,3}\s*(现象|避免方式|处置|排查|根因|症状)/m
const AVOIDANCE_SECTION = /^#{2,3}\s*(避免方式|处置)\s*$/m
const CASE_SECTION = /^#{2,3}\s*(现象|判例)/m
const LESSON_SECTION = /^#{2,3}\s*(复盘|总结|归纳|经验|教训|方法论|判例)/m
const NORM_SECTION = /^#{2,3}\s*(规范|约束|要求|规则|约定|做法|纪律)/m
const FACT_SECTION = /^#{2,3}\s*(事实|现状|环境|机制|结构|架构|行为|语义)/m
const DECISION_SECTION = /^#{2,3}\s*(决策|选型|取舍|方案|设计)/m

/** 并列断序（§2.1 重要性参考序：conventions > pitfalls > decisions > lessons > facts） */
const TYPE_PRIORITY: readonly KnowledgeType[] = ['conventions', 'pitfalls', 'decisions', 'lessons', 'facts']

/** type 预判产物：判定值 + 置信（零分/并列 = 低置信） */
export interface TypeJudgement {
  readonly type: KnowledgeType | undefined
  readonly confident: boolean
}

/** 五句判定式执行面（title + summary + body 结构化加权——确定性纯函数） */
export function predictType(text: string): TypeJudgement {
  const scores = new Map<KnowledgeType, number>()
  for (const [type, patterns] of TYPE_SIGNALS) {
    scores.set(type, countMatches(patterns[0]!, text) * 2)
  }
  scores.set('facts', scores.get('facts')! + countMatches(FACT_EXTRA, text) * 2)
  // decisions 词面语义密度高（词少而专）——1.5× + 次级词面补强
  scores.set('decisions', Math.round(scores.get('decisions')! * 1.5) + countMatches(DECISION_EXTRA, text) * 2)
  if (NORM_SECTION.test(text)) scores.set('conventions', scores.get('conventions')! + 6)
  if (PITFALL_SECTION.test(text)) scores.set('pitfalls', scores.get('pitfalls')! + 8)
  if (AVOIDANCE_SECTION.test(text) && CASE_SECTION.test(text)) scores.set('pitfalls', scores.get('pitfalls')! + 6)
  if (LESSON_SECTION.test(text)) scores.set('lessons', scores.get('lessons')! + 6)
  if (FACT_SECTION.test(text)) scores.set('facts', scores.get('facts')! + 6)
  if (DECISION_SECTION.test(text)) scores.set('decisions', scores.get('decisions')! + 4)
  const max = Math.max(...scores.values())
  if (max === 0) return { type: undefined, confident: false }
  const top = TYPE_PRIORITY.filter((t) => scores.get(t) === max)
  return { type: top[0], confident: top.length === 1 }
}

// ── 查重三通道（§2.3：给归并建议不拒收） ──

/** FTS5 MATCH 查询构造（title 词面 OR——引号防注入） */
function ftsMatchOf(title: string): string | undefined {
  const terms = [...new Set(title.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/).filter((t) => t.length >= 2))]
  if (terms.length === 0) return undefined
  return terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ')
}

/** FTS 归一分（bm25 越负越相关 → 1/(1+max(0,bm25)) 归一到 (0,1]） */
export function ftsRankOf(bm25Score: number): number {
  return 1 / (1 + Math.max(0, bm25Score))
}

/** Jaccard 相似度（keywords 集合——小写规范化受控词表口径） */
export function jaccardOf(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a.map((k) => k.trim().toLowerCase()).filter((k) => k !== ''))
  const sb = new Set(b.map((k) => k.trim().toLowerCase()).filter((k) => k !== ''))
  if (sa.size === 0 || sb.size === 0) return 0
  let inter = 0
  for (const k of sa) if (sb.has(k)) inter += 1
  return inter / (sa.size + sb.size - inter)
}

const FTS_APPROX_THRESHOLD = 0.8 // FTS5 近似 rank 阈值（§2.3 定值）
const JACCARD_THRESHOLD = 0.6 // Jaccard 缩围阈（缩围通道——候选确认）

/** 查重归并建议（三通道并集；排除 versionOf 自身——版本化不走 candidate_of） */
export function findMergeSuggestions(
  db: Database.Database,
  q: { title: string; keywords: readonly string[]; excludeId?: string },
): MergeSuggestion[] {
  const out = new Map<string, MergeSuggestion>()
  const add = (s: MergeSuggestion): void => {
    if (q.excludeId !== undefined && s.id === q.excludeId) return
    const prev = out.get(s.id)
    if (prev === undefined) out.set(s.id, s)
  }
  // ① title_norm 精确
  const exact = db
    .prepare<[string], { id: string; title: string }>(
      `SELECT id, title FROM knowledge_entries WHERE title_norm = ?`,
    )
    .all(normalizeTitleNorm(q.title))
  for (const row of exact) add({ id: row.id, title: row.title, basis: 'title-norm' })
  // ② FTS5 近似（归一分 ≥0.8）
  const match = ftsMatchOf(q.title)
  if (match !== undefined) {
    try {
      const approx = db
        .prepare<[string], { id: string; title: string; keywords: string; rank: number }>(
          `SELECT id, title, keywords, bm25(knowledge_fts) AS rank FROM knowledge_fts WHERE knowledge_fts MATCH ?`,
        )
        .all(match)
      for (const row of approx) {
        if (ftsRankOf(row.rank) < FTS_APPROX_THRESHOLD) continue
        add({ id: row.id, title: row.title, basis: 'fts-approx', similarity: Number(ftsRankOf(row.rank).toFixed(4)) })
      }
    } catch {
      // MATCH 语法异常（空词面等）= 近似通道零候选，不硬拒
    }
  }
  // ③ keywords Jaccard 缩围（在 ①② 候选域上确认——全集小表直算）
  const allFts = db.prepare<unknown[], { id: string; title: string; keywords: string }>(
    `SELECT id, title, keywords FROM knowledge_fts`,
  )
  for (const row of allFts.all()) {
    const sim = jaccardOf(q.keywords, row.keywords.split(/\s+/))
    if (sim < JACCARD_THRESHOLD) continue
    add({ id: row.id, title: row.title, basis: 'jaccard', similarity: Number(sim.toFixed(4)) })
  }
  return [...out.values()]
}

// ── 写入门实现 ──

/** 严契约字段缺失检测（缺 title/正文/type/三问结论任一项——CT-WG-05 逐例） */
function missingFieldOf(q: KnowledgeWriteQuery): string | undefined {
  if (typeof q.title !== 'string' || q.title.trim() === '') return 'title'
  if (typeof q.summary !== 'string' || q.summary.trim() === '') return 'summary'
  if (!Array.isArray(q.keywords) || q.keywords.length === 0) return 'keywords'
  if (typeof q.body !== 'string' || q.body.trim() === '') return 'body'
  if (q.necessity === undefined || q.necessity === null) return 'necessity'
  if (typeof q.necessity.stable !== 'boolean') return 'necessity.stable'
  if (typeof q.necessity.nonTrivial !== 'boolean') return 'necessity.non_trivial'
  if (typeof q.necessity.value !== 'boolean') return 'necessity.value'
  return undefined
}

/** 域路径校验（缺省根域合法；非空域走 stage③ 共享校验 validateDomainPath——与
 *  setDomainDescription 同一校验函数，≤3 层/≤500/字符集同口径） */
function validDomain(domain: string | undefined): boolean {
  if (domain === undefined || domain === '') return true
  return validateDomainPath(domain) === undefined
}

/** version_ts → 文件名时间戳段（Windows 保留字符剥除，毫秒粒度保留） */
function fileTsOf(versionTs: string): string {
  return versionTs.replace(/[-:]/g, '').replace(/\./g, '')
}

/** 深比较（round-trip 等值判定——键序不敏感） */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

interface EntryProjectionRow {
  id: string
  status: string
  effective_rank: number
  confirmed_version_id: string | null
  merged_into: string | null
  domain: string
}

/** 写入门工厂（service.ts 注入 db/emit；knowledgeDir 每调用期传入——文件面无缓存快照） */
export function createWriteGateway(deps: WriteGatewayDeps) {
  const { db, emit } = deps
  const selectEntry = db.prepare<[string], EntryProjectionRow>(
    `SELECT id, status, effective_rank, confirmed_version_id, merged_into, domain FROM knowledge_entries WHERE id = ?`,
  )
  const selectVersions = db.prepare<[string], { version_ts: string; file_path: string }>(
    `SELECT version_ts, file_path FROM knowledge_entry_versions WHERE id = ? ORDER BY version_ts`,
  )
  const selectIdExists = db.prepare<[string], { c: number }>(`SELECT COUNT(*) AS c FROM knowledge_entries WHERE id = ?`)
  // 域简介 upsert 面（knowledge-domain-desc-write-param：write 扩参 domain_description
  // ——SQL 与 service.ts setDomainDescription 同源同形；状态判定先读旧行再落）
  const selectDomainDesc = db.prepare<[string, string], { description: string | null }>(
    `SELECT description FROM knowledge_domains WHERE ws_path = ? AND domain = ?`,
  )
  const upsertDomainDescription = db.prepare<[string, string, string, string]>(
    `INSERT INTO knowledge_domains (ws_path, domain, description, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(ws_path, domain) DO UPDATE SET description = excluded.description, updated_at = excluded.updated_at`,
  )

  function reject(reason: 'illegal-path' | 'roundtrip' | 'missing-field' | 'illegal-description', detail: string, field?: string): KnowledgeWriteOutcome {
    emitStorageDiag(emit, storageDiag('info', KNOWLEDGE_WRITE_REJECT_EVENT, `写入拒收（${reason}）：${detail}`, { }))
    return { outcome: 'rejected', reason, ...(field !== undefined ? { field } : {}), detail }
  }

  /** id 占用检查消歧（§2.2：撞名追加 `-2` 递增，耗尽短 hash 兜底） */
  function disambiguateId(base: string): string {
    if (selectIdExists.get(base)!.c === 0) return base
    for (let n = 2; n < 100; n += 1) {
      const candidate = `${base}-${n}`
      if (selectIdExists.get(candidate)!.c === 0) return candidate
    }
    return `${base}-${hashFallback(base)}`
  }

  async function write(q: KnowledgeWriteQuery, knowledgeDir: string, wsPath: string): Promise<KnowledgeWriteOutcome> {
    // ① 严契约：缺字段逐例拒收（零残留——CT-WG-05）
    const missing = missingFieldOf(q)
    if (missing !== undefined) return reject('missing-field', `必填缺失或类型不符：${missing}`, missing)
    // ② 严契约：路径非法（CT-WG-03）
    if (!validDomain(q.domain)) return reject('illegal-path', `域路径非法：${String(q.domain)}`)
    // ②' 域简介校验（与 setDomainDescription 同源口径——validateDomainPath 管路径层级/长度，
    //    简介本体只查非空一句；契约边界：三问门只约束条目，domain_description 走描述校验）
    const descInput = q.domainDescription
    const hasDesc = descInput !== undefined
    if (hasDesc) {
      if (q.domain === undefined || q.domain === '') {
        return reject('illegal-description', 'domain_description 须与非根域 domain 同现（根域无简介行）', 'domain_description')
      }
      if (descInput.trim() === '') return reject('illegal-description', 'domain_description 简介缺失（非空一句）', 'domain_description')
    }
    // ③ 必要性三问（agent 自判闸——不过不写，§2.3）
    const n = q.necessity
    if (!n.stable || !n.nonTrivial || !n.value) {
      return {
        outcome: 'not-written',
        reason: 'necessity-failed',
        detail: `必要性三问未通过（长期稳定=${String(n.stable)} 非常识=${String(n.nonTrivial)} 本域价值=${String(n.value)}）${n.reason !== undefined ? `：${n.reason}` : ''}`,
      }
    }
    // ④ type 判定（五句判定式；低置信 → procedure 默认 + 待定）
    const judged = predictType(`${q.title}\n${q.summary}\n${q.body}`)
    const declared = q.type !== undefined && (KNOWLEDGE_TYPES as readonly string[]).includes(q.type)
      ? (q.type as KnowledgeType)
      : undefined
    if (q.type !== undefined && !declared) return reject('missing-field', `type 非五类枚举（${q.type}）`, 'type')
    const typePending = judged.type === undefined || !judged.confident || (declared !== undefined && judged.type !== declared)
    const typeFinal = declared ?? judged.type
    const procedureDefault = typePending // 低置信 → procedure 默认（§2.3）
    // ⑤ 版本化前置：versionOf 必须命中既有条目（悬空 = 缺字段拒收面）
    let supersedes: string | undefined
    let reuseId: string | undefined
    if (q.versionOf !== undefined) {
      if (!isValidSlugId(q.versionOf)) return reject('missing-field', `version_of 非法 id：${q.versionOf}`, 'version_of')
      const row = selectEntry.get(q.versionOf)
      if (row === undefined) return reject('missing-field', `version_of 未命中既有条目：${q.versionOf}`, 'version_of')
      const versions = selectVersions.all(q.versionOf)
      if (versions.length === 0) return reject('missing-field', `条目无版本行：${q.versionOf}`, 'version_of')
      reuseId = q.versionOf
      supersedes = versions[versions.length - 1]!.version_ts // 锚旧版本 version_ts（非文件名——§2.2）
    }
    // ⑥ 查重归并建议（不拒收；版本化路径排除自身且不挂 candidate_of——互斥）
    const suggestions = findMergeSuggestions(db, {
      title: q.title,
      keywords: q.keywords,
      ...(reuseId !== undefined ? { excludeId: reuseId } : {}),
    })
    const candidateOf = reuseId === undefined && suggestions.length > 0 ? suggestions[0]!.id : undefined
    // ⑦ slug id 生成链 + 创建时占用检查消歧
    const id = reuseId ?? disambiguateId(generateSlugBase({ title: q.title, slugHint: q.slugHint, keywords: q.keywords }))
    if (!isValidSlugId(id)) return reject('illegal-path', `id 生成链产物非法：${id}`)
    // ⑧ frontmatter 回写元数据 + YAML round-trip 自证（CT-WG-04）
    const versionTs = new Date().toISOString()
    const fm: Record<string, unknown> = {
      title: q.title,
      summary: q.summary,
      keywords: [...q.keywords],
      id,
      status: 'unconfirmed',
      version_ts: versionTs,
      updated: versionTs,
    }
    if (typeFinal !== undefined) fm.type = typeFinal
    if (q.procedure === true || procedureDefault) fm.procedure = true
    if (supersedes !== undefined) fm.supersedes = supersedes
    if (candidateOf !== undefined) fm.candidate_of = candidateOf
    if (q.slugHint !== undefined) fm.slug_hint = q.slugHint
    const serialized = matter.stringify(q.body, fm)
    let roundtripOk = false
    try {
      const reparsed = matter(serialized)
      roundtripOk = deepEqual(reparsed.data, fm) && reparsed.content.trim() === q.body.trim()
    } catch {
      roundtripOk = false
    }
    if (!roundtripOk) return reject('roundtrip', `YAML round-trip 不等值：${id}`)
    // ⑨ 落盘（`<id>-<version_ts>.md`；存在性检查防同秒撞名——§2.2）
    const domainDir = q.domain !== undefined && q.domain !== '' ? q.domain : ''
    const targetDir = join(knowledgeDir, ...domainDir.split('/').filter((s) => s !== ''))
    let fileTs = fileTsOf(versionTs)
    let finalVersionTs = versionTs
    let filePath = join(targetDir, `${id}-${fileTs}.md`)
    for (let attempt = 0; existsSync(filePath) && attempt < 20; attempt += 1) {
      await sleep(2) // 毫秒粒度推进（双会话同秒并发不撞名——CT-WG-09）
      finalVersionTs = new Date().toISOString()
      fileTs = fileTsOf(finalVersionTs)
      filePath = join(targetDir, `${id}-${fileTs}.md`)
    }
    mkdirSync(targetDir, { recursive: true })
    writeFileSync(filePath, serialized, 'utf8')
    // ⑩ DB 投影（同事务：版本行 + entries 投影 + FTS 权威面）
    const digest = createHash('sha256').update(serialized, 'utf8').digest('hex')
    // 写入产物按 frontmatter 契约自证（解析失败 = 落盘内容不合格——fail-loud 撤面）
    const selfCheck = parseKnowledgeFile({
      relPath: domainDir === '' ? `${id}-${fileTs}.md` : `${domainDir}/${id}-${fileTs}.md`,
      domainPath: domainDir,
      domainDepth: domainDir === '' ? 0 : domainDir.split('/').length,
      content: serialized,
      mtime: new Date(),
    })
    if (!selfCheck.ok) {
      throw new Error(`knowledge write: 落盘产物 frontmatter 契约自证失败（${selfCheck.reason}）：${filePath}`)
    }
    const conflict = supersedes !== undefined && supersedes !== '' && selectVersions.all(id).every((v) => v.version_ts !== supersedes)
    // 权威投影规则（rebuild pickAuthority 同口径）：confirmed 在场 → 旧权威不动（CT-WG-13：
    // unconfirmed 新稿不污染 entries 投影）；否则新版本即权威（unconfirmed 0.6）。
    const existing = selectEntry.get(id)
    const keepOldAuthority = existing !== undefined && existing.confirmed_version_id !== null
    // 域简介三态（写事务纪律内 upsert——knowledge-domain-desc-write-param Q2）
    let domainDesc: 'created' | 'unchanged' | 'updated' | undefined
    withImmediateTransaction(db, () => {
      db.prepare(
        `INSERT INTO knowledge_entry_versions (id, version_ts, file_path, content_hash, recorded_at) VALUES (?, ?, ?, ?, ?)`,
      ).run(id, finalVersionTs, filePath, digest, finalVersionTs)
      const rank = deriveEffectiveRank(
        keepOldAuthority ? 'confirmed' : 'unconfirmed',
        undefined,
        conflict,
      )
      if (existing === undefined) {
        db.prepare(
          `INSERT INTO knowledge_entries (id, title, title_norm, type, procedure_tag, status, effective_rank, confirmed_version_id, merged_into, domain, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        ).run(
          id,
          q.title,
          normalizeTitleNorm(q.title),
          typeFinal ?? null,
          (q.procedure === true || procedureDefault) ? 1 : 0,
          'unconfirmed',
          rank,
          domainDir,
          finalVersionTs,
        )
        db.prepare(`INSERT INTO knowledge_fts (id, title, keywords, summary) VALUES (?, ?, ?, ?)`).run(
          id,
          q.title,
          q.keywords.join(' '),
          q.summary,
        )
      } else if (!keepOldAuthority) {
        db.prepare(
          `UPDATE knowledge_entries SET title = ?, title_norm = ?, type = ?, procedure_tag = ?, status = 'unconfirmed',
             effective_rank = ?, merged_into = NULL, domain = ?, updated_at = ? WHERE id = ?`,
        ).run(
          q.title,
          normalizeTitleNorm(q.title),
          typeFinal ?? null,
          (q.procedure === true || procedureDefault) ? 1 : 0,
          rank,
          domainDir,
          finalVersionTs,
          id,
        )
        db.prepare(`DELETE FROM knowledge_fts WHERE id = ?`).run(id)
        db.prepare(`INSERT INTO knowledge_fts (id, title, keywords, summary) VALUES (?, ?, ?, ?)`).run(
          id,
          q.title,
          q.keywords.join(' '),
          q.summary,
        )
      } else {
        db.prepare(`UPDATE knowledge_entries SET updated_at = ? WHERE id = ?`).run(finalVersionTs, id)
      }
      if (hasDesc) {
        const prev = selectDomainDesc.get(wsPath, domainDir)?.description ?? null
        domainDesc = prev === null || prev.trim() === '' ? 'created' : prev.trim() === descInput.trim() ? 'unchanged' : 'updated'
        upsertDomainDescription.run(wsPath, domainDir, descInput, new Date().toISOString())
      }
    })
    // 子域简介缺失提醒（域细分 2026-11-05）：仅当本次未携带 domain_description 且非根域
    // 写入、knowledge_domains 无该域简介行 → 回执携带 domainUnbound（renderWrite HINT
    // 提示下次可携参补齐——检索按语义路由；扩参后提醒闭环闭合）
    let domainUnbound: string | undefined
    if (domainDir !== '' && !hasDesc) {
      const bound = db
        .prepare<[string, string], { c: number }>(
          `SELECT COUNT(*) AS c FROM knowledge_domains kd
             JOIN knowledge_registry r ON kd.ws_path = r.ws_path
            WHERE r.knowledge_dir = ? AND kd.domain = ?`,
        )
        .get(knowledgeDir, domainDir)
      if ((bound?.c ?? 0) === 0) domainUnbound = domainDir
    }
    emitStorageDiag(
      emit,
      storageDiag('info', KNOWLEDGE_WRITE_EVENT, `条目写入：${id}@${finalVersionTs}${supersedes !== undefined ? `（supersedes ${supersedes}）` : ''}${candidateOf !== undefined ? `（candidate_of ${candidateOf}）` : ''}${domainDesc !== undefined ? `（domain_desc ${domainDesc}）` : ''}`, { cwd: filePath }),
    )
    return {
      outcome: 'written',
      id,
      versionTs: finalVersionTs,
      filePath,
      // typeJudged 键缺席式（lossless JSON——bug 62211111 同族：显式 undefined 属性值
      // 会被 harness 输出边界整值拒绝「value is not lossless JSON」）
      ...(typeFinal !== undefined ? { typeJudged: typeFinal } : {}),
      typePending,
      mergeSuggestions: suggestions,
      ...(candidateOf !== undefined ? { candidateOf } : {}),
      ...(supersedes !== undefined ? { supersedes } : {}),
      ...(domainDesc !== undefined ? { domainDesc } : {}),
      ...(domainUnbound !== undefined ? { domainUnbound } : {}),
    }
  }

  /** knowledge_read（准入三分支——CT-WG-14） */
  function read(q: KnowledgeReadQuery, knowledgeDir: string): KnowledgeReadOutcome {
    const row = selectEntry.get(q.id)
    if (row === undefined) return denied()
    const versions = selectVersions.all(q.id)
    const authority = versions.length > 0 ? versions[versions.length - 1]! : undefined
    // 项目域归属：版本文件须在本项目知识目录下（跨项目 id 不可读）
    if (authority === undefined || !authority.file_path.startsWith(`${knowledgeDir}\\`) && !authority.file_path.startsWith(`${knowledgeDir}/`)) {
      return denied()
    }
    let status = row.status
    let confirmedAt: string | undefined
    let title: string | undefined
    try {
      const raw = readFileSync(authority.file_path, 'utf8')
      const fm = matter(raw).data as Record<string, unknown>
      // frontmatter 正本权威：状态/曾审标记以文件为准
      if (typeof fm.status === 'string') status = fm.status
      confirmedAt = typeof fm.confirmed_at === 'string' ? fm.confirmed_at : undefined
      title = typeof fm.title === 'string' ? fm.title : undefined
      // 准入：confirmed 全开 / superseded 曾审可读（confirmed_at 在场 = 曾 confirmed）
      // / unconfirmed 拒正文且不露存在性 / merged redirect 承载可回看正文（§2.6）
      if (status === 'confirmed' || status === 'superseded') {
        if (status === 'superseded' && confirmedAt === undefined) return denied()
        return { outcome: 'read', id: q.id, title: title ?? q.id, status, versionTs: authority.version_ts, body: raw }
      }
      if (row.merged_into !== null && row.merged_into !== '') {
        return { outcome: 'read', id: q.id, title: title ?? q.id, status: 'superseded', versionTs: authority.version_ts, body: raw }
      }
      return denied()
    } catch {
      return denied() // 文件亡/不可读：不暴露存在性（无孤儿态由 rebuild 对账清理）
    }
  }

  function denied(): KnowledgeReadOutcome {
    return { outcome: 'denied', message: 'knowledge_read denied: full-text access requires a confirmed entry (unconfirmed drafts are not readable)' }
  }

  /** confirm 升格（CAS 前置 + 事务内旧版降 superseded + 权威指针前移——CT-WG-15） */
  async function confirm(q: KnowledgeConfirmQuery): Promise<KnowledgeConfirmOutcome> {
    const row = selectEntry.get(q.id)
    if (row === undefined) {
      return { outcome: 'cas-failed', id: q.id, reason: 'merged', detail: `条目未命中：${q.id}` }
    }
    // CAS 前置：已被归并（merged_into 非空）→ 后到者失败回执（§2.4）
    if (row.merged_into !== null && row.merged_into !== '') {
      return { outcome: 'cas-failed', id: q.id, reason: 'merged', detail: `条目已归并至 ${row.merged_into}——confirm 拒绝（CAS 前置）` }
    }
    const versions = selectVersions.all(q.id)
    if (versions.length === 0) {
      return { outcome: 'cas-failed', id: q.id, reason: 'merged', detail: `条目无版本行：${q.id}` }
    }
    const target = q.versionTs !== undefined ? versions.find((v) => v.version_ts === q.versionTs) : versions[versions.length - 1]!
    if (target === undefined) {
      return { outcome: 'cas-failed', id: q.id, reason: 'merged', detail: `目标版本未命中：${q.id}@${String(q.versionTs)}` }
    }
    const confirmedAt = new Date().toISOString()
    const demoted: string[] = []
    // 文件面先行（正本权威）：目标版升 confirmed + confirmed_at；其余 confirmed 版降 superseded
    //（保留 confirmed_at——「曾审」标记，superseded 可读性判定依据）
    for (const v of versions) {
      let raw: string
      try {
        raw = readFileSync(v.file_path, 'utf8')
      } catch (cause) {
        return { outcome: 'cas-failed', id: q.id, reason: 'merged', detail: `版本文件不可读：${v.file_path}（${String(cause)}）` }
      }
      const parsed = matter(raw)
      const data = { ...parsed.data } as Record<string, unknown>
      if (v.version_ts === target.version_ts) {
        data.status = 'confirmed'
        data.confirmed_at = confirmedAt
      } else if (data.status === 'confirmed') {
        data.status = 'superseded'
        demoted.push(v.version_ts)
      } else {
        continue
      }
      writeFileSync(v.file_path, matter.stringify(parsed.content, data), 'utf8')
    }
    // DB 面（同事务）：权威指针前移 + rank 派生 + FTS 权威面刷新
    const targetRaw = readFileSync(target.file_path, 'utf8')
    const targetParsed = matter(targetRaw)
    const tf = targetParsed.data as Record<string, unknown>
    const domain = row.domain
    withImmediateTransaction(db, () => {
      db.prepare(
        `UPDATE knowledge_entries SET status = 'confirmed', effective_rank = 1.0, confirmed_version_id = ?,
           title = ?, title_norm = ?, updated_at = ? WHERE id = ?`,
      ).run(
        target.version_ts,
        typeof tf.title === 'string' ? tf.title : q.id,
        normalizeTitleNorm(typeof tf.title === 'string' ? tf.title : q.id),
        confirmedAt,
        q.id,
      )
      db.prepare(`DELETE FROM knowledge_fts WHERE id = ?`).run(q.id)
      db.prepare(`INSERT INTO knowledge_fts (id, title, keywords, summary) VALUES (?, ?, ?, ?)`).run(
        q.id,
        typeof tf.title === 'string' ? tf.title : q.id,
        Array.isArray(tf.keywords) ? (tf.keywords as string[]).join(' ') : '',
        typeof tf.summary === 'string' ? tf.summary : '',
      )
      void domain
    })
    emitStorageDiag(
      emit,
      storageDiag('info', KNOWLEDGE_CONFIRM_EVENT, `confirm 升格：${q.id}@${target.version_ts}${demoted.length > 0 ? `（旧版降 superseded：${demoted.join(', ')}）` : ''}`, { cwd: target.file_path }),
    )
    return { outcome: 'confirmed', id: q.id, versionTs: target.version_ts, demoted }
  }

  return { write, read, confirm }
}
