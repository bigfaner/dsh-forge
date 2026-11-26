// 1.45 随 dock tab 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// 会话动作纯函数族 + 打开新会话编排器 + Bug 快速路径自 apps/web 壳侧 plugin.ts 平移
// （fix-13 A4——dock tab 族注册面消费；壳侧消费面改经包窄子路径 client-ui/session-actions）。
// reflectServiceGet / buildOpenSessionOrchestrator / bugReferenceServicesOf / buildBugQuickAdder
// 的 ctx 入参自 ForgeClientCtx 收窄为本地最小 ctx 镜像 SessionActionsCtx（reflect.get 一面）。
import { bugReferenceInsertOf } from './bug-refs/bug-source.js'
import { FORGE_BUG_SOURCE_NAME } from './official-seams.js'
import { createOpenSessionOrchestrator, openSessionPlatformFrom, insertReferenceAtTail, type ComposerInputFace, type OpenSessionBinding, type OpenSessionConversation, type OpenSessionOrchestrator, type OpenSessionServices, type PresetSelectResult, type ReferenceInsertMirror, type ReferenceInsertServices } from './open-session.js'

/** dsh 会话服务窄面（ISessions 消费切片：账本快照源——Session Controller client 无 open 面） */
export interface ForgeSessionsService {
  /** 会话账本快照源（实时读——零缓存零副本的源本体） */
  readonly list: unknown
  /**
   * 全量重拉会话列表基线（官方 SessionsService.refresh——refreshList 同径）。D6 修复面：
   * in-process worker 子会话的 added 广播未达客户端时账本缺行 → ⟞/执行会话 pill 判读不到
   * parentId，平开子会话 id 又非官方支持径（resolveTarget 抛 unknown session）。此时主动
   * refresh 一次（宿主 session.list 读盘上报持久子会话行——header parentSession 在场）后
   * 重判读。缺席（上游面漂移）= 跳过，平开兜底。
   */
  readonly refresh?: () => Promise<unknown>
  /**
   * 借用会话作用域引用（官方 ISessions.using 消费切片——D45 会话改名正径：官方
   * RenameSession 适配同面 `using(sessionId, {source:'workspaceOperation'}, ref =>
   * ref.binding.session.rename(title))`）。缺席（上游面漂移）= 改名菜单项不呈现。
   */
  readonly using?: (
    target: string,
    options: { readonly source: string },
    operation: (reference: unknown) => unknown,
  ) => Promise<unknown>
}

/**
 * dsh 工作区 UI 服务窄面（UiWorkspace 消费切片）。fix-11：会话行打开的正确官方面 =
 * uiWorkspace.openSession（内部 retain(mainView) + selection 一体 + layout.selectPanel(null)
 * 回会话面板——历史恢复经此驱动）。fix-42：项目行尾「新会话」钮 = uiWorkspace.startSession
 * （reuse-or-create blank + 呈现一体——官方 WorkspaceBrowser 同径动作面）。
 * m3.1 D6：openSession 增地址形态入参（官方 SessionTarget——上游 ui-subagent openChild
 * 同径：子会话经 {parentSessionId, childSessionId, mode} 打开，面包屑/只读 composer 等
 * subagent 呈现随官方 selection.subagentAddress 到场）。
 */
