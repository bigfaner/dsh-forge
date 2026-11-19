// conversation.hero.workspace 槽注册面（定位：装配——1.7 B 类顶替②自 apps/web 壳侧
// plugin.ts registerConversationViews hero 登记迁入本包，fix-13 模式：注册归插件域，
// 官方宿主不装载产品壳时本面仍随插件 bundle apply 期自注册）。
//
// 顶替语义（源码级核销 = hero-slot-occupy-audit.md §5）：`conversation.hero.workspace`
// 是 single/root 槽（官方占用者 = ui-workspace WorkspacePicker，priority 缺省 0）——
// SlotCore.register 仅追加条目并按 priority 升序排序、选举面取每格第一个未 abdicated
// 条目：插件行 priority -100 恒选胜（lowest renders），官方条目留注册表落选（影子共存，
// 不抛错不拒绝）。已知并接受的改写代价（用户裁决 2026-11-12）：官方 WorkspacePicker
// 自承载的 workspace 列表与「添加工作区」目录流失渲染位（目录流子槽
// conversation.hero.workspace.directoryFlow 声明仍由官方登记行供养[本行零 children
// ——重声明即 throw，fix-23 runtime 实证]，项目添加径走产品 UF-3 注册流不经该子洞）。
//
// hero 区呈现「项目 + worktree 双 select」（upgrade 装配——组件本体 =
// ui/worktree-picker/hero-workspace-picker.tsx + ForgeHeroWorktreeMount）：项目 select
// 弹层列 forge 项目（owner onPick = 官方 selectWorkspace 链零改契约）；worktree select
// 点选链 = ensureWorkspace → openWorkspace（ForgeHeroWorktreeMount 既有装配）。链路
// 复刻官方契约：会话绑定/openWorkspace 在 owner 侧不在 WorkspacePicker 内（audit §3）
// ——onPick 经 share 递达的官方链原样；worktree 链的 openWorkspace 官方面经本注册面
// inject 递达（官方宿主可达——窗口锚 `__dshForgeOpenWorkspace` 仅壳宿主安装，回退源），
// 语义复刻壳侧安装器（open-workspace-face-install.ts 结构同型镜像）：基线在场门
// （bug d353536f / bd7d7977 同因面）+ beforeOpen 草稿迁移（官方 selectWorkspace 同语义）
// + fail-soft catch。
//
// 无选中态/空项目态 fail-soft：selectedId 未命中行集 = 零高亮 + 默认拾取门（不盲拾）；
// 零项目 = 「添加」唯一入口直达产品注册流（addIsTheOnlyEntry）。
//
// 时序纪律（同 sidebar-face）：插件 apply 期官方 sessions/workspaces/uiWorkspace 尚未
// 入座——服务读取全部收敛进 slots.inject 声明缝 cb 内现查（AGENTS 1.6 检测永不缓存），
// apply 期零读取；cb 内缺席 = 不注册（官方 WorkspacePicker 保持）。
import { ForgeHeroWorkspacePicker } from './worktree-picker/hero-workspace-picker.js'
import { registerKeyedSection, type SectionSlotsFace } from './keyed-section.js'
import { waitForWorkspacePresent, type OpenSessionWaitOptions } from './open-session.js'
import type { LedgerWorkspacesSnapshot, SnapshotSource } from './sidebar/sidebar-model.js'

/** 洞名：官方新会话 hero 工作区选择/切换控件（single/root——audit §5 单源字面量） */
export const HERO_WORKSPACE_SLOT = 'conversation.hero.workspace'
/** 影子优先级（single 槽 lowest renders；官方占用者缺省 0 → -100 = 产品控件替换占用者） */
export const HERO_SHADOW_PRIORITY = -100

/** apply ctx 窄面（官方服务现查消费切片——sidebar-face SidebarFaceCtx 同型） */
export interface HeroPickerFaceCtx {
  get(name: 'sessions' | 'workspaces' | 'uiWorkspace'): unknown
  /** reflect 只读反射（conversation.input.for 草稿 shell 解析缝——缺席/异常 = undefined） */
  reflect?: { get(name: string, strict?: boolean): unknown }
}

