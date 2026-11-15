// knowledge 插件 ui 镜像窄面（knowledge-plugin-migration 1.4 子提交 b——处置矩阵
// 「镜像窄面」行）：anchored-projects 链的 knowledge 侧镜像。正本归位 project
// （plugins/project/ui/anchored-projects.tsx——project.db + workspaceRegistry 归属裁决
// 是 project 域职责，圆桌 architect 裁决随迁方向倒置否决）；跨 bundle 不可 import 正本，
// 本件按正本逐字镜像 knowledge 面消费切片（isWorkspacesSnapshot / WorkspacesAnchor /
// readMainSessionId / MainSessionAnchor / AnchoredProjects / useAnchoredProjects）。
// useWorkspaceProjectMap / resolveWorkspaceProjectMap 不在镜像（project 侧独占消费）。
// 镜像同步 pin = plugins/knowledge/ui/mirrors-pin.test.ts（export 形状/内容 hash 对账）。
// 数据源 useForgeProjects = 本包自持（use-forge-projects.ts——channels face 传输，
// knowledge 域数据链），行为与迁移前逐字等价。
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { LedgerWorkspacesSnapshot, KitSelectorHook } from '../shared/kit-types.js'
import { useForgeProjects, type ProjectsPhase } from './use-forge-projects.js'

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

/**
 * 主视图会话纯读（官方口径）：byId 中 retainedBy.mainView > 0 的会话行 id（官方
 * ui-layout DocumentTitle / ui-workspace 同型 find——主视图唯一保留会话）；形状漂移/
 * 缺省 → null（fail-soft——非壳载体降级为无会话锚）。选择器返回原语（store 稳定面）。
 */
export function readMainSessionId(hook: KitSelectorHook): string | null {
  return hook((s) => {
    const byId = (s as { byId?: Record<string, { id?: string; retainedBy?: { mainView?: number } }> } | undefined)
      ?.byId
    if (byId === undefined || typeof byId !== 'object') return null
    const current = Object.values(byId).find((row) => (row?.retainedBy?.mainView ?? 0) > 0)
    return current?.id ?? null
  }) as string | null
}

/**
 * 主视图会话锚子件（PanelInfoAnchor/WorkspacesAnchor 同形制——fix-33 ⑤ 钩子形制：
 * 可选 kit hook 经子件无条件调用，效应上抛宿主状态；SSR 首帧保持 null 缺省，效应驱动
 * 更新归 e2e）。导出面 = 单测（KnowledgePanel 再导出）。
 */
export function MainSessionAnchor({
  hook,
  onChange,
}: {
  readonly hook: KitSelectorHook
  readonly onChange: (sessionId: string | null) => void
}): ReactNode {
  const sessionId = readMainSessionId(hook)
  useEffect(() => {
    onChange(sessionId)
  }, [sessionId, onChange])
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
 * 口径与正本逐字同型——行为零变化。
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
