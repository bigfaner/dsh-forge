// 左栏工作区面板（定位：业务——UF-1：槽位路线 A 替换官方 sidebar 壳 sidebar.workspaces 洞位的
// 产品面板本体）。纯展示件：数据进（tree/loading/current）、回调出（导航/变更动作），装配缝 =
// ForgeSidebarSlot（洞位注册真身，plugin 经产品视图发布面引用）。
// 形态纪律（Hard Rule 官方件复用）：项目节点 = 官方 DisclosureRow（fix-42：expandOnRowClick
// 官方开关 = 整行 treeitem 翻转语义 + previewChevron 缺省 hover folder↔chevron 互换——fix-41
// 先行修复面收编）；状态点 = 官方 StateDot；悬停提示 = title 面；头部图标钮 = 官方 Button
// （ghost/sm——侧栏行语言透明底 + 仅 hover 底，fix-13：toolbar 变体常驻底色误用退役）+
// 官方图标件（fix-17：＋钮 = 官方 IconProjectAddOutlineRegular 文件夹+加号件——原生 dsh
// 同款）；过滤输入 = 官方 Input；视图选项弹层/行尾 ellipsis 菜单 = 官方 Menu；改名模态 =
// 官方 Modal（母本 rename 同型，AddProjectFlow Modal 壳惯例）；行语言（projectRow 高 34 /
// sessionRow 高 32、hover interactive-bg、radius md、行尾 hover 动作）对齐官方 ui-workspace
// Rows 刻度，本文件零平行发明。fix-42：段头内嵌搜索槽（官方 searchSlot 形态——展开即占位、
// label/头部动作让位）+ 视图菜单实装（groupBy 二值 + archivedFilter 三态——orderBy/树嵌套
// 不做出现在菜单）+ rail 态项目 folder 图标列（收起态可用性）。
// D41（2026-10-10 用户裁决——默认可见性两规则）：①归档项目缺省隐藏
// （SIDEBAR_VIEW_DEFAULT.archivedFilter = 'hide'——三态菜单可切回）；②会话 24h 窗口
// （sidebarSessionVisibility 纯切分 + 项目块内「更早（N）」可展开折叠组——本地微观态
// 不持久化；搜索在场折叠让位；flat/rail 投影不消费）。
// D42（2026-10-10 用户追加裁决——会话行悬浮动作钮对齐 dsh）：行尾 hover 动作组 =
// 官方 ui-sidebar fading 等价机制（opacity:0 + hover 显 + 官方 .15s 过渡）+
// ui-sidebar iconButton 刻度（28/radius-sm/hover interactive-bg-hover）；时间标签让位
// （官方 :hover .time 同判，透明度承载）。
// D45（2026-10-10 用户再追加裁决——三钮对齐 dsh）：悬浮行尾三钮依次 = ⋯ 菜单 / 归档会话 /
// 置顶会话（官方 archive[100]/pin[200] 位序）；⋯ 菜单含其它更多功能项（置顶/重命名/分叉/
// 归档——官方 session menu 四项序）；置顶行静止图钉标记 + 项目块内领先 + 24h 折叠让位；
// 归档随三态过滤进退 + 运行中归档拒绝 → 「停止并归档」确认模态；会话改名模态（官方
// RenameSession 同型）。动作面 = 官方 uiWorkspace/sessions 窄面（plugin inject face
// 注入——缺席 = 对应项不呈现，P1 口径沿袭）。
// D45-②（同日再追加裁决——浮现机制）：「按钮浮现在会话上方，不挤占会话的行空间」——
// 动作组绝对定位浮现 overlay（零布局占位）+ 背板 = 行悬浮合成色（surface + tint 双层，
// 遮文字穿透且与行面无缝；几何/背板机制归 sidebar.css D42/D45-② 块）。
// 收起/展开（56px rail ↔ ~240px）由官方壳几何持有——本面板按 owner share 的 wide 双态渲染；
// rail 展开回路 = expandSidebar 壳回调消费（fix-41 B 面：图标/搜索钮点击先展开侧栏）。
// 分层（fix-6，WorkbenchZones→WorkbenchPanel 同型）：ForgeWorkspacePanel = 过滤/视图/改名
// 态机持有者；SidebarProjectsZone = 受控展示件（过滤/视图应用/相位正交的静态可测面）；
// SidebarRail = 收起态受控展示件（图标列——fix-42 抽出同型受控缝）。
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Button,
  DisclosureRow,
  IconArchiveCheckOutlineRegular,
  IconArchiveOffOutlineRegular,
  IconArchiveOutlineRegular,
  IconBranchOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronRightOutlineRegular,
  IconEditOutlineRegular,
  IconEllipsisOutlineRegular,
  IconFlatListOutlineRegular,
  IconFolderCloseRegular,
  IconFolderOpenRegular,
  IconNewChatOutlineRegular,
  IconPinFillRegular,
  IconPinOutlineRegular,
  IconProjectAddOutlineRegular,
  IconQueueOutlineRegular,
  IconSearchOutlineRegular,
  IconSlidersTwoOutlineRegular,
  IconUnarchiveOutlineRegular,
  Input,
  Menu,
  Modal,
  StateDot,
  Tooltip,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState, ErrorBar, SkeletonRows } from '../../components/index.js'
import {
  SIDEBAR_VIEW_DEFAULT,
  relativeTimeLabel,
  sessionDotState,
  sessionLoopAriaLabel,
  shouldCollapseFilterOnBlur,
  sidebarArchivedFilterOf,
  sidebarFilterOf,
  sidebarFlatFilterOf,
  sidebarFlatRowsOf,
  sidebarSectionLabelOf,
  sidebarSessionVisibility,
  sidebarViewOfPick,
  type SessionLoopBadge,
  type SidebarFlatRow,
  type SidebarProjectNode,
  type SidebarSessionRow,
  type SidebarSessionSplit,
  type SidebarView,
} from './sidebar-model.js'
import { sessionArchiveActiveRefusal } from './sidebar-actions.js'
import './sidebar.css'

/** 会话加载骨架行数（行级骨架相位——账本 pending） */
const SKELETON_ROWS = 3

export interface ForgeWorkspacePanelProps {
  /** 壳折叠态（sidebar.workspaces owner share：true = 宽面板，false = 56px rail 图标列） */
  readonly wide: boolean
  /** rail 图标请求展开（壳回调——fix-42 消费：rail 搜索/项目图标点击先展开侧栏，fix-41 B 面） */
  readonly expandSidebar: () => void
  /** 项目树（buildSidebarTree 派生；含每项目会话行） */
  readonly tree: readonly SidebarProjectNode[]
  /** 账本未就绪（行级骨架） */
  readonly loading: boolean
  /** 当前会话 id（行高亮依据；null = 未选） */
  readonly currentSessionId: string | null
  /** 项目列表就绪（false = RPC 在途——骨架相位，防空态闪现） */
  readonly projectsPending: boolean
  /** 是否有项目（就绪且非空；空态判据 = 首用引导指向 hero UF-2） */
  readonly hasProjects: boolean
  /** 项目列表加载失败文案（在场 = 错误条相位） */
  readonly projectsError?: string
  /** 「＋」添加项目入口（UF-3 流程打开缝——槽位层绑定 openAddProjectFlow；缺席 = 不呈现） */
  readonly onAddProject?: () => void
  /** 会话行回调（打开会话 + select-session——AC5） */
  readonly onSessionActivate?: (sessionId: string) => void
  /** 项目列表重试（错误条相位） */
  readonly onRetryProjects?: () => void
  /** 项目行尾「新会话」钮（官方 startSession(workspaceId)——fix-42；缺席 = 钮不呈现） */
  readonly onStartSession?: (workspaceId: string) => void
  /** 项目改名（forge:projects/update name patch——改名模态确认面；缺席 = 菜单项不呈现） */
  readonly onRenameProject?: (projectId: string, name: string) => Promise<void>
  /** 归档切换（forge:projects/update archived patch——ellipsis 菜单直发；缺席 = 菜单项不呈现） */
  readonly onArchiveToggle?: (projectId: string, archived: boolean) => void
  /** 置顶/取消置顶（官方 uiWorkspace.pinSession/unpinSession——D45；缺席 = 钮/菜单项不呈现） */
  readonly onSessionPinToggle?: (sessionId: string, pinned: boolean) => void
  /**
   * 归档会话（官方 uiWorkspace.archiveSession——D45；缺席 = 归档钮/菜单项不呈现）。
   * 运行中会话被宿主拒 → 拒绝上抛（面板「停止并归档」确认模态消费）。
   */
  readonly onSessionArchive?: (
    sessionId: string,
    options?: { readonly stopActivity?: boolean },
  ) => Promise<void>
  /** 取消归档（官方 uiWorkspace.unarchiveSession——D45；缺席 = 归档行对应面不呈现） */
  readonly onSessionUnarchive?: (sessionId: string) => void
  /** 会话改名（sessions.using → binding.session.rename——D45；缺席 = 改名菜单项不呈现） */
  readonly onSessionRename?: (sessionId: string, title: string) => Promise<void>
  /** 分叉会话（官方 uiWorkspace.forkSession——D45；缺席 = 分叉菜单项不呈现） */
  readonly onSessionFork?: (sessionId: string) => void
  /** 相对时间基准（注入——纯渲染可测） */
  readonly now: number
}

