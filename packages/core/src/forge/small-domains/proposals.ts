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
// - listProposals：search（slug/title/状态中英标签）+ sort（active 活跃优先 | created）。
//
// 写动词闭包尾部 emitTasksChanged(projectId)（Interface 1 写后事件四域覆盖面裁决——
// proposals 为 tool 写，无事件则提案子 tab 永不刷新；事务提交后发射）。
// 一切 SQL prepared statements（Hard Rule）。
import { randomUUID } from 'node:crypto'
import {
  PROPOSAL_STATUSES,
  type CreateProposalInput,
  type ForgeProposalsService,
  type ListProposalDocsQuery,
  type ProposalCard,
  type ProposalDocRow,
  type ProposalRow,
  type ProposalStatus,
  type SetProposalModeInput,
  type TransitionProposalInput,
  type TransitionProposalResult,
} from '@dsh-forge/contracts'
import { withTransaction } from '../../db/transaction.js'
import type { ForgeTaskEvents } from '../workspace/events.js'
import type { ForgeWorkspaceStore } from '../workspace/store.js'
import { assertDomainTransition, ProposalNotFoundError } from './errors.js'
import { matchesSearch, proposalSearchKeys, sortByActiveThenCreated } from './list-utils.js'

export interface ProposalsServiceDeps {
  /** 每工作区任务库惰性句柄（projectId → ensureOpen） */
  readonly store: ForgeWorkspaceStore
  /** 写后事件发射器（装配单例——四域共享） */
  readonly events: ForgeTaskEvents
}

/** proposals 行存储形状（snake_case → DTO 映射唯一落点） */
interface ProposalStorageRow {
  id: string
  slug: string
  title: string
  proposal_status: ProposalStatus
  rel_path: string | null
  author: string | null
  decided_at: string | null
  created_at: string
  updated_at: string
}

const SELECT_PROPOSAL = `SELECT id, slug, title, proposal_status, rel_path, author, decided_at, created_at, updated_at FROM proposals`

function toProposalRow(row: ProposalStorageRow): ProposalRow {
  return {
    proposalId: row.id,
    slug: row.slug,
    title: row.title,
    proposalStatus: row.proposal_status,
    relPath: row.rel_path ?? undefined,
    author: row.author ?? undefined,
    decidedAt: row.decided_at ?? undefined,
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
      // M3 taskCount（容器维度）：tasks.slug ≡ 容器 slug 服务不变量下按 slug 计数——成链
      // feature 同名任务并入同计（M2 等价口径；source_id 分组随 1.2/2.3 泛化）
      const counts = new Map(
        db
          .prepare<unknown[], { slug: string; n: number }>(
            `SELECT slug, COUNT(*) AS n FROM tasks GROUP BY slug`,
          )
          .all()
          .map((r) => [r.slug, r.n] as const),
      )
      const cards: ProposalCard[] = rows.map((row) => ({ ...toProposalRow(row), taskCount: counts.get(row.slug) ?? 0 }))
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

    // M3 新面（1.1 契约对齐垫片）：docs/proposals/<slug>/ 目录扫描读面归 2.3（UF-1 文档区）
    async listProposalDocs(_q: ListProposalDocsQuery): Promise<ProposalDocRow[]> {
      throw new Error('listProposalDocs: M3 语义实现归 2.3（提案文档区目录扫描）')
    },
  }
}