export interface ForgeUiWorkspaceService {
  /** 选择会话为当前并呈现其会话面（官方导航动作面；子会话 = SubagentAddress 形态） */
  openSession(target: string | ForgeSubagentOpenAddress): void
  /** 工作区新会话流（官方 UiWorkspaceService.startSession——复用/新建空白会话并打开） */
  startSession(workspaceId?: string): void
  /**
   * 归档会话（官方 UiWorkspaceService.archiveSession——D45 会话行动作钮正径）。运行中
   * 会话被宿主拒（WorkspaceArchiveError `workspace/session-active`）→ 拒绝原样上抛
   * （面板停止并归档确认流消费）；`stopActivity` = 先停运行工作再归档。
   * 缺席（上游面漂移）= 归档钮/菜单项不呈现。
   */
  readonly archiveSession?: (
    sessionId: string,
    options?: { readonly stopActivity?: boolean },
  ) => Promise<void>
  /** 取消归档（官方 UiWorkspaceService.unarchiveSession——D45）。缺席 = 对应面不呈现。 */
  readonly unarchiveSession?: (sessionId: string) => Promise<void>
  /** 置顶会话（官方 UiWorkspaceService.pinSession——D45）。缺席 = 置顶钮/菜单项不呈现。 */
  readonly pinSession?: (sessionId: string) => Promise<void>
  /** 取消置顶（官方 UiWorkspaceService.unpinSession——D45）。缺席 = 对应面不呈现。 */
  readonly unpinSession?: (sessionId: string) => Promise<void>
  /**
   * 分叉会话（官方 UiWorkspaceService.forkSession——D45；子会话经宿主列表到达源行旁）。
   * 缺席 = 分叉菜单项不呈现。
   */
  readonly forkSession?: (sessionId: string) => Promise<unknown>
}

/**
 * 官方子会话打开地址（上游 SubagentAddress 消费切片——mode 'unknown' = 读取子历史时
 * 解析；上游 dsh-subagent/control-types 契约）。m3.1 D6：悬浮面板 ⟞ 打开 worker 执行
 * 子会话的载荷形态（官方 ui-subagent openChild 同径）。
 */
export interface ForgeSubagentOpenAddress {
  readonly parentSessionId: string
  readonly childSessionId: string
  readonly mode: 'unknown'
}

/**
 * 会话行父会话判读（纯函数——m3.1 D6 ⟞ 开面）：账本快照窄读 byId[sessionId].parentId
 * （形状漂移/缺席/异常 = undefined 走平开）。子会话在场 = 地址形态打开（官方 openChild
 * 同径），顶层会话 = 平开（e2e 合成执行会话等非子会话径）。
 */
export function sessionParentIdOf(list: unknown, sessionId: string): string | undefined {
  if (typeof list !== 'object' || list === null) return undefined
  const getSnapshot = (list as { getSnapshot?: () => unknown }).getSnapshot
  if (typeof getSnapshot !== 'function') return undefined
  let snapshot: unknown
  try {
    snapshot = getSnapshot.call(list)
  } catch {
    return undefined
  }
  if (typeof snapshot !== 'object' || snapshot === null) return undefined
  const row = (snapshot as { byId?: Record<string, { parentId?: unknown }> }).byId?.[sessionId]
  return typeof row?.parentId === 'string' ? row.parentId : undefined
}

/** ⟞ 打开目标推导（纯函数）：父会话在场 = 地址形态；缺席 = 平开会话 id */
export function workerOpenTarget(
  parentId: string | undefined,
  childSessionId: string,
): string | ForgeSubagentOpenAddress {
  return parentId === undefined
    ? childSessionId
    : { parentSessionId: parentId, childSessionId, mode: 'unknown' }
}

/**
 * 账本行在场判定（纯函数——D6 修复面）：byId[sessionId] 行是否存在。行在场 → parentId
 * 判读一次即定（有无都定——顶层/子会话均不重拉）；行缺席（in-process worker 的 added
 * 广播未达/丢失——真实派发径的常见态：worker 创建与 dispose 的广播均不保证到达，而宿主
 * 重启后的全量 list 读盘恒含持久子会话行）→ 需 refresh 全量基线后重判读。形状漂移/异常
 * = false（与 sessionParentIdOf 同防御口径）。
 */
export function sessionRowInLedger(list: unknown, sessionId: string): boolean {
  if (typeof list !== 'object' || list === null) return false
  const getSnapshot = (list as { getSnapshot?: () => unknown }).getSnapshot
  if (typeof getSnapshot !== 'function') return false
  let snapshot: unknown
  try {
    snapshot = getSnapshot.call(list)
  } catch {
    return false
  }
  if (typeof snapshot !== 'object' || snapshot === null) return false
  return (snapshot as { byId?: Record<string, unknown> }).byId?.[sessionId] !== undefined
}

