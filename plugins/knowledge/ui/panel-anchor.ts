// 1.42 随 knowledge 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// 面板锚纯函数（自 workbench/panel-model 抽出——只取被用导出）：KnowledgePanel 消费
// projectAnchorOf/pickedProjectAnchor 两纯函数；panel-model 其余导出（hero 相位/右栏
// 联动/视图镜像等）归壳侧装配域不随迁。
import { normalizeFsPath } from '@dsh-forge/lib-path/path-key'

/**
 * 当前项目锚推导（纯函数，3.8 建立）：会话锚在场 → 会话归属 workspace（sessionIds 成员）→
 * 该 workspace 名下的项目；未匹配/无会话锚 → 唯一项目兜底（单人工作台 P1 最常见的无歧义
 * 相位）；多项目无锚 = null（浏览/召回面按「无项目锚」降级，不猜首个）。
 * 快照缺席（useWorkspaces hook 不在场）= 单项目兜底同径（非壳载体降级）。
 * fix-25 注：知识面板原恒走兜底线（root 作用域「无会话锚可读」）；fix-bug 起知识面板
 * 经 root 标准props useSessions 读主视图会话（官方 retainedBy.mainView 口径——
 * DocumentTitle 同型先例）走会话锚定分支，多项目 + 活跃会话不再恒降级（多项目无会话
 * = 保持 null 不猜首个，空态文案分流见 KnowledgeView.anchorlessCopy）。
 * fix-33 ⑨：projects 行 workspaceId 收紧为必填（contracts Project/ProjectSummary 镜像
 * ——原可选放宽无消费面，属漂移面）。
 * bug 1e761ada：锚定只在活跃（非归档）行内进行——行可选携带 archived（ProjectSummary
 * 同形；缺席 = 活跃，既有调用形状零变化）。归档行参与兜底计数曾致「5 归档 + 1 活跃」
 * 恒无锚：宿主重启落开始页（无主会话）时概览谎称未注册、入口卡消失（左栏自滤归档故
 * 正常，形成分裂）。
 */
export function projectAnchorOf(input: {
  readonly sessionId: string | null
  readonly workspaces: {
    readonly items: readonly { readonly workspaceId: string; readonly sessionIds: readonly string[]; readonly path?: string }[]
  } | null
  readonly projects: readonly { readonly id: string; readonly workspaceId: string; readonly archived?: boolean }[]
  /** 工作区路径（归一键）→ 归属项目 id——host 身份裁决映射（forge:worktree/resolve 批量
   *  通道产物，bug 52fc94db：worktree 工作区会话概览锚定接 host 裁决——e9330692 同族，
   *  概览锚定径补同款两段键）。缺席 = 既有行为零变化。 */
  readonly workspaceProject?: ReadonlyMap<string, string>
}): string | null {
  const active = input.projects.filter((p) => p.archived !== true)
  if (input.sessionId !== null && input.workspaces !== null) {
    const home = input.workspaces.items.find((ws) => ws.sessionIds.includes(input.sessionId as string))
    if (home !== undefined) {
      const byWorkspace = active.find((p) => p.workspaceId === home.workspaceId)
      if (byWorkspace !== undefined) return byWorkspace.id
      // miss 段（orchestrateRootOf 同形制——e9330692 修订）：worktree 工作区不在注册表，
      // 经 host 身份裁决映射归并回属主项目；裁决行须核销活跃（归档/未解析 → 落兜底，不锚定）。
      if (home.path !== undefined && input.workspaceProject !== undefined) {
        const resolvedId = input.workspaceProject.get(normalizeFsPath(home.path))
        if (resolvedId !== undefined) {
          const resolvedRow = active.find((p) => p.id === resolvedId)
          if (resolvedRow !== undefined) return resolvedRow.id
        }
      }
    }
  }
  if (active.length === 1) return active[0]!.id
  return null
}

/**
 * 显式拾取锚推导（纯函数，fix-bug 知识范围项目切换控件）：拾取行仍在切换行集（archived
 * 排除——与 hero 弹层同口径）→ 拾取优先（粘性：会话/派生锚不覆盖用户显式选择）；拾取
 * 行离场（删除/归档）或未拾取 → null（回落 projectAnchorOf 派生锚）。
 */
export function pickedProjectAnchor(
  pickedId: string | null | undefined,
  scopeRows: readonly { readonly id: string }[],
): string | null {
  if (pickedId === null || pickedId === undefined) return null
  return scopeRows.some((row) => row.id === pickedId) ? pickedId : null
}
