// dock tab 族注册面（定位：装配——1.45 自 apps/web 壳侧 plugin.ts registerDockTabs 迁入
// 本包，fix-13 模式：注册归插件域，官方宿主不装载产品壳时本面仍随插件 bundle 自注册）。
// 两段注册（tech-design Integration #3/#4——「adding a type is a registration, never an
// edit」官方口径）：
//   第一段 = sidebarRightTabs.register 两类型——
//     - `dswf-overview` 页型（无 patterns，按 kind 开）：guide 入口卡 order 0（官方
//       files/terminal/browser = 10/20/30 → 排最前）；拾取由官方 GuideBody
//       `tab.actions.openTab(kind, {replaceTab:true})` 原位替换开始 tab（产品零代码）；
//     - `dswf-doc` 资源型：multiple（异地址各自成 tab）+ patterns 整地址 glob + canOpen
//       前缀防御；去重 = 地址本身（官方资源面缺省）；
//   第二段 = `sidebar.right.pane.tab` keyed 两 body（dispatch 键 = 定义 id；组件本体 =
//     本包 dock-tabs/dock-tabs.tsx——ForgeOverviewTab/ForgeDocsTab）。
// overview inject 面 = { bridge（页内缝 __DSH_FORGE_WORKBENCH__ 现读——knowledge-face
// workbenchBridgeOf 模式；桥本体 = 壳 C 类域）, onOpenSession/onOpenWorkerSession
// （session-actions openSessionWithLedgerAddress）, openSession（buildOpenSessionOrchestrator
// ——ctx reflect 现查 conversation/agentPresets，5.2 勘误配方）, addBugToSession
// （buildBugQuickAdder——noteInserted 用本包 bugSourceCacheOf，official-seams 已有）}。
// 逐面 try/catch fail-soft（单面异常只降本面，console.warn 留痕不炸装配）；类型撤销器
// 归 ctx.effect 级联（official-seams Bug tab 同径）。
import { ForgeDocsTab, ForgeOverviewTab, DSWF_DOC_ADDRESS_PREFIX, DSWF_DOC_TAB_KIND, DSWF_OVERVIEW_TAB_KIND } from './dock-tabs/dock-tabs.js'
import { typertRpcClientFactory } from './dock-tabs/typert-transport.js'
import { SIDEBAR_RIGHT_PANE_TAB_SLOT, type OfficialSeamCtx } from './official-seams.js'
import { bugSourceCacheOf } from './official-seams.js'
import { registerKeyedSection, type SectionSlotsFace } from './keyed-section.js'
import { FORGE_PROJECT_LOCALE_NS, type LocaleServiceFace } from './locale.js'
import {
  buildBugQuickAdder,
  buildOpenSessionOrchestrator,
  docTabTitle,
  openSessionWithLedgerAddress,
  type BugQuickAddInput,
  type ForgeSessionsService,
  type ForgeUiWorkspaceService,
  type ForgeWorkspacesService,
} from './session-actions.js'

/** apply ctx 窄面（OfficialSeamCtx 增 uiWorkspace 边——概览 inject 面跳会话动作源） */
interface DockTabsFaceCtx extends OfficialSeamCtx {
  get(name: 'sidebarRight' | 'sidebarRightTabs' | 'workspaces' | 'sessions' | 'uiWorkspace'): unknown
}

/** workbench 桥窄面（壳 createWorkbenchBridge 产物结构同型镜像——knowledge-face 同款消费切片） */
interface WorkbenchBridgeMirror {
  subscribe(listener: () => void): () => void
  getSnapshot(): Record<string, unknown>
}