/** 会话行归档请求载荷（面板确认流消费——标题随行供「停止并归档」模态命名） */
export interface SessionArchiveRequestRow {
  readonly sessionId: string
  readonly title: string
}

/**
 * 会话行「⋯」菜单项（D45——官方 ui-workspace session menu items 同型裁剪：置顶[100] +
 * 重命名[200] + 分叉[300] + 归档[400]，官方序）。纯数据面（MenuEntry）——静态可测；
 * 变更面缺席（available 对应位 false）= 对应项不出现（P1 无置灰形态）；归档行恒无置顶项
 * （官方 Pin/Archive 互斥判读同款）。
 */
export function sessionMenuItemsOf(
  row: Pick<SidebarSessionRow, 'pinned' | 'archived'>,
  available: {
    readonly pin: boolean
    readonly rename: boolean
    readonly fork: boolean
    readonly archive: boolean
    readonly unarchive: boolean
  },
): readonly MenuEntry[] {
  const items: MenuEntry[] = []
  if (available.pin && !row.archived) {
    items.push({
      id: 'pin',
      label: row.pinned ? '取消置顶' : '置顶会话',
      icon: row.pinned ? <IconPinFillRegular size={16} /> : <IconPinOutlineRegular size={16} />,
    })
  }
  if (available.rename) {
    items.push({ id: 'rename', label: '重命名', icon: <IconEditOutlineRegular size={16} /> })
  }
  if (available.fork) {
    items.push({ id: 'fork', label: '分叉会话', icon: <IconBranchOutlineRegular size={16} /> })
  }
  if (row.archived ? available.unarchive : available.archive) {
    items.push({
      id: 'archive',
      label: row.archived ? '取消归档' : '归档会话',
      icon: row.archived ? (
        <IconUnarchiveOutlineRegular size={16} />
      ) : (
        <IconArchiveOutlineRegular size={16} />
      ),
    })
  }
  return items
}

/** 会话行动作回调组（D45——逐位缺席 = 对应钮/菜单项不呈现，纯展示件零缺省动作） */
interface SessionRowActions {
  /** 置顶切换（hover 置顶钮 + 菜单项；归档行缺席——官方互斥） */
  readonly onPinToggle?: (sessionId: string, pinned: boolean) => void
  /** 归档会话（非归档行——面板确认流持有：运行中拒绝 → 停止并归档模态） */
  readonly onArchive?: (row: SessionArchiveRequestRow) => void
  /** 取消归档（归档行） */
  readonly onUnarchive?: (sessionId: string) => void
  /** 分叉会话（菜单项直发） */
  readonly onFork?: (sessionId: string) => void
  /** 重命名请求（菜单项 → 面板改名模态） */
  readonly onRequestRename?: (sessionId: string, currentTitle: string) => void
}

/**
 * 派发循环行左缘标记（S7 改版·R2·决策 #30——run-tasks-host-command 1.8 文字徽标退役）。
 * 兜底面记账（proposal S7「上游 sidebar 徽标缝任务内核实」）：上游缝存在但本产品
 * 不可挂接——① `sidebar.session.row.leading` 座契约明文只在行主状态 idle 时挂载
 * （dsh-client-ui-workspace slots.d.ts：「never renders beside a status dot」），循环
 * 运行中会话恰是 live-activity 态（running 点占位）——徽标要出现的时刻正是该座被
 * 撤换的时刻；hover 座仅悬浮卡打开时挂载。② 决定性：本产品 sidebar.workspaces 洞位
 * 由 ForgeSidebarSlot 以 priority -100 影子占用（plugin.ts 2.7 槽位路线 A），官方
 * WorkspaceBrowser 及其两座在本产品不挂载。故循环状态落产品自有会话行（本组件），
 * 数据经账本行 projectionValues['forge-dispatch-loop'] 窄读（sidebar-model
 * sessionLoopBadge——零新增 RPC、零新增记录）。
 * R2 形态（预览工件 walkthrough/loop-visual-marker-preview-v2.html 变体 R2 为准绳）：
 * 行左缘 2-3px 标记即循环状态——running = 蓝色连续流光（CSS-only 渐变
 * background-position 动画，sidebar.css dswf-loop-flowdown）；starting/stopping =
 * 琥珀静态左缘；非活循环族 = 零标记（sessionLoopBadge 派生同 1.8 语义）。扫视层归
 * 图形，语义层退至 hover/aria——行 aria-label 承载「任务源 slug + 状态词」
 * （sessionLoopAriaLabel；D30 零原生 title 纪律延续）。离开 running 后左缘 2s 渐隐
 * （fading 态——CSS 动画 opacity 收敛后卸载；reduced-motion 降级全静态）。
 */
function SessionLoopEdgeFade({
  status,
  onDone,
}: {
  status: SessionLoopBadge['status']
  onDone: () => void
}): ReactNode {
  return (
    <span
      className="dswf-sidebar-session-loopedge"
      data-dswf-session-loop-fading={status}
      aria-hidden="true"
      onAnimationEnd={onDone}
    />
  )
}

/**
 * 会话行（dsh 行语言：状态点 + 标题 + 相对时间；官方 sessionRow 同型刻度）。
 * D42（2026-10-10 用户裁决：「鼠标悬浮到项目列表的某一个会话时，显示相关的按钮，对齐 dsh」）
 * 行尾 hover 动作组：显隐 = 官方 ui-sidebar fading 等价机制（opacity:0 + hover/focus-within
 * 显 + opacity 0.15s var(--ds-ease-in-out) 官方过渡——dsh-client-ui-sidebar lib/client.js
 * `.fading>*` 源码同款；pointer-events 隐形守卫）+ 官方 ui-sidebar iconButton 刻度
 * （28 命中区 / radius-sm / label-secondary / hover interactive-bg-hover）。样式面 =
 * sidebar.css D42 块（机械 pin 在 tests/structure）。
 * D45-②（2026-10-10 用户再追加裁决：「按钮浮现在会话上方，不挤占会话的行空间」）：
 * 动作组绝对定位浮现 overlay（sidebar.css position:absolute——脱离行布局流零占位：
 * 标题可用宽度恒定，非悬浮/悬浮态行内空间不因动作组变化；官方 rowActions display:none
 * 起手的零占位语义同源）；背板 = 行悬浮合成色（--dsw-specific-sidebar-fill 表面 +
 * interactive-bg-hover tint 双层叠加——遮蔽标题/时间文字穿透且与行面无缝）。
 * D45（2026-10-10 用户追加裁决——三钮对齐 dsh）：悬浮行尾三钮依次 = ⋯ 菜单 / 归档会话 /
 * 置顶会话（官方 session row.action 位序：archive[100] 在前、pin[200] 最右——置顶钮落
 * 静止位图钉标记位）；「打开会话」钮退役（行点击 = 打开既有单缝）。动作集逐位记账
 * （官方 ui-workspace session-actions 对照）：
 *  ① ⋯ 菜单 = sessionMenuItemsOf（置顶/重命名/分叉/归档——官方四项序；面缺席 = 项缺席）；
 *  ② 归档钮：归档行转「取消归档」形（IconUnarchive + 取消归档名）；运行中会话归档被宿主
 *     拒 → 面板「停止并归档」确认模态（官方 SessionArchiveConfirmDialog 同型裁剪）；
 *  ③ 置顶钮：置顶形 = IconPinFill/取消置顶；归档行缺席（官方 Pin/Archive 互斥）；
 *  ④ 置顶静止标记：置顶行行尾常显 IconPinFill 小标（官方 rest-state pin marker 同位——
 *     hover 三钮显形时让位）。
 * 归档行语言（官方同判）：前导状态点槽空白（live 状态不占格）+ 行弱化（CSS data-archived）；
 * 行点击不打开（官方 archived not openable——P1 无通知面，静默不外溢）。
 * 时间标签共存布局（官方对照优先 = 让位）：官方 `.sessionRow:hover .time{display:none}`
 * 同判——fading 等价改透明度让位（占位保留零抖动），非悬浮时间常驻（overlay 背板遮蔽
 * 承接悬浮态）。
 * 行本体 = div[role=button]（官方 DisclosureRow 行同型——原生 button 不可嵌套动作钮）；
 * Enter/Space 激活 = 官方 toggleFromKeyboard 同语义；动作容器 click/keydown
 * stopPropagation（防冒泡双触发——官方 rowActions onClick stopPropagation 同型）。
 */
