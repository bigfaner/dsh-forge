// 项目锚定装载共享 hook（定位：装配——fix-36 收敛：ShellHost / HeroWorkspacePicker /
// ConversationViews / KnowledgePanel 四装配面同型 15 行「快照 useState + 窄化 +
// useForgeProjects + 条件 WorkspacesAnchor」模式的单一来源）。
// 铁律口径：「视图同级互禁」只禁同级业务互引——本模块 = 公共下层（装配域共享面），
// 数据源 useForgeProjects 仍唯一（views/sidebar）。
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { LedgerWorkspacesSnapshot } from '../views/sidebar/sidebar-model.js'
import { useForgeProjects, type ProjectsPhase } from '../views/sidebar/use-forge-projects.js'
import type { KitSelectorHook } from '../views/session/ConversationViews.js'

/**
 * workspace 归属快照窄判定（纯函数）：dsh 归属快照最小形状（items 数组）——非壳载体/
 * 形状漂移期按 null 降级（不炸壳；SC2：只读快照身份与归属查询，不落地行内容副本）。
 */
export function isWorkspacesSnapshot(value: unknown): value is LedgerWorkspacesSnapshot {
  return typeof value === 'object' && value !== null && Array.isArray((value as { items?: unknown }).items)
}

/**
 * workspace 归属锚子件（快照只读上抛——SC2 零缓存零副本：装配侧仅持快照对象身份供
 * 重拉锚，不落地行内容派生副本；导出面 = 单测）。
 */
export function WorkspacesAnchor({
  hook,
  onChange,
}: {
  readonly hook: KitSelectorHook
  readonly onChange: (snap: unknown) => void
}): ReactNode {
  const snap = hook((s) => s)
  useEffect(() => {
    onChange(snap)
  }, [snap, onChange])
  return null
}

/** useAnchoredProjects 输出（相位 + 快照 + 双刷新动作 + 条件锚子件） */
export interface AnchoredProjects {
  /** 项目列表相位（useForgeProjects 直通——ready 相位消费方自行窄化） */
  readonly projects: ProjectsPhase
  /** workspace 归属快照（窄化后——项目锚推导输入：projectAnchorOf 的 workspaces 面） */
  readonly workspaces: LedgerWorkspacesSnapshot | null
  /** 显式重试（错误相位复位重拉——闪骨架） */
  readonly retry: () => void
  /** 静默重拉（保留现行相位不闪骨架——高频开合面刷新） */
  readonly silentRefresh: () => void
  /** 条件锚子件（kit hook 在场才挂载；缺席 = null——钩子于子件内无条件调用，规则合规） */
  readonly anchor: ReactNode
}

/**
 * 项目锚定装载（共享 hook）：workspace 归属快照（重拉锚 + 锚推导输入）+
 * forge:projects/list 相位一体。快照上抛窄化（形状漂移/非壳载体 → null 降级）与刷新锚
 * 口径与本模块迁移前四装配面逐字同型——行为零变化（fix-36 纯收敛）。
 */
export function useAnchoredProjects(useWorkspaces?: KitSelectorHook): AnchoredProjects {
  const [workspacesSnap, setWorkspacesSnap] = useState<LedgerWorkspacesSnapshot | null>(null)
  const [projects, retry, silentRefresh] = useForgeProjects(workspacesSnap)
  const handleWorkspacesSnap = useCallback((snap: unknown) => {
    setWorkspacesSnap(isWorkspacesSnapshot(snap) ? snap : null)
  }, [])
  const anchor =
    useWorkspaces === undefined ? null : <WorkspacesAnchor hook={useWorkspaces} onChange={handleWorkspacesSnap} />
  return { projects, workspaces: workspacesSnap, retry, silentRefresh, anchor }
}
