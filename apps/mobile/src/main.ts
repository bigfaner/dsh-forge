/**
 * 生产入口装配（薄组合层——AGENTS.md §3.1 复用纪律：只做组合与注入，业务逻辑全在 core/views）。
 *
 * 首屏流（bug 63ee4a3d 修复——脚手架占位升级为正式接线）：
 *   模式探测（hostnameMode + GET /remote/forge-stream 语义）→
 *   · lan（IP 字面量/回环）：defaultApiDeps 直连 → createRemoteRpc + createOfficialApi → 主视图链；
 *   · tunnel（域名形态）：PSK+PIN 双因子配对面（1.31 语义：sid-epoch 身份、加密 forge-stream、
 *     host 公钥静态验签）→ establishTunnelMaterial 激活 → createTunnelTransport 信封化 rpc → 主视图链。
 * 主视图链：createRouter(windowHashSource()) 六路由（hero/chat/drawer/settings/models/worker）
 * + 浮层（settings sheet / models / tasks FAB / ask / reader）不走路由。
 * forge-stream：sid/epoch 订阅（隧道 = AEAD+验签帧，lan = 明文镜像）→ 帧驱动刷新腿
 * （drawer/tasks/worker 重投影 + user-questions/request → ask 浮层），轮询兜底在视图层既有面。
 */
import './style.css'
import { createOfficialApi, defaultApiDeps, type ApiDeps, type OfficialApi } from './core/api.ts'
import {
  createRemoteRpc,
  PROXY_FILE_CHANNEL,
  type RemoteRpc,
} from './core/rpc.ts'
import { createRouter, windowHashSource, type RouteMatch, type Router } from './core/router.ts'
import { createStore } from './core/store.ts'
import {
  browserRandomBytes,
  createSessionIdentity,
  detectTunnelMode,
  type KvStorage,
  type TunnelMode,
} from './core/tunnel.ts'
import { createTunnelTransport, type TunnelMaterial, type TunnelSession } from './core/tunnel-transport.ts'
import {
  createForgeStreamSource,
  type ForgeStreamSource,
} from './core/forge-stream-source.ts'
import type { WireEvent } from './core/wire.ts'
import { createTunnelPanel } from './widgets/tunnel-panel.ts'
import { createFab } from './widgets/fab.ts'
import { createHeroView } from './views/hero.ts'
import { coerceHistoryWindow, createChatView, defaultStreamEngine } from './views/chat.ts'
import { createDrawerView, defaultFetchStatus } from './views/drawer.ts'
import { createSettingsSheet, type SettingsHandle } from './views/settings.ts'
import { createModelsView, recentStorageKey, type KeyValueStore } from './views/models.ts'
import { createTasksView } from './views/tasks.ts'
import { catalogProjection, createWorkerSessionView } from './views/worker.ts'
import { createAskView } from './views/ask.ts'
import { createReader } from './views/reader.ts'

// ---------------------------------------------------------------------------
// 装配态（一次构造、视图链共享——薄注入面）
// ---------------------------------------------------------------------------

interface AssemblyContext {
  rpc: RemoteRpc | null
  api: OfficialApi | null
  /** 隧道材料（lan = undefined——forge-stream 明文镜像径）。 */
  material: TunnelMaterial | undefined
  tunnel: boolean
  session: TunnelSession
  /** forge-stream 帧订阅腿（帧到达 → 逐订阅者通知；视图轮询兜底自理）。 */
  readonly frameListeners: Set<() => void>
}

/** 内存 Kv 兜底（storage 缺席环境——identity/游标/最近模型降级为页内态）。 */
function memoryKv(): KvStorage {
  const map = new Map<string, string>()
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
  }
}

function localStorageKv(): KvStorage | null {
  if (typeof window === 'undefined' || !window.localStorage) return null
  const ls = window.localStorage
  return {
    get: (key) => ls.getItem(key),
    set: (key, value) => ls.setItem(key, value),
  }
}