/** 注册面诊断（registered = 实际落座面；e2e/排障锚——sidebar-face 同型） */
export interface HeroPickerFaceDiagnostics {
  readonly registered: string[]
}

/** 官方 openWorkspace 窄面承诺（beforeOpen：草稿迁移窗钩子——官方 replaceMain 换主前回调） */
type OfficialOpenWorkspace = (
  workspaceId: string,
  beforeOpen?: (nextSessionId: string) => void,
) => Promise<void>

/** 会话输入 shell 窄面（conversation.input.for 产物——草读写） */
interface DraftShellFace {
  readonly snapshot: { readonly draft: string; readonly attachmentIds?: readonly unknown[] }
  setDraft(text: string): void
}

/**
 * 会话 shell 形状适配（壳侧 open-workspace-face-install.ts resolveDraftShellFace 结构
 * 同型镜像）：sessions.binding 借已 retain 绑定 → conversation.input.for 取官方 shell →
 * 收敛为 DraftShellFace。bug 4b89d984：setDraft 必须 .call(record, text) 保 receiver。
 * 未 retain/面缺席/形状漂移 = undefined fail-soft 零迁移。
 */
function resolveDraftShellFace(
  ctx: HeroPickerFaceCtx,
  sessions: unknown,
  sessionId: string,
): DraftShellFace | undefined {
  const binding = (sessions as { binding?: (id: string) => unknown } | undefined)?.binding?.(sessionId)
  const actx = (binding as Record<string, unknown> | undefined)?.['ctx']
  if (actx === undefined) return undefined
  const input = ((): { for?: (actx: unknown) => unknown } | undefined => {
    try {
      return (ctx.reflect?.get('conversation', false) as { input?: unknown } | undefined)?.input as
        | { for?: (actx: unknown) => unknown }
        | undefined
    } catch {
      return undefined
    }
  })()
  const shell = input?.for?.(actx)
  const record = shell as Record<string, unknown> | undefined
  if (record === undefined || record === null) return undefined
  const snapshot = record['snapshot'] as { draft?: unknown; attachmentIds?: unknown } | undefined
  const setDraft = record['setDraft']
  const attachmentIds = snapshot?.['attachmentIds']
  if (
    snapshot === undefined ||
    typeof snapshot['draft'] !== 'string' ||
    typeof setDraft !== 'function' ||
    (attachmentIds !== undefined && !Array.isArray(attachmentIds))
  ) {
    return undefined
  }
  return {
    snapshot: {
      draft: snapshot['draft'],
      attachmentIds: Array.isArray(attachmentIds) ? attachmentIds : undefined,
    },
    setDraft: (text: string): void => {
      ;(setDraft as (this: unknown, text: string) => void).call(record, text)
    },
  }
}

/**
 * 官方 openWorkspace 窄面组装（壳侧安装器结构同型镜像）：worktree 点选 = 显式传参官方
 * openWorkspace(workspaceId, beforeOpen)——官方唯一创建前决策缝。
 * ① 基线在场门（bug bd7d7977 / d353536f 同因面）：官方 connectWorkspace 只查客户端本地
 *    快照，host 侧建档到 workspaces.list 投影推送抵达存在竞速窗——有界等基线在场再委派；
 * ② beforeOpen 草稿迁移（官方 selectWorkspace 同语义）：旧 blank 草稿写入新 blank、旧
 *    blank 清空；shell 面缺席 = 零迁移不阻切换；
 * ③ fail-soft catch：openWorkspace 失败留痕不炸点选链。
 */
