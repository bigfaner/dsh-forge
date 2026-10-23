/**
 * 生产入口装配（薄组合层——AGENTS.md §3.1 复用纪律：只做组合与注入，业务逻辑全在 core/views）。
 *
 * 首屏流（bug 63ee4a3d 修复——脚手架占位升级为正式接线）：
 *   模式探测（hostnameMode + GET /remote/forge-stream 语义）→
 *   · lan（IP 字面量/回环）：明文代理传输（配对 cookie）→ createRemoteRpc + createOfficialApi → 主视图链；
 *   · tunnel（域名形态）：PSK+PIN 双因子配对面（1.31 语义：sid-epoch 身份、加密 forge-stream、
 *     host 公钥静态验签）→ establishTunnelMaterial 激活 → createTunnelTransport 信封化 rpc → 主视图链。
 * 主视图链：createRouter(windowHashSource()) 六路由（hero/chat/drawer/settings/models/worker）
 * + 浮层（settings sheet / models / tasks FAB / ask / reader）不走路由。
 * forge-stream：sid/epoch 订阅（隧道 = AEAD+验签帧，lan = 明文镜像）→ 帧驱动刷新腿
 * （drawer/tasks/worker 重投影 + user-questions/request → ask 浮层），轮询兜底在视图层既有面。
 */
