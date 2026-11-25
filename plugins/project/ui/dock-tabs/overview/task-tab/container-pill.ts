// 1.45 随 dock tab 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// 任务容器选项投影（定位：业务——容器来源 = 任务数据自身：tasks.list({projectId}) 全项目
// 卡按 source{kind,slug} 聚合（计数 + 状态分布），稳定排序 slug 字典序）。
// 前史（留痕）：容器曾 = features ∪ 有任务突击提案 两域聚合（M3 4.4「前端组合两域读」）；
// features/提案域 UI 已随 G2（feature 子 tab 退役，用户裁决 2026-11）退役——features 恒空
// → 容器选项恒空 → 任务子 tab 恒「暂无任务容器」空态（判例 2026-11-25 真机定谳）。本投影
// 退役 features 行源，改按任务卡聚合：有任务卡必有容器，真真空（任务列表空）才空态。
// kind 双轨沿 contracts CONTAINER_KINDS（tasks.source_kind 同词汇——feature 远征轨 /
// proposal 突击轨）；source 缺席卡回退 feature:slug（slug ≡ 容器 slug 服务不变量）。
// 呈现判据保留：突击容器带「（突击提案）」菜单标记 + 无「诊断」按钮
//（validateFeatureTasks 为 feature 域校验——一次一 feature）。
import { type ContainerKind, type Mode, type TaskCard, type TaskStatus } from '@dsh-forge/contracts'

/** 任务容器选项（pill 选中 + 菜单行 + 派发/诊断语境的单源投影） */
export interface TaskContainerOption {
  /** 容器类型（feature = 远征轨 / proposal = 突击轨——tasks.source_kind 同词汇） */
  readonly kind: ContainerKind
  /** 容器标识（任务 slug 恒等值——RPC source 与派发指令容器标识（→ dispatchTask source_slug）同值） */
  readonly slug: string
  readonly title: string
  /** 容器对应模式（feature 恒 'expedition'；突击提案 = 'blitz'） */
  readonly mode: Mode
  /** 任务计数（聚合卡数） */
  readonly taskCount: number
  /** 状态分布（按聚合卡 taskStatus 计数——菜单/呈现可选注） */
  readonly statusCounts: Partial<Record<TaskStatus, number>>
}

/** 突击容器菜单标记词（v20 ㉝——「突击提案」） */
export const BLITZ_CONTAINER_MARK = '突击提案'

function containerMode(kind: ContainerKind): Mode {
  return kind === 'feature' ? 'expedition' : 'blitz'
}

/**
 * 容器选项集（任务数据自身聚合——唯一行源）：全项目任务卡按 source{kind,slug} 分组，
 * 每组 = 一个容器选项（计数 + 状态分布）；稳定排序 = slug 字典序（同 slug 双轨按 kind
 * 可辨）。真真空（零任务卡）= 空列 → 容器空态唯一判据。
 */
export function taskContainerOptionsFromCards(
  cards: readonly TaskCard[],
): readonly TaskContainerOption[] {
  const groups = new Map<string, {
    readonly kind: ContainerKind
    readonly slug: string
    taskCount: number
    statusCounts: Partial<Record<TaskStatus, number>>
  }>()
  for (const card of cards) {
    const ref = card.source ?? { kind: 'feature' as const, slug: card.slug }
    const key = `${ref.kind}:${ref.slug}`
    const group = groups.get(key) ?? { kind: ref.kind, slug: ref.slug, taskCount: 0, statusCounts: {} }
    group.taskCount += 1
    group.statusCounts[card.taskStatus] = (group.statusCounts[card.taskStatus] ?? 0) + 1
    groups.set(key, group)
  }
  return [...groups.values()]
    .sort((a, b) => a.slug.localeCompare(b.slug) || a.kind.localeCompare(b.kind))
    .map((group) => ({ ...group, title: group.slug, mode: containerMode(group.kind) }))
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