function SessionRow({
  row,
  selected,
  now,
  onActivate,
  actions,
}: {
  row: Pick<SidebarSessionRow, 'sessionId' | 'title' | 'status' | 'updatedAt' | 'pinned' | 'archived' | 'loop'>
  selected: boolean
  now: number
  onActivate?: (sessionId: string) => void
  actions?: SessionRowActions
}): ReactNode {
  const [menuOpen, setMenuOpen] = useState(false)
  // S7 R2：循环离场渐隐态（running 离开活循环族 → 左缘 ≤2s 渐隐后归普通行；本地
  // 微观态不持久化——上一次循环状态记翻转判据；stopping 直接退场零渐隐=琥珀静态缘
  // 本就无动效语义）
  const [fadeStatus, setFadeStatus] = useState<SessionLoopBadge['status'] | null>(null)
  const prevLoopRef = useRef(row.loop)
  useEffect(() => {
    const prev = prevLoopRef.current
    prevLoopRef.current = row.loop
    if (prev !== undefined && row.loop === undefined && prev.status !== 'stopping') {
      setFadeStatus(prev.status)
    }
  }, [row.loop])
  const loop = row.loop
  const interactive = onActivate !== undefined
  // D45 动作可用性逐位（回调缺席 = 钮/项缺席——P1 纯展示件零缺省动作）
  const pinAvailable = actions?.onPinToggle !== undefined && !row.archived
  const archiveAvailable =
    actions !== undefined && (row.archived ? actions.onUnarchive !== undefined : actions.onArchive !== undefined)
  const menuItems = sessionMenuItemsOf(row, {
    pin: pinAvailable,
    rename: actions?.onRequestRename !== undefined,
    fork: actions?.onFork !== undefined,
    archive: actions?.onArchive !== undefined,
    unarchive: actions?.onUnarchive !== undefined,
  })
  const hasMenu = menuItems.length > 0
  const hasActions = pinAvailable || archiveAvailable || hasMenu
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      className="dswf-sidebar-session"
      data-dswf-session={row.sessionId}
      data-selected={selected || undefined}
      data-pinned={row.pinned || undefined}
      data-archived={row.archived || undefined}
      // S7 R2：循环状态锚随行（活循环族在场 = 左缘标记；锚 + slug 随行供测试/语义面）
      data-dswf-session-loop={loop?.status}
      {...(loop?.slug !== undefined && loop.slug !== null
        ? { 'data-dswf-session-loop-slug': loop.slug }
        : {})}
      aria-label={loop !== undefined ? sessionLoopAriaLabel(loop) : undefined}
      onClick={
        onActivate === undefined
          ? undefined
          : () => {
              // 归档行不打开（官方 archived not openable——P1 静默）
              if (row.archived) return
              onActivate(row.sessionId)
            }
      }
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                if (row.archived) return
                onActivate(row.sessionId)
              }
            }
          : undefined
      }
    >
      {/* S7 R2 左缘循环标记（绝对定位行左缘——running 流光/琥珀静态；离场渐隐态
          由 fading 锚承载，onAnimationEnd 卸载归普通行；reduced-motion 全静态降级） */}
      {loop !== undefined ? (
        <span
          className="dswf-sidebar-session-loopedge"
          data-dswf-session-loop-edge={loop.status}
          aria-hidden="true"
        />
      ) : fadeStatus !== null ? (
        <SessionLoopEdgeFade status={fadeStatus} onDone={() => setFadeStatus(null)} />
      ) : null}
      <span className="dswf-sidebar-session-dot">
        {/* 归档行前导槽空白（官方 archived row keeps the cell blank 同判） */}
        {row.archived ? null : <StateDot state={sessionDotState(row.status)} size={10} />}
      </span>
      <span className="dswf-sidebar-session-title">{row.title}</span>
      <span className="dswf-sidebar-session-time">{relativeTimeLabel(row.updatedAt, now)}</span>
      {hasActions ? (
        // D42/D45 行尾 hover 动作组（机制与记账见组件文档块；容器 stopPropagation 防双触发）
        <span
          className="dswf-sidebar-session-actions"
          data-dswf-session-actions=""
          onClick={(event) => {
            event.stopPropagation()
          }}
          onKeyDown={(event) => {
            event.stopPropagation()
          }}
        >
          {hasMenu ? (
            <Menu
              open={menuOpen}
              onClose={() => {
                setMenuOpen(false)
              }}
              items={menuItems}
              onSelect={(id) => {
                setMenuOpen(false)
                if (id === 'pin') actions?.onPinToggle?.(row.sessionId, !row.pinned)
                else if (id === 'rename') actions?.onRequestRename?.(row.sessionId, row.title)
                else if (id === 'fork') actions?.onFork?.(row.sessionId)
                else if (id === 'archive') {
                  if (row.archived) actions?.onUnarchive?.(row.sessionId)
                  else actions?.onArchive?.({ sessionId: row.sessionId, title: row.title })
                }
              }}
              portal
              closeOnPointerLeave
              anchor={
                <button
                  type="button"
                  className="dswf-sidebar-session-action"
                  data-dswf-session-action="menu"
                  aria-label={`会话操作 ${row.title}`}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => {
                    setMenuOpen(true)
                  }}
                >
                  <IconEllipsisOutlineRegular size={16} />
                </button>
              }
            />
          ) : null}
          {archiveAvailable ? (
            <button
              type="button"
              className="dswf-sidebar-session-action"
              data-dswf-session-action="archive"
              aria-label={row.archived ? `取消归档 ${row.title}` : `归档会话 ${row.title}`}
              onClick={() => {
                if (row.archived) actions?.onUnarchive?.(row.sessionId)
                else actions?.onArchive?.({ sessionId: row.sessionId, title: row.title })
              }}
            >
              {row.archived ? <IconUnarchiveOutlineRegular size={16} /> : <IconArchiveOutlineRegular size={16} />}
            </button>
          ) : null}
          {pinAvailable ? (
            <button
              type="button"
              className="dswf-sidebar-session-action"
              data-dswf-session-action="pin"
              aria-label={row.pinned ? `取消置顶 ${row.title}` : `置顶会话 ${row.title}`}
              onClick={() => {
                actions?.onPinToggle?.(row.sessionId, !row.pinned)
              }}
            >
              {row.pinned ? <IconPinFillRegular size={16} /> : <IconPinOutlineRegular size={16} />}
            </button>
          ) : null}
        </span>
      ) : null}
      {/* D45 置顶静止标记（官方 rest-state pin marker 同位：行尾常显小图钉——非悬浮
          即可辨置顶态；hover/聚焦三钮显形时 CSS 让位，DOM 序在动作组之后 = 让位选择器可及） */}
      {row.pinned ? (
        <span className="dswf-sidebar-session-pinmark" data-dswf-session-pinmark="">
          <IconPinFillRegular size={12} />
        </span>
      ) : null}
    </div>
  )
}

