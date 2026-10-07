// 阶段过滤 chips（定位：业务——4.3 UF-4 六态 chips 行：「阶段」原「相位」更名（v8——
// M2「相位推导机」保留为代码域术语）。中文标签 = PHASE_PHRASES 短形单源（message-format
// 4.1——与消息体「阶段：」行同词汇；contracts FEATURE_STATUS_LABELS 长形为 M2 概览行用法，
// 两 vocabulary 并存各自单源）。行序 = ui-design UF-4 / 原型 PHASE_ORDER（进行中 · 需求 ·
// 设计 · 任务 · 已完成 · 已归档——活跃前置、文档相位推进序、终态殿后；与 contracts
// FEATURE_STATUSES 同集不同序）。机制沿 M2 七态 chips：0 计数 disabled、多选并集、清过滤
// （受控件：active 集与 toggle 归帧侧模型——4.6 接线；counts 聚合与并集过滤 = 本模块纯函数面）。
// 阶段点色（ui-design M3 令牌映射表未列阶段——原型 PHASE_TAG 最近语义映射）：进行中/设计 =
// 蓝（business——活跃/评审语义）、需求/已归档 = 中性（idle）、已完成 = 绿（success）、
// 任务 = 原型紫无官方令牌 → 中性三级（同 4.2 superseded 注记）。
import type { ReactNode } from 'react'
import type { FeatureCard, FeatureStatus } from '@dsh-forge/contracts'
import { PHASE_PHRASES } from '../message-format.js'
import './feature-tab.css'

/** chips 行序（展示序——ui-design UF-4 六态读序；值集 = contracts FEATURE_STATUSES 同集） */
export const PHASE_CHIP_ORDER: readonly FeatureStatus[] = [
  'in-progress',
  'prd',
  'design',
  'tasks',
  'completed',
  'archived',
]

/** 六态计数聚合（chips 行计数单源——帧侧头路 features 直读聚合，不随搜索漂移口径归装配） */
export function phaseCounts(features: readonly FeatureCard[]): Record<FeatureStatus, number> {
  const counts = {
    'in-progress': 0,
    prd: 0,
    design: 0,
    tasks: 0,
    completed: 0,
    archived: 0,
  } as Record<FeatureStatus, number>
  for (const feature of features) counts[feature.featureStatus] += 1
  return counts
}

/**
 * 多选并集过滤（AC1）：激活集空 = 全部；非空 = 阶段 ∈ 激活集（多选并集）。
 * 服务端 listFeatures 无阶段过滤参（ListFeaturesQuery = search/sort——Interface 权威）
 * ——chips 过滤帧侧客户端承载（与 4.2 提案五态 chips 同口径）。
 */
export function filterFeaturesByPhases(
  features: readonly FeatureCard[],
  active: ReadonlySet<FeatureStatus>,
): readonly FeatureCard[] {
  if (active.size === 0) return features
  return features.filter((feature) => active.has(feature.featureStatus))
}

export interface PhaseChipsProps {
  /** 六态计数（0 计数禁用——不可点出空态） */
  readonly counts: Readonly<Record<FeatureStatus, number>>
  /** 激活集（受控——帧侧 toggle 持有；子 tab 切换清空沿 overview-model switchSubtab 机制） */
  readonly active: ReadonlySet<FeatureStatus>
  /** chip toggle 上抛 */
  readonly onToggle: (phase: FeatureStatus) => void
  /** 清过滤上抛（任一激活时呈现入口；缺席 = 无清入口面） */
  readonly onClear?: () => void
}

/** 阶段过滤 chips 行（AC1：toggle + 0 计数 disabled + 多选并集接口） */
export function PhaseChips({ counts, active, onToggle, onClear }: PhaseChipsProps): ReactNode {
  const hasFilter = active.size > 0
  return (
    <div className="dswf-ov-phchips" role="group" aria-label="阶段过滤" data-dswf-ov-phchips="">
      {PHASE_CHIP_ORDER.map((phase) => {
        const count = counts[phase] ?? 0
        const disabled = count === 0
        const on = active.has(phase)
        const cls = ['dswf-ov-phchip', on ? 'is-on' : '', disabled ? 'is-zero' : '']
          .filter(Boolean)
          .join(' ')
        return (
          <button
            key={phase}
            type="button"
            className={cls}
            data-dswf-ov-phchip={phase}
            aria-pressed={on}
            disabled={disabled}
            title={disabled ? '无此阶段 feature' : PHASE_PHRASES[phase]}
            onClick={() => {
              onToggle(phase)
            }}
          >
            <span className="dswf-ov-phchip-dot" data-phase={phase} aria-hidden="true" />
            <span className="dswf-ov-phchip-label">{PHASE_PHRASES[phase]}</span>
            <span className="dswf-ov-phchip-count">{count}</span>
          </button>
        )
      })}
      {hasFilter && onClear !== undefined ? (
        <button
          type="button"
          className="dswf-ov-phchip dswf-ov-phchip-clear"
          data-dswf-ov-phchip-clear=""
          onClick={onClear}
        >
          ✕ 清过滤
        </button>
      ) : null}
    </div>
  )
}