/**
 * 账本父反查子会话（纯函数——⟞ 进行中 worker 兜底面）：byId 扫描 row.parentId ===
 * parentSessionId 的子行。taskKey 在场时优先按 displayTitle 前缀 `${taskKey} · ` 命中
 * 目标任务的子行（spawn 标签 = `${taskKey} · ${任务名}` 落账本 displayTitle——同父多
 * worker 判别单源）。带键无命中（标签漂移/旧数据/执行中 worker 账本行未落持久化）=
 * undefined——不回退兄弟子行（bug b87a6869：把最近兄弟冒充目标任务，点击开了错会话；
 * 宁可行非交互不空跳）。无键（循环级近似）回退 updatedAt 择新（字符串 ISO 字典序防御
 * 窄读；全体缺席/非串回退枚举末位）。零命中/形状漂移/快照异常 = undefined
 * （调用面 no-op fail-soft）。
 * Root cause（bug 661bce2b）：原实现任务键无关、恒取同父最新子行——一父多 worker 时
 * 进行中任务的 ⟞ 打开的是别的任务的子会话。
 */
export function workerChildSessionOf(list: unknown, parentSessionId: string, taskKey?: string): string | undefined {
  if (typeof list !== 'object' || list === null) return undefined
  const getSnapshot = (list as { getSnapshot?: () => unknown }).getSnapshot
  if (typeof getSnapshot !== 'function') return undefined
  let snapshot: unknown
  try {
    snapshot = getSnapshot.call(list)
  } catch {
    return undefined
  }
  if (typeof snapshot !== 'object' || snapshot === null) return undefined
  const byId = (snapshot as { byId?: Record<string, { readonly parentId?: unknown; readonly updatedAt?: unknown; readonly displayTitle?: unknown }> }).byId
  if (typeof byId !== 'object' || byId === null) return undefined
  const keyPrefix = taskKey === undefined ? undefined : `${taskKey} · `
  let bestId: string | undefined
  let bestUpdatedAt: string | undefined
  let keyedId: string | undefined
  for (const [sessionId, row] of Object.entries(byId)) {
    if (typeof row !== 'object' || row === null || row.parentId !== parentSessionId) continue
    const updatedAt = typeof row.updatedAt === 'string' ? row.updatedAt : undefined
    const newer =
      updatedAt !== undefined && (bestUpdatedAt === undefined || updatedAt > bestUpdatedAt)
    if (bestId === undefined || newer || (updatedAt === undefined && bestUpdatedAt === undefined)) {
      bestId = sessionId
      bestUpdatedAt = updatedAt
    }
    if (keyPrefix !== undefined && keyedId === undefined) {
      const title = row.displayTitle
      if (typeof title === 'string' && title.startsWith(keyPrefix)) keyedId = sessionId
    }
  }
  return taskKey === undefined ? bestId : keyedId // 带键无命中 = undefined（不冒充兄弟——bug b87a6869）
}

/**
 * 父反查 worker 子会话解析（纯异步面——⟞ 兜底径）：首扫账本；miss（in-process worker 的
 * added 广播未达——D6 修复面同款场景）→ refresh 全量基线一次后重扫（宿主 session.list
 * 读盘上报持久子会话行）；仍 miss / refresh 缺席或抛错 = undefined fail-soft
 * （openSessionWithLedgerAddress refresh 兜底同刻度）。
 */
export async function resolveWorkerChildSession(
  services: Pick<ForgeSessionsService, 'list' | 'refresh'>,
  parentSessionId: string,
  taskKey?: string,
): Promise<string | undefined> {
  const first = workerChildSessionOf(services.list, parentSessionId, taskKey)
  if (first !== undefined) return first
  const refresh = services.refresh
  if (refresh === undefined) return undefined
  try {
    await refresh()
  } catch {
    return undefined
  }
  return workerChildSessionOf(services.list, parentSessionId, taskKey)
}

/**
 * 会话名解析（纯函数——task-ui-info-density-blitz S1 通道）：账本快照窄读
 * byId[sessionId].displayTitle。命中（非空串）= 返回标题；行缺席（归档/旧会话/快照
 * 缺行）/形状漂移/快照异常/非串/空串 = undefined（调用方回退显示 sessionId——fail-soft
 * 口径与 sessionParentIdOf 同源）。
 */