/**
 * 项目行 ellipsis 菜单项（fix-42——官方 ownRow workspaceMenuItems 同型裁剪：改名 + 归档
 * 切换；删除归 fix-27 补偿语义后续里程碑）。纯数据面（MenuEntry）——静态可测；
 * 变更面缺席（回调未注入）= 对应项不出现（P1 无置灰形态）。
 */
export function projectMenuItemsOf(
  node: Pick<SidebarProjectNode, 'archived'>,
  renameAvailable: boolean,
  archiveAvailable: boolean,
): readonly MenuEntry[] {
  const items: MenuEntry[] = []
  if (renameAvailable) {
    items.push({ id: 'rename', label: '改名', icon: <IconEditOutlineRegular size={16} /> })
  }
  if (archiveAvailable) {
    items.push({
      id: 'archive',
      label: node.archived ? '取消归档' : '归档项目',
      icon: node.archived ? (
        <IconUnarchiveOutlineRegular size={16} />
      ) : (
        <IconArchiveOutlineRegular size={16} />
      ),
    })
  }
  return items
}

/** 一个项目块：官方 DisclosureRow 节点（expandOnRowClick 整行翻转 + hover 图标互换）+
 * 会话行列表 + 行尾 hover 动作（新会话钮 / ellipsis 菜单——官方 rowActions 同型；
 * 空会话行内占位——文案随过滤态切换：无过滤「暂无会话」/ 过滤中「无匹配会话」）。
 * D41-②：会话行按 24h 窗口切分（sidebarSessionVisibility）——窗口内默认可见，窗口外
 * 折叠进「更早（N）」可展开组（展开态 = 本地微观态不持久化，fix-42 P1 口径沿袭——
 * 切面板回默认折叠）；搜索在场折叠让位（命中行全展示，折叠组不渲染）。 */
function ProjectBlock({
  node,
  expanded,
  onToggle,
  currentSessionId,
  now,
  searchActive,
  onSessionActivate,
  onStartSession,
  onArchiveToggle,
  onRequestRename,
  sessionActions,
  emptyNote,
}: {
  node: SidebarProjectNode
  expanded: boolean
  onToggle: () => void
  currentSessionId: string | null
  now: number
  /** 搜索在场（D41-②：query 非空 = 折叠让位——命中行全展示） */
  searchActive: boolean
  onSessionActivate?: (sessionId: string) => void
  onStartSession?: (workspaceId: string) => void
  onArchiveToggle?: (projectId: string, archived: boolean) => void
  onRequestRename?: (projectId: string, currentName: string) => void
  /** D45 会话行动作组（逐位缺席 = 对应钮/菜单项不呈现） */
  sessionActions?: SessionRowActions
  readonly emptyNote: string
}): ReactNode {
  const [menuOpen, setMenuOpen] = useState(false)
  // 「更早（N）」展开态（本地微观态——不持久化；随块挂载缺省收起）
  const [olderOpen, setOlderOpen] = useState(false)
  // D41-② 会话 24h 窗口切分（搜索在场折叠让位——全量行即窗口内语义）
  const split: SidebarSessionSplit = searchActive
    ? { recent: node.sessions, older: [] }
    : sidebarSessionVisibility(node.sessions, now)
  const active = node.sessions.some((row) => row.sessionId === currentSessionId)
  const menuItems = projectMenuItemsOf(
    node,
    onRequestRename !== undefined,
    onArchiveToggle !== undefined,
  )
  const hasMenu = menuItems.length > 0
  const actionsAvailable = hasMenu || onStartSession !== undefined
  return (
    // M3.1 D3 + D30：项目行仅名称一行，canonicalPath（wsPath）转官方 Tooltip 悬停提示
    // （显式偏离官方 Rows meta 常驻次行——用户裁决 R16；portal 逃逸侧栏滚动容器）
    <Tooltip label={node.wsPath} portal>
      <div
        className="dswf-sidebar-project"
        data-dswf-project={node.projectId}
        data-archived={node.archived || undefined}
        data-active={active || undefined}
      >
      <DisclosureRow
        icon={
          <span className="dswf-sidebar-project-folder">
            {expanded ? <IconFolderOpenRegular size={16} /> : <IconFolderCloseRegular size={16} />}
          </span>
        }
        title={node.name}
        open={expanded}
        expandable={node.sessions.length > 0}
        onToggle={onToggle}
        expandOnRowClick
        keepContentWhenOpen
        rowClassName="dswf-sidebar-project-row"
        contentClassName="dswf-sidebar-project-content"
        contentLayoutClassName="dswf-sidebar-project-contentlayout"
        titleClassName="dswf-sidebar-project-title"
        collapsedContent={
          actionsAvailable ? (
            // 行尾 hover 动作（官方 rowActions 同型）：行内尾部槽（collapsedContent +
            // keepContentWhenOpen——DisclosureRow 唯一行内尾槽），click stopPropagation
            // 防冒泡行翻转（官方 rowActions onClick stopPropagation 同型）
            <span
              className="dswf-sidebar-project-actions"
              data-menu-open={menuOpen || undefined}
              onClick={(event) => {
                event.stopPropagation()
              }}
            >
              {hasMenu ? (
                <Menu
                  open={menuOpen}
                  onClose={() => {
                    setMenuOpen(false)
                  }}
                  items={menuItems}
                  onSelect={(id) => {
                    setMenuOpen(false)
                    if (id === 'rename') onRequestRename?.(node.projectId, node.name)
                    else if (id === 'archive') onArchiveToggle?.(node.projectId, !node.archived)
                  }}
                  portal
                  closeOnPointerLeave
                  anchor={
                    <button
                      type="button"
                      className="dswf-sidebar-rowaction"
                      data-dswf-project-action="menu"
                      aria-label={`项目操作 ${node.name}`}
                      onClick={() => {
                        setMenuOpen(true)
                      }}
                    >
                      <IconEllipsisOutlineRegular size={16} />
                    </button>
                  }
                />
              ) : null}
              {onStartSession === undefined ? null : (
                <Tooltip label="新会话" portal>
                  <button
                    type="button"
                    className="dswf-sidebar-rowaction"
                    data-dswf-project-action="new-session"
                    aria-label={`在 ${node.name} 新建会话`}
                    onClick={() => {
                      onStartSession(node.workspaceId)
                    }}
                  >
                    <IconNewChatOutlineRegular size={16} />
                  </button>
                </Tooltip>
              )}
            </span>
          ) : null
        }
      >
        <div className="dswf-sidebar-sessions" role="list">
          {split.recent.map((row) => (
            <SessionRow
              key={row.sessionId}
              row={row}
              selected={row.sessionId === currentSessionId}
              now={now}
              onActivate={onSessionActivate}
              actions={sessionActions}
            />
          ))}
          {split.older.length === 0 ? null : (
            <>
              {/* D41-②：「更早（N）」折叠组开关（官方 chevron 件 + 三级行语言——
                aria-expanded = 官方 DisclosureRow 开关同语义；本地微观态不持久化） */}
              <button
                type="button"
                className="dswf-sidebar-older"
                data-dswf-older=""
                aria-expanded={olderOpen}
                aria-label={
                  olderOpen
                    ? `收起更早的 ${split.older.length} 个会话`
                    : `展开更早的 ${split.older.length} 个会话`
                }
                onClick={() => {
                  setOlderOpen((prev) => !prev)
                }}
              >
                <span className="dswf-sidebar-older-chevron">
                  {olderOpen ? (
                    <IconChevronDownOutlineRegular size={12} />
                  ) : (
                    <IconChevronRightOutlineRegular size={12} />
                  )}
                </span>
                <span className="dswf-sidebar-older-label">
                  {olderOpen ? '收起更早' : `更早（${split.older.length}）`}
                </span>
              </button>
              {olderOpen
                ? split.older.map((row) => (
                    <SessionRow
                      key={row.sessionId}
                      row={row}
                      selected={row.sessionId === currentSessionId}
                      now={now}
                      onActivate={onSessionActivate}
                      actions={sessionActions}
                    />
                  ))
                : null}
            </>
          )}
        </div>
      </DisclosureRow>
      {node.sessions.length === 0 ? <div className="dswf-sidebar-no-session">{emptyNote}</div> : null}
      </div>
    </Tooltip>
  )
}

