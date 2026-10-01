// 产品 client 插件本体（定位：装配——可测纯面；入口 index.ts 零导出保 classic script 形状）。
// 2.7：槽位路线 A —— 替换官方 ui-sidebar 壳 sidebar.workspaces 洞位（tech-design
// Integration）与品牌行内容洞位（sidebar.brand.mark/name）；壳级几何/收展（56px rail ↔
// 展开宽）/新会话/快捷键全部白拿（AC1）。组件本体不进本 bundle（classic script 自含
// 纪律 + React 单例）——经壳 bundle 发布面 __DSH_FORGE_VIEWS__ 递达（缺席 = 装配断裂
// fail-loud）。
// 契约依据（上游 0.2.0-rc.2 源码核实，G1 契约面清单第 3 项——S2 残留 #1 清点入池）：
//   - ui-sidebar slots.ts：'sidebar.workspaces' single/root，owner = SidebarSectionOwnerProps
//     { wide, expandSidebar }；'sidebar.brand.mark' owner { size }；'sidebar.brand.name'
//     owner { children?: never }（占位者自持内容）。
//   - ui-slots SlotCore：single 槽 priority 升序最低者渲染（lowest renders）；同 priority
//     再注册即抛——官方占用者（ui-workspace 浏览器 / 官方品牌行）缺省 priority 0，
//     产品行取 -100 影子替换。
//   - SlotRegistry.inject(key, cb)：洞位声明在场（或入座时）装 cb 效果，随本插件 fiber
//     卸载级联回收——插件热卸载即还原官方占用者。
// 运行期锚（e2e 实证，2.7）：插件长活依赖 profile 置停 client-hmr——其全图 sync 会以宿主
// 最新图对账掉壳掌舵追加的本行（实测激活 ~145ms 后被 prune、槽位注册级联回收），
// 见 apps/host profile cordis.patch.yml 的 client-hmr 行（S2 清单残留 #3 的处置）。
import type { ModuleLoaderFacade } from '../shell/dsh-globals.js'

/** 插件 id（= 注册键 = Loader entry 名 = 掌舵入图 id；与 shell/boot.ts 掌舵参数同源） */
export const FORGE_CLIENT_PLUGIN_ID = '@dsh-forge/web-client'

/** 洞名：官方 sidebar 壳的工作区浏览区（本项目树 + 会话列表占用此洞——AC1 替换目标） */
export const SIDEBAR_WORKSPACES_SLOT = 'sidebar.workspaces'
/** 洞名：品牌行字标 / 字名（壳拥有品牌行；内容洞位 = 产品品牌件） */
export const SIDEBAR_BRAND_MARK_SLOT = 'sidebar.brand.mark'
export const SIDEBAR_BRAND_NAME_SLOT = 'sidebar.brand.name'
/** 影子优先级（single 槽 lowest renders；官方占用者缺省 0 → -100 = 产品面板替换占用者） */
export const SIDEBAR_SHADOW_PRIORITY = -100

/** 插件依赖的服务名（cordis inject——apply 等待三服务在场；与官方 ui-workspace 同型先例） */
export const FORGE_CLIENT_INJECT = ['slots', 'sessions', 'workspaces'] as const

/** dsh 槽位服务窄面（结构同型镜像——bundle 零外部 import） */
export interface ForgeSlotsService {
  /** 依赖洞位声明：声明在场（或入座）即装 cb；cb 返回即释放器（随 fiber 卸载级联） */
  inject(key: string, callback: () => (() => void) | undefined): () => void
  /** 注册占用者（options.name = 洞名；priority = single 槽影子序） */
  register(options: { name: string; priority?: number; inject?: () => object }, component: unknown): () => void
}

/** dsh 会话服务窄面（ISessions 消费切片：账本快照源 + 打开） */
export interface ForgeSessionsService {
  /** 会话账本快照源（实时读——零缓存零副本的源本体） */
  readonly list: unknown
  /** 选择会话为当前（官方面：会话视图打开） */
  open(sessionId: string): void
}

/** dsh workspace 服务窄面（IWorkspaces 消费切片：归属快照源） */
export interface ForgeWorkspacesService {
  readonly list: unknown
}

/** 产品视图发布面窄面（product-views.ts 结构同型镜像） */
export interface ForgeViewsGlobal {
  __DSH_FORGE_VIEWS__?: {
    ForgeSidebarSlot: unknown
    ForgeBrandMark: unknown
    ForgeBrandName: unknown
  }
}

/** 插件 apply 的 ctx 窄面（cordis Context 消费切片——get 解析注入服务） */
export interface ForgeClientCtx {
  readonly slots: ForgeSlotsService
  get(name: 'sessions' | 'workspaces'): unknown
}

/** cordis 插件最小结构面（免引 cordis 运行时——bundle 零外部 import，保 classic script 形状） */
export interface ForgeClientPlugin {
  readonly name: string
  readonly inject: readonly string[]
  apply(ctx: unknown): void
}

