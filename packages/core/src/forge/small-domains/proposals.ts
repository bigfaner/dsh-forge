// forge 提案域服务（任务 2.7；tech-design §Interface 3 全三法——ctx.forgeProposals）。
// 定位：业务。三小域合并单目录承载（布局自由度注记——服务面四分是契约，文件布局非契约）。
//
// 五法面（M3 2.2 写径三面落位后面分治：transitionProposal 双面（tool + RPC——UF-1 人工裁决
// drift 修订）、setProposalMode = UI 专属 RPC（律三唯一正门——agent tool 面无模式改写动词）、
// createProposal = tool 专属写、两读面（listProposals/listProposalDocs）恒 RPC）：
// - createProposal：slug UNIQUE 预检（校验先于写——冲突抛普通 Error：错误码面无
//   proposal-exists 专属码，typed 面不私扩；tool 侧可读可重试）；status 缺省 'draft'
//   （schema DEFAULT 同值）；decided_at 恒 NULL 起步（裁决时刻由 transitionProposal 写）；
//   mode 透传（创建技能写入；缺省 NULL——扫描吸收旧行同形占位）。
// - transitionProposal：from≠to 同源校验（ERR_INVALID_TRANSITION——assertDomainTransition
//   单源）；裁决写 decided_at：→ accepted/rejected 时写（覆盖式——最新裁决时刻），
//   打回（→ under-review/draft）/superseded 不改写；superseded 必带 supersededBy
//   （目标在场校验 → 写 superseded_by 谱系取代链——缺席 typed 拒 / 入参缺席普通 Error
//   fail-loud）；成链分叉内聚（图 6·裁决⑤）：accepted ∧ mode='expedition' ∧ 无同
//   proposal_id feature → 同事务 registerFeatureInTx（features 行 + feature_records(register)
//   ·actor='core'）返回 chained——blitz/NULL 不成链、非 accepted 恒不成链、幂等不重复建链。
// - setProposalMode：单事务只写 proposals.mode（tasks.mode 永不触碰 = 快照不回溯·律三；
//   features 无 mode 列无需同步）+ reason 必填（ERR_REASON_REQUIRED——人工变更溯源审计面）。
// - listProposals：search（slug/title/状态中英标签）+ sort（active 活跃优先 | created）；
//   行增 mode（NULL 直出 = 键缺席——UI 缺省占位判据）+ taskCount（单查询 JOIN 按
//   source_id 分组——容器 pill「有任务的提案」判据；2.3）。
// - listProposalDocs：提案文档区只读扫描（评审缺口#1 处置——零状态零写径，文件系统
//   为事实源；UF-1 文档区「文档(N 篇)」与提案渠道 prefill「已生成文档」清单同源本法，
//   web 侧零二次扫描；2.3）。
//
// 成链内聚经装配注入的 features 域 registerFeatureInTx（同事务调用非二次提交——四域互禁
// import 彼此，装配层注边；2.1 导出面契约）。
// 写动词闭包尾部 emitTasksChanged(projectId)（Interface 1 写后事件四域覆盖面裁决——
// proposals 为写域，无事件则提案子 tab 永不刷新；事务提交后发射）。
// 一切 SQL prepared statements（Hard Rule）。
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync, type Dirent } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import {
  PROPOSAL_STATUSES,
  type CreateProposalInput,
  type FeatureRow,
  type FeatureStatus,
  type ForgeProposalsService,
  type ListProposalDocsQuery,
  type Mode,
  type ProposalCard,
  type ProposalDocRow,
  type ProposalRow,
  type ProposalStatus,
  type SetProposalModeInput,
  type TaskActor,
  type TransitionProposalInput,
  type TransitionProposalResult,
} from '@dsh-forge/contracts'
import { withTransaction } from '../../db/transaction.js'
import { isLegalSlugDirName, parseThinFrontmatter } from '../workspace/discovery.js'
import type { ForgeTaskEvents } from '../workspace/events.js'
import type { ForgeWorkspaceStore } from '../workspace/store.js'
import { assertDomainTransition, FeatureExistsError, ProposalNotFoundError, ReasonRequiredError } from './errors.js'
import { matchesSearch, proposalSearchKeys, sortByActiveThenCreated } from './list-utils.js'

