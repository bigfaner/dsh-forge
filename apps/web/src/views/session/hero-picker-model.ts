// hero 工作区控件行映射纯函数（fix-24 ①；定位：业务——弹层列「项目」的映射面，官方
// WorkspacePickFlow 行语言同型：items 全量账本无过滤缝 → 产品经影子占用改列 forge 项目）。
// 口径（任务 fix-24 Description ①）：
//   - items = forge 项目（forge:projects/list → name；archived 排除——与左栏过滤口径一致）；
//   - 未绑定项目的工作区天然不出现（行源是项目不是账本——初版「选择器过滤」口径的子集覆盖）；
//   - 选中映射：owner selectedId（workspaceId）↔ 行 id（= project.workspaceId）恒等对照，
//     未绑定/已归档工作区无命中行（零高亮）；
//   - 空集 + 账面已定 → 「添加」为唯一入口（官方 addIsTheOnlyEntry 语义对齐，:1935-1943）。
import type { ProjectSummary } from '@dsh-forge/contracts'

/** 弹层项目行（id = workspaceId——owner 契约 selectedId/onPick 零变化走官方链） */
export interface HeroPickerRow {
  readonly id: string
  readonly name: string
}

/** 弹层面（行集 + 入口形态派生——组件消费的唯一计划对象） */
export interface HeroPickerPlan {
  /** 项目行（archived 排除；listProjects 顺位保持 created_at 序） */
  readonly rows: readonly HeroPickerRow[]
  /** 行集非空 → 添加项入 footer（官方 pinAdd 同义） */
  readonly pinAdd: boolean
  /** 行集空且账面已定 → 「添加」唯一入口，弹层直达产品注册流（官方 addIsTheOnlyEntry 同义） */
  readonly addIsTheOnlyEntry: boolean
}

/** 弹层行集与入口形态（纯函数：projects + 账面相位 → 计划） */
export function heroPickerPlan(
  projects: readonly ProjectSummary[],
  settled: boolean,
): HeroPickerPlan {
  const rows: HeroPickerRow[] = []
  for (const project of projects) {
    if (project.archived) continue // 过滤口径：archived 排除（与左栏一致）
    rows.push({ id: project.workspaceId, name: project.name })
  }
  return { rows, pinAdd: rows.length > 0, addIsTheOnlyEntry: settled && rows.length === 0 }
}

/** workspaceId ↔ 项目映射（owner selectedId 命中行集内项目；undefined = 无命中——未绑定/已归档） */
export function selectedProjectOf(
  rows: readonly HeroPickerRow[],
  selectedId: string | undefined,
): HeroPickerRow | undefined {
  if (selectedId === undefined) return undefined
  return rows.find((row) => row.id === selectedId)
}

/**
 * worktree 第二 chip 数据根（纯函数，fix-2 建立 / bug 10833861 修正）：
 * selectedId 官方语义 = workspaceId（owner 契约）——经 workspaceId 回查项目行取 ws_path；
 * 未选中/未命中 → 活跃（非归档）首个有 ws_path 的行兜底；全无 → null（chip 零注入退回现状）。
 * bug 10833861 Root cause: 原推导以 project.id 比对 workspaceId 恒 miss，fallback 又取
 * 全量首行（created_at 最早的归档项目，如非 git 的 learn）→ isGit=false 全零注入。
 */
export function selectedProjectRootOf(
  projects: readonly ProjectSummary[],
  selectedId: string | undefined,
): string | null {
  const byWorkspace =
    selectedId !== undefined ? projects.find((project) => project.workspaceId === selectedId) : undefined
  if (byWorkspace !== undefined && byWorkspace.wsPath !== '') return byWorkspace.wsPath
  return projects.find((p) => p.archived !== true && p.wsPath !== undefined && p.wsPath !== '')?.wsPath ?? null
}

// ───────────── 1.25（bug af65c0a9）双静默路显式化：提示文案纯函数单源 ─────────────

/** worktree 注入面缺席提示（旧插件面/装配降级——不静默 no-op，官方 Toast 呈现） */
export function worktreeFaceUnavailableNotice(): string {
  return 'worktree 编排面不可用（插件版本陈旧？），未能进入所选 worktree'
}

/**
 * worktree 挂靠编排失败提示（含环节语义——sessionCreate / openSession 两步；
 * bug af65c0a9 Root cause: 原 onWorktreeSelect 编排失败 `.catch(() => {})` 静默吞错，
 * 用户点选后以为已进入 worktree，实际仍在默认主树会话里。
 */
export function worktreeOrchestrationNotice(stage: 'create' | 'open', cause: string): string {
  const stageText = stage === 'create' ? '创建挂靠会话' : '打开会话'
  return `worktree 挂靠失败（${stageText}）：${cause}，当前会话未切换`
}
