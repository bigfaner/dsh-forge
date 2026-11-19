// 1.45 随 dock tab 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// 容器 pill 双轨数据模型（定位：业务——M3 4.4 UF-3：任务容器 = features ∪ 有任务突击提案，
// tech-design Integration #3「前端组合两域读——MVC 跨域聚合归前端先例」）。
// 成员判据（ui-design v20 ㉝）：feature 全量（远征轨——蓝点）+ blitz 提案 taskCount > 0
// （突击轨——琥珀点·2.3 单查询判据）；零任务提案不在列；非突击提案容器不入列——远征提案
// 成链后任务归同标识 feature 容器承载（裁决⑥/⑪：feature 恒远征·突击无 feature 阶段），
// 无溯源（mode NULL）提案无「容器对应模式」路由（openSessionWithPreset mode 参不可缺省成谎）。
// 呈现判据：突击容器带「（突击提案）」菜单标记 + 无「诊断」按钮
//（validateFeatureTasks 为 feature 域校验——一次一 feature，M2 既定口径）。
import { TASK_STATUSES, type ContainerKind, type FeatureCard, type Mode } from '@dsh-forge/contracts'

/** 任务容器选项（pill 选中 + 菜单行 + 派发/诊断语境的单源投影） */
export interface TaskContainerOption {
  /** 容器类型（feature = 远征轨 / proposal = 突击轨） */
  readonly kind: ContainerKind
  /** 容器标识（feature 目录名 / proposal slug——RPC source 与派发指令容器标识（→ dispatchTask source_slug）同值） */
  readonly slug: string
  readonly title: string
  /** 容器对应模式（feature 恒 'expedition'——成链门保证无列；突击提案 = 'blitz'） */
  readonly mode: Mode
  /** 任务计数（feature = byStatus 七态总和；突击提案 = 2.3 单查询 taskCount 原值） */
  readonly taskCount: number
}

/** 突击容器菜单标记词（v20 ㉝——「突击提案」） */
export const BLITZ_CONTAINER_MARK = '突击提案'

function featureTotal(feature: FeatureCard): number {
  return TASK_STATUSES.reduce((sum, status) => sum + (feature.byStatus[status] ?? 0), 0)
}

/**
 * 容器选项集（feature 轨——AC5 输入序）：feature 全量（远征轨——蓝点，mode 恒
 * 'expedition'）。proposal kind 选项仍在役（容器 pill/派发路由渲染面零改动），
 * 仅不再由本投影产出——proposal 域 UI 消费面退役后无提案行源。
 */
export function taskContainerOptions(
  features: readonly FeatureCard[],
): readonly TaskContainerOption[] {
  return features.map((feature) => ({
    kind: 'feature',
    slug: feature.slug,
    title: feature.title,
    mode: 'expedition' as const,
    taskCount: featureTotal(feature),
  }))
}

/** 选中解析（命中 = 对应选项；未命中 = undefined 不派发切换） */
export function containerOfSlug(
  options: readonly TaskContainerOption[],
  slug: string,
): TaskContainerOption | undefined {
  return options.find((option) => option.slug === slug)
}

/** 菜单行标记（突击容器带「（突击提案）」；feature 空串——当前项 ✓ 由 Menu selection 承载） */
export function containerMenuMark(option: TaskContainerOption): string {
  return option.kind === 'feature' ? '' : `（${BLITZ_CONTAINER_MARK}）`
}

/** 「诊断」按钮可见性（仅 feature 容器——validateFeatureTasks 恒单 feature 子图；突击容器无） */
export function containerHasSubgraphDiag(option: TaskContainerOption): boolean {
  return option.kind === 'feature'
}
