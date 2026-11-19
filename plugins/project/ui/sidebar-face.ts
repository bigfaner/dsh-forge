// sidebar.workspaces 槽注册面（定位：装配——1.6 B 类顶替①自 apps/web 壳侧 plugin.ts
// registerSidebarSlots 迁入本包，fix-13 模式：注册归插件域，官方宿主不装载产品壳时本面
// 仍随插件 bundle apply 期自注册）。
//
// 顶替语义（源码级核销 = hero-slot-occupy-audit.md §6）：`sidebar.workspaces` 是
// single/root 槽（官方占用者 = ui-workspace WorkspaceBrowser，priority 缺省 0）——
// SlotCore.register 仅追加条目并按 priority 升序排序、选举面取每格第一个未 abdicated
// 条目：插件行 priority -100 恒选胜（lowest renders），官方条目留注册表落选（影子共存，
// 不抛错不拒绝）。已知并接受的改写代价（用户裁决 2026-11-12）：官方 WorkspaceBrowser
// 声明的五子槽（directoryFlow/session.menu.item/session.row.action/leading/hover）失挂点
// ——官方 pin/rename/fork/archive 菜单行注入生态随之失效，由本包面板自有动作面承接。
//
// 五功能复刻（proposal 2.3 首版即复刻裁决）：搜索过滤 / pin 置顶 / archive 归档 /
// rename 重命名 / 分组态——面板本体 ForgeWorkspacePanel（ui/sidebar/）逐项与官方
// workspace 列表行为对齐；数据源 = forge.projects（Typert 正典 ui/rpc 面）；行点击链路
// = openSession（官方 uiWorkspace.openSession）/ startSession（uiWorkspace.startSession
// ——waitForWorkspacePresent 在场门单源，bug d353536f 同因面）；worktree 维度不混入
// 列表（归 hero 双 select——B 类顶替②）。
//
// 「＋」入口收口（用户裁决 2026-11-12）：「＋ 添加项目」入口不在项目列表内（列表头部/
// rail 轨内零入口）；唯一残存入口 = 无项目空态 CTA；入口归宿登记待裁决清单。
//
// 时序纪律（真机 0.16.0 实证收口）：插件 apply 期官方 sessions/workspaces/uiWorkspace
// 尚未入座（壳侧先例 = cordis inject 激活等待；插件侧等价缝 = 官方 SlotRegistry.inject
// 声明缝——cb 在槽声明在场/入座时装载，彼时官方 ui-sidebar owner 已持服务）——服务
// 读取全部收敛进声明缝 cb 内现查（AGENTS 1.6 检测永不缓存），apply 期零读取；cb 内
// 缺席 = 不注册（官方 WorkspaceBrowser 保持）。
import { ForgeSidebarSlot } from './sidebar/ForgeSidebarSlot.js'
import { registerKeyedSection, type SectionSlotsFace } from './keyed-section.js'
import { waitForWorkspacePresent } from './open-session.js'
import {
  sessionActionFaceOf,
  type ForgeSessionsService,
  type ForgeUiWorkspaceService,
  type ForgeWorkspacesService,
} from './session-actions.js'

/** 洞名：官方 sidebar 壳的工作区浏览区（项目列表顶替目标——audit §6 单源字面量） */
export const SIDEBAR_WORKSPACES_SLOT = 'sidebar.workspaces'
/** 影子优先级（single 槽 lowest renders；官方占用者缺省 0 → -100 = 产品面板替换占用者） */
export const SIDEBAR_SHADOW_PRIORITY = -100

/** apply ctx 窄面（官方服务现查消费切片——dock-tabs-face DockTabsFaceCtx 同型） */
export interface SidebarFaceCtx {
  get(name: 'sessions' | 'workspaces' | 'uiWorkspace'): unknown
}

/** 注册面诊断（registered = 实际落座面；e2e/排障锚——dock-tabs-face 同型） */
export interface SidebarFaceDiagnostics {
  readonly registered: string[]
}

/**
 * sidebar.workspaces 顶替注册（apply 编排）：两段式——slots.inject 声明缝 cb 内现查
 * 官方三服务（缺席 = warn 不注册，官方 WorkspaceBrowser 保持）→ registerKeyedSection
 * 落座（priority -100 影子）。返回值 = 声明缝诊断（随插件 fiber 级联撤销）。
 */
export function registerSidebarFace(ctx: SidebarFaceCtx, slots: SectionSlotsFace): SidebarFaceDiagnostics {
  const registered: string[] = []
  if (typeof slots.inject !== 'function') {
    throw new Error('ctx.slots.inject absent——sidebar.workspaces 不注册（官方 WorkspaceBrowser 保持）')
  }
  slots.inject(SIDEBAR_WORKSPACES_SLOT, () => {
    // 声明缝 cb（槽声明在场/入座时点——官方服务已入座）：现查不缓存（AGENTS 1.6）。
    const sessions = ctx.get('sessions') as ForgeSessionsService | undefined
    const workspaces = ctx.get('workspaces') as ForgeWorkspacesService | undefined
    const uiWorkspace = ctx.get('uiWorkspace') as ForgeUiWorkspaceService | undefined
    if (
      sessions === undefined ||
      workspaces === undefined ||
      uiWorkspace === undefined ||
      typeof uiWorkspace.openSession !== 'function' ||
      typeof uiWorkspace.startSession !== 'function'
    ) {
      console.warn('[dsh-forge/project] sessions/workspaces/uiWorkspace absent at slot seating——sidebar.workspaces 不注册（官方 WorkspaceBrowser 保持）')
      return undefined
    }
    const inject = (): Record<string, unknown> => ({
      sessions: sessions.list,
      workspaces: workspaces.list,
      // 官方导航动作面（fix-11：uiWorkspace.openSession——会话选择+呈现一体）
      openSession: (sessionId: string): void => {
        uiWorkspace.openSession(sessionId)
      },
      startSession: (workspaceId: string): void => {
        // 官方新会话流（fix-42：项目行尾「新会话」钮——uiWorkspace.startSession
        // reuse-or-create blank + 呈现一体，官方 WorkspaceBrowser 行动作同径）。
        // bug d353536f 同因面：官方基线未就位时盲委派 = connectWorkspace 查空快照
        // 抛 unknown workspace——有界等待在场后委派（waitForWorkspacePresent 单源；
        // 超时仍委派，官方 createFailed 错误面保真）。
        void waitForWorkspacePresent(workspaces.list, workspaceId).then(() => {
          uiWorkspace.startSession(workspaceId)
        })
      },
      // D45 会话行动作面（…菜单/归档/置顶钮——官方面缺席 = 键缺席 → 面板对应项不呈现）
      ...sessionActionFaceOf({ uiWorkspace, sessions }),
    })
    const dispose = registerKeyedSection(slots, {
      slot: SIDEBAR_WORKSPACES_SLOT,
      priority: SIDEBAR_SHADOW_PRIORITY,
      inject,
      component: ForgeSidebarSlot,
    })
    if (dispose !== undefined) registered.push(SIDEBAR_WORKSPACES_SLOT)
    return dispose
  })
  return { registered }
}