/** 行级骨架（账本 pending 相位——UF-1 States「会话加载中」；共享件注入 sidebar 域锚） */
function PanelSkeleton(): ReactNode {
  return (
    <SkeletonRows
      className="dswf-sidebar-skeleton"
      rowClassName="dswf-sidebar-skeleton-row"
      rows={SKELETON_ROWS}
      anchor="data-dswf-sidebar-skeleton"
    />
  )
}

/** 过滤行（fix-6：官方 Input 受控件——前导检索图标；占位/aria 文案对齐原型 sb-searchrow；
 * Esc 收起并清空 = 原型 S.pj 交互语义；autoFocus = 展开即聚焦，原型 toggle 后 focus 同型；
 * fix-22：blur 移出自动收起（走查人规格演进——超原型），与 Esc 同缝 onCollapse；
 * fix-42：迁段头内嵌槽（官方 searchSlot 形态）——锚 data-dswf-searchrow 保持不变 */
export interface SidebarFilterRowProps {
  /** 过滤查询（受控——态机单一来源在面板层） */
  readonly query: string
  /** 查询变更（原样上抛——过滤即时生效经 sidebarFilterOf 纯函数） */
  readonly onQueryChange: (query: string) => void
  /** 收起过滤行（Esc / blur 移出——收起即清空查询，原型语义；blur 头部钮守卫归
   * shouldCollapseFilterOnBlur 纯裁决） */
  readonly onCollapse: () => void
}

/** 过滤行本体（官方 Input——零自绘输入控件；onBlur 经官方 Input 透传到原生 input） */
export function SidebarFilterRow({ query, onQueryChange, onCollapse }: SidebarFilterRowProps): ReactNode {
  return (
    <div className="dswf-sidebar-searchrow" data-dswf-searchrow="">
      <Input
        icon={<IconSearchOutlineRegular size={14} />}
        className="dswf-sidebar-search"
        type="text"
        placeholder="过滤项目名 / 会话标题…"
        aria-label="项目与会话过滤"
        autoFocus
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCollapse()
        }}
        onBlur={(event) => {
          // fix-22：移出即收起（头部钮容器内除外——竞态守卫口径 a，防双翻转重开）
          if (shouldCollapseFilterOnBlur(event.relatedTarget)) onCollapse()
        }}
      />
    </div>
  )
}

/**
 * 视图选项菜单项（fix-42 实装——官方 ViewOptionsMenu 同型裁剪：groupBy 二值（tree/flat）
 * + archivedFilter 三态（default/hide/only）；orderBy/手动换序/工作区树嵌套不做——
 * 菜单项不出现不置灰（P1 裁决）。选中面经 selectedIds=[groupBy, archivedFilter]。
 */
export const SIDEBAR_VIEW_MENU_ITEMS: readonly MenuEntry[] = [
  { type: 'label', id: 'view-group', text: '分组' },
  { id: 'tree', label: '按项目树', icon: <IconFolderCloseRegular size={16} /> },
  { id: 'flat', label: '平铺', icon: <IconFlatListOutlineRegular size={16} /> },
  { type: 'separator', id: 'view-archived-separator' },
  { type: 'label', id: 'view-archived', text: '归档' },
  { id: 'default', label: '默认', icon: <IconQueueOutlineRegular size={16} /> },
  { id: 'hide', label: '不含归档', icon: <IconArchiveOffOutlineRegular size={16} /> },
  { id: 'only', label: '仅归档', icon: <IconArchiveCheckOutlineRegular size={16} /> },
]

/** 项目区受控展示缝（fix-6 抽出——过滤/视图应用/空提示/相位正交的静态可测面；
 * fix-42 增视图态（view/onViewPick）与行动作回调（新会话/改名请求/归档切换）） */
export interface SidebarProjectsZoneProps {
  /** 项目树（buildSidebarTree 派生；含每项目会话行） */
  readonly tree: readonly SidebarProjectNode[]
  /** 账本未就绪（行级骨架） */
  readonly loading: boolean
  /** 当前会话 id（行高亮依据；null = 未选——过滤不改变选中态，锚由本入参持有） */
  readonly currentSessionId: string | null
  /** 项目列表就绪（false = RPC 在途——骨架相位，防空态闪现） */
  readonly projectsPending: boolean
  /** 是否有项目（就绪且非空；空态判据 = 首用引导指向 hero UF-2） */
  readonly hasProjects: boolean
  /** 项目列表加载失败文案（在场 = 错误条相位） */
  readonly projectsError?: string
  /** 「＋」添加项目入口（缺席 = 不呈现；既有锚 data-dswf-nav 不动） */
  readonly onAddProject?: () => void
  /** 会话行回调（打开会话 + select-session） */
  readonly onSessionActivate?: (sessionId: string) => void
  /** 项目列表重试（错误条相位） */
  readonly onRetryProjects?: () => void
  /** 相对时间基准（注入——纯渲染可测） */
  readonly now: number
  /** 过滤行展开态（受控——态机在面板层） */
  readonly searchOpen: boolean
  /** 过滤行展开/收起切换（收起即清空查询——原型语义，由态机持有者执行） */
  readonly onSearchToggle: () => void
  /** 过滤查询（受控——sidebarFilterOf 纯函数即时生效；空串 = 不过滤） */
  readonly query: string
  /** 查询变更（原样上抛） */
  readonly onQueryChange: (query: string) => void
  /** 视图选项菜单开合态（受控） */
  readonly viewMenuOpen: boolean
  /** 视图选项菜单开合切换（官方 Menu onClose/onSelect 同归此缝） */
  readonly onViewMenuOpenChange: (open: boolean) => void
  /** 视图态（受控——groupBy/archivedFilter；态机在面板层） */
  readonly view: SidebarView
  /** 视图菜单项选择（菜单项 id 原样上抛——sidebarViewOfPick 投影归态机持有者） */
  readonly onViewPick: (id: string) => void
  /** 项目行尾「新会话」钮（缺席 = 钮不呈现） */
  readonly onStartSession?: (workspaceId: string) => void
  /** 项目改名请求（ellipsis 菜单 → 面板改名模态；缺席 = 菜单项不呈现） */
  readonly onRequestRename?: (projectId: string, currentName: string) => void
  /** 归档切换（ellipsis 菜单直发；缺席 = 菜单项不呈现） */
  readonly onArchiveToggle?: (projectId: string, archived: boolean) => void
  /** D45 会话行置顶切换（hover 置顶钮 + 菜单项；缺席 = 对应项不呈现） */
  readonly onSessionPinToggle?: (sessionId: string, pinned: boolean) => void
  /** D45 归档会话请求（运行中拒绝 → 面板「停止并归档」确认模态；缺席 = 归档钮不呈现） */
  readonly onSessionArchiveRequest?: (row: SessionArchiveRequestRow) => void
  /** D45 取消归档（归档行归档钮转取消归档形；缺席 = 对应面不呈现） */
  readonly onSessionUnarchive?: (sessionId: string) => void
  /** D45 会话改名请求（菜单项 → 面板改名模态；缺席 = 菜单项不呈现） */
  readonly onRequestSessionRename?: (sessionId: string, currentTitle: string) => void
  /** D45 分叉会话（菜单项直发；缺席 = 菜单项不呈现） */
  readonly onSessionFork?: (sessionId: string) => void
}

