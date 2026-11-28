// 官方缝注册面（定位：装配——会话头 chip / composer overlay
// 双行（封存提示 + chip 重建）/ 右栏 Bug 台账 tab 两段（类型定义 + keyed body）/
// @ 补全 Bug source / chip 重建缝页内全局——注册归属本插件域（插件可移植性：装配缝
// 归插件，宿主只做 wiring），随本插件 client bundle apply 期自注册——产品壳
// （apps/host 集成形态，本 bundle 同样装载）与官方 dsh web 一致呈现。
//
// bundle 自含纪律：官方面（slots/sidebarRightTabs/sidebarRight/inputTriggers/workspaces/
// sessions/conversation）以结构同型镜像承载（keyed-section 先例）；RPC 通道常量出自
// @dsh-forge/lib-api（本 bundle esbuild 内联——自含审计口径：产物零裸 import）。
// 注册条件门控：list 槽行（scope session）由槽 runtime 在会话视图内声明递达 sessionId——
// 本面只做登记，门控语义归官方槽 runtime（与壳侧登记行同形）。
import { ForgeBugPreview } from './bug-refs/BugPreview.js'
import { ForgeBugGlyph } from './bug-refs/BugGlyph.js'
import {
  ForgeBugChipRestoreOverlay,
  publishBugChipRestorer,
  type BugChipRestorer,
} from './bug-refs/ChipRestoreOverlay.js'
import { watchBugChipRestore } from './bug-refs/chip-restore.js'
import {
  bugIdOfRef,
  createBugReferenceSource,
  type BugReferenceSource,
} from './bug-refs/bug-source.js'
import { ForgeSessionWorktreeChip } from './session-badge/chip.js'
import { ForgeWorktreeSealOverlay } from './session-badge/seal-notice.js'
import { createForgeRpcClient, type ForgeRpcClient } from './rpc.js'
import {
  registerKeyedSection,
  type SectionSlotsFace,
} from './keyed-section.js'
import { SIDEBAR_RIGHT_PANE_TAB_SLOT } from '@dsh-forge/lib-ui'

// 槽名单源（裁决 5）：sidebar.right.pane.tab 键出自 @dsh-forge/lib-ui（esbuild 内联，
// 自含审计口径不变），本文件只透传既有消费面 import 路径。

export { SIDEBAR_RIGHT_PANE_TAB_SLOT }

// ── 槽名 / 行键常量（与 apps/web 壳侧退役常量字面同源——官方 SlotMap 键） ──

/** 官方会话头标题邻位动作带（list 槽 scope session——chip 登记行载体） */
export const SESSION_HEADER_ACTIONS_SLOT = 'conversation.session.header.actions'
/** worktree 会话头 chip 登记 id */
export const WORKTREE_CHIP_ENTRY_ID = 'dswf-worktree-chip'
/** worktree 会话头 chip 登记序（官方带 -30/-20/-10/20 → -60 居前） */
export const WORKTREE_CHIP_ORDER = -60
/** 官方 composer 区 overlay 缝（封存提示 + chip 重建双行载体） */
export const CONVERSATION_INPUT_OVERLAY_SLOT = 'conversation.input.overlay'
/** 封存提示 overlay 行 id */
export const SEAL_NOTICE_ENTRY_ID = 'dswf-worktree-seal'
/** Bug chip 重建 overlay 行 id（零视觉效应行） */
export const BUG_CHIP_RESTORE_ENTRY_ID = 'dswf-bug-chip-restore'
/** Bug 台账 tab 类型 kind = keyed body 键（与 ui/bug-refs/BugPreview.tsx DSWF_BUG_TAB_KIND 字面量同源 pin） */
export const BUG_TAB_KIND = 'dswf-bug'
/** Bug 台账资源地址前缀（openResource 去重键 = 地址本身；与 BugPreview.tsx DSWF_BUG_ADDRESS_PREFIX 字面量同源 pin） */
export const BUG_ADDRESS_PREFIX = `dsh-resource://${BUG_TAB_KIND}/`
/** Bug 组名（@ 菜单独立组标题行——唯一性由官方 registerSource duplicate throw 硬守卫） */
export const FORGE_BUG_SOURCE_NAME = 'dswf-bug'
/** Bug 组排序（官方 @reference 组缺省 0 → 30 = 文件/会话组之后） */
export const FORGE_BUG_SOURCE_ORDER = 30

