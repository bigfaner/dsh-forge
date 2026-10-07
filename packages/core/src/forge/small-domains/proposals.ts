// forge 提案域服务（任务 2.7；tech-design §Interface 3 全三法——ctx.forgeProposals）。
// 定位：业务。三小域合并单目录承载（布局自由度注记——服务面四分是契约，文件布局非契约）。
//
// 三法面（写动词 = tool 专属——Interface 7 面 RPC 仅供 list；本域不涉面分治，恒走 core 动词门）：
// - createProposal：slug UNIQUE 预检（校验先于写——冲突抛普通 Error：15 错误码面无
//   proposal-exists 专属码，typed 面不私扩；tool 侧可读可重试）；status 缺省 'draft'
//   （schema DEFAULT 同值）；decided_at 恒 NULL 起步（裁决时刻由 transitionProposal 写）。
// - transitionProposal：from≠to 同源校验（ERR_INVALID_TRANSITION——assertDomainTransition
//   单源）；裁决写 decided_at：→ accepted/rejected 时写（覆盖式——最新裁决时刻），
//   打回（→ under-review/draft）/superseded 不改写。
// - listProposals：search（slug/title/状态中英标签）+ sort（active 活跃优先 | created）；
//   行增 mode（NULL 直出 = 键缺席——UI 缺省占位判据）+ taskCount（单查询 JOIN 按
//   source_id 分组——容器 pill「有任务的提案」判据；2.3）。
// - listProposalDocs：提案文档区只读扫描（评审缺口#1 处置——零状态零写径，文件系统
//   为事实源；UF-1 文档区「文档(N 篇)」与提案渠道 prefill「已生成文档」清单同源本法，
//   web 侧零二次扫描；2.3）。
//
// 写动词闭包尾部 emitTasksChanged(projectId)（Interface 1 写后事件四域覆盖面裁决——
// proposals 为 tool 写，无事件则提案子 tab 永不刷新；事务提交后发射）。
// 一切 SQL prepared statements（Hard Rule）。
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync, type Dirent } from 'node:fs'
import { join } from 'node:path'
import {
  PROPOSAL_STATUSES,
  type CreateProposalInput,
  type ForgeProposalsService,
  type ListProposalDocsQuery,
  type Mode,
  type ProposalCard,
  type ProposalDocRow,
  type ProposalRow,
  type ProposalStatus,
  type SetProposalModeInput,
  type TransitionProposalInput,
  type TransitionProposalResult,
} from '@dsh-forge/contracts'
import { withTransaction } from '../../db/transaction.js'
import { isLegalSlugDirName, parseThinFrontmatter } from '../workspace/discovery.js'
import type { ForgeTaskEvents } from '../workspace/events.js'
import type { ForgeWorkspaceStore } from '../workspace/store.js'
import { assertDomainTransition, ProposalNotFoundError } from './errors.js'
import { matchesSearch, proposalSearchKeys, sortByActiveThenCreated } from './list-utils.js'

export interface ProposalsServiceDeps {
  /** 每工作区任务库惰性句柄（projectId → ensureOpen） */
  readonly store: ForgeWorkspaceStore
  /** 写后事件发射器（装配单例——四域共享） */
  readonly events: ForgeTaskEvents
  /** projectId → forge_dir（中央 projects 行 forge_dir 列——装配层 routing 注入；文档区扫描基准） */
  readonly resolveForgeDir: (projectId: string) => string
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

function toProposalRow(row: ProposalStorageRow): ProposalRow {
  return {
    proposalId: row.id,
    slug: row.slug,
    title: row.title,
    proposalStatus: row.proposal_status,
    relPath: row.rel_path ?? undefined,
    author: row.author ?? undefined,
    decidedAt: row.decided_at ?? undefined,
    // M3 2.3 读面：mode NULL 直出 = 键缺席（UI 缺省占位判据——tech-design Interface 1）
    mode: row.mode ?? undefined,
    // 谱系右列数据面（superseded 转移写入——语义写径归 2.2，读面先行直出）
    supersededBy: row.superseded_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** 裁决态（→ 此时写 decided_at；打回/superseded 不改写——schema.sql decided_at 行注） */
const DECIDING_STATUSES: readonly ProposalStatus[] = ['accepted', 'rejected']

/** Interface 3：core · forge 提案域服务面（ctx.forgeProposals——M3 五法：三 M2 法容器化 +
 *  setProposalMode/listProposalDocs 两新面垫片，语义实现归 2.2/2.3） */
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
        db.prepare(
          `INSERT INTO proposals (id, slug, title, proposal_status, rel_path, author, decided_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        ).run(id, input.slug, input.title, input.status ?? 'draft', input.relPath ?? null, now, now)
        return db.prepare<unknown[], ProposalStorageRow>(`${SELECT_PROPOSAL} WHERE id = ?`).get(id) as ProposalStorageRow
      })
      deps.events.emitTasksChanged(input.projectId)
      return toProposalRow(row)
    },

    async transitionProposal(input: TransitionProposalInput): Promise<TransitionProposalResult> {
      const db = deps.store.ensureOpen(input.projectId)
      const row = withTransaction(db, () => {
        const current = db
          .prepare<unknown[], ProposalStorageRow>(`${SELECT_PROPOSAL} WHERE id = ?`)
          .get(input.proposalId)
        if (current === undefined) {
          throw new ProposalNotFoundError({ projectId: input.projectId, proposalId: input.proposalId })
        }
        assertDomainTransition('proposal', PROPOSAL_STATUSES, current.proposal_status, input.toStatus)
        // 裁决写 decided_at：→ accepted/rejected 覆盖式写最新裁决时刻；其余转移不改写。
        // M3 垫片（1.1）：supersededBy 谱系与成链分叉内聚随 1.2/2.2（schema mode/superseded_by
        // 双列 + feature_records 到场）——本契约期面零行为变更（可选入参不消费）。
        const now = new Date().toISOString()
        const decidedAt = DECIDING_STATUSES.includes(input.toStatus) ? now : current.decided_at
        db.prepare(`UPDATE proposals SET proposal_status = ?, decided_at = ?, updated_at = ? WHERE id = ?`).run(
          input.toStatus,
          decidedAt,
          now,
          input.proposalId,
        )
        return db.prepare<unknown[], ProposalStorageRow>(`${SELECT_PROPOSAL} WHERE id = ?`).get(input.proposalId) as ProposalStorageRow
      })
      deps.events.emitTasksChanged(input.projectId)
      return toProposalRow(row)
    },

    // M3 新面（1.1 契约对齐垫片）：proposals.mode 列随 1.2 schema v1 直改到场——语义实现归 2.2
    // （setProposalMode 单事务只写 mode + 审计）。垫片期无调用方（RPC 接线 = 3.8，UI = 4.2）。
    async setProposalMode(_input: SetProposalModeInput): Promise<ProposalRow> {
      throw new Error('setProposalMode: M3 语义实现归 2.2（proposals.mode 列随 1.2 schema 到场）')
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