export function sessionTitleOf(list: unknown, sessionId: string): string | undefined {
  if (typeof list !== 'object' || list === null) return undefined
  const getSnapshot = (list as { getSnapshot?: () => unknown }).getSnapshot
  if (typeof getSnapshot !== 'function') return undefined
  let snapshot: unknown
  try {
    snapshot = getSnapshot.call(list)
  } catch {
    return undefined
  }
  if (typeof snapshot !== 'object' || snapshot === null) return undefined
  const title = (snapshot as { byId?: Record<string, { displayTitle?: unknown }> }).byId?.[sessionId]
    ?.displayTitle
  return typeof title === 'string' && title !== '' ? title : undefined
}

/**
 * 会话名解析器组装（S1 通道——shell.overlay inject face 递达 ShellHost → 任务弹窗组件
 * 的闭包面）：账本快照源（sessions.list）单源，缺省 undefined 回退归调用方。
 */
export function makeSessionTitleResolver(
  sessions: ForgeSessionsService,
): (sessionId: string) => string | undefined {
  return (sessionId: string): string | undefined => sessionTitleOf(sessions.list, sessionId)
}

/**
 * 活跃会话解析（纯函数——1.4 Bug 快速路径「有活跃会话」判读；bug 15faa6f0 修正）：
 * 官方 SessionListState 无 current 字段（view selection 在 Controller 之外）——当前会话
 * 正本 = ui-session publishMain 同径：byId 行 `retainedBy.mainView > 0` 即主视图在留
 * （该会话因已被 retain，sessions.binding(id) 按「borrow an already-retained binding」
 * 语义可用）。快照缺席/形状漂移/无在留行 = undefined（调用方走无活跃会话兜底：开新会话预填）。
 */
// Root cause: 实现者虚构了快照 current 字段（官方类型无此成员），活跃判读恒 undefined。
export function activeSessionIdOf(list: unknown): string | undefined {
  if (typeof list !== 'object' || list === null) return undefined
  const getSnapshot = (list as { getSnapshot?: () => unknown }).getSnapshot
  if (typeof getSnapshot !== 'function') return undefined
  let snapshot: unknown
  try {
    snapshot = getSnapshot.call(list)
  } catch {
    return undefined
  }
  const byId = (snapshot as { byId?: unknown } | null)?.byId
  if (typeof byId !== 'object' || byId === null) return undefined
  for (const row of Object.values(byId as Record<string, unknown>)) {
    const id = (row as { id?: unknown } | null)?.id
    const mainView = (row as { retainedBy?: { mainView?: unknown } } | null)?.retainedBy?.mainView
    if (typeof id === 'string' && id !== '' && typeof mainView === 'number' && mainView > 0) return id
  }
  return undefined
}
/**
 * 打开会话（判读式统一径——D6 修复面）：显式父（库侧权威——任务挂接双源卡的 link 派发
 * 会话 = worker 的 durable 父）仅在账本缺行时直接 SubagentAddress 形态打开（进行中
 * worker 的账本行/盘上日志均未落的场景恒可得——98189bf 径）；账本行在场 = 宿主持久化
 * 父子关系为权威，按行自身 parentId 判读（合成挂接/非官方父子域的显式父不再强制
 * SubagentAddress——官方校验拒亲子关系即 subagent/unauthorized 历史加载失败横幅，
 * m2 tsl :173/:538 fixture 实证）。无显式父 → 账本 parentId 判读 → 子会话 = 官方地址
 * 形态（openChild 同径——树零联动），顶层 = 平开。账本缺行（worker 的 added 广播未达/
 * 丢失）→ refresh 全量基线后重判读一次（宿主 session.list 读盘上报持久子会话行——
 * header parentSession 在场）；refresh 缺席/失败/仍缺行 = 平开（顶层会话常态径）。
 * 行在场路径零异步（同步判读同步开——高频顶层径不加拍）。官方面异常 fail-soft 不外溢。
 * 悬浮面板 ⟞ 与任务详情执行会话 pill 两消费面共用。
 */