/** 视图 KeyValueStore 形状（localStorage 原生 get/set 语义——models/drawer/chat 既有消费面）。 */
function viewStore(): KeyValueStore | null {
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
}

export function mount(root: HTMLElement): void {
  const container = document.createElement('div')
  container.className = 'app-root'
  root.appendChild(container)

  const storage = localStorageKv()
  const identity = createSessionIdentity({
    storage: storage ?? memoryKv(),
    randomBytes: browserRandomBytes,
    now: () => Date.now(),
  })

  const ctx: AssemblyContext = {
    rpc: null,
    api: null,
    material: undefined,
    tunnel: false,
    session: identity.beginSession(),
    frameListeners: new Set(),
  }
  const router: Router = createRouter(windowHashSource())
  const store = createStore<{ currentSessionId: string | null }>({ currentSessionId: null })
  const pairDomain = (typeof window !== 'undefined' ? window.location.host : '') || 'default'

  // ---- 会话日志缓存（tasks/worker 投影数据源：api.history 快照 + 帧失效重拉）----
  const logCache = new Map<string, readonly WireEvent[]>()
  const emitFrames = (): void => {
    for (const listener of Array.from(ctx.frameListeners)) listener()
  }
  const getEvents =
    (sessionId: string) =>
    (): readonly WireEvent[] =>
      logCache.get(sessionId) ?? []
  const refreshLog = async (sessionId: string): Promise<void> => {
    if (ctx.api === null || sessionId === '') return
    try {
      const raw = await ctx.api.history(sessionId, 500)
      logCache.set(sessionId, coerceHistoryWindow(raw, 500).entries)
    } catch {
      /* 历史拉取失败保持旧快照（轮询/帧腿下轮重试） */
    }
  }

  // ---- forge-stream（懒开：会话面路由首达时订阅；hero 首屏零长连）----
  // 订阅前先探测端点语义（200 + text/event-stream）——缺席/静态预览形态 fail-soft 跳过
  // （视图层轮询兜底既有面自理），避免 EventSource MIME 报错噪音。
  let stream: ForgeStreamSource | null = null
  let streamOpening = false
  const openStream = (): void => {
    stream = createForgeStreamSource(
      ctx.session,
      { material: ctx.material },
      {
        openSource: (url, handlers) => {
          const source = new EventSource(url)
          source.addEventListener('frame', (event) => handlers.onFrame((event as MessageEvent).data as string))
          source.onerror = () => handlers.onError()
          return source
        },
      },
      {
        onEvent: (event) => {
          if (event.type === 'api-session/activity' || event.type === 'forge/progress') {
            const payload = event.payload as { sessionId?: unknown } | null
            if (typeof payload?.sessionId === 'string') void refreshLog(payload.sessionId)
          }
          emitFrames()
          if (event.type === 'user-questions/request') openAsk()
        },
        onError: () => {
          /* EventSource 自带重连；视图层轮询兜底自理（sse.ts 判活口径） */
        },
      },
    )
  }
  const ensureStream = (): void => {
    if (stream !== null || streamOpening || ctx.rpc === null) return
    streamOpening = true
    void fetch('/remote/forge-stream', { cache: 'no-store' })
      .then((response) => {
        const contentType = response.headers.get('content-type') ?? ''
        if (response.status === 200 && contentType.includes('text/event-stream')) openStream()
      })
      .catch(() => {
        /* 端点缺席 = 纯轮询兜底 */
      })
      .finally(() => {
        streamOpening = false
      })
  }

  // ---- 当前会话（chat/worker 路由写入；settings/models/tasks/ask 注入消费）----
  const currentSessionId = (): string => store.get().currentSessionId ?? ''
  const setCurrentSession = (sessionId: string): void => {
    if (store.get().currentSessionId === sessionId) return
    store.set({ currentSessionId: sessionId })
    void refreshLog(sessionId)
  }

  // ---- 浮层（不走路由——router.openOverlay 语义族；此处直挂 container）----
  let settingsSheet: SettingsHandle | null = null
  const closeSettings = (): void => {
    settingsSheet?.root.remove()
    settingsSheet = null
  }
  function openSettings(): void {
    if (ctx.rpc === null) return
    closeSettings()
    settingsSheet = createSettingsSheet({
      rpc: ctx.rpc,
      sessionId: currentSessionId(),
      onOpenModels: () => router.navigate('models'),
    })
    container.appendChild(settingsSheet.root)
    void settingsSheet.open()
  }
  function openReader(path: string): void {
    if (ctx.rpc === null) return
    const handle = createReader({
      path,
      rpc: ctx.rpc,
      onExit: () => handle.root.remove(),
    })
    container.appendChild(handle.root)
  }

  function openAsk(): void {
    if (ctx.rpc === null || currentSessionId() === '') return
    const view = createAskView({
      rpc: ctx.rpc,
      sessionId: currentSessionId(),
      onDone: () => view.remove(),
      subscribeStream: (onFrame) => {
        ctx.frameListeners.add(onFrame)
        return () => ctx.frameListeners.delete(onFrame)
      },
    })
    container.appendChild(view)
  }

  let tasksHandle: { root: HTMLElement } | null = null
  function openTasks(): void {
    if (ctx.rpc === null) return
    tasksHandle?.root.remove()
    const sessionId = currentSessionId()
    const handle = createTasksView({
      rpc: ctx.rpc,
      sessionId,
      getEvents: getEvents(sessionId),
      subscribe: (onFrame) => {
        ctx.frameListeners.add(onFrame)
        return () => ctx.frameListeners.delete(onFrame)
      },
      isStale: () => false,
      onClose: () => {
        handle.root.remove()
        tasksHandle = null
      },
    })
    tasksHandle = handle
    container.appendChild(handle.root)
  }

  // ---- 路由视图链 ----
  interface RenderedView {
    key: string
    root: HTMLElement
    dispose?: () => void
  }
  let rendered: RenderedView | null = null

  const openSession = (sessionId: string): void => {
    setCurrentSession(sessionId)
    router.navigate('chat', { id: sessionId })
  }
  const openDrawer = (): void => router.navigate('drawer')
  const openHero = (): void => router.navigate('hero')

  function heroDeps(): Parameters<typeof createHeroView>[0] {
    return {
      rpc: ctx.rpc!,
      api: ctx.api!,
      onOpenSession: openSession,
      onOpenDrawer: openDrawer,
      onOpenSettings: openSettings,
    }
  }

  async function enrichHero(): Promise<void> {
    // worktree 清单锚（best-effort：workspace.list 首行 path——缺席 = composer 只显当前分支）
    if (ctx.api === null) return
    try {
      const { items } = await ctx.api.listWorkspaces()
      const first = items.find((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      const path = typeof first?.['path'] === 'string' ? first['path'] : undefined
      if (path === undefined || path === '' || rendered?.key !== 'hero') return
      rendered.root.remove()
      rendered = { key: 'hero', root: createHeroView({ ...heroDeps(), projectRoot: path }) }
      container.appendChild(rendered.root)
    } catch {
      /* 清单锚缺席 = hero 降级形态（零清单直开） */
    }
  }

  function buildView(match: RouteMatch): RenderedView {
    if (ctx.rpc === null || ctx.api === null) return { key: 'boot', root: bootScreen() }
    switch (match.name) {
      case 'hero': {
        ensureStream()
        return { key: 'hero', root: createHeroView(heroDeps()) }
      }
      case 'chat': {
        ensureStream()
        const sessionId = match.params['id'] ?? ''
        setCurrentSession(sessionId)
        return {
          key: `chat:${sessionId}`,
          root: createChatView(sessionId, {
            api: ctx.api,
            pairDomain,
            createEngine: (sid, sink) => defaultStreamEngine(sid, sink),
            onOpenDrawer: openDrawer,
            onOpenHero: openHero,
            onOpenSettings: openSettings,
            onOpenDoc: openReader,
            resolveDocSize: async (path) => {
              const manifest = await ctx.rpc!.call<{ size?: unknown }>(PROXY_FILE_CHANNEL, {
                path,
                offset: 0,
                manifest: true,
              })
              return manifest.ok && typeof manifest.data.size === 'number' ? manifest.data.size : undefined
            },
            tunnel: ctx.tunnel,
          }),
        }
      }
      case 'drawer': {
        ensureStream()
        return {
          key: 'drawer',
          root: createDrawerView({
            rpc: ctx.rpc,
            fetchStatus: defaultFetchStatus,
            onOpenSession: openSession,
            onDisconnected: () => showPairing(),
            // 用户裁决 2026-10-22：连接详情「激活连接」钮 → 激活连接界面（配对面）
            onActivateConnection: () => showPairing(),
            // 用户裁决 2026-10-22：点抽屉外自动收起——回当前会话（无会话回 hero）
            onClose: () => {
              const sid = store.get().currentSessionId
              if (typeof sid === 'string' && sid !== '') openSession(sid)
              else openHero()
            },
            currentSessionId: store.get().currentSessionId ?? undefined,
            pairDomain,
            store: viewStore(),
            subscribeStream: (onFrame) => {
              ctx.frameListeners.add(onFrame)
              return () => ctx.frameListeners.delete(onFrame)
            },
          }),
        }
      }
      case 'models': {
        return {
          key: 'models',
          root: createModelsView({
            rpc: ctx.rpc,
            sessionId: currentSessionId(),
            recentKey: recentStorageKey(pairDomain),
            onBack: () => history.back(),
            onSelected: () => void settingsSheet?.refresh(),
            store: viewStore(),
          }),
        }
      }
      case 'worker': {
        ensureStream()
        const sessionId = match.params['sessionId'] ?? ''
        const parent = store.get().currentSessionId ?? sessionId
        const entry = catalogProjection(logCache.get(parent) ?? []).get(sessionId)
        const mode = entry?.mode === 'one-shot' ? ('one-shot' as const) : ('continuable' as const)
        const handle = createWorkerSessionView({
          sessionId,
          mode,
          label: entry?.label ?? '',
          api: ctx.api,
          getEvents: getEvents(sessionId),
          subscribe: (onEvent) => {
            let emitted = -1
            const listener = (): void => {
              const fresh = (logCache.get(sessionId) ?? []).filter((event) => event.seq > emitted)
              if (fresh.length === 0) return
              emitted = fresh.reduce((max, event) => Math.max(max, event.seq), emitted)
              for (const event of fresh) onEvent(event)
            }
            ctx.frameListeners.add(listener)
            return () => ctx.frameListeners.delete(listener)
          },
          onExit: () => history.back(),
        })
        return { key: `worker:${sessionId}`, root: handle.root, dispose: () => handle.dispose() }
      }
      default:
        return { key: 'hero', root: createHeroView(heroDeps()) }
    }
  }

  function renderRoute(match: RouteMatch | null): void {
    if (match === null) {
      router.navigate('hero')
      return
    }
    closeSettings()
    tasksHandle?.root.remove()
    tasksHandle = null
    rendered?.dispose?.()
    rendered?.root.remove()
    rendered = buildView(match)
    container.appendChild(rendered.root)
    // 会话面 FAB（任务浮球——1.16 意图入口；chat 路由在场）
    if (rendered.key.startsWith('chat:')) {
      const fab = createFab({ onActivate: openTasks })
      rendered.root.appendChild(fab.root)
    }
    if (rendered.key === 'hero') void enrichHero()
  }

  // ---- 配对面（tunnel 模式——PSK+PIN 双因子输入；激活成功进主视图链）----
  function bootScreen(): HTMLElement {
    const screen = document.createElement('div')
    screen.className = 'phone-root'
    screen.appendChild(elText('boot-line', '连接中…'))
    return screen
  }

  function showPairing(): void {
    rendered?.dispose?.()
    rendered?.root.remove()
    rendered = null
    container.textContent = ''
    const screen = document.createElement('div')
    screen.className = 'phone-root pairing-root'
    screen.appendChild(elText('title', '会话配对'))
    screen.appendChild(
      elText('pairing-hint', '录入桌面端「连接密钥 + 配对 PIN + host 公钥」建立加密隧道'),
    )
    screen.appendChild(
      createTunnelPanel({
        sid: identity.sid,
        onActivated: (material) => {
          applyTunnelMaterial(material)
          startMain()
        },
      }).root,
    )
    container.appendChild(screen)
  }

  /** 隧道材料落地：信封化传输 → rpc/api 重建 + 加密 forge-stream 会话沿用 sid/epoch。 */
  function applyTunnelMaterial(material: TunnelMaterial): void {
    ctx.material = material
    ctx.tunnel = true
    stream?.close()
    stream = null
    const plain = defaultApiDeps()
    const transport = createTunnelTransport(material, ctx.session, {
      post: async (path, body) => {
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        })
        return { status: response.status, text: await response.text() }
      },
    })
    ctx.rpc = createRemoteRpc({ post: transport.post })
    ctx.api = createOfficialApi(tunnelApiDeps(plain))
  }

  // ---- 启动流：模式探测 → 直连/配对 → 主视图链 ----
  async function start(): Promise<void> {
    const verdict = await detectTunnelMode({
      hostname: typeof window !== 'undefined' ? window.location.hostname : '',
      probe: () =>
        fetch('/remote/forge-stream', { cache: 'no-store' }).then(
          (response) => response.status,
          () => 0,
        ),
    })
    reportLanding(`landing mode=${verdict.mode} probe=${verdict.probe ?? '-'} host=${typeof window !== 'undefined' ? window.location.host : ''}`)
    if (verdict.mode === ('lan' satisfies TunnelMode)) {
      const deps = defaultApiDeps()
      ctx.rpc = createRemoteRpc(deps)
      ctx.api = createOfficialApi(deps)
      startMain()
      return
    }
    showPairing()
  }

  function startMain(): void {
    container.textContent = ''
    rendered = null
    router.subscribe(renderRoute)
    router.subscribeOverlays(() => {
      /* 浮层由装配面直挂 container（settings/tasks/ask/reader 直挂径） */
    })
    renderRoute(router.current())
  }

  void start().catch(() => {
    container.textContent = ''
    container.appendChild(elText('conn-overlay', '启动失败，请刷新重试'))
  })
}

// ---------------------------------------------------------------------------
// 装配小件
// ---------------------------------------------------------------------------

function elText(className: string, text: string): HTMLElement {
  const node = document.createElement('div')
  node.className = className
  node.textContent = text
  return node
}

/** fix-22 落地诊断信标（child.ts /__rvdiag 对接）：落地判定 fire-and-forget 上报——真机
 * 302 链断点定位的唯手机侧遥测（零状态触碰、失败静默）。 */
function reportLanding(line: string): void {
  try {
    void fetch(`/__rvdiag?line=${encodeURIComponent(line)}`, { cache: 'no-store' }).catch(() => {})
  } catch {
    /* 无网络/上下文异常——静默 */
  }
}

/** 隧道域官方面：POST 走信封化传输（/remote/__rpc 咽喉），GET/时区沿用明文同源面。 */
function tunnelApiDeps(plain: ApiDeps): ApiDeps {
  return { ...plain }
}

const app = document.querySelector<HTMLElement>('#app')
if (app) mount(app)