/** 相位主体推导输入（phaseBody 消费——SidebarProjectsZone 的相位判据 + 树/平铺快照） */
export interface SidebarZonePhaseInput {
  /** 项目列表加载失败文案（在场 = 错误条相位） */
  readonly projectsError: string | undefined
  /** 账本未就绪（行级骨架相位之一） */
  readonly loading: boolean
  /** 项目列表就绪（false = RPC 在途——骨架相位，防空态闪现） */
  readonly projectsPending: boolean
  /** 是否有项目（就绪且非空；空态判据 = 首用引导指向 hero UF-2） */
  readonly hasProjects: boolean
  /** 过滤激活（与相位正交——仅列表相位消费） */
  readonly filterActive: boolean
  /** 排列（tree = 项目树 / flat = 平铺行） */
  readonly groupBy: 'tree' | 'flat'
  /** 过滤后可见树（tree 态——sidebarArchivedFilterOf ∘ sidebarFilterOf 产物） */
  readonly visibleTree: readonly SidebarProjectNode[]
  /** 过滤后平铺行（flat 态——sidebarFlatRowsOf ∘ sidebarFlatFilterOf 产物） */
  readonly flatRows: readonly SidebarFlatRow[]
  /** 当前会话 id（行高亮依据；null = 未选） */
  readonly currentSessionId: string | null
  /** 相对时间基准（注入——纯渲染可测） */
  readonly now: number
  /** 会话行回调 */
  readonly onSessionActivate?: (sessionId: string) => void
  /** 项目列表重试（错误条相位） */
  readonly onRetryProjects?: () => void
  /** 项目块展开判据（折叠集合读） */
  readonly isExpanded: (projectId: string) => boolean
  /** 项目块折叠切换 */
  readonly onToggleProject: (projectId: string) => void
  /** 项目行尾「新会话」钮 */
  readonly onStartSession?: (workspaceId: string) => void
  /** 项目改名请求 */
  readonly onRequestRename?: (projectId: string, currentName: string) => void
  /** 归档切换 */
  readonly onArchiveToggle?: (projectId: string, archived: boolean) => void
  /** D45 会话行动作组（逐位缺席 = 对应钮/菜单项不呈现） */
  readonly sessionActions?: SessionRowActions
}

/**
 * 相位主体（纯函数，fix-36 早返化——原四层嵌套三元）：项目错误条 > 骨架（账本 pending /
 * 项目 RPC 在途——防空态闪现）> 首用空态（无项目 → 引导指向 hero UF-2）> 列表相位
 * （tree = 项目树 / flat = 平铺行；过滤无结果 = 行内「无匹配项目/会话」提示）。
 * 过滤与相位正交：错误/骨架/首用空态不受查询影响。
 */
export function phaseBody(input: SidebarZonePhaseInput): ReactNode {
  if (input.projectsError !== undefined) {
    return (
      <ErrorBar
        className="dswf-sidebar-error"
        message="项目列表加载失败"
        retryClassName="dswf-sidebar-retry"
        anchor="data-dswf-error"
        onRetry={input.onRetryProjects}
      />
    )
  }
  if (input.loading || input.projectsPending) return <PanelSkeleton />
  if (!input.hasProjects) {
    return (
      <EmptyState
        title="尚未注册项目"
        description="在中间引导页点击「添加项目」，注册你的第一个项目"
      />
    )
  }
  if (input.filterActive && (input.groupBy === 'flat' ? input.flatRows.length === 0 : input.visibleTree.length === 0)) {
    return <div className="dswf-sidebar-filterempty" data-dswf-filterempty>无匹配项目/会话</div>
  }
  if (input.groupBy === 'flat') {
    return (
      <div className="dswf-sidebar-flatlist" data-dswf-flatlist="" role="list">
        {input.flatRows.map((row) => (
          <SessionRow
            key={row.sessionId}
            row={row}
            selected={row.sessionId === input.currentSessionId}
            now={input.now}
            onActivate={input.onSessionActivate}
            actions={input.sessionActions}
          />
        ))}
      </div>
    )
  }
  return input.visibleTree.map((node) => (
    <ProjectBlock
      key={node.projectId}
      node={node}
      expanded={input.isExpanded(node.projectId)}
      onToggle={() => { input.onToggleProject(node.projectId) }}
      currentSessionId={input.currentSessionId}
      now={input.now}
      searchActive={input.filterActive}
      onSessionActivate={input.onSessionActivate}
      onStartSession={input.onStartSession}
      onArchiveToggle={input.onArchiveToggle}
      onRequestRename={input.onRequestRename}
      sessionActions={input.sessionActions}
      emptyNote={input.filterActive ? '无匹配会话' : '暂无会话'}
    />
  ))
}

/**
 * 项目区本体（受控展示件）：头部四件（label + 搜索钮 + 视图选项钮 + ＋；搜索展开 =
 * 官方 searchSlot 形态——label/头部动作让位、过滤行占位）+ 相位主体（phaseBody 纯函数）。
 * 项目块展开态是本件内部纯视图微观态（缺省全展开——与过滤态互不触碰，清过滤即恢复可见）。
 */
export function SidebarProjectsZone({
  tree,
  loading,
  currentSessionId,
  projectsPending,
  hasProjects,
  projectsError,
  onAddProject,
  onSessionActivate,
  onRetryProjects,
  now,
  searchOpen,
  onSearchToggle,
  query,
  onQueryChange,
  viewMenuOpen,
  onViewMenuOpenChange,
  view,
  onViewPick,
  onStartSession,
  onRequestRename,
  onArchiveToggle,
  onSessionPinToggle,
  onSessionArchiveRequest,
  onSessionUnarchive,
  onRequestSessionRename,
  onSessionFork,
}: SidebarProjectsZoneProps): ReactNode {
  // 展开态（折叠集合——缺省全展开，P1 最简；展开态是纯视图态，不属 SC2 副本纪律）
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(() => new Set())
  const isExpanded = (projectId: string): boolean => !collapsedIds.has(projectId)
  const toggleProject = (projectId: string): void => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }
  // 视图投影（纯函数链——数据源不变）：归档过滤 → 排列（tree 过滤 / flat 摊平）。
  // 选中锚 currentSessionId 与过滤/视图正交（PRD UF-1 Validation 同径）。
  const archivedTree = sidebarArchivedFilterOf(view.archivedFilter, tree)
  const treeMode = view.groupBy === 'tree'
  const visibleTree = treeMode ? sidebarFilterOf(query, archivedTree) : archivedTree
  const flatRows = treeMode ? [] : sidebarFlatFilterOf(query, sidebarFlatRowsOf(archivedTree))
  const filterActive = query.trim() !== ''
  return (
    <div className="dswf-sidebar-projects">
      <div className="dswf-sidebar-sectionhead">
        {searchOpen ? (
          // 官方 searchSlot 展开形态：label/头部动作让位，过滤行独占段头（fix-42 方案 4；
          // blur 收起/Esc 语义照旧——SidebarFilterRow 自持，收起即恢复四件）
          <SidebarFilterRow query={query} onQueryChange={onQueryChange} onCollapse={onSearchToggle} />
        ) : (
          <>
            <div className="dswf-sidebar-sectionlabel">{sidebarSectionLabelOf(view)}</div>
            <Tooltip label="搜索（项目名 + 会话标题）" portal>
              <Button
                variant="ghost"
                size="sm"
                className="dswf-sidebar-headbtn"
                data-dswf-search-toggle=""
                aria-label="搜索项目与会话"
                onClick={onSearchToggle}
              >
                <IconSearchOutlineRegular size={14} />
              </Button>
            </Tooltip>
            <Menu
              className="dswf-sidebar-headmenu"
              open={viewMenuOpen}
              onClose={() => {
                onViewMenuOpenChange(false)
              }}
              onSelect={(id) => {
                onViewMenuOpenChange(false)
                onViewPick(id)
              }}
              items={SIDEBAR_VIEW_MENU_ITEMS}
              selectedIds={[view.groupBy, view.archivedFilter]}
              align="end"
              dense
              portal
              anchor={
                <Tooltip label="视图选项（分组 / 归档过滤）" portal>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="dswf-sidebar-headbtn"
                    data-dswf-view-menu=""
                    aria-label="视图选项"
                    aria-haspopup="menu"
                    aria-expanded={viewMenuOpen}
                    onClick={() => {
                      onViewMenuOpenChange(true)
                    }}
                  >
                    <IconSlidersTwoOutlineRegular size={14} />
                  </Button>
                </Tooltip>
              }
            />
            {onAddProject === undefined ? null : (
              <Tooltip label="添加项目" portal>
                <Button
                  variant="ghost"
                  size="sm"
                  className="dswf-sidebar-headbtn"
                  data-dswf-nav="add-project"
                  aria-label="添加项目"
                  onClick={onAddProject}
                >
                  <IconProjectAddOutlineRegular size={16} />
                </Button>
              </Tooltip>
            )}
          </>
        )}
      </div>
      {phaseBody({
        projectsError,
        loading,
        projectsPending,
        hasProjects,
        filterActive,
        groupBy: view.groupBy,
        visibleTree,
        flatRows,
        currentSessionId,
        now,
        onSessionActivate,
        onRetryProjects,
        isExpanded,
        onToggleProject: toggleProject,
        onStartSession,
        onRequestRename,
        onArchiveToggle,
        // D45 会话行动作组（逐位缺席 = 对应钮/菜单项不呈现）
        sessionActions:
          onSessionPinToggle === undefined &&
          onSessionArchiveRequest === undefined &&
          onSessionUnarchive === undefined &&
          onRequestSessionRename === undefined &&
          onSessionFork === undefined
            ? undefined
            : {
                onPinToggle: onSessionPinToggle,
                onArchive: onSessionArchiveRequest,
                onUnarchive: onSessionUnarchive,
                onRequestRename: onRequestSessionRename,
                onFork: onSessionFork,
              },
      })}
    </div>
  )
}