export function openSessionWithLedgerAddress(
  services: {
    readonly sessions: ForgeSessionsService
    readonly uiWorkspace: ForgeUiWorkspaceService
  },
  sessionId: string,
  parentSessionId?: string,
): void {
  const openWith = (parentId: string | undefined): void => {
    try {
      services.uiWorkspace.openSession(workerOpenTarget(parentId, sessionId))
    } catch {
      // fail-soft：无会话面（会话卸载瞬态）——点击不外溢
    }
  }
  if (parentSessionId !== undefined && !sessionRowInLedger(services.sessions.list, sessionId)) {
    openWith(parentSessionId)
    return
  }
  const parentId = sessionParentIdOf(services.sessions.list, sessionId)
  if (parentId !== undefined || sessionRowInLedger(services.sessions.list, sessionId)) {
    openWith(parentId)
    return
  }
  const refresh = services.sessions.refresh
  if (typeof refresh !== 'function') {
    openWith(undefined)
    return
  }
  void Promise.resolve(refresh.call(services.sessions))
    .catch(() => undefined)
    .then(() => {
      openWith(sessionParentIdOf(services.sessions.list, sessionId))
    })
}

/** dsh workspace 服务窄面（IWorkspaces 消费切片：归属快照源——快照自带 registry 级
 * archivedSessionIds/pinnedSessionIds 两集合，sidebar-model 窄镜像消费；动作面经
 * uiWorkspace 服务走（官方同径——含置顶排序/通知/归档选中清面编排）） */
export interface ForgeWorkspacesService {
  readonly list: unknown
}

/**
 * 会话改名官方面组装（D45——官方 RenameSession 适配同径）：`sessions.using` 借用
 * 会话作用域引用 → `binding.session.rename(title)`（RemoteResult 信封——!ok 抛
 * `error.message`，官方 renameSession 同判；成功 = 归一化标题已落宿主）。sessions.using
 * 缺席（上游面漂移）= 返回 undefined → 面板改名菜单项不呈现（P1：变更面缺席 = 对应项
 * 不出现）。binding.session.rename 缺席（会话未就绪/面漂移）= 调用期拒绝 → 改名模态
 * 呈现错误（官方对话框错误面同型）。
 */
export function makeSessionRenameFace(
  sessions: ForgeSessionsService,
): ((sessionId: string, title: string) => Promise<void>) | undefined {
  if (typeof sessions.using !== 'function') return undefined
  return async (sessionId: string, title: string): Promise<void> => {
    const result = (await sessions
      .using!(sessionId, { source: 'workspaceOperation' }, (reference: unknown) =>
        sessionRenameViaBinding(reference, title),
      )
      .catch((cause: unknown) => {
        throw cause instanceof Error ? cause : new Error(String(cause))
      })) as { ok: boolean; error?: { message?: string } }
    if (result === null || typeof result !== 'object' || result.ok !== true) {
      const message =
        (typeof result === 'object' && result !== null && result.error?.message) || '会话改名被拒绝'
      throw new Error(message)
    }
  }
}

/** 借用引用 → session.rename 调用（纯适配——形状漂移 = 拒绝，不静默捏造结果） */
function sessionRenameViaBinding(reference: unknown, title: string): Promise<unknown> {
  const session = (
    reference as { binding?: { session?: { rename?: (title: string) => Promise<unknown> } } } | null
  )?.binding?.session
  if (session === undefined || typeof session.rename !== 'function') {
    return Promise.reject(new Error('session.rename 缺席（上游面漂移）'))
  }
  return session.rename(title)
}

/**
 * 会话行动作注入面（D45——sidebar.workspaces 洞位 inject face 的会话行动作段）：逐位
 * 探测官方面在场性，缺席（上游面漂移）= 键缺席 → 面板对应动作钮/菜单项不呈现。归档
 * 拒绝（运行中会话 workspace/session-active）原样上抛给面板（停止并归档确认流消费）。
 */