export interface ProposalsServiceDeps {
  /** 每工作区任务库惰性句柄（projectId → ensureOpen） */
  readonly store: ForgeWorkspaceStore
  /** 写后事件发射器（装配单例——四域共享） */
  readonly events: ForgeTaskEvents
  /** projectId → forge_dir（中央 projects 行 forge_dir 列——装配层 routing 注入；文档区扫描基准） */
  readonly resolveForgeDir: (projectId: string) => string
  /**
   * 成链内聚同事务核心（features 域 registerFeatureInTx——2.1 导出面；四域互禁 import
   * 彼此，装配层注入消 import 边）：features 行 + feature_records(register) 审计行，
   * 只可在已开事务内调用（同事务调用非二次提交）。
   */
  readonly registerFeatureInTx: (
    db: Database.Database,
    input: { slug: string; title: string; summary?: string; proposalId?: string },
    actor: TaskActor,
  ) => ChainedFeatureStorageRow
}

/**
 * 成链返回行形状（features 域存储行结构投影——四域互禁 import，经注入面结构兼容传递；
 * registerFeatureInTx 返回值与本形状赋值兼容即单源，不复制实现）。
 */
export interface ChainedFeatureStorageRow {
  id: string
  slug: string
  title: string
  feature_status: FeatureStatus
  summary: string | null
  proposal_id: string | null
  created_at: string
  updated_at: string
}

/** 成链 feature 行 → FeatureRow DTO（snake_case → DTO 映射——features.ts 同口径就近复刻）。
 *  NULL 列条件展开 = 键缺席（tool 返回面 lossless JSON 合规——显式 undefined 属性会被
 *  harness 输出快照边界整值拒绝，提案 tool-row-lossless-json-fix；房式 = tasks/query.ts） */
