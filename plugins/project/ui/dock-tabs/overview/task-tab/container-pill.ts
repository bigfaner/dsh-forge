// 1.45 随 dock tab 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// 任务容器选项投影（定位：业务——容器来源 = 任务数据自身：tasks.list({projectId}) 全项目
// 卡按 source{kind,slug} 聚合（计数 + 状态分布），稳定排序 slug 字典序）。
// 前史（留痕）：容器曾 = features ∪ 有任务突击提案 两域聚合（M3 4.4「前端组合两域读」）；
// features/提案域 UI 已随 G2（feature 子 tab 退役，用户裁决 2026-11）退役——features 恒空
// → 容器选项恒空 → 任务子 tab 恒「暂无任务容器」空态（判例 2026-11-25 真机定谳）。本投影
// 退役 features 行源，改按任务卡聚合：有任务卡必有容器，真真空（任务列表空）才空态。
// kind 双轨沿 contracts CONTAINER_KINDS 仅为 wire 契约回传保留（tasks.list/stats/graph 的
// source.kind 必填）——取任务卡自身 kind 原样回传，缺席卡回退 'feature'；kind 不参与分组、
// 排序与呈现（容器统一为 spec，slug 即容器）。
import { type ContainerKind, type Mode, type TaskCard, type TaskStatus } from '@dsh-forge/contracts'

/** 任务容器选项（pill 选中 + 菜单行 + 派发/诊断语境的单源投影） */
export interface TaskContainerOption {
  /** wire 契约回传用容器类型（任务卡自身 kind 原值——不参与分组/排序/呈现） */
  readonly kind: ContainerKind
  /** 容器标识（任务 slug 恒等值——RPC source 与派发指令容器标识（→ dispatchTask source_slug）同值） */
  readonly slug: string
  readonly title: string
  /** 容器对应模式（派发新会话模式） */
  readonly mode: Mode
  /** 任务计数（聚合卡数） */
  readonly taskCount: number
  /** 状态分布（按聚合卡 taskStatus 计数——菜单/呈现可选注） */
  readonly statusCounts: Partial<Record<TaskStatus, number>>
}

function containerMode(kind: ContainerKind): Mode {
  return kind === 'feature' ? 'expedition' : 'blitz'
}

/**
 * 容器选项集（任务数据自身聚合——唯一行源）：全项目任务卡按 slug 分组，每组 = 一个容器
 * 选项（计数 + 状态分布）；稳定排序 = slug 字典序。真真空（零任务卡）= 空列 → 容器空态
 * 唯一判据。
 */
export function taskContainerOptionsFromCards(
  cards: readonly TaskCard[],
): readonly TaskContainerOption[] {
  const groups = new Map<string, {
    kind: ContainerKind
    slug: string
    taskCount: number
    statusCounts: Partial<Record<TaskStatus, number>>
  }>()
  for (const card of cards) {
    const slug = card.slug
    let group = groups.get(slug)
    if (group === undefined) {
      group = { kind: card.source?.kind ?? 'feature', slug, taskCount: 0, statusCounts: {} }
      groups.set(slug, group)
    }
    group.taskCount += 1
    group.statusCounts[card.taskStatus] = (group.statusCounts[card.taskStatus] ?? 0) + 1
  }
  return [...groups.values()]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((group) => ({ ...group, title: group.slug, mode: containerMode(group.kind) }))
}

/** 「全部任务」作用域菜单行 id（pill 菜单首项——项目全域，不限定容器） */
export const ALL_CONTAINERS_MENU_ID = 'all'

/** 「全部任务」作用域菜单行标签 */
export const ALL_CONTAINERS_LABEL = '全部任务'