/** Bug tab 地址（= 去重键 contentId：同 projectId+bugId 同 tab、异地址新开；BugPreview.forgeBugAddress 同构镜像） */
export function bugAddressOf(projectId: string, bugId: string): string {
  return `${BUG_ADDRESS_PREFIX}${projectId}/${bugId}`
}

/** Bug tab 地址解析（纯函数）：前缀 + `<projectId>/<bugId>` 取 bugId 段；形状非法 → undefined */
export function bugIdOfAddress(address: string): string | undefined {
  if (!address.startsWith(BUG_ADDRESS_PREFIX)) return undefined
  const rest = address.slice(BUG_ADDRESS_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0 || slash === rest.length - 1) return undefined
  const bugId = rest.slice(slash + 1)
  return bugId === '' ? undefined : bugId
}

// ── 官方服务窄面（结构同型镜像——bundle 自含零上游 import） ──

/** 官方 workspaces 服务消费切片（会话 → 项目锚数据源） */
interface WorkspacesServiceMirror {
  readonly list: unknown
}

/** 官方右栏导航服务消费切片（Bug chip 点击 → openResource 开台账 pane） */
interface SidebarRightMirror {
  openResource(address: string, options?: { readonly kind?: string }): void
}

/** 官方右栏 tab 类型注册表消费切片（两段注册第一段） */
interface SidebarRightTabsMirror {
  register(definition: {
    readonly id: string
    readonly kind: string
    readonly multiple?: boolean
    readonly patterns?: readonly string[]
    readonly canOpen?: (address: string) => boolean
    readonly title: (address: string) => string
  }): () => void
}

/** apply ctx 窄面（cordis Context 消费切片——get 解析注入服务 + reflect 反射读） */
export interface OfficialSeamCtx {
  get(name: 'sidebarRight' | 'sidebarRightTabs' | 'workspaces' | 'sessions'): unknown
  /** cordis 事件效果缝（inputTriggers 撤销器归级联——官方 ui-reference 同径） */
  effect?(factory: () => (() => void) | undefined, name?: string): unknown
  /** cordis reflect 只读反射（未 inject 服务的官方面；缺席 = undefined fail-soft） */
  reflect?: { get(name: string, strict?: boolean): unknown }
}

/** unknown → 对象窄化（缺席/非对象 = undefined） */
const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined

/** reflect 只读反射（缺席/异常 = undefined——fail-soft） */
function reflectGet(ctx: OfficialSeamCtx, name: string, strict = true): unknown {
  try {
    return ctx.reflect?.get(name, strict)
  } catch {
    return undefined
  }
}

/** 项目锚行窄形状（contracts ProjectSummary 消费切片：id + 必填 workspaceId） */
interface ProjectRowMirror {
  readonly id: string
  readonly workspaceId: string
}

/** projects.list 行集正规化（形状漂移行剔除——非对象/缺键不记） */
export function bugProjectsFromRows(rows: unknown): ProjectRowMirror[] {
  if (!Array.isArray(rows)) return []
  const out: ProjectRowMirror[] = []
  for (const row of rows) {
    const record = asRecord(row)
    const id = record?.['id']
    const workspaceId = record?.['workspaceId']
    if (typeof id === 'string' && id !== '' && typeof workspaceId === 'string' && workspaceId !== '') {
      out.push({ id, workspaceId })
    }
  }
  return out
}

/**
 * 会话 → 项目锚（workspaces 快照成员归属 → 名下项目；未匹配 → 唯一项目兜底；多项目
 * 无锚 = undefined 不猜首个）。workspaces 快照缺席/异常 = 无锚同径。
 */