function toChainedFeature(row: ChainedFeatureStorageRow): FeatureRow {
  return {
    featureId: row.id,
    slug: row.slug,
    title: row.title,
    featureStatus: row.feature_status,
    ...(row.summary !== null ? { summary: row.summary } : {}),
    ...(row.proposal_id !== null ? { proposalId: row.proposal_id } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** proposals 行存储形状（snake_case → DTO 映射唯一落点） */
interface ProposalStorageRow {
  id: string
  slug: string
  title: string
  proposal_status: ProposalStatus
  rel_path: string | null
  author: string | null
  mode: Mode | null
  superseded_by: string | null
  decided_at: string | null
  created_at: string
  updated_at: string
}

const SELECT_PROPOSAL = `SELECT id, slug, title, proposal_status, rel_path, author, mode, superseded_by, decided_at, created_at, updated_at FROM proposals`

/** proposals 行 → ProposalRow DTO（snake_case → DTO 映射唯一落点）。NULL 列条件展开 =
 *  键缺席（tool 返回面 lossless JSON 合规——显式 undefined 属性被 harness 输出快照边界
 *  整值拒绝[author 恒 NULL → createProposal 必炸]，提案 tool-row-lossless-json-fix；
 *  可选键缺席式语义与 ProposalRow 可选字段契约一致） */
function toProposalRow(row: ProposalStorageRow): ProposalRow {
  return {
    proposalId: row.id,
    slug: row.slug,
    title: row.title,
    proposalStatus: row.proposal_status,
    ...(row.rel_path !== null ? { relPath: row.rel_path } : {}),
    ...(row.author !== null ? { author: row.author } : {}),
    ...(row.decided_at !== null ? { decidedAt: row.decided_at } : {}),
    // M3 2.3 读面：mode NULL 直出 = 键缺席（UI 缺省占位判据——tech-design Interface 1）
    ...(row.mode !== null ? { mode: row.mode } : {}),
    // 谱系右列数据面（superseded 转移写入——语义写径归 2.2，读面先行直出）
    ...(row.superseded_by !== null ? { supersededBy: row.superseded_by } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** 裁决态（→ 此时写 decided_at；打回/superseded 不改写——schema.sql decided_at 行注） */
const DECIDING_STATUSES: readonly ProposalStatus[] = ['accepted', 'rejected']

/** Interface 3：core · forge 提案域服务面（ctx.forgeProposals——M3 五法全语义：三 M2 法
 *  （2.2 写径三面：mode 透传/supersededBy 谱系/成链分叉内聚）+ setProposalMode 新正门 +
 *  listProposals/listProposalDocs 读面（2.3）） */
export function createProposalsService(deps: ProposalsServiceDeps): ForgeProposalsService {
  return {
    async createProposal(input: CreateProposalInput): Promise<ProposalRow> {
      const db = deps.store.ensureOpen(input.projectId)
      const row = withTransaction(db, () => {
        // slug UNIQUE 预检（校验先于写；单写者无并发窗口）：无专属 typed 码——普通 Error
        // fail-loud（RPC 边界原样上抛，与 updateProject 未命中同口径）
        const existing = db.prepare<unknown[], { id: string }>(`SELECT id FROM proposals WHERE slug = ?`).get(input.slug)
        if (existing !== undefined) {
          throw new Error(`提案已存在：${input.slug}（project ${input.projectId}）——slug UNIQUE 冲突`)
        }
        const id = randomUUID()
        const now = new Date().toISOString()
        // mode 透传（2.2）：创建技能写入溯源模式；缺省 NULL——扫描吸收旧行同形占位（成链门按 NULL 边界处理）
        db.prepare(
          `INSERT INTO proposals (id, slug, title, proposal_status, rel_path, author, mode, decided_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)`,
        ).run(id, input.slug, input.title, input.status ?? 'draft', input.relPath ?? null, input.mode ?? null, now, now)
        return db.prepare<unknown[], ProposalStorageRow>(`${SELECT_PROPOSAL} WHERE id = ?`).get(id) as ProposalStorageRow
      })
      deps.events.emitTasksChanged(input.projectId)
      return toProposalRow(row)
    },

    async transitionProposal(input: TransitionProposalInput): Promise<TransitionProposalResult> {
      const db = deps.store.ensureOpen(input.projectId)
      const { row, chained } = withTransaction(db, () => {
        const current = db
          .prepare<unknown[], ProposalStorageRow>(`${SELECT_PROPOSAL} WHERE id = ?`)
          .get(input.proposalId)
        if (current === undefined) {
          throw new ProposalNotFoundError({ projectId: input.projectId, proposalId: input.proposalId })
        }
        assertDomainTransition('proposal', PROPOSAL_STATUSES, current.proposal_status, input.toStatus)
        // 谱系取代链（2.2·UF-1 数据面）：superseded 必带 supersededBy——目标在场校验（缺席 →
        // typed 404）后写 superseded_by；入参缺席 → 普通 Error fail-loud（错误码面无专属码——
        // createProposal slug 冲突同口径，typed 面不私扩）。非 superseded 转移不改写既有谱系
        //（打回保留取代事实——「superseded 转移写入」单向纪律）。
        let supersededBy = current.superseded_by
        if (input.toStatus === 'superseded') {
          if (input.supersededBy === undefined) {
            throw new Error(
              `superseded 转移必带 supersededBy（目标提案 id——UF-1 取代链数据面）：proposal ${input.proposalId}（project ${input.projectId}）`,
            )
          }
          const target = db.prepare<unknown[], { id: string }>(`SELECT id FROM proposals WHERE id = ?`).get(input.supersededBy)
          if (target === undefined) {
            throw new ProposalNotFoundError({ projectId: input.projectId, proposalId: input.supersededBy })
          }
          supersededBy = input.supersededBy
        }
        // 裁决写 decided_at：→ accepted/rejected 覆盖式写最新裁决时刻；其余转移不改写。
        const now = new Date().toISOString()
        const decidedAt = DECIDING_STATUSES.includes(input.toStatus) ? now : current.decided_at
        db.prepare(`UPDATE proposals SET proposal_status = ?, superseded_by = ?, decided_at = ?, updated_at = ? WHERE id = ?`).run(
          input.toStatus,
          supersededBy,
          decidedAt,
          now,
          input.proposalId,
        )
        // 成链分叉内聚（图 6·裁决⑤·不变量 5 单事务原子）：toStatus='accepted' ∧ mode='expedition'
        // ∧ 无同 proposal_id feature → 同事务 registerFeatureInTx（features 行（同名 slug/title
        // 继承——proposals 无 summary 列，继承面天然缺席）+ feature_records(register)·actor='core'）。
        // blitz/NULL 不成链（NULL 边界：先 setProposalMode 定模式，补链 = 显式 registerFeature）；
        // 非 accepted 恒不成链；幂等——同 proposal_id 已有 feature 不重复建链（chained 缺席，
        // 成链事实由谱系 JOIN 读面承载）。
        let chained: ChainedFeatureStorageRow | undefined
        if (input.toStatus === 'accepted' && current.mode === 'expedition') {
          const linked = db.prepare<unknown[], { id: string }>(`SELECT id FROM features WHERE proposal_id = ?`).get(input.proposalId)
          if (linked === undefined) {
            // 同名 slug 冲突预检（UNIQUE(features.slug)——异谱系同 slug feature 在场 → typed 409
            // 优于裸约束错；单事务整体回滚 = 无半成品链）
            const slugTaken = db.prepare<unknown[], { id: string }>(`SELECT id FROM features WHERE slug = ?`).get(current.slug)
            if (slugTaken !== undefined) {
              throw new FeatureExistsError({ projectId: input.projectId, slug: current.slug })
            }
            chained = deps.registerFeatureInTx(
              db,
              { slug: current.slug, title: current.title, proposalId: input.proposalId },
              'core',
            )
          }
        }
        return {
          row: db.prepare<unknown[], ProposalStorageRow>(`${SELECT_PROPOSAL} WHERE id = ?`).get(input.proposalId) as ProposalStorageRow,
          chained,
        }
      })
      deps.events.emitTasksChanged(input.projectId)
      // chained 键缺席 = 未成链（幂等跳过/blitz/NULL/非 accepted——UI 判据与 mode NULL 直出同口径）
      return { ...toProposalRow(row), ...(chained !== undefined ? { chained: toChainedFeature(chained) } : {}) }
    },

    // 律三唯一正门（2.2·图 7）：单事务只写 proposals.mode——tasks.mode 永不触碰（快照不回溯：
    // 既有任务留创建时事实；features 无 mode 列无需同步——恒远征语义由成链门保证）。
    // UI 专属 RPC 面（agent tool 面无模式改写动词——SC6 契约断言对象）。
    async setProposalMode(input: SetProposalModeInput): Promise<ProposalRow> {
      const db = deps.store.ensureOpen(input.projectId)
      const row = withTransaction(db, () => {
        const current = db
          .prepare<unknown[], ProposalStorageRow>(`${SELECT_PROPOSAL} WHERE id = ?`)
          .get(input.proposalId)
        if (current === undefined) {
          throw new ProposalNotFoundError({ projectId: input.projectId, proposalId: input.proposalId })
        }
        // reason 必填（人工变更溯源——快照不回溯明示的审计面；与 transfer 动词空因同语义）
        if (input.reason.trim() === '') {
          throw new ReasonRequiredError({ verb: 'setProposalMode' })
        }
        const now = new Date().toISOString()
        db.prepare(`UPDATE proposals SET mode = ?, updated_at = ? WHERE id = ?`).run(input.mode, now, input.proposalId)
        return db.prepare<unknown[], ProposalStorageRow>(`${SELECT_PROPOSAL} WHERE id = ?`).get(input.proposalId) as ProposalStorageRow
      })
      deps.events.emitTasksChanged(input.projectId)
      return toProposalRow(row)
    },

    async listProposals(q: { projectId: string; search?: string; sort?: 'active' | 'created' }): Promise<ProposalCard[]> {
      const db = deps.store.ensureOpen(q.projectId)
      const rows = db.prepare<unknown[], ProposalStorageRow>(`${SELECT_PROPOSAL}`).all()
      // M3 2.3 taskCount（容器维度·单查询 JOIN 按 source_id 分组）：proposal 直挂任务 +
      // 成链 feature（proposal_id 谱系）任务并入同计——容器 pill「有任务的提案」判据。
      // 判别口径 = kind + source_id（非 slug 计——未成链同 slug feature 任务不串计；
      // tasks 两 OR 分支互斥无扇出，COUNT(t.id) 恒每任务一次）。
      const counts = new Map(
        db
          .prepare<unknown[], { proposal_id: string; n: number }>(
            `SELECT p.id AS proposal_id, COUNT(t.id) AS n
             FROM proposals p
             LEFT JOIN features f ON f.proposal_id = p.id
             LEFT JOIN tasks t ON (t.source_kind = 'proposal' AND t.source_id = p.id)
                                 OR (t.source_kind = 'feature' AND t.source_id = f.id)
             GROUP BY p.id`,
          )
          .all()
          .map((r) => [r.proposal_id, r.n] as const),
      )
      const cards: ProposalCard[] = rows.map((row) => ({ ...toProposalRow(row), taskCount: counts.get(row.id) ?? 0 }))
      const filtered = cards.filter((c) =>
        matchesSearch(q.search, proposalSearchKeys(c.slug, c.title, c.proposalStatus)),
      )
      return sortByActiveThenCreated(filtered, {
        active: q.sort ?? 'active',
        isTerminal: (c) =>
          c.proposalStatus === 'accepted' || c.proposalStatus === 'rejected' || c.proposalStatus === 'superseded',
        createdAt: (c) => c.createdAt,
        id: (c) => c.proposalId,
      })
    },

    // M3 2.3：提案文档区只读扫描（评审缺口#1 处置——零状态零写径，文件系统为事实源；
    // 不触工作区库——UF-1 文档区与提案渠道 prefill「已生成文档」清单同源本法）。
    async listProposalDocs(q: ListProposalDocsQuery): Promise<ProposalDocRow[]> {
      // slug 卫生守卫（discovery 同源 isLegalSlugDirName）：路径穿越/隐藏/分隔符面 → 空列表
      if (!isLegalSlugDirName(q.slug)) return []
      return scanProposalDocs(deps.resolveForgeDir(q.projectId), q.slug)
    },
  }
}

// ─────────────────────────── 提案文档区只读扫描（发现面同族） ───────────────────────────

/** 严格 UTF-8 解码器（非 UTF-8 → fatal 抛错——行降级为可选字段缺席，非错误） */
const utf8Fatal = new TextDecoder('utf-8', { fatal: true })

/**
 * docs/proposals/&lt;slug&gt;/ 全部 .md 递归扫描（子目录含入——提案目录 spikes/ 等嵌套文档
 * 同收；relPath 相对 forge_dir 正斜杠）。越界容错（非错误口径）：目录缺席 → 空列表、
 * 非 .md（严格小写）忽略、符号链接不跟随（withFileTypes 判形）、frontmatter 缺席/非 UTF-8
 * → title/status 可选字段缺席（fileName/relPath 恒有）；行按 relPath 字典序确定性输出。
 */
function scanProposalDocs(forgeDir: string, slug: string): ProposalDocRow[] {
  const out: ProposalDocRow[] = []
  const walk = (dir: string, parts: readonly string[]): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return // 目录缺席/不可读 → 静默空结果（零错误面）
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), [...parts, entry.name])
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(toProposalDocRow(slug, parts, entry.name, join(dir, entry.name)))
      }
    }
  }
  walk(join(forgeDir, 'docs', 'proposals', slug), [])
  return out.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0))
}

/** 单文档行：frontmatter title/status 可选初值（原文透传——doc 区显示初值，不做词汇归一；
 *  title 只取 frontmatter，非正文 H1）；读失败（非 UTF-8 等）→ 可选字段缺席，行恒立。
 *  relPath 由段拼接（正斜杠契约——不经 OS 路径拼接，Windows 亦正斜杠）。 */
function toProposalDocRow(
  slug: string,
  parts: readonly string[],
  fileName: string,
  absPath: string,
): ProposalDocRow {
  let title: string | undefined
  let status: string | undefined
  try {
    const fm = parseThinFrontmatter(utf8Fatal.decode(readFileSync(absPath)))
    if (fm.ok) {
      title = fm.data.title
      status = fm.data.status
    }
  } catch {
    // 非 UTF-8 / 不可读 → 可选字段缺席（fileName/relPath 恒有——行不缺席）
  }
  return { fileName, relPath: ['docs', 'proposals', slug, ...parts, fileName].join('/'), title, status }
}