function officialOpenWorkspaceFaceOf(options: {
  readonly open: OfficialOpenWorkspace
  readonly workspacesList: SnapshotSource<LedgerWorkspacesSnapshot>
  readonly mainSessionIdOf: () => string | undefined
  readonly resolveShell: (sessionId: string) => DraftShellFace | undefined
  readonly wait?: OpenSessionWaitOptions
}): (workspaceId: string) => Promise<void> {
  const warn = (message: string): void => console.warn(message)
  return async (workspaceId: string): Promise<void> => {
    const from = options.mainSessionIdOf()
    const beforeOpen =
      from === undefined
        ? undefined
        : (nextSessionId: string): void => {
            if (from === nextSessionId) return
            try {
              const fromShell = options.resolveShell(from)
              const nextShell = options.resolveShell(nextSessionId)
              if (fromShell === undefined || nextShell === undefined) return
              const attachments = fromShell.snapshot.attachmentIds
              if (attachments !== undefined && attachments.length > 0) return
              const draft = fromShell.snapshot.draft
              if (draft === '') return
              nextShell.setDraft(draft)
              fromShell.setDraft('')
            } catch (cause: unknown) {
              warn(`[dsh-forge/project] worktree 切换草稿迁移失败（fail-soft——不阻切换）：${String(cause)}`)
            }
          }
    await waitForWorkspacePresent(options.workspacesList, workspaceId, options.wait)
    return options.open(workspaceId, beforeOpen).catch((cause: unknown): void => {
      warn(`[dsh-forge/project] openWorkspace 失败（fail-soft）：${String(cause)}`)
    })
  }
}

/**
 * conversation.hero.workspace 顶替注册（apply 编排）：两段式——slots.inject 声明缝 cb 内
 * 现查官方三服务（workspaces/uiWorkspace.openWorkspace 缺席 = warn 不注册，官方
 * WorkspacePicker 保持；sessions 缺席 = 注册仍落座[草稿迁移零迁移 fail-soft]）→
 * registerKeyedSection 落座（priority -100 影子；inject = workspaces 快照源 +
 * openWorkspace 官方面）。返回值 = 声明缝诊断（随插件 fiber 级联撤销）。
 */
export function registerHeroPickerFace(ctx: HeroPickerFaceCtx, slots: SectionSlotsFace): HeroPickerFaceDiagnostics {
  const registered: string[] = []
  if (typeof slots.inject !== 'function') {
    throw new Error('ctx.slots.inject absent——conversation.hero.workspace 不注册（官方 WorkspacePicker 保持）')
  }
  slots.inject(HERO_WORKSPACE_SLOT, () => {
    // 声明缝 cb（槽声明在场/入座时点——官方服务已入座）：现查不缓存（AGENTS 1.6）。
    const workspaces = ctx.get('workspaces') as
      | { list?: SnapshotSource<LedgerWorkspacesSnapshot> }
      | undefined
    const uiWorkspace = ctx.get('uiWorkspace') as
      | ({ openWorkspace?: OfficialOpenWorkspace } & { mainReference?: { sessionId?: unknown } })
      | undefined
    const sessions = ctx.get('sessions') as unknown
    if (
      workspaces === undefined ||
      typeof workspaces.list?.getSnapshot !== 'function' ||
      typeof workspaces.list?.subscribe !== 'function' ||
      typeof uiWorkspace?.openWorkspace !== 'function'
    ) {
      console.warn('[dsh-forge/project] workspaces/uiWorkspace absent at slot seating——conversation.hero.workspace 不注册（官方 WorkspacePicker 保持）')
      return undefined
    }
    const list = workspaces.list
    const open = uiWorkspace.openWorkspace.bind(uiWorkspace) as OfficialOpenWorkspace
    const openWorkspace = officialOpenWorkspaceFaceOf({
      open,
      workspacesList: list,
      mainSessionIdOf: () => {
        const sessionId = uiWorkspace?.mainReference?.sessionId
        return typeof sessionId === 'string' ? sessionId : undefined
      },
      resolveShell: (sessionId: string) => resolveDraftShellFace(ctx, sessions, sessionId),
    })
    const dispose = registerKeyedSection(slots, {
      slot: HERO_WORKSPACE_SLOT,
      priority: HERO_SHADOW_PRIORITY,
      inject: (): Record<string, unknown> => ({
        workspaces: list,
        openWorkspace,
      }),
      component: ForgeHeroWorkspacePicker,
    })
    if (dispose !== undefined) registered.push(HERO_WORKSPACE_SLOT)
    return dispose
  })
  return { registered }
}