export function bugProjectIdOf(
  sessionId: string,
  workspacesSnapshot: unknown,
  projects: readonly ProjectRowMirror[],
): string | undefined {
  const items = asRecord(workspacesSnapshot)?.['items']
  if (sessionId !== '' && Array.isArray(items)) {
    for (const item of items) {
      const ws = asRecord(item)
      const workspaceId = ws?.['workspaceId']
      const sessionIds = ws?.['sessionIds']
      if (typeof workspaceId !== 'string' || !Array.isArray(sessionIds)) continue
      if (!sessionIds.includes(sessionId)) continue
      const match = projects.find((project) => project.workspaceId === workspaceId)
      if (match !== undefined) return match.id
    }
  }
  if (projects.length === 1) return projects[0]!.id
  return undefined
}

/** Bug source 接线依赖（注入面——测试替身/生产缺省两径） */
export interface BugSourceWiringDeps {
  readonly workspaces: WorkspacesServiceMirror
  /** forge RPC 工厂（Typert face——缺省 createForgeRpcClient，缺席 = 各调用点 reject fail-soft） */
  readonly makeRpc?: () => ForgeRpcClient | undefined
  /** 候选行图标件（ForgeBugGlyph 本体——IconProps 组件；缺席 = 行零 icon 键） */
  readonly bugIcon?: unknown
  /** 官方右栏服务（chip 点击 openReference 路由——缺席 = 引用点击返回 false 不拦截官方手势） */
  readonly sidebarRight?: SidebarRightMirror
}

/** Bug source + warm 面（官方 InputTriggerSource warm 槽——scope 出生预热，fire-and-forget） */
export interface BugSourceWithWarm extends BugReferenceSource {
  readonly warm: (session: { readonly sessionId: string }) => void
}

/** Bug source + openReference 面（官方 chip 点击路由缝——命中开台账 pane → true） */
export interface BugSourceWithOpenReference extends BugSourceWithWarm {
  openReference(session: { readonly sessionId: string }, ref: { readonly ref: string }): boolean
}

/**
 * Bug source 接线装配（createBugReferenceSource 纯模型的运行时依赖注入面——自壳侧
 * plugin.ts 迁入，裁决语义逐字保持）：projectId = 会话↔项目绑定事实（workspaces 快照
 * 成员归属 + projects.list 缓存）；listBugs = forge:bugs/list 传输递达（信封拆装；
 * 传输缺席 = reject——factory catch 消费为空候选 fail-soft）；warm = scope 出生预热。
 */
export function buildBugReferenceSource(deps: BugSourceWiringDeps): BugSourceWithOpenReference {
  const rpcOf = (): ForgeRpcClient | undefined => {
    if (deps.makeRpc !== undefined) return deps.makeRpc()
    try {
    return createForgeRpcClient()
    } catch {
      return undefined
    }
  }
  let projects: readonly ProjectRowMirror[] = []

  const workspaceSnapshot = (): unknown => {
    try {
      const list = deps.workspaces.list as { getSnapshot?: () => unknown } | undefined
      return typeof list?.getSnapshot === 'function' ? list.getSnapshot() : undefined
    } catch {
      return undefined
    }
  }
  const projectIdOf = (sessionId?: string): string | undefined =>
    bugProjectIdOf(sessionId ?? '', workspaceSnapshot(), projects)
  const refreshProjects = (): Promise<void> => {
    const rpc = rpcOf()
    if (rpc === undefined) return Promise.resolve()
    return rpc.projects
      .list()
      .then((rows) => {
        projects = bugProjectsFromRows(rows)
      })
      .catch(() => undefined)
  }

  const source = createBugReferenceSource({
    name: FORGE_BUG_SOURCE_NAME,
    projectId: projectIdOf,
    // 跨项目有界回退（serialize 锚定落空时逐项目现查）——refreshProjects 填充
    projectIds: () => projects.map((row) => row.id),
    listBugs: (query) => {
      const rpc = rpcOf()
      if (rpc === undefined) {
        return Promise.reject(new Error('dsh-forge project client: forge remote face 缺席（Bug 组 fail-soft 零候选）'))
      }
      return rpc.bugs.list(query)
    },
    // 慢取数诊断走 factory 缺省 console.warn——client bundle 诊断豁免面
  })

  /** 1.3 chip 点击 → Bug 台账 pane（官方 openReference 路由缝） */
  const openReference = (session: { readonly sessionId: string }, ref: { readonly ref: string }): boolean => {
    const bugId = bugIdOfRef(ref?.ref ?? '')
    if (bugId === undefined || deps.sidebarRight === undefined) return false
    try {
      // 项目锚缺席 = '' 地址段（pane 现查失败呈现缺省态——不阻断点击路由）
      deps.sidebarRight.openResource(bugAddressOf(projectIdOf(session?.sessionId ?? '') ?? '', bugId), { kind: BUG_TAB_KIND })
      return true
    } catch {
      return false
    }
  }

  return {
    ...source,
    order: FORGE_BUG_SOURCE_ORDER,
    candidates: async (session, req) => {
      const rows = await source.candidates(session, req)
      return deps.bugIcon === undefined ? rows : rows.map((row) => ({ ...row, icon: deps.bugIcon }))
    },
    warm: (session) => {
      void refreshProjects()
        .then(() => {
          const projectId = projectIdOf(session.sessionId)
          const rpc = rpcOf()
          if (projectId === undefined || rpc === undefined) return undefined
          // 预取不丢弃——全量台账种进快照（持久化还原 chip 无插入事件，
          // serialize 依赖此种子命中全卡）；同一次预取种项目台账
          return rpc.bugs
            .list({ projectId })
            .then((rows) => {
              source.seedSnapshots(Array.isArray(rows) ? rows : [])
              if (Array.isArray(rows)) source.seedLedger(projectId, rows)
            })
            .catch(() => undefined)
        })
        .catch(() => undefined)
    },
    openReference,
  }
}