/** 页内桥缝读取（inject 期现查不缓存——缺席/劣形 = undefined fail-soft） */
function workbenchBridgeOf(): WorkbenchBridgeMirror | undefined {
  const bridge = (globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__
  if (typeof bridge !== 'object' || bridge === null) return undefined
  const record = bridge as Record<string, unknown>
  return typeof record['subscribe'] === 'function' && typeof record['getSnapshot'] === 'function'
    ? (bridge as WorkbenchBridgeMirror)
    : undefined
}

/** 官方右栏 tab 类型注册表窄面（ui-sidebar-right SidebarRightTabRegistry 消费切片——壳侧退役面同形） */
interface SidebarRightTabsMirror {
  /** 注册一个 tab 类型（本插件生命周期内有效；id 冲突/同带 kind 冲突抛错） */
  register(definition: {
    readonly id: string
    readonly kind: string
    readonly multiple?: boolean
    readonly patterns?: readonly string[]
    readonly priority?: 'extension' | 'builtin' | 'fallback'
    readonly canOpen?: (address: string) => boolean
    readonly title: (address: string) => string
    readonly guide?: readonly {
      readonly id: string
      readonly order: number
      readonly title: () => string
      readonly description?: () => string
    }[]
  }): () => void
}

/** 注册面诊断（registered = 实际落座面；e2e/排障锚） */
export interface DockTabsFaceDiagnostics {
  readonly registered: string[]
}

/**
 * dock tab 族注册（apply 编排）：类型定义两枚 + keyed body 两枚，逐面 fail-soft。
 * sidebarRightTabs/sessions/uiWorkspace 服务经 ctx.get 现查（插件 inject 列表现有该边）；
 * locale 缺席 = label 回退 ns 键名呈现（注册不阻断）。
 */
export function registerDockTabsFace(
  ctx: DockTabsFaceCtx,
  slots: SectionSlotsFace,
  locale: LocaleServiceFace,
): DockTabsFaceDiagnostics {
  const registered: string[] = []
  const face = (name: string, registerFace: () => void): void => {
    try {
      registerFace()
      registered.push(name)
    } catch (error) {
      console.warn(`[dsh-forge/project] dock tab face '${name}' registration failed——降级不注册`, error)
    }
  }
  const t = locale.bind(FORGE_PROJECT_LOCALE_NS)
  const tabs = ctx.get('sidebarRightTabs') as SidebarRightTabsMirror | undefined
  // workspaces/sessions/uiWorkspace 不在 apply 期取（bug fba7913c / bug 757b0441——官方
  // 服务惰性实例化，apply 点 undefined 被闭包缓存 → 概览 body 注册失败降级不注册）；改
  // inject 期现查（AGENTS 1.6——检测永不缓存），inject 时点服务已实例化。

  // 第一段①：概览页型 + guide 入口卡 order 0（官方入口卡 10/20/30——升序排最前）
  face(DSWF_OVERVIEW_TAB_KIND, () => {
    if (tabs === undefined || typeof tabs.register !== 'function') {
      throw new Error('ctx.sidebarRightTabs.register absent')
    }
    const disposeType = tabs.register({
      id: DSWF_OVERVIEW_TAB_KIND,
      kind: DSWF_OVERVIEW_TAB_KIND,
      title: () => t('tab.overview'),
      guide: [
        {
          id: 'overview',
          order: 0,
          title: () => t('tab.overview'),
          description: () => t('guide.overview.desc'),
        },
      ],
    })
    // 撤销器归 ctx.effect 级联（official-seams Bug tab 同径）
    ctx.effect?.call?.(ctx as object, () => (typeof disposeType === 'function' ? disposeType : undefined), 'dswf-overview: dock tab type')
  })

  // 第一段②：文档资源型（multiple + patterns + canOpen 前缀防御；去重 = 地址本身）
  face(DSWF_DOC_TAB_KIND, () => {
    if (tabs === undefined || typeof tabs.register !== 'function') {
      throw new Error('ctx.sidebarRightTabs.register absent')
    }
    const disposeType = tabs.register({
      id: DSWF_DOC_TAB_KIND,
      kind: DSWF_DOC_TAB_KIND,
      multiple: true,
      patterns: [`${DSWF_DOC_ADDRESS_PREFIX}**`],
      canOpen: (address: string): boolean => address.startsWith(DSWF_DOC_ADDRESS_PREFIX),
      title: docTabTitle,
    })
    ctx.effect?.call?.(ctx as object, () => (typeof disposeType === 'function' ? disposeType : undefined), 'dswf-doc: dock tab type')
  })

  // 第二段①：概览 keyed body（inject 面 = 桥[页内缝现读] + 跳会话 + 编排器 + Bug 快速路径）
  // 注册/挂载拆分（bug 757b0441）：apply 期无条件注册（tab 骨架恒在，注册不绑数据服务）；
  // sessions/uiWorkspace 改 inject 时点现查（AGENTS 1.6——检测永不缓存、每消费点现查），
  // 到场即挂会话动作面真值内容、缺席 = 会话动作键整体缺省 → 组件空态呈现，不悬空炸面。
  face(`${SIDEBAR_RIGHT_PANE_TAB_SLOT}:${DSWF_OVERVIEW_TAB_KIND}`, () => {
    if (registerKeyedSection(slots, {
      slot: SIDEBAR_RIGHT_PANE_TAB_SLOT,
      key: DSWF_OVERVIEW_TAB_KIND,
      inject: () => {
        // 消费点现查（apply 期闭包缓存退役——bug fba7913c 同径；electron dev 宿主服务
        // 惰性实例化，apply 点 sessions/uiWorkspace 缺席 = 挂载点现查命中补挂）
        const sessions = ctx.get('sessions') as ForgeSessionsService | undefined
        const uiWorkspace = ctx.get('uiWorkspace') as ForgeUiWorkspaceService | undefined
        const workspaces = ctx.get('workspaces') as ForgeWorkspacesService | undefined
        const servicesPresent = sessions !== undefined && uiWorkspace !== undefined
        return {
          bridge: workbenchBridgeOf(),
          // 概览锚自解析服务缝（fix-11 缺陷 A——桥缺席/桥锚 null 时插件自解析退路；
          // sessions/workspaces 服务现查产物直递，缺席 = 无退路维持空态）
          ...(servicesPresent && workspaces !== undefined ? { selfAnchor: { sessions, workspaces } } : {}),
          // 数据通道真身（fix-15——bug 9c5469c8）：官方宿主无 window.dshForge preload
          // 传输，缺省工厂构造期即崩（slot entry crashed → 概览零渲染）。显式递 Typert
          // 适配工厂——官方宿主七族通道在场照常送达，缺席族（tasks/docs/knowledge/
          // settings）typed 拒绝 → 消费面错误相位 fail-soft。
          makeClient: typertRpcClientFactory,
          // 会话动作面（服务缺席 = 整体缺键——组件可选 props 空态呈现）
          ...(servicesPresent
            ? {
                onOpenSession: (sessionId: string): void => {
                  // 官方导航动作面（同 sidebar.workspaces openSession 注入——fix-11 口径）
                  uiWorkspace.openSession(sessionId)
                },
                // S5 列表行 ⟞：worker 执行子会话打开径（账本判读 + refresh 兜底单源——ShellHost 同径）
                onOpenWorkerSession: (childSessionId: string, parentSessionId?: string): void => {
                  openSessionWithLedgerAddress({ sessions, uiWorkspace }, childSessionId, parentSessionId)
                },
                // 打开新会话编排器（openSessionWithPreset + 跳转姊妹出口——概览三子 tab 共源）
                openSession: buildOpenSessionOrchestrator(ctx, uiWorkspace, sessions, workspaces),
                // Bug 快速路径（有活跃会话 scoped 插入/无活跃会话开新会话预填；快照落缓存经本包
                // bugSourceCacheOf——bug 27ab222b）
                addBugToSession: buildBugQuickAdder(
                  ctx,
                  sessions,
                  buildOpenSessionOrchestrator(ctx, uiWorkspace, sessions, workspaces),
                  (bug: BugQuickAddInput): void => {
                    bugSourceCacheOf()?.cacheBugSnapshot(bug)
                  },
                ),
              }
            : {}),
        }
      },
      component: ForgeOverviewTab,
    }) === undefined) throw new Error('slots face unavailable')
  })

  // 第二段②：文档 keyed body（useTabInfo 由 seat 声明 inject 恒递达；makeClient = Typert
  // 适配工厂——fix-15 同族批斩，docs.read 通道官方宿主缺席 = typed 错误相位不炸槽）
  face(`${SIDEBAR_RIGHT_PANE_TAB_SLOT}:${DSWF_DOC_TAB_KIND}`, () => {
    if (registerKeyedSection(slots, {
      slot: SIDEBAR_RIGHT_PANE_TAB_SLOT,
      key: DSWF_DOC_TAB_KIND,
      inject: () => ({ makeClient: typertRpcClientFactory }),
      component: ForgeDocsTab,
    }) === undefined) throw new Error('slots face unavailable')
  })

  return { registered }
}