import './style.css'
import { createOfficialApi, type ApiDeps, type OfficialApi } from './core/api.ts'
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
import { createTunnelTransport, type TunnelMaterial, type TunnelSession, type TunnelTransport } from './core/tunnel-transport.ts'
import {
  createForgeStreamSource,
  type ForgeStreamSource,
} from './core/forge-stream-source.ts'
import type { WireEvent } from './core/wire.ts'
import { createTunnelPanel } from './widgets/tunnel-panel.ts'
import { createFab } from './widgets/fab.ts'
import { createHeroView } from './views/hero.ts'
import { coerceHistoryWindow, createChatView, type StreamEngine } from './views/chat.ts'
import type { SseSink } from './core/sse.ts'
import { createDrawerView } from './views/drawer.ts'
import { createSettingsSheet, type SettingsHandle } from './views/settings.ts'
import {
  clearPendingModelDefault,
  createModelsView,
  loadPendingModelDefault,
  modelDefaultStorageKey,
  recentStorageKey,
  type KeyValueStore,
} from './views/models.ts'
import { createTasksView, deriveTaskRuns } from './views/tasks.ts'
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
  // 节流刷新（每会话 ~600ms 一次——运行期事件密集，逐事件 history 拉取打爆通道）
  const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const scheduleRefresh = (sessionId: string): void => {
    if (refreshTimers.has(sessionId)) return
    refreshTimers.set(sessionId, setTimeout(() => {
      refreshTimers.delete(sessionId)
      void refreshLog(sessionId)
    }, 600))
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
          // bug 未读徽标恒零：任意带 sessionId 的事件都触发节流日志刷新（原先仅 activity/
          // progress——普通 durable 消息事件不刷新 logCache，chat 增量与未读永不外推）
          const payload = event.payload as { sessionId?: unknown } | null
          if (typeof payload?.sessionId === 'string') scheduleRefresh(payload.sessionId)
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
    // bug 59c02cd5：隧道域已激活（material 在场）→ 跳过无参探测直连真流——无参 GET 在隧道域
    // 必被 PSK 门 401（sealer 需 sid/epoch），探测永不过 = openStream 从未执行、实时帧全死。
    // forgeStreamUrl 自带 sid/epoch，宿主流分支直接 200 SSE。
    if (ctx.material !== undefined) {
      streamOpening = true
      openStream()
      streamOpening = false
      return
    }
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

  // ---- 会话流引擎（用户裁决 2026-10-22 双域统一代理化）：chat 视图流统一 forge-stream
  // 镜像帧（LAN 明文 / 隧道 AEAD 同缝）——/api/session/stream SSE + /api/rpc 轮询旧引擎
  // 双域皆被 api-guard 403（死面）退役。快照 = api.history 代理装载（logCache 单源），
  // 增量 = 帧失效重拉后的 logCache 尾序外推（seq 单调，不重不漏）。
  const createForgeStreamEngine = (): ((sessionId: string, sink: SseSink) => StreamEngine) => {
    return (sessionId, sink) => {
      let listener: (() => void) | null = null
      let lastSeq = -1
      return {
        start() {
          ensureStream()
          void refreshLog(sessionId)
            .then(() => {
              const events = logCache.get(sessionId) ?? []
              for (const event of events) if (event.seq > lastSeq) lastSeq = event.seq
              sink.snapshot({ kind: 'snapshot', events, projections: undefined })
              sink.stateChange('live')
            })
            .catch(() => sink.stateChange('degraded'))
          listener = () => {
            for (const event of logCache.get(sessionId) ?? []) {
              if (event.seq > lastSeq) {
                lastSeq = event.seq
                sink.delta({ kind: 'event', event })
              }
            }
          }
          ctx.frameListeners.add(listener)
        },
        teardown() {
          if (listener !== null) ctx.frameListeners.delete(listener)
          listener = null
        },
        retry() {
          void refreshLog(sessionId)
        },
        setPollActive() {
          /* 镜像帧恒活——官方活跃/空闲轮询节奏不适用 */
        },
      }
    }
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
      // 用户裁决 2026-10-22：点面板外收起
      onClose: closeSettings,
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
  /** chat 路由 FAB 帧同步退订（路由重建前清理——帧监听泄漏防护） */
  let chatFabSync: (() => void) | null = null

  const openSession = (sessionId: string): void => {
    setCurrentSession(sessionId)
    router.navigate('chat', { id: sessionId })
  }
  const openDrawer = (): void => router.navigate('drawer')
  const openHero = (): void => router.navigate('hero')

  /** composer 唤醒候选源（feature：/ 命令 + @ 文件 mention——双通道装配单点）。 */
  async function suggestItems(kind: '/' | '@', projectRoot?: string): Promise<{ insert: string; label: string }[]> {
    if (ctx.rpc === null) return []
    if (kind === '/') {
      const result = await ctx.rpc.call<{ name?: unknown; description?: unknown }[]>('forge:proxy/commands-list', {})
      if (!result.ok || !Array.isArray(result.data)) return []
      return result.data
        .filter((row): row is { name: string; description?: string } => typeof row?.name === 'string' && row.name !== '')
        .map((row) => ({
          insert: `/${row.name} `,
          label: row.name,
          ...(typeof row.description === 'string' && row.description !== '' ? { description: row.description } : {}),
        }))
    }
    if (projectRoot === undefined || projectRoot === '') return []
    const result = await ctx.rpc.call<{ entries?: { path?: unknown; dir?: unknown }[] }>('forge:proxy/file-list', { projectRoot })
    if (!result.ok || !Array.isArray(result.data?.entries)) return []
    return result.data!.entries
      .filter((row): row is { path: string; dir: boolean } => typeof row?.path === 'string' && row.path !== '' && row.dir === false)
      .map((row) => ({ insert: `@${row.path} `, label: row.path }))
  }

  function heroDeps(): Parameters<typeof createHeroView>[0] {
    return {
      rpc: ctx.rpc!,
      api: ctx.api!,
      suggest: (kind) => suggestItems(kind),
      // bug 38ab5a8d：hero 暂存的新会话默认档（模型视图写入、建会话后下发并清除）
      modelDefault: {
        read: () => loadPendingModelDefault(viewStore(), modelDefaultStorageKey(pairDomain)),
        clear: () => clearPendingModelDefault(viewStore(), modelDefaultStorageKey(pairDomain)),
      },
      onOpenSession: openSession,
      onOpenDrawer: openDrawer,
      onOpenSettings: openSettings,
    }
  }

  async function enrichHero(): Promise<void> {
    // worktree 清单锚（best-effort：projects-grouped 首项目 wsPath——隧道域同源可达；
    // 官方 workspace.list 异源 + 隧道域 403，弃用）。缺席 = composer 只显当前分支。
    if (ctx.rpc === null) return
    try {
      const result = await ctx.rpc.call<{ projects?: ReadonlyArray<{ wsPath?: unknown }> }>('forge:proxy/projects-grouped', {})
      if (!result.ok) return
      const path = result.data?.projects?.find((project) => typeof project?.wsPath === 'string' && project.wsPath !== '')?.wsPath
      if (typeof path !== 'string' || path === '' || rendered?.key !== 'hero') return
      rendered.root.remove()
      rendered = { key: 'hero', root: createHeroView({ ...heroDeps(), projectRoot: path, suggest: (kind) => suggestItems(kind, path) }) }
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
        // bug 会话标题：LLM 标题在官方 title 投影不在事件——grouped 异步解析注入回退链
        const fallbackTitleRef = { current: '' }
        // @ mention 根（grouped 异步收敛——best-effort，缺席 = @ 候选空态）
        const chatRootRef = { current: undefined as string | undefined }
        const root = createChatView(sessionId, {
          api: ctx.api,
          suggest: (kind) => suggestItems(kind, chatRootRef.current),
          // bug 1dd4b437：已读游标 host 侧单点（localStorage 随 origin churn 丢失 → 未读全量误报）
          writeReadState: (sid, seq) => {
            void ctx.rpc?.call('forge:remote/read-state-write', { sessionId: sid, seq })
          },
          // 用户裁决 2026-10-22（双域统一代理化）：会话流引擎统一 forge-stream 镜像帧
          // （/remote/forge-stream LAN 明文 / 隧道 AEAD 同缝）——/api/session/stream +
          // /api/rpc 轮询旧引擎退役（两域皆被 api-guard 403 的死面）
          createEngine: createForgeStreamEngine(),
          fallbackTitleRef,
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
        })
        void (async () => {
          try {
            const result = await ctx.rpc!.call('forge:proxy/projects-grouped', {})
            if (!result.ok || rendered?.key !== `chat:${sessionId}`) return
            const data = result.data as { projects?: ReadonlyArray<{ sessions?: ReadonlyArray<{ sessionId?: unknown; projections?: { values?: { title?: unknown }; asOfSeq?: unknown } }> }> } | undefined
            for (const project of data?.projects ?? []) {
              if (chatRootRef.current === undefined && typeof project?.wsPath === 'string' && project.wsPath !== '') {
                chatRootRef.current = project.wsPath
              }
              for (const session of project.sessions ?? []) {
                if (session.sessionId !== sessionId) continue
                const title = session.projections?.values?.title
                if (typeof title === 'string' && title !== '') {
                  fallbackTitleRef.current = title
                  const el = root.querySelector('.topbar .title')
                  if (el !== null && (el.textContent === '…' || el.textContent === '会话')) el.textContent = title
                }
                // bug bee0845e 续：打开即已读的游标 = 会话 asOfSeq（全量）——chat 初始装载
                // 只知窗口尾巴（maxMessages 截断），残余事件会残留徽标；grouped 收敛的单源
                // 上界在此落盘（晚到的标题/上界同次收敛，幂等单调写）
                const asOfSeq = session.projections?.asOfSeq
                if (typeof asOfSeq === 'number' && Number.isSafeInteger(asOfSeq)) {
                  void ctx.rpc?.call('forge:remote/read-state-write', { sessionId, seq: asOfSeq })
                }
                return
              }
            }
          } catch {
            /* grouped 不可达 = 标题保持事件面回退（诚实降级） */
          }
        })()
        return { key: `chat:${sessionId}`, root }
      }
      case 'drawer': {
        ensureStream()
        return {
          key: 'drawer',
          root: createDrawerView({
            rpc: ctx.rpc,
            // 用户裁决 2026-10-22（双域统一代理化）：心跳统一 grouped 通道——/api/status
            // 双域皆被 api-guard 403（LAN 明文 __rpc 携配对 cookie / 隧道 PSK 信封同缝）
            fetchStatus: async () => {
              try {
                const result = await ctx.rpc.call<unknown>('forge:proxy/projects-grouped', {})
                return { ok: result.ok, tunnelExpiresAt: null, tunnel: ctx.tunnel === true }
              } catch {
                return { ok: false, tunnelExpiresAt: null, tunnel: ctx.tunnel === true }
              }
            },
            onOpenSession: openSession,
            onDisconnected: () => showPairing(),
            // 用户裁决 2026-10-22（二次）：隧道配置面板内嵌连接详情（与状态同处）
            tunnelPanel: createTunnelPanel({
              sid: identity.sid,
              pairDomain,
              activated: ctx.tunnel === true,
              onActivated: (material) => {
                applyTunnelMaterial(material)
                ensureStream()
              },
            }),
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
            // bug 38ab5a8d：hero 态（sessionId=''）选模型 = 新会话默认档暂存
            defaultKey: modelDefaultStorageKey(pairDomain),
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
    chatFabSync?.()
    rendered?.dispose?.()
    rendered?.root.remove()
    rendered = buildView(match)
    container.appendChild(rendered.root)
    // 会话面 FAB（任务浮球——1.16 意图入口；chat 路由在场）。
    // 用户裁决 2026-10-22：无任务循环的会话不展示悬浮球——可见位 = 会话日志 forge/progress
    // 投影非空（快照装载 + 帧失效同步）。
    if (rendered.key.startsWith('chat:')) {
      const sid = match.params['id'] ?? ''
      const fab = createFab({ onActivate: openTasks })
      // .fab 显式 display 规则压制 hidden 属性——可见位走 style.display
      fab.root.style.display = 'none'
      const syncFab = (): void => {
        fab.root.style.display = deriveTaskRuns(logCache.get(sid) ?? []).length === 0 ? 'none' : ''
      }
      void refreshLog(sid).then(syncFab)
      ctx.frameListeners.add(syncFab)
      chatFabSync = () => {
        ctx.frameListeners.delete(syncFab)
        chatFabSync = null
      }
      rendered.root.appendChild(fab.root)
    } else if (chatFabSync !== null) {
      chatFabSync()
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
        pairDomain,
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
    ctx.api = createOfficialApi(tunnelApiDeps(transport))
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
      // 用户裁决 2026-10-22（双域统一代理化）：LAN 与隧道域同策略——官方面调用全部映射
      // forge:proxy/* 走 /remote/__rpc（明文 + /pair 配对 cookie），官方 /api 裸面保留
      // api-guard 403（1.32 收敛判例）。代理传输与隧道域同契约（post → {status,json}）。
      const proxyTransport = {
        post: async (path: string, body: unknown): Promise<{ status: number; json: unknown }> => {
          const response = await fetch(path, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
          return { status: response.status, json: await response.json().catch(() => null) }
        },
      }
      ctx.rpc = createRemoteRpc(proxyTransport)
      ctx.api = createOfficialApi(tunnelApiDeps(proxyTransport))
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

/**
 * 隧道域官方面（2026-10-22 bug：/api/rpc 被回环围栏 403——hero 官方面径建会话静默失败
 * 恒留 hero）。修法：/api/rpc 的官方面调用按 method 映射到 forge:proxy/* 信封通道
 * （同一 host 官方 controller 直调——形状逐字同官方网关），未代理 method 回显 ok:false
 * 信封（调用面既有 catch 诚实降级）。
 */
const TUNNEL_OFFICIAL_RPC_PROXY: Readonly<Record<string, string>> = {
  'session.create': 'forge:proxy/session-create',
  'session.prompt': 'forge:proxy/session-prompt',
  'session.selectModel': 'forge:proxy/session-select-model',
  'session.cancel': 'forge:proxy/session-cancel',
  'session.list': 'forge:proxy/session-list',
  'session.history': 'forge:proxy/session-history',
  'commands.execute': 'forge:proxy/commands-execute',
  'agentPreset.select': 'forge:proxy/agent-preset-select',
}

function tunnelApiDeps(transport: Pick<TunnelTransport, 'post'>): ApiDeps {
  return {
    post: async (path, body) => {
      if (path !== '/api/rpc') {
        return { status: 200, json: { ok: false, error: `代理域官方面未代理：${path}` } }
      }
      const frame = body as { method?: unknown; payload?: unknown }
      const method = typeof frame?.method === 'string' ? frame.method : ''
      const channel = TUNNEL_OFFICIAL_RPC_PROXY[method]
      if (channel === undefined) {
        return { status: 200, json: { ok: false, error: `代理域官方面未代理：${method}` } }
      }
      const result = await transport.post('/remote/__rpc', { channel, payload: frame.payload })
      const envelope = result.json as { ok?: boolean; data?: unknown; error?: unknown }
      if (envelope?.ok === true) return { status: 200, json: { ok: true, value: envelope.data } }
      return {
        status: 200,
        json: { ok: false, error: typeof envelope?.error === 'object' && envelope.error !== null ? (envelope.error as { message?: unknown }).message : envelope?.error },
      }
    },
    get: async () => {
      // /api/status 心跳双域皆被 api-guard 403（1.32）——状态面走 grouped 通道心跳
      // （drawer/hero fetchStatus 装配），本 get 仅诚实回非可达（status() = false）。
      return { status: 403, json: null }
    },
    timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
}

const app = document.querySelector<HTMLElement>('#app')
if (app) mount(app)