/**
 * Bug 引用 source 登记行（apply 编排）：官方 `ctx.inputTriggers.registerSource` 挂 T1
 * Bug source——服务取法 = reflect.get 惰性 fail-soft（缺席/异常 = 不注册、不报错、不炸）；
 * duplicate throw（官方守卫）= 吞掉不炸。撤销面 = ctx.effect 级联（effect 面缺席 = 跳过
 * ——登记本身仍成立）。
 */
export function registerBugReferenceSource(
  ctx: OfficialSeamCtx,
  workspaces: WorkspacesServiceMirror,
  sidebarRight: SidebarRightMirror,
): BugSourceWithOpenReference | undefined {
  const inputTriggers = asRecord(reflectGet(ctx, 'inputTriggers'))
  const registerSource = inputTriggers?.['registerSource']
  if (typeof registerSource !== 'function') return undefined
  const source = buildBugReferenceSource({ workspaces, sidebarRight, bugIcon: ForgeBugGlyph })
  try {
    const dispose = (registerSource as (src: unknown) => unknown).call(inputTriggers, source)
    ctx.effect?.call?.(ctx as object, () => (typeof dispose === 'function' ? (dispose as () => void) : undefined), 'dswf-bug: input trigger source')
    // 登记期预热：projects 缓存先行（锚定会话场景仍以 scope 出生 warm 为准）
    source.warm({ sessionId: '' })
  } catch {
    // 注册被拒（duplicate 等）——fail-soft 不炸 apply；source 仍返回（未注册的 source
    // 无 chip 产出，缓存面无害）
  }
  return source
}

// ── chip 重建缝（bug 4b34e5d8）——引用插入服务切片 + 页内全局发布 ──

/** 会话绑定窄面（sessions.binding 消费切片） */
interface SessionsBindingMirror {
  binding(sessionId: string): { readonly ctx: unknown } | undefined
}

/** composer 输入 facade 窄面（conversation.input.for 消费切片——结构同型镜像） */
interface ComposerInputMirror {
  setDraft(text: string): void
  submit(): void
  focus(): void
}

/** chip 重建缝服务切片组装（sessions.binding + conversation.input.for + bail——自壳侧
 * bugReferenceServicesOf 迁入，调用期惰性解析 conversation 未 inject 服务） */
