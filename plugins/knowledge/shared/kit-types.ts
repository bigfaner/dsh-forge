// knowledge 插件 shared 下沉件（knowledge-plugin-migration 1.4 子提交 a——处置矩阵
// 「下沉 knowledge shared」行）：kit 钩子/快照窄类型（自 project ui/knowledge/kit-types.ts
// 逐字下沉——纯类型零 runtime；project 侧消费 = ui/anchored-projects.tsx 正本（类型引
// sidebar-model 既有副本 + KitSelectorHook 本地声明），镜像同步 pin 对账）。原件头注：
// KitSelectorHook 自 views/session/ConversationViews.tsx 最小抽出（壳侧 ConversationViews
// 不迁——B2 另批，RecallTab 不消费该类型、KnowledgePanel/anchored-projects 消费）；
// LedgerWorkspacesSnapshot 自 views/sidebar/sidebar-model.ts 最小抽出（仅 items 窄形状
// 消费面——归档/置顶集合可选镜像两字段一并保留，形状零裁剪）。

/** kit 选择器钩子（官方 kit hook 形状——root 标准 props 递达面；可选 = 降级） */
export type KitSelectorHook = (selector: (state: never) => unknown) => unknown

/**
 * dsh workspace 归属快照窄形状（上游 WorkspaceSnapshot 消费切片）。D45 增镜像两集合
 * （上游快照恒在场——选项性 = 测试替身/面漂移缺席容忍，缺席 = 无置顶/归档标记）：
 * archivedSessionIds = registry 级归档集（宿主序）；pinnedSessionIds = registry 级置顶
 * 集（最近置顶在前——上游官方口径）。
 */
export interface LedgerWorkspacesSnapshot {
  readonly items: readonly { readonly workspaceId: string; readonly sessionIds: readonly string[]; readonly path?: string }[]
  /** 归档会话 id 集（registry 级——上游 archivedSessionIds 镜像；缺席 = 空集语义） */
  readonly archivedSessionIds?: readonly string[]
  /** 置顶会话 id 集（最近置顶在前——上游 pinnedSessionIds 镜像；缺席 = 空集语义） */
  readonly pinnedSessionIds?: readonly string[]
}