/** rail 态受控展示缝（fix-42——收起态图标列：搜索钮 + 「＋」+ 项目 folder 图标列；
 * 官方 rail 刻度 36px 命中区 / 18px 图标） */
export interface SidebarRailProps {
  /** 项目树（归档过滤随视图态共享——图标列与宽态同口径） */
  readonly tree: readonly SidebarProjectNode[]
  /** 视图态（archivedFilter 消费；groupBy 对 rail 无意义——图标列恒项目口径） */
  readonly view: SidebarView
  /** 当前会话 id（含当前会话的项目图标 active 色——官方 folderActive 同型） */
  readonly currentSessionId: string | null
  /** rail 图标请求展开（壳回调——点击语义 = 先展开侧栏） */
  readonly expandSidebar: () => void
  /** 搜索钮（展开侧栏 + 打开过滤行——官方 requestSearch 同径） */
  readonly onSearchOpen: () => void
  /** 「＋」添加项目入口（缺席 = 不呈现） */
  readonly onAddProject?: () => void
  /** 会话行回调（项目图标点击 = 展开侧栏 + 选中该项目首会话） */
  readonly onSessionActivate?: (sessionId: string) => void
}

/**
 * rail 态本体（fix-42：空轨道退役——收起态可用性）：项目 folder 图标点击 = expandSidebar +
 * 选中该项目首会话（无会话 = 仅展开侧栏）；搜索钮 = expandSidebar + 开过滤行；
 * 「＋」保持 openAddProjectFlow（边界裁决：目录流不入产品「＋」）。
 */
export function SidebarRail({
  tree,
  view,
  currentSessionId,
  expandSidebar,
  onSearchOpen,
  onAddProject,
  onSessionActivate,
}: SidebarRailProps): ReactNode {
  const railTree = sidebarArchivedFilterOf(view.archivedFilter, tree)
  return (
    <div className="dswf-sidebar dswf-sidebar-rail" data-dswf-sidebar="rail">
      <Tooltip label="搜索（项目名 + 会话标题）" portal>
        <Button
          variant="ghost"
          size="sm"
          className="dswf-sidebar-railbtn"
          data-dswf-search-toggle=""
          aria-label="搜索项目与会话"
          onClick={onSearchOpen}
        >
          <IconSearchOutlineRegular size={18} />
        </Button>
      </Tooltip>
      {onAddProject === undefined ? null : (
        <Tooltip label="添加项目" portal>
          <Button
            variant="ghost"
            size="sm"
            className="dswf-sidebar-railbtn"
            data-dswf-nav="add-project"
            aria-label="添加项目"
            onClick={onAddProject}
          >
            <IconProjectAddOutlineRegular size={18} />
          </Button>
        </Tooltip>
      )}
      {railTree.map((node) => (
        <Tooltip key={node.projectId} label={node.name} portal>
          <Button
            variant="ghost"
            size="sm"
            className="dswf-sidebar-railbtn"
            data-dswf-rail-project={node.projectId}
            data-active={
              node.sessions.some((row) => row.sessionId === currentSessionId) || undefined
            }
            data-archived={node.archived || undefined}
            aria-label={`打开项目 ${node.name}`}
            onClick={() => {
              expandSidebar()
              const first = node.sessions[0]
              if (first !== undefined) onSessionActivate?.(first.sessionId)
            }}
          >
            <IconFolderCloseRegular size={18} />
          </Button>
        </Tooltip>
      ))}
    </div>
  )
}

/** 改名模态态（面板态机持有——官方 renameTarget 同型：目标 + 草稿随行） */
interface ProjectRenameState {
  readonly projectId: string
  readonly currentName: string
  draft: string
}

/** 会话改名模态态（D45——官方 SessionRenameTarget 同型：目标 + 草稿随行） */
interface SessionRenameState {
  readonly sessionId: string
  readonly currentTitle: string
  draft: string
}

/** 「停止并归档」确认模态态（D45——官方 SessionArchiveConfirmRequest 同型裁剪：目标行命名） */
interface SessionArchiveConfirmState {
  readonly sessionId: string
  readonly title: string
}

/**
 * 产品工作区面板（sidebar.workspaces 占用者本体——过滤/视图菜单/改名态机持有者）。
 * 宽态：项目区（SidebarProjectsZone）；rail 态：图标列（SidebarRail——fix-42 空轨道退役）。
 * 过滤态机（fix-6）：searchOpen/query 纯视图态；收起即清空查询（原型 S.pj 语义——
 * 过滤掉当前选中项不重置锚，清过滤即恢复可见，PRD UF-1 Validation）。
 * 视图态机（fix-42）：view 纯视图态（groupBy/archivedFilter——P1 不持久化，缺省 =
 * SIDEBAR_VIEW_DEFAULT——D41-① 归档默认隐藏）；改名态机：目标/草稿/进行中/错误四件（官方 rename
 * 模态同型——确认失败错误留在模态内，成功关模态）。
 * useState 先于 rail 早退分支（hook 顺序稳定——wide 翻转不重挂）。
 */