function referenceServicesOf(
  ctx: OfficialSeamCtx,
  sessions: SessionsBindingMirror,
): Parameters<typeof watchBugChipRestore>[0] {
  return {
    sessions: {
      binding: (sessionId) => sessions.binding(sessionId),
    },
    conversation: {
      input: {
        for: (actx: unknown): ComposerInputMirror => {
          const resolved = (
            asRecord(reflectGet(ctx, 'conversation'))?.['input'] as
              | { for?: (actx: unknown) => unknown }
              | undefined
          )?.['for']?.(actx)
          if (resolved === undefined || resolved === null) {
            throw new Error('conversation.input.for 缺席（会话输入缝未就绪）')
          }
          return resolved as ComposerInputMirror
        },
      },
    },
    // scoped 事件发射（cordis bail——actx 作主语；缺席 = undefined 返回 → 判未应用走兜底）
    bail: (actx, name, payload) =>
      (actx as { bail?: (subject: unknown, name: string, payload: unknown) => unknown }).bail?.(
        actx,
        name,
        payload,
      ),
  } as Parameters<typeof watchBugChipRestore>[0]
}

/** Bug source 页内缝（壳侧 1.4 快速路径跨 bundle 消费 cacheBugSnapshot；openReference
 * 同面直达——官方 web 无 dshForge 桥时 @ 菜单零候选的 tab 开面路由，e2e/CDP 取证同径） */
interface BugSourceCacheGlobal {
  cacheBugSnapshot(card: { readonly bugId: string; readonly summary: string }): void
  openReference(session: { readonly sessionId: string }, ref: { readonly ref: string }): boolean
}

/** 缝键（BugChipRestorer 页内全局见 ChipRestoreOverlay.tsx；source 缓存缝同族） */
const BUG_SOURCE_CACHE_KEY = '__DSH_FORGE_BUG_SOURCE__'

// ── 注册面本体 ──

/** 缝面注册诊断（registered = 实际落座的缝面；e2e/排障锚——boot 一行汇总） */
export interface OfficialSeamDiagnostics {
  readonly registered: string[]
}

/**
 * 官方缝注册面（fix-13 迁移面——apply 期自注册五面）：
 *   ① `conversation.session.header.actions` list 行 'dswf-worktree-chip'（会话头只读
 *      chip——scope session 由槽 runtime 在会话视图内递达 sessionId）；
 *   ② `conversation.input.overlay` 行 'dswf-worktree-seal'（封存提示双通道）；
 *   ③ `conversation.input.overlay` 行 'dswf-bug-chip-restore'（chip 重建零视觉效应行）；
 *   ④ Bug 台账 tab 两段：`sidebarRightTabs.register` 类型定义 + `sidebar.right.pane.tab`
 *      keyed 'dswf-bug' body；
 *   ⑤ @ 补全 Bug source（inputTriggers.registerSource）+ chip 重建缝页内全局发布。
 * 逐面 try/catch（单面异常只降本面，console.warn 留痕不炸装配）；slots 声明缝 =
 * registerKeyedSection（官方 SlotRegistry.inject——随调用者 fiber 卸载级联）。
 */
