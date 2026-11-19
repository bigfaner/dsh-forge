// hero 项目弹层组件（B 类顶替②——1.7 自 apps/web 壳侧 views/session/HeroWorkspacePicker.tsx
// 平移本包，fix-13 模式：占用者本体与注册面归插件域，官方宿主不装载产品壳时随插件 bundle
// apply 期自注册）。hero 区「项目 + worktree 双 select」的装配层：
//   - 弹层行 = forge 项目（forgeProjects/list[Typert 正典] → name + 官方文件夹图标；
//     archived 排除）——未绑定项目的工作区天然不出现；
//   - 项目选中零改契约：owner selectedId(workspaceId) → 高亮命中项目行；onPick(project.
//     workspaceId) → 官方 selectWorkspace 链原样（hero-picker-model 映射面）；
//   - worktree select = ForgeHeroWorktreeMount（点选链 ensureWorkspace → openWorkspace
//     ——openWorkspace 官方面经注册面 inject 递达，窗口锚回退）；
//   - 「添加项目…」→ openAddProjectFlow()（UF-3 产品注册流）；空项目集 = 添加唯一入口；
//   - 官方件复用零自绘：Menu primitive；项目行文件夹图标与添加行 ＋ 图标均官方件。
// chip 触发器不在本面：官方 owner 侧渲染（ui-conversation heroWorkspaceRow——WorkspaceChip
// + renderSlot 本件），文案经 workspaces.rename 标题对齐项目名（fix-24 ②，host 侧链）。
// 子洞链（fix-14/16 原生选取）不受影：官方 WorkspacePicker 登记行恒在（影子只取渲染位，
// ui-slots single 槽 lowest-renders 语义），其 children 声明持续供养
// conversation.hero.workspace.directoryFlow 子洞——本行不重声明 children（ui-slots
// register 对已声明子槽重声明即 throw，fix-23 runtime 实证）。
// 数据面注记：壳侧 useAnchoredProjects（KitSelectorHook 形制）随迁退役——快照源改经
// 注册面 inject 递达（SnapshotSource 直读，ForgeSidebarSlot 同制），useSyncExternalStore
// 闭包绑定（dsh 快照源 = 类方法——裸引用脱离 this 即崩）。
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { IconFolderCloseRegular, IconPlusOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { openAddProjectFlow } from '../add-project/flow-open.js'
import { useForgeProjects } from '../sidebar/use-forge-projects.js'
import { preloadRpcClientFactory, type RpcClientFactory } from '../rpc.js'
import type { LedgerWorkspacesSnapshot, SnapshotSource } from '../sidebar/sidebar-model.js'
import { ForgeHeroWorktreeMount } from './picker.js'
import { openWorkspaceFace, type OpenWorkspaceFace } from '../state/open-workspace-face.js'
import {
  heroDefaultPickId,
  heroDefaultPickReady,
  heroPickerPlan,
  selectedProjectOf,
  selectedProjectRootOf,
} from './hero-picker-model.js'

/** 「添加项目…」行 id（菜单内保留字——项目行 id 恒为 dsh workspace uuid，无碰撞面） */
const ADD_PROJECT = 'dswf-add-project'
/** 添加行文案（产品口径——与 hero CTA/左栏「＋」入口同义词面） */
const ADD_LABEL = '添加项目…'

/** owner share 契约（官方 ConversationContent renderSlot('conversation.hero.workspace', …)
 * 面——ui-conversation client.js:16268-16281 结构同型镜像）+ 注册面 inject 面 */
export interface ForgeHeroWorkspacePickerProps {
  /** 弹层开合（owner 态——chip 点击翻转） */
  readonly open: boolean
  /** chip 触发器锚（官方 pickerAnchor——portal 定位源；缺席 = 不定位，menu 不可见面） */
  readonly anchorRef?: { readonly current: { getBoundingClientRect(): DOMRect } | null }
  /** 当前选中工作区 id（= workspaceId；pendingWorkspace ?? sessionWorkspace——映射入行集） */
  readonly selectedId?: string
  /** 拾取项目（id = project.workspaceId——官方 selectWorkspace 链，owner 契约零变化） */
  readonly onPick: (workspaceId: string) => void
  /** 弹层关闭（外点/Esc/拾取后——owner 态） */
  readonly onClose: () => void
  /** workspace 归属快照源（注册面 inject——默认拾取在场门 + worktree 数据根推导；
   * 缺席 = 快照面 null 降级，默认拾取不发生[不盲拾]） */
  readonly workspaces?: SnapshotSource<LedgerWorkspacesSnapshot>
  /** 官方 openWorkspace 窄面（注册面 inject——worktree 点选链；缺席回退 window 锚） */
  readonly openWorkspace?: OpenWorkspaceFace
  /** RPC 构造器（测试替身注入；缺省 Typert 真身） */
  readonly makeRpc?: RpcClientFactory
}

/**
 * conversation.hero.workspace 占用者：项目行弹层 + 「添加项目…」入口 + 空集直达 +
 * worktree 第二 select。data 锚：弹层卡 = .dswf-hero-picker-list（Menu listClassName
 * ——portal 面唯一可达样式钩，e2e/走查锚）；数据面经 hero-picker-model 纯函数。
 */
export function ForgeHeroWorkspacePicker({
  open,
  anchorRef,
  selectedId,
  onPick,
  onClose,
  workspaces,
  openWorkspace: injectedOpenWorkspace,
  makeRpc = preloadRpcClientFactory,
}: ForgeHeroWorkspacePickerProps): ReactNode {
  // workspace 归属快照直读（闭包绑定——类方法裸引用脱离 this 即崩，ForgeSidebarSlot 同制）。
  const subscribeWorkspaces = useCallback(
    (onChange: () => void) => workspaces?.subscribe(onChange) ?? (() => {}),
    [workspaces],
  )
  const readWorkspaces = useCallback(
    () => workspaces?.getSnapshot() ?? null,
    [workspaces],
  )
  const workspacesSnap = useSyncExternalStore(subscribeWorkspaces, readWorkspaces, readWorkspaces)

  // 项目源（Typert RPC；刷新锚 = workspace 归属快照身份——注册/删除 workspace 即重拉）
  const [projectsState, , silentRefresh] = useForgeProjects(workspacesSnap, makeRpc)

  const projects = projectsState.phase === 'ready' ? projectsState.projects : []
  const plan = heroPickerPlan(projects, projectsState.phase !== 'loading')
  const selectedRow = selectedProjectOf(plan.rows, selectedId)

  // bug 2ba146d8 默认拾取（hero 默认选中第一个活跃项目）：选中态缺席/未命中行集（归档
  // 会话回 hero、冷启、绑定已归档项目）→ 经官方 owner onPick 链拾取首行（与用户点选同行
  // 同语义——selectWorkspace 零改契约）。行集未定（loading）不拾取；per 候选 id 一次性
  // 尝试闩（pick 被官方拒时 pending 回滚、selectedId 不变——闩防重试循环，fail-soft 回
  // 「选择工作区」现状）。bug d353536f 在场门：官方 workspaces 快照含目标 id 才放行——
  // 基线未就位盲拾取 = 官方 connectWorkspace 查空快照抛 unknown workspace；快照就位经
  // 锚重渲染补拾取（heroDefaultPickReady 纯函数单源）。
  // bug 9eb9d6cb：默认拾取判据带官方 workspace 行——selectedId 指向树 workspace（A2 合法
  // 选中，永不命中项目行）时零拾取，防 1~3s 锚刷新后 onPick(主项目) 弹回 hero。
  const defaultPickId = heroDefaultPickId(plan.rows, selectedId, workspacesSnap?.items)
  const defaultPick = heroDefaultPickReady(workspacesSnap?.items, defaultPickId)
  const attemptedDefaultRef = useRef<ReadonlySet<string>>(new Set())
  useEffect(() => {
    if (defaultPick === undefined) return
    if (attemptedDefaultRef.current.has(defaultPick)) return
    attemptedDefaultRef.current = new Set(attemptedDefaultRef.current).add(defaultPick)
    onPick(defaultPick)
  }, [defaultPick, onPick])

  // 「添加项目…」打开（官方 openDirectoryFlow 同形：先 onClose 归还 owner 态，再开产品流）
  const openAdd = useCallback(() => {
    onClose()
    openAddProjectFlow()
  }, [onClose])

  // 空集直达（官方 addIsTheOnlyEntry 效应同构：open 且唯一入口 → 直接开产品注册流，弹层不呈现）
  const addOnly = plan.addIsTheOnlyEntry
  useEffect(() => {
    if (open && addOnly) openAdd()
  }, [open, addOnly, openAdd])

  // 开弹层即静默重拉（应用侧行删除/归档不触发 workspace 快照锚——open 边沿兜住陈旧行集；
  // 静默 = 保留现行相位不闪骨架）
  useEffect(() => {
    if (open) silentRefresh()
  }, [open, silentRefresh])

  // worktree 第二 select 数据锚：选中项目的 ws_path（纯函数 selectedProjectRootOf——
  // bug 10833861/8a316608 修正在 model 层）。
  const selectedProjectRoot = selectedProjectRootOf(projects, selectedId, workspacesSnap?.items as readonly unknown[] | undefined)

  // bug d353536f 同因面：官方基线未就位时点选同样盲打官方链（connectWorkspace 查空快照
  // 必抛 unknown workspace）——目标不在官方快照 = 挂起待基线，就位后由效应补拾取
  // （与默认拾取同门同源 heroDefaultPickReady；真不在场 = 挂起不消，不盲打官方链）。
  const [pendingPickId, setPendingPickId] = useState<string | undefined>(undefined)
  const pendingReadyPick = heroDefaultPickReady(workspacesSnap?.items, pendingPickId)
  useEffect(() => {
    if (pendingReadyPick === undefined) return
    setPendingPickId(undefined)
    onPick(pendingReadyPick)
  }, [pendingReadyPick, onPick])

  const onSelect = useCallback(
    (id: string) => {
      if (id === ADD_PROJECT) {
        openAdd()
        return
      }
      if (heroDefaultPickReady(workspacesSnap?.items, id) === undefined) {
        setPendingPickId(id)
        return
      }
      onPick(id)
    },
    [openAdd, onPick, workspacesSnap],
  )

  const getAnchorRect = useCallback(
    () => anchorRef?.current?.getBoundingClientRect() ?? null,
    [anchorRef],
  )

  const addEntry = {
    id: ADD_PROJECT,
    label: ADD_LABEL,
    icon: <IconPlusOutlineRegular size={16} />,
  }
  const items = plan.pinAdd
    ? plan.rows.map((row) => ({
        id: row.id,
        label: row.name,
        icon: <IconFolderCloseRegular size={16} />,
      }))
    : [addEntry]

  return (
    <>
      <Menu
        open={open && !plan.addIsTheOnlyEntry}
        anchor={null}
        items={items}
        selectedId={selectedRow?.id}
        onSelect={onSelect}
        onClose={onClose}
        portal
        side="bottom"
        getAnchorRect={getAnchorRect}
        footer={plan.pinAdd ? [addEntry] : undefined}
        listClassName="dswf-hero-picker-list"
      />
      {/* worktree 第二 select（hero 双 select 右档——非 git / 未选中项目零注入整体退回
          现状）。点选 = 纯选中态 + 点选时点跨分支确认（1.19）+ ensureWorkspace →
          openWorkspace 显式传参官方链（WYSIWYG——显示 = 实际生效状态）；openWorkspace
          官方面经注册面 inject 递达（官方宿主可达），窗口锚回退（壳宿主双保险）。 */}
      <ForgeHeroWorktreeMount
        projectRoot={selectedProjectRoot}
        makeRpc={makeRpc}
        openWorkspace={injectedOpenWorkspace ?? openWorkspaceFace()}
      />
    </>
  )
}