/** 槽位注册诊断（registered = 声明回调内实际落座的洞位；error = 注册链失败因——e2e/排障面） */
export interface SidebarSlotDiagnostics {
  readonly registered?: readonly string[]
  readonly error?: string
}

/** 激活自证面（e2e 消费；先于槽位注册立标——注册失败不断 e2e 面） */
export interface ForgeClientActiveMarker {
  readonly plugin: string
  readonly activatedAt: number
  readonly sidebar?: SidebarSlotDiagnostics
}

/** 洞位注册一行（注入面经 make 产出；落座后回填诊断） */
function registerSidebarSlot(
  ctx: ForgeClientCtx,
  key: string,
  diagnostics: { registered?: string[] },
  make: () => (() => void) | undefined,
): void {
  ctx.slots.inject(key, () => {
    const dispose = make()
    diagnostics.registered = [...(diagnostics.registered ?? []), key]
    return dispose
  })
}

/** 取产品视图发布面（缺席 = 装配断裂：壳 bundle 未发布/被裁——fail-loud 不静默降级） */
export function publishedViews(): NonNullable<ForgeViewsGlobal['__DSH_FORGE_VIEWS__']> {
  const views = (globalThis as ForgeViewsGlobal).__DSH_FORGE_VIEWS__
  if (views === undefined) {
    throw new Error(
      'dsh-forge web-client: __DSH_FORGE_VIEWS__ 发布面缺席（main.ts product-views 未求值）——槽位替换组件源断裂',
    )
  }
  return views
}

/** 插件本体（client bundle factory 的返回值 = 模块 exports）。 */
export function forgeClientPlugin(): ForgeClientPlugin {
  return {
    name: FORGE_CLIENT_PLUGIN_ID,
    inject: [...FORGE_CLIENT_INJECT],
    apply(ctx: unknown) {
      const diagnostics: { registered?: string[]; error?: string } = {}
      const marker: ForgeClientActiveMarker = {
        plugin: FORGE_CLIENT_PLUGIN_ID,
        activatedAt: Date.now(),
        sidebar: diagnostics,
      }
      ;(globalThis as { __DSH_FORGE_CLIENT__?: ForgeClientActiveMarker }).__DSH_FORGE_CLIENT__ = marker
      const clientCtx = ctx as ForgeClientCtx
      try {
        const views = publishedViews()
        const sessions = clientCtx.get('sessions') as ForgeSessionsService
        const workspaces = clientCtx.get('workspaces') as ForgeWorkspacesService

        // 工作区洞位替换（AC1）：注入面携带 dsh 面数据源与动作（面板侧 useSyncExternalStore 直读）
        registerSidebarSlot(clientCtx, SIDEBAR_WORKSPACES_SLOT, diagnostics, () =>
          clientCtx.slots.register(
            {
              name: SIDEBAR_WORKSPACES_SLOT,
              priority: SIDEBAR_SHADOW_PRIORITY,
              inject: () => ({
                sessions: sessions.list,
                workspaces: workspaces.list,
                openSession: (sessionId: string): void => {
                  sessions.open(sessionId)
                },
              }),
            },
            views.ForgeSidebarSlot,
          ),
        )

        // 品牌行内容洞位（行本体与新会话快捷交互归壳——AC3 品牌行点击 = 官方 startSession）
        registerSidebarSlot(clientCtx, SIDEBAR_BRAND_MARK_SLOT, diagnostics, () =>
          clientCtx.slots.register(
            { name: SIDEBAR_BRAND_MARK_SLOT, priority: SIDEBAR_SHADOW_PRIORITY },
            views.ForgeBrandMark,
          ),
        )
        registerSidebarSlot(clientCtx, SIDEBAR_BRAND_NAME_SLOT, diagnostics, () =>
          clientCtx.slots.register(
            { name: SIDEBAR_BRAND_NAME_SLOT, priority: SIDEBAR_SHADOW_PRIORITY },
            views.ForgeBrandName,
          ),
        )
      } catch (error) {
        diagnostics.error = error instanceof Error ? error.message : String(error)
      }
    },
  }
}

/** 注册进 __ModuleLoader__（queue 态入待载队列、live 态直注；缺席 = 装配断裂 fail-loud）。 */
export function registerForgeClient(loader: ModuleLoaderFacade): void {
  loader.load({
    id: FORGE_CLIENT_PLUGIN_ID,
    factory: () => forgeClientPlugin() as unknown as Record<string, unknown>,
  })
}

/** 注册面读取器（测试注入 fake 用；生产面 = 页面全局 __ModuleLoader__）。 */
export function moduleLoaderFacade(): ModuleLoaderFacade {
  const loader = (globalThis as { __ModuleLoader__?: ModuleLoaderFacade }).__ModuleLoader__
  if (loader === undefined) {
    throw new Error('dsh-forge web-client: window.__ModuleLoader__ 注册面缺席（bundle 未经 boot 注入/掌舵装载）')
  }
  return loader
}