export function registerOfficialSeamFaces(
  ctx: OfficialSeamCtx,
  slots: SectionSlotsFace,
): OfficialSeamDiagnostics {
  const registered: string[] = []
  const face = (name: string, registerFace: () => void): void => {
    try {
      registerFace()
      registered.push(name)
    } catch (error) {
      console.warn(`[dsh-forge/project] official seam face '${name}' registration failed——降级不注册`, error)
    }
  }

  // ① 会话头只读 chip（list 行 id + order 同壳侧登记形状）
  face(WORKTREE_CHIP_ENTRY_ID, () => {
    if (registerKeyedSection(slots, {
      slot: SESSION_HEADER_ACTIONS_SLOT,
      id: WORKTREE_CHIP_ENTRY_ID,
      order: WORKTREE_CHIP_ORDER,
      component: ForgeSessionWorktreeChip,
    }) === undefined) throw new Error('slots face unavailable')
  })

  // ② 封存提示 overlay 行（list 槽官方校验必带 id——bug 判例 2026-10-16）
  face(SEAL_NOTICE_ENTRY_ID, () => {
    if (registerKeyedSection(slots, {
      slot: CONVERSATION_INPUT_OVERLAY_SLOT,
      id: SEAL_NOTICE_ENTRY_ID,
      component: ForgeWorktreeSealOverlay,
    }) === undefined) throw new Error('slots face unavailable')
  })

  // ③ Bug chip 重建 overlay 行（零视觉——会话作用域挂载即接重建订阅缝）
  face(BUG_CHIP_RESTORE_ENTRY_ID, () => {
    if (registerKeyedSection(slots, {
      slot: CONVERSATION_INPUT_OVERLAY_SLOT,
      id: BUG_CHIP_RESTORE_ENTRY_ID,
      component: ForgeBugChipRestoreOverlay,
    }) === undefined) throw new Error('slots face unavailable')
  })

  // ④ Bug 台账 tab 两段（类型定义 + keyed body——「adding a type is a registration」官方口径）
  face(BUG_TAB_KIND, () => {
    const tabs = ctx.get('sidebarRightTabs') as SidebarRightTabsMirror | undefined
    if (tabs === undefined || typeof tabs.register !== 'function') {
      throw new Error('ctx.sidebarRightTabs.register absent')
    }
    const disposeType = tabs.register({
      id: BUG_TAB_KIND,
      kind: BUG_TAB_KIND,
      multiple: true,
      patterns: [`${BUG_ADDRESS_PREFIX}**`],
      canOpen: (address: string): boolean => address.startsWith(BUG_ADDRESS_PREFIX),
      title: (address: string): string => {
        const bugId = bugIdOfAddress(address)
        return bugId === undefined ? 'Bug 台账' : `Bug ${bugId}`
      },
    })
    const body = registerKeyedSection(slots, {
      slot: SIDEBAR_RIGHT_PANE_TAB_SLOT,
      key: BUG_TAB_KIND,
      component: ForgeBugPreview,
    })
    // 撤销器归 ctx.effect 级联（effect 面缺席 = 直挂登记，随 slots.inject 声明缝回收 body）
    ctx.effect?.call?.(ctx as object, () => (typeof disposeType === 'function' ? disposeType : undefined), 'dswf-bug: dock tab type')
    if (body === undefined) throw new Error('slots face unavailable')
  })

  // ⑤ @ 补全 Bug source + chip 重建缝页内全局发布
  face(FORGE_BUG_SOURCE_NAME, () => {
    const workspaces = ctx.get('workspaces') as WorkspacesServiceMirror | undefined
    const sidebarRight = ctx.get('sidebarRight') as SidebarRightMirror | undefined
    const sessions = ctx.get('sessions') as SessionsBindingMirror | undefined
    if (workspaces === undefined || sidebarRight === undefined || sessions === undefined) {
      throw new Error('official services absent（workspaces/sidebarRight/sessions）')
    }
    const source = registerBugReferenceSource(ctx, workspaces, sidebarRight)
    if (source !== undefined) registered.push(`input-triggers:${FORGE_BUG_SOURCE_NAME}`)
    const restorer: BugChipRestorer = (sessionId: string): (() => void) | void =>
      watchBugChipRestore(referenceServicesOf(ctx, sessions), sessionId)
    publishBugChipRestorer(restorer)
    // 页内缝 = registered source 本体（openReference 同面直达——官方 web 无 dshForge 桥时
    // @ 菜单零候选，bug tab 开面走本缝路由；e2e/CDP 取证同径）。source 缺席（登记被拒）
    // = 零发布（fail-soft：消费侧 bugSourceCacheOf undefined 不炸）。
    if (source !== undefined) {
      ;(globalThis as Record<string, unknown>)[BUG_SOURCE_CACHE_KEY] = source satisfies BugSourceCacheGlobal
    }
  })

  return { registered }
}

/** Bug source 缓存缝读取（壳侧 1.4 快速路径消费——本 bundle 未装载/已卸载 = undefined fail-soft） */
export function bugSourceCacheOf(): BugSourceCacheGlobal | undefined {
  const face = (globalThis as Record<string, unknown>)[BUG_SOURCE_CACHE_KEY]
  return asRecord(face) !== undefined && typeof (face as BugSourceCacheGlobal).cacheBugSnapshot === 'function'
    ? (face as BugSourceCacheGlobal)
    : undefined
}

/** 缝面摘除（apply catch/卸载补撤销——页内全局零死闭包残留） */
export function revokeOfficialSeamGlobals(): void {
  publishBugChipRestorer(undefined)
  delete (globalThis as Record<string, unknown>)[BUG_SOURCE_CACHE_KEY]
}