export function sessionActionFaceOf(services: {
  readonly uiWorkspace: ForgeUiWorkspaceService
  readonly sessions: ForgeSessionsService
}): {
  archiveSession?: (sessionId: string, options?: { readonly stopActivity?: boolean }) => Promise<void>
  unarchiveSession?: (sessionId: string) => Promise<void>
  pinSession?: (sessionId: string) => Promise<void>
  unpinSession?: (sessionId: string) => Promise<void>
  forkSession?: (sessionId: string) => Promise<unknown>
  renameSession?: (sessionId: string, title: string) => Promise<void>
} {
  const face: {
    archiveSession?: (sessionId: string, options?: { readonly stopActivity?: boolean }) => Promise<void>
    unarchiveSession?: (sessionId: string) => Promise<void>
    pinSession?: (sessionId: string) => Promise<void>
    unpinSession?: (sessionId: string) => Promise<void>
    forkSession?: (sessionId: string) => Promise<unknown>
    renameSession?: (sessionId: string, title: string) => Promise<void>
  } = {}
  const { uiWorkspace } = services
  if (typeof uiWorkspace.archiveSession === 'function') {
    face.archiveSession = (sessionId, options) =>
      uiWorkspace.archiveSession!(sessionId, options)
  }
  if (typeof uiWorkspace.unarchiveSession === 'function') {
    face.unarchiveSession = (sessionId) => uiWorkspace.unarchiveSession!(sessionId)
  }
  if (typeof uiWorkspace.pinSession === 'function') {
    face.pinSession = (sessionId) => uiWorkspace.pinSession!(sessionId)
  }
  if (typeof uiWorkspace.unpinSession === 'function') {
    face.unpinSession = (sessionId) => uiWorkspace.unpinSession!(sessionId)
  }
  if (typeof uiWorkspace.forkSession === 'function') {
    face.forkSession = (sessionId) => uiWorkspace.forkSession!(sessionId)
  }
  const renameSession = makeSessionRenameFace(services.sessions)
  if (renameSession !== undefined) face.renameSession = renameSession
  return face
}

/** unknown → 对象窄化（缺席/非对象 = undefined） */
const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined

/** 本地最小 ctx 镜像（reflect.get 一面——平移自 ForgeClientCtx 消费切片；导出 = 壳侧
 * 消费面窄化入参的显式转换锚——ForgeClientCtx 与本镜像零公共属性，弱型检查需显式断言） */
export interface SessionActionsCtx {
  readonly reflect?: { get(n: string, strict?: boolean): unknown }
}

/** 惰性服务读取（reflect.get——未 inject 服务的官方面；缺席/异常 = undefined fail-soft；
 * 5.2 e2e 勘误配方同 buildOpenSessionOrchestrator）。strict = 官方缺省（仅活性 fiber 可见）；
 * false = 非严格读（提供方 fiber apply 期 state=1 亦可见——register 的值已同步构造完整） */
function reflectServiceGet(ctx: SessionActionsCtx, name: string, strict = true): unknown {
  try {
    return ctx.reflect?.get(name, strict)
  } catch {
    return undefined
  }
}

/**
 * 文档地址 → chip 标题（末段文件名——`dsh-resource://dswf-doc/<id>/<docRel>` 末段；
 * 与 dock-tabs.tsx 地址编解码同源格式，plugin.test 字面量 pin 两侧一致）。
 * 1.45 修正：源文（壳侧 plugin.ts）私有——dock-tabs-face 注册面与壳侧字面 pin 消费面
 * 经本模块取用，随迁后升为导出（语义逐字不变）。
 */
export function docTabTitle(address: string): string {
  const lastSlash = address.lastIndexOf('/')
  return lastSlash === -1 || lastSlash === address.length - 1 ? address : address.slice(lastSlash + 1)
}