export function ForgeWorkspacePanel({
  wide,
  expandSidebar,
  tree,
  loading,
  currentSessionId,
  projectsPending,
  hasProjects,
  projectsError,
  onAddProject,
  onSessionActivate,
  onRetryProjects,
  onStartSession,
  onRenameProject,
  onArchiveToggle,
  onSessionPinToggle,
  onSessionArchive,
  onSessionUnarchive,
  onSessionRename,
  onSessionFork,
  now,
}: ForgeWorkspacePanelProps): ReactNode {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [view, setView] = useState<SidebarView>(SIDEBAR_VIEW_DEFAULT)
  const [renameTarget, setRenameTarget] = useState<ProjectRenameState | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  // D45 会话改名模态态机（官方 SessionRenameDialog 同型——确认失败错误留在模态内，成功关模态）
  const [sessionRename, setSessionRename] = useState<SessionRenameState | null>(null)
  const [sessionRenaming, setSessionRenaming] = useState(false)
  const [sessionRenameError, setSessionRenameError] = useState<string | null>(null)
  // D45「停止并归档」确认模态态机（官方 SessionArchiveConfirmDialog 同型裁剪——
  // 归档运行中会话被宿主拒[workspace/session-active]时开出）
  const [archiveConfirm, setArchiveConfirm] = useState<SessionArchiveConfirmState | null>(null)
  const [stopArchiving, setStopArchiving] = useState(false)
  // 搜索钮展开/收起（Esc 同走此缝——收起即清空；展开从空查询开始）
  const onSearchToggle = (): void => {
    setSearchOpen((prev) => !prev)
    setQuery('')
  }
  // rail 搜索径（fix-42）：先展开侧栏（壳回调），后开过滤行（宽态 autoFocus 接力聚焦）
  const openSearch = (): void => {
    expandSidebar()
    setSearchOpen(true)
    setQuery('')
  }
  // 视图菜单项选择（id 原样投影——sidebarViewOfPick 纯裁决，无效 id 零变化）
  const onViewPick = (id: string): void => {
    setView((prev) => sidebarViewOfPick(prev, id))
  }
  // 改名请求（项目行 ellipsis 菜单 → 模态开）
  const requestRename = (projectId: string, currentName: string): void => {
    setRenameTarget({ projectId, currentName, draft: currentName })
    setRenameError(null)
  }
  const closeRename = (): void => {
    if (renaming) return
    setRenameTarget(null)
    setRenameError(null)
  }
  const confirmRename = async (): Promise<void> => {
    if (renaming || renameTarget === null || onRenameProject === undefined) return
    const trimmed = renameTarget.draft.trim()
    if (trimmed === '') {
      setRenameError('项目名不能为空')
      return
    }
    setRenaming(true)
    try {
      await onRenameProject(renameTarget.projectId, trimmed)
      setRenameTarget(null)
      setRenameError(null)
    } catch (cause) {
      setRenameError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRenaming(false)
    }
  }

  // D45 会话改名流（菜单项 → 模态开——草稿种子 = 行现标题；空名确认阻断，官方同判）
  const requestSessionRename = (sessionId: string, currentTitle: string): void => {
    setSessionRename({ sessionId, currentTitle, draft: currentTitle })
    setSessionRenameError(null)
  }
  const closeSessionRename = (): void => {
    if (sessionRenaming) return
    setSessionRename(null)
    setSessionRenameError(null)
  }
  const confirmSessionRename = async (): Promise<void> => {
    if (sessionRenaming || sessionRename === null || onSessionRename === undefined) return
    const trimmed = sessionRename.draft.trim()
    if (trimmed === '') {
      setSessionRenameError('会话名称不能为空')
      return
    }
    setSessionRenaming(true)
    try {
      await onSessionRename(sessionRename.sessionId, trimmed)
      setSessionRename(null)
      setSessionRenameError(null)
    } catch (cause) {
      setSessionRenameError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSessionRenaming(false)
    }
  }

  // D45 归档请求流：直发官方归档面——运行中会话被宿主拒（workspace/session-active）
  // →「停止并归档」确认模态；其余失败 fail-soft 控制台告警（P1 无行内错误面）
  const requestSessionArchive = (row: SessionArchiveRequestRow): void => {
    if (onSessionArchive === undefined) return
    onSessionArchive(row.sessionId).catch((cause: unknown) => {
      if (sessionArchiveActiveRefusal(cause)) {
        setArchiveConfirm({ sessionId: row.sessionId, title: row.title })
        return
      }
      console.warn(
        `归档会话失败（P1 fail-soft：行数据未变，可重试）——session ${row.sessionId}：${cause instanceof Error ? cause.message : String(cause)}`,
      )
    })
  }
  const closeArchiveConfirm = (): void => {
    if (stopArchiving) return
    setArchiveConfirm(null)
  }
  const confirmStopAndArchive = async (): Promise<void> => {
    if (stopArchiving || archiveConfirm === null || onSessionArchive === undefined) return
    setStopArchiving(true)
    try {
      await onSessionArchive(archiveConfirm.sessionId, { stopActivity: true })
      setArchiveConfirm(null)
    } catch (cause) {
      // 二次失败（宿主拒绝/载体断）= fail-soft：关模态 + 控制台告警（P1 无行内错误面）
      console.warn(
        `停止并归档失败（P1 fail-soft）——session ${archiveConfirm.sessionId}：${cause instanceof Error ? cause.message : String(cause)}`,
      )
      setArchiveConfirm(null)
    } finally {
      setStopArchiving(false)
    }
  }

  // rail 态：图标列（fix-42 空轨道退役——搜索/＋/项目图标；知识入口 = 官方 panellist 行）
  if (!wide) {
    return (
      <SidebarRail
        tree={tree}
        view={view}
        currentSessionId={currentSessionId}
        expandSidebar={expandSidebar}
        onSearchOpen={openSearch}
        onAddProject={onAddProject}
        onSessionActivate={onSessionActivate}
      />
    )
  }

  return (
    <div className="dswf-sidebar" data-dswf-sidebar="wide" aria-label="项目与会话">
      <SidebarProjectsZone
        tree={tree}
        loading={loading}
        currentSessionId={currentSessionId}
        projectsPending={projectsPending}
        hasProjects={hasProjects}
        projectsError={projectsError}
        onAddProject={onAddProject}
        onSessionActivate={onSessionActivate}
        onRetryProjects={onRetryProjects}
        now={now}
        searchOpen={searchOpen}
        onSearchToggle={onSearchToggle}
        query={query}
        onQueryChange={setQuery}
        viewMenuOpen={viewMenuOpen}
        onViewMenuOpenChange={setViewMenuOpen}
        view={view}
        onViewPick={onViewPick}
        onStartSession={onStartSession}
        onRequestRename={onRenameProject === undefined ? undefined : requestRename}
        onArchiveToggle={onArchiveToggle}
        onSessionPinToggle={onSessionPinToggle}
        onSessionArchiveRequest={onSessionArchive === undefined ? undefined : requestSessionArchive}
        onSessionUnarchive={onSessionUnarchive}
        onRequestSessionRename={onSessionRename === undefined ? undefined : requestSessionRename}
        onSessionFork={onSessionFork}
      />
      {renameTarget === null ? null : (
        <Modal
          open
          onClose={closeRename}
          closeLabel="关闭"
          title="项目改名"
          footer={
            <>
              <Button variant="outline" disabled={renaming} onClick={closeRename}>
                取消
              </Button>
              <Button
                variant="primary"
                disabled={renaming || renameTarget.draft.trim() === ''}
                onClick={() => {
                  void confirmRename()
                }}
              >
                改名
              </Button>
            </>
          }
        >
          <Input
            className="dswf-sidebar-rename-input"
            data-dswf-rename-input=""
            type="text"
            aria-label="项目名"
            autoFocus
            value={renameTarget.draft}
            disabled={renaming}
            onChange={(event) => {
              setRenameTarget({ ...renameTarget, draft: event.target.value })
              setRenameError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void confirmRename()
              }
            }}
          />
          {renameError === null ? null : (
            <div className="dswf-sidebar-rename-error" role="alert">
              {renameError}
            </div>
          )}
        </Modal>
      )}
      {sessionRename === null ? null : (
        // D45 会话改名模态（官方 SessionRenameDialog/RenameForm 同型——空名阻断 +
        // 确认失败错误留模态 + Enter 提交；文案对齐官方 zh 词典）
        <Modal
          open
          onClose={closeSessionRename}
          closeLabel="关闭"
          title="重命名会话"
          footer={
            <>
              <Button variant="outline" disabled={sessionRenaming} onClick={closeSessionRename}>
                取消
              </Button>
              <Button
                variant="primary"
                disabled={sessionRenaming || sessionRename.draft.trim() === ''}
                onClick={() => {
                  void confirmSessionRename()
                }}
              >
                重命名
              </Button>
            </>
          }
        >
          <Input
            className="dswf-sidebar-rename-input"
            data-dswf-session-rename-input=""
            type="text"
            aria-label="会话名称"
            autoFocus
            value={sessionRename.draft}
            disabled={sessionRenaming}
            onChange={(event) => {
              setSessionRename({ ...sessionRename, draft: event.target.value })
              setSessionRenameError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void confirmSessionRename()
              }
            }}
          />
          {sessionRenameError === null ? null : (
            <div className="dswf-sidebar-rename-error" role="alert">
              {sessionRenameError}
            </div>
          )}
        </Modal>
      )}
      {archiveConfirm === null ? null : (
        // D45「停止并归档」确认模态（官方 SessionArchiveConfirmDialog 同型裁剪——
        // 宿主拒绝因 = 会话仍有运行中工作；确认 = stopActivity 归档，取消 = 保持运行）
        <Modal
          open
          onClose={closeArchiveConfirm}
          closeLabel="关闭"
          title="停止并归档会话"
          footer={
            <>
              <Button variant="outline" disabled={stopArchiving} onClick={closeArchiveConfirm}>
                取消
              </Button>
              <Button
                variant="primary"
                disabled={stopArchiving}
                onClick={() => {
                  void confirmStopAndArchive()
                }}
              >
                停止并归档
              </Button>
            </>
          }
        >
          <div className="dswf-sidebar-archive-confirm" data-dswf-archive-confirm="">
            「{archiveConfirm.title}」仍有运行中的工作。归档前先停止这些工作吗？
          </div>
        </Modal>
      )}
    </div>
  )
}
