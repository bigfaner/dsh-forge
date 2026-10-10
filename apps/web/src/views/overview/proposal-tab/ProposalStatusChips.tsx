// 五态过滤 chips（定位：业务——4.2 UF-1 五态 chips 行：draft/under-review/accepted/rejected/
// superseded 中文标签 + 计数；0 计数 disabled、多选并集、子 tab 切换清空（机制沿 M2 七态
// chips——受控件：active 集与 toggle 归帧侧模型 4.6 接线；counts 聚合与并集过滤 = 本模块
// 纯函数面）。状态点官方 StateDot 无蓝/紫语义——提案五态点色走 --dsw-alias 语义令牌自绘
// （ui-design M3 令牌映射表：draft=中性 · under-review=蓝 · accepted=绿 · rejected=红；
// superseded=紫无官方令牌——最近语义映射中性三级，执行记录注记）。
import type { ReactNode } from 'react'
import {
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_LABELS,
  type ProposalCard,
  type ProposalStatus,
} from '@dsh-forge/contracts'
import { Tooltip, type TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import './proposal-tab.css'

/**
 * 提案五态 → 官方 Tag tone（行状态 tag 着色单源——4.6 提案父行 tag 消费）。
 * ui-design 五态色映射：draft=中性 / under-review=蓝 / accepted=绿 / rejected=红 /
 * superseded=紫——官方 tone 调色板无紫，superseded 取 quiet（最弱语义面，与 draft 中性底区分）。
 */
export const PROPOSAL_STATUS_TAG_TONE: Readonly<Record<ProposalStatus, TagTone>> = {
  draft: 'neutral',
  'under-review': 'info',
  accepted: 'success',
  rejected: 'danger',
  superseded: 'quiet',
}

/** 五态计数聚合（chips 行计数单源——帧侧头路 proposals 直读聚合，不随搜索漂移口径归装配） */
export function proposalStatusCounts(proposals: readonly ProposalCard[]): Record<ProposalStatus, number> {
  const counts = { draft: 0, 'under-review': 0, accepted: 0, rejected: 0, superseded: 0 } as Record<
    ProposalStatus,
    number
  >
  for (const proposal of proposals) counts[proposal.proposalStatus] += 1
  return counts
}

/**
 * 多选并集过滤（AC4）：激活集空 = 全部；非空 = 状态 ∈ 激活集（多选并集）。
 * 服务端 listProposals 无状态过滤参（ListProposalsQuery = search/sort——Interface 3 权威）
 * ——chips 过滤帧侧客户端承载（M2 任务域 statusFilter 服务端参的提案域差异，非漂移）。
 */
export function filterProposalsByStatuses(
  proposals: readonly ProposalCard[],
  active: ReadonlySet<ProposalStatus>,
): readonly ProposalCard[] {
  if (active.size === 0) return proposals
  return proposals.filter((proposal) => active.has(proposal.proposalStatus))
}

export interface ProposalStatusChipsProps {
  /** 五态计数（0 计数禁用——不可点出空态） */
  readonly counts: Readonly<Record<ProposalStatus, number>>
  /** 激活集（受控——帧侧 toggle 持有；子 tab 切换清空沿 overview-model switchSubtab 机制） */
  readonly active: ReadonlySet<ProposalStatus>
  /** chip toggle 上抛 */
  readonly onToggle: (status: ProposalStatus) => void
  /** 清过滤上抛（任一激活时呈现入口；缺席 = 无清入口面） */
  readonly onClear?: () => void
}

/** 五态过滤 chips 行（AC4：toggle + 0 计数 disabled + 多选并集接口） */
export function ProposalStatusChips({ counts, active, onToggle, onClear }: ProposalStatusChipsProps): ReactNode {
  const hasFilter = active.size > 0
  return (
    <div className="dswf-ov-pschips" role="group" aria-label="提案状态过滤" data-dswf-ov-pschips="">
      {PROPOSAL_STATUSES.map((status) => {
        const count = counts[status] ?? 0
        const disabled = count === 0
        const on = active.has(status)
        const cls = ['dswf-ov-pschip', on ? 'is-on' : '', disabled ? 'is-zero' : '']
          .filter(Boolean)
          .join(' ')
        return (
          // D30：原生 title 退役——官方 Tooltip（禁用态锚定 = dswf-tipwrap 包裹 span）
          <Tooltip
            key={status}
            label={
              disabled
                ? '无此状态提案'
                : `${PROPOSAL_STATUS_LABELS[status].zh}（${PROPOSAL_STATUS_LABELS[status].en}）`
            }
            portal
          >
            <span className="dswf-tipwrap">
              <button
                type="button"
                className={cls}
                data-dswf-ov-pschip={status}
                aria-pressed={on}
                disabled={disabled}
                onClick={() => {
                  onToggle(status)
                }}
              >
                <span className="dswf-ov-pschip-dot" data-status={status} aria-hidden="true" />
                <span className="dswf-ov-pschip-label">{PROPOSAL_STATUS_LABELS[status].zh}</span>
                <span className="dswf-ov-pschip-count">{count}</span>
              </button>
            </span>
          </Tooltip>
        )
      })}
      {hasFilter && onClear !== undefined ? (
        <button
          type="button"
          className="dswf-ov-pschip dswf-ov-pschip-clear"
          data-dswf-ov-pschip-clear=""
          onClick={onClear}
        >
          ✕ 清过滤
        </button>
      ) : null}
    </div>
  )
}