/**
 * 打开新会话编排器组装（4.6 Integration #5 消费面）：openSessionPlatformFrom 真实服务
 * 适配——conversation / ctx.remote.agentPresets **调用期惰性解析**（不进 inject 数组：
 * 服务名核实无误前不承激活风险；缺席 = 各阶段 fail-soft 降级——create/draft 阶段错误
 * 上报，不炸壳）。uiWorkspace.openWorkspace 经结构探测（OQ#1 核实面：reuse-or-create
 * blank + beforeOpen 回传 sessionId）。
 *
 * 5.2 e2e 实证勘误（2026-10-08，SC1 自动对齐首跑）：cordis 4.0.4 的 ctx 属性/get 面
 * 对未 inject 服务**抛错**（`cannot get property "remote" without inject`——惰性属性
 * 读取 ≠ 缺席降级）。惰性配方修正 = `ctx.reflect.get(name)`（官方面：绕过 inject 义务
 * 的只读反射，缺席 = undefined——3.4 已裁决同配方）。conversation 同缝同修。
 * 1.45 修正：源文（壳侧 plugin.ts）私有——dock-tabs-face 概览 inject 与壳侧 shell.overlay
 * inject 两消费面经本模块取用，随迁后升为导出（语义逐字不变）。
 */
export function buildOpenSessionOrchestrator(
  clientCtx: SessionActionsCtx,
  uiWorkspace: ForgeUiWorkspaceService,
  sessions: ForgeSessionsService,
  workspaces?: ForgeWorkspacesService,
): OpenSessionOrchestrator {
  const asObject = (value: unknown): Record<string, unknown> | undefined =>
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
  /** 惰性服务读取（reflect.get——未 inject 服务的官方面；缺席/异常 = undefined fail-soft） */
  const reflectGet = (name: string): unknown => {
    try {
      const reflect = (clientCtx as { reflect?: { get(n: string): unknown } }).reflect
      return reflect?.get(name)
    } catch {
      return undefined
    }
  }
  const conversationSvc = (): Record<string, unknown> | undefined => asObject(reflectGet('conversation'))
  const agentPresetsSvc = (): Record<string, unknown> | undefined =>
    asObject(reflectGet('remote.agentPresets')) ?? asObject(asObject(reflectGet('remote'))?.['agentPresets'])
  const services: OpenSessionServices = {
    uiWorkspace: {
      openWorkspace: (workspaceId, beforeOpen) => {
        const svc = uiWorkspace as unknown as {
          openWorkspace?: (workspaceId: string, beforeOpen?: (sessionId: string) => void) => Promise<void>
        }
        if (svc.openWorkspace === undefined) {
          return Promise.reject(new Error('uiWorkspace.openWorkspace 缺席（上游面漂移）'))
        }
        return svc.openWorkspace(workspaceId, beforeOpen)
      },
      openSession: (sessionId) => {
        uiWorkspace.openSession(sessionId)
      },
    },
    agentPresets: {
      select: (sessionId, presetId) => {
        const select = agentPresetsSvc()?.['select'] as
          | ((sessionId: string, presetId: string) => Promise<unknown>)
          | undefined
        if (select === undefined) {
          return Promise.resolve({ ok: false as const, error: { message: 'ctx.remote.agentPresets.select 缺席' } })
        }
        return select(sessionId, presetId) as Promise<PresetSelectResult>
      },
    },
    sessions: {
      binding: (sessionId) =>
        (sessions as unknown as { binding?: (sessionId: string) => unknown }).binding?.(sessionId) as
          | OpenSessionBinding
          | undefined,
    },
    conversation: {
      input: {
        for: (actx: unknown): ComposerInputFace => {
          const resolved = (conversationSvc()?.['input'] as { for?: (actx: unknown) => unknown } | undefined)?.[
            'for'
          ]?.(actx)
          if (resolved === undefined || resolved === null) {
            throw new Error('conversation.input.for 缺席（会话输入缝未就绪）')
          }
          return resolved as ComposerInputFace
        },
      },
    } satisfies OpenSessionConversation,
    // bug d353536f 同因面：openWorkspace 先过官方基线在场门（open-session.ts waitForWorkspacePresent）
    ...(workspaces !== undefined ? { workspaces: { list: workspaces.list } } : {}),
  }
  return createOpenSessionOrchestrator(openSessionPlatformFrom(services))
}

/** Bug 快速路径输入（1.4——Bug 子 tab 行「添加到会话」；summary = chip label 主键） */
export interface BugQuickAddInput {
  readonly bugId: string
  readonly summary: string
}

