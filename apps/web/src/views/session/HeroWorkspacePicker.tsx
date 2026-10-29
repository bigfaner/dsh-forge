// hero 工作区选择/切换控件影子（fix-24 ①；定位：业务装配——官方 conversation.hero.workspace
// 槽位 single 影子占用者，priority -100 lowest renders 取代官方 WorkspacePicker 弹层）。
// 语义改列「项目」（初版「选择器过滤未绑定工作区」的超集——行源从 dsh 账本换 forge 项目）：
//   - 弹层行 = forge 项目（forge:projects/list → name + 官方文件夹图标；archived 排除）——
//     未绑定项目的工作区天然不出现；
//   - 选中/切换零改契约：owner selectedId(workspaceId) → 高亮命中项目行；onPick(project.
//     workspaceId) → 官方 selectWorkspace 链原样（hero-picker-model 映射面）；
//   - 「添加项目…」→ openAddProjectFlow()（UF-3 产品注册流：OS 选取 → 表单 → 注册 → 绑定，
//     与 hero CTA/左栏「＋」同径）；空项目集 = 添加唯一入口，弹层直达产品注册流
//     （官方 addIsTheOnlyEntry 自动开目录流语义对齐，client.js:1935-1943）；
//   - 官方件复用零自绘：Menu（anchor/portal/footer/selectedId）primitive；项目行文件夹图标
//     与添加行 ＋ 图标均官方件（官方 WorkspacePickFlow 行语言同型）；
//   - chip（触发器）不在本面：官方 owner 侧渲染，文案经 workspace.title 对齐项目名达成
//     （core 注册链 workspaces.rename——fix-24 ②），非影子替换。
// 子洞链（fix-14/16 原生选取）不受影：官方 WorkspacePicker 登记行恒在（影子只取渲染位，
// ui-slots single 槽 lowest-renders 语义），其 children 声明持续供养
// conversation.hero.workspace.directoryFlow 子洞——本影子行不重声明 children（ui-slots
// register 对已声明子槽重声明即 throw，fix-23 runtime 实证），产品添加径亦不经该子洞。
// W3 arm 退役（session-binding-guarantee）：挂靠编排缝（createWorktreeOrchestrator）与
// 1.25 失败 Toast 文案族退役——会话创建唯一时机 = 官方 create 调用点（wrap 改道预铸，
// create 失败走官方 createFailed toast），本面只剩项目弹层 + hero worktree chip 挂载。
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { IconFolderCloseRegular, IconPlusOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { openAddProjectFlow } from '../../flows/add-project/flow-open.js'
import { useAnchoredProjects } from '../../workbench/anchored-projects.js'
import { preloadRpcClientFactory, type ForgeRpcClient } from '../../rpc/client.js'
import {
  heroDefaultPickId,
  heroDefaultPickReady,
  heroPickerPlan,
  selectedProjectOf,
  selectedProjectRootOf,
} from './hero-picker-model.js'
import { ForgeHeroWorktreeMount } from './WorktreeFaces.js'
import type { KitSelectorHook } from './ConversationViews.js'

/** 「添加项目…」行 id（菜单内保留字——项目行 id 恒为 dsh workspace uuid，无碰撞面） */
const ADD_PROJECT = 'dswf-add-project'
/** 添加行文案（产品口径——与 hero CTA/左栏「＋」入口同义词面） */
const ADD_LABEL = '添加项目…'

/** owner share 契约（官方 ConversationContent renderSlot('conversation.hero.workspace', …)
 * 面包——ui-conversation client.js:16268-16281 结构同型镜像）+ root 作用域标准观察钩子 */
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
  /** workspace 归属观察钩子（root 作用域标准 prop——项目重拉锚，外部注册后快照身份变化） */
  readonly useWorkspaces?: KitSelectorHook
  /** RPC 构造器（测试替身注入；缺省 preload 真身） */
  readonly makeRpc?: () => ForgeRpcClient
}

/**
 * conversation.hero.workspace 影子占用者：项目行弹层 + 「添加项目…」入口 + 空集直达。
 * data 锚：弹层卡 = .dswf-hero-picker-list（Menu listClassName——portal 面唯一可达样式钩，
 * e2e/走查锚）；数据面经 hero-picker-model 纯函数（单测覆盖行集/映射/空集口径）。
 */
export function ForgeHeroWorkspacePicker({
  open,
  anchorRef,
  selectedId,
  onPick,
  onClose,
  useWorkspaces,
  makeRpc = preloadRpcClientFactory,
}: ForgeHeroWorkspacePickerProps): ReactNode {
  // 项目源（RPC）+ 重拉锚（workspace 归属快照身份——注册/删除 workspace 即触发，与左栏
  // 同锚口径；useAnchoredProjects 共享 hook，fix-36 收敛）。workspaces 快照同时是默认
  // 拾取的官方基线在场门数据源（bug d353536f）。
  const { projects: projectsState, workspaces: workspacesSnap, silentRefresh, anchor: workspacesAnchor } =
    useAnchoredProjects(useWorkspaces)

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

  // worktree 第二 chip 数据锚：选中项目的 ws_path（纯函数 selectedProjectRootOf——bug 10833861
  // 修正在 model 层：workspaceId 回查 + fallback 只取活跃行；bug 8a316608：树 ws 选中态
  // 按官方快照 path 归属活跃项目根——不回落首个活跃项目）。
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
      {workspacesAnchor}
      {/* worktree 第二 chip（难点 A 落法③产品自增行——影子渲染面就地并列，原型「chip 行
          两 chip」构图；非 git / 未选中项目零注入整体退回现状）。点选 = 纯选中态 +
          点选时点跨分支确认（1.19）；点选即换绑编排已退役（bug 82e92933）——会话创建
          = 官方 create 调用点，选树零 forge 建会话 RPC。 */}
      <ForgeHeroWorktreeMount projectRoot={selectedProjectRoot} makeRpc={makeRpc} />
    </>
  )
}
