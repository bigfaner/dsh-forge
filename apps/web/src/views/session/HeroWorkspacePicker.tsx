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
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { IconFolderCloseRegular, IconPlusOutlineRegular, Menu, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import { openAddProjectFlow } from '../../flows/add-project/flow-open.js'
import { useAnchoredProjects } from '../../workbench/anchored-projects.js'
import { preloadRpcClientFactory, type ForgeRpcClient } from '../../rpc/client.js'
import {
  heroPickerPlan,
  selectedProjectOf,
  selectedProjectRootOf,
  selectedProjectRootStrictOf,
  worktreeFaceUnavailableNotice,
  worktreeOrchestrationNotice,
  worktreeUnselectedProjectNotice,
  type HeroWorktreeFace,
  type WorktreeOrchestrateFn,
} from './hero-picker-model.js'
import { ForgeHeroWorktreeMount } from './WorktreeFaces.js'
import type { KitSelectorHook } from './ConversationViews.js'

/** 「添加项目…」行 id（菜单内保留字——项目行 id 恒为 dsh workspace uuid，无碰撞面） */
const ADD_PROJECT = 'dswf-add-project'
/** 添加行文案（产品口径——与 hero CTA/左栏「＋」入口同义词面） */
const ADD_LABEL = '添加项目…'

/** 编排缝依赖面（React 解耦——1.31 抽出 createWorktreeOrchestrator 可单测面） */
export interface WorktreeOrchestrationDeps {
  /** hero worktree inject face（编排 + 账本 + openSession 缝；undefined = 编排降级提示） */
  readonly worktree: HeroWorktreeFace | undefined
  readonly makeRpc: () => ForgeRpcClient
  /** 编排数据根（A7——selectedId 严格命中；null = 渲染兜底不进编排，提示 + null） */
  readonly orchestrateRoot: string | null
  /** 提示呈现（组件侧接 Toast 态；1.25 不静默口径） */
  readonly onNotice: (text: string) => void
}

const noticeText = (error: unknown): string =>
  error instanceof Error && error.message !== '' ? error.message : String(error)

/**
 * 挂靠编排缝（1.16 预铸采纳单 RPC 一体面；1.31 A7 语义；bug e678ca5f 主行 reuse 零补绑定）：
 *   · A7——orchestrateRoot null（selectedId 无命中项目行）→ 提示 + null：渲染兜底
 *     （selectedProjectRootOf fallback）仅供 chip 渲染，禁止泄漏为绑定数据源；
 *   · 主行/树行 blank reuse 均直接打开：活跃会话写句柄被官方 agent loop 持有（单写者
 *     铁律），客户端补写挂靠事件结构性必败——绑定正确性由 host 侧必绑拦截单点保证
 *     （judge 'route' → 预铸采纳重路由，挂靠事件随预铸落盘）。
 */
export function createWorktreeOrchestrator(deps: WorktreeOrchestrationDeps): WorktreeOrchestrateFn {
  return (path: string): Promise<string | null> => {
    return (async (): Promise<string | null> => {
      const { worktree, makeRpc, orchestrateRoot, onNotice } = deps
      if (worktree === undefined) {
        onNotice(worktreeFaceUnavailableNotice()) // 注入面缺席（旧插件面/装配降级）——1.25①
        return null
      }
      if (orchestrateRoot === null) {
        onNotice(worktreeUnselectedProjectNotice()) // A7：渲染兜底不进编排
        return null
      }
      const rpc = makeRpc()
      // arm 重复消费不重复建会话：该 cwd 已有空白会话 → 复用（官方 reuseOrCreateBlank 同构；
      // bug e678ca5f：零补绑定——首条消息时点由 host 必绑拦截保证绑定）
      const reuseSessionId = worktree.blankSessionByCwd?.(path)
      if (reuseSessionId !== undefined) {
        try {
          worktree.openSession(reuseSessionId)
        } catch (error) {
          onNotice(worktreeOrchestrationNotice('open', noticeText(error)))
          return null
        }
        return reuseSessionId
      }
      let sessionId: string
      try {
        ({ sessionId } = await rpc.worktree.sessionCreate({ worktreePath: path }))
      } catch (error) {
        onNotice(worktreeOrchestrationNotice('create', noticeText(error)))
        return null
      }
      try {
        worktree.openSession(sessionId)
      } catch (error) {
        onNotice(worktreeOrchestrationNotice('open', noticeText(error)))
        return null
      }
      return sessionId
    })().catch((error: unknown) => {
      // 安全网兜底（内部各失败径已自呈提示）——意外异常不静默：同一 Toast 面呈现
      deps.onNotice(worktreeOrchestrationNotice('create', noticeText(error)))
      return null
    })
  }
}

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
  /**
   * worktree 挂靠缝（fix-2 槽位 inject face——client 插件注册时递达）。1.29 时序裁决：
   * 点选 worktree 行 = 纯选中态（chip 回填 + 项目粒度记忆，挂载面本地闭环）——本 face
   * 只剩 arm 消费点（首条消息时点）消费的编排与账本面。缺席 = 编排降级（arm 时 1.25
   * Toast 明示；旧插件面/降级装配场景）。face 细节见 HeroWorktreeFace（model 单源）。
   */
  readonly worktree?: HeroWorktreeFace | undefined
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
  worktree,
  makeRpc = preloadRpcClientFactory,
}: ForgeHeroWorkspacePickerProps): ReactNode {
  // 项目源（RPC）+ 重拉锚（workspace 归属快照身份——注册/删除 workspace 即触发，与左栏
  // 同锚口径；useAnchoredProjects 共享 hook，fix-36 收敛）
  const { projects: projectsState, silentRefresh, anchor: workspacesAnchor } = useAnchoredProjects(useWorkspaces)

  const projects = projectsState.phase === 'ready' ? projectsState.projects : []
  const plan = heroPickerPlan(projects, projectsState.phase !== 'loading')
  const selectedRow = selectedProjectOf(plan.rows, selectedId)

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
  // 修正在 model 层：workspaceId 回查 + fallback 只取活跃行）。
  const selectedProjectRoot = selectedProjectRootOf(projects, selectedId)

  // 1.25 编排失败/face 缺席提示态（Toast 只在首条消息时点的 arm 失败出现——1.29 点选
  // 纯选中态无失败面）
  const [worktreeNotice, setWorktreeNotice] = useState<{ readonly text: string; readonly seq: number } | undefined>(undefined)
  // 挂靠编排缝（1.31——React 解耦抽出 createWorktreeOrchestrator 可单测面；1.29 起 arm
  // 消费点唯一消费，点选不触达）。返回产物 sessionId（草稿搬运落点）；失败 → 1.25 Toast
  // + null（挂载面选中态同清——不产生「已选中」假象）。
  // A7（1.31）：编排数据根 = selectedId 严格命中（selectedProjectRootStrictOf）——渲染
  // 兜底（selectedProjectRootOf fallback）禁止泄漏为绑定语义：无命中 → 提示 + null 不编排。
  const orchestrateRoot = selectedProjectRootStrictOf(projects, selectedId)
  const orchestrate = useMemo(
    () =>
      createWorktreeOrchestrator({
        worktree,
        makeRpc,
        orchestrateRoot,
        onNotice: (text) => setWorktreeNotice((prev) => ({ text, seq: (prev?.seq ?? 0) + 1 })),
      }),
    [worktree, makeRpc, orchestrateRoot],
  )

  const onSelect = useCallback(
    (id: string) => {
      if (id === ADD_PROJECT) {
        openAdd()
        return
      }
      onPick(id)
    },
    [openAdd, onPick],
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
      {/* 1.25 编排失败/face 缺席提示（官方 Toast——body portal 顶部横幅，失败档长驻 5s） */}
      {worktreeNotice !== undefined && (
        <Toast
          key={worktreeNotice.seq}
          text={worktreeNotice.text}
          holdMs={5000}
          onDone={() => setWorktreeNotice(undefined)}
        />
      )}
      {/* worktree 第二 chip（难点 A 落法③产品自增行——影子渲染面就地并列，原型「chip 行
          两 chip」构图；非 git / 未选中项目零注入整体退回现状）。1.29：点选纯选中态在
          挂载面本地闭环；编排缝只递达 arm 消费点。 */}
      <ForgeHeroWorktreeMount
        projectRoot={selectedProjectRoot}
        worktree={worktree !== undefined ? { ...worktree, orchestrate } : undefined}
        makeRpc={makeRpc}
      />
    </>
  )
}