/** Bug 快速路径动作面（概览 dock tab 注入面——Bug 子 tab 行按钮消费） */
export type BugQuickAddFn = (bug: BugQuickAddInput, workspaceId: string | null) => Promise<void>

/**
 * Bug 引用插入服务切片组装（scoped 事件发射三件套——sessions.binding / conversation.input.for /
 * actx.bail；1.4 快速路径与 bug 4b34e5d8 chip 重建缝共用：conversation 服务调用期惰性解析，
 * bail 面缺席 = undefined 返回 → 判未应用走各自兜底）。
 */
function bugReferenceServicesOf(clientCtx: SessionActionsCtx, sessions: ForgeSessionsService): ReferenceInsertServices {
  return {
    sessions: {
      binding: (sessionId) =>
        (sessions as unknown as { binding?: (sessionId: string) => unknown }).binding?.(sessionId) as
          | OpenSessionBinding
          | undefined,
    },
    conversation: {
      input: {
        for: (actx: unknown): ComposerInputFace => {
          const resolved = (
            asRecord(reflectServiceGet(clientCtx, 'conversation'))?.['input'] as
              | { for?: (actx: unknown) => unknown }
              | undefined
          )?.['for']?.(actx)
          if (resolved === undefined || resolved === null) {
            throw new Error('conversation.input.for 缺席（会话输入缝未就绪）')
          }
          return resolved as ComposerInputFace
        },
      },
    } satisfies OpenSessionConversation,
    // scoped 事件发射（cordis bail——actx 作主语；官方 input-trigger execute 同径；
    // bail 面缺席 = undefined 返回 → 判未应用走兜底）
    bail: (actx, name, payload) =>
      (actx as { bail?: (subject: unknown, name: string, payload: unknown) => unknown }).bail?.(
        actx,
        name,
        payload,
      ),
  }
}

/**
 * Bug 快速路径组装（composer-bug-reference 1.4）：有活跃会话（账本快照 current 锚）→
 * 官方 scoped 事件 `slash/input-insert-reference`（span-CAS 基于 InputState.draftRev +
 * 草稿末尾——insertReferenceAtTail 单源）插入 T1 同构原子引用并还焦 composer；插入未获
 * 应用（缝缺席/相位守卫拒——韧性兜底同 open-session 兜底裁决刻度）或无活跃会话 → 既有
 * open-session 编排器开新会话，首条草稿预填该引用剪贴板投影（@[摘要](bug:<bugId>)——
 * 预填走 setDraft 既有缝，chip 形态由 @ 菜单/粘贴官方链承接）。conversation 服务调用期
 * 惰性解析（buildOpenSessionOrchestrator 同配方）；workspaceId 缺席 = 无锚不编排（点击
 * fail-soft 不外溢）。
 */
export function buildBugQuickAdder(
  clientCtx: SessionActionsCtx,
  sessions: ForgeSessionsService,
  orchestrator: OpenSessionOrchestrator,
  /** 插入时快照落缓存（bug 27ab222b——dock 递达的 BugCard 全字段经此喂给 source；缺席 = 不落） */
  noteInserted?: (bug: BugQuickAddInput) => void,
): BugQuickAddFn {
  const services = bugReferenceServicesOf(clientCtx, sessions)
  return async (bug, workspaceId) => {
    // 外部插入径快照（bug 27ab222b）：dock 递达的是完整 BugCard（BugQuickAddInput 的
    // 结构超集——运行期全字段原样透传），不经 onPick 也能让 serialize 命中全卡
    noteInserted?.(bug)
    // chip 构造单一事实源（T1 bugReferenceInsertOf——@ 菜单 pick 产物同构）
    const reference: ReferenceInsertMirror = bugReferenceInsertOf(bug, FORGE_BUG_SOURCE_NAME)
    const active = activeSessionIdOf(sessions.list)
    if (active !== undefined && insertReferenceAtTail(services, active, reference)) return
    if (workspaceId === null) return
    await orchestrator.openSessionWithPreset({ workspaceId, prefill: reference.clipboardText })
  }
}
