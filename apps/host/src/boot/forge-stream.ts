// 加密 forge-stream SSE（mobile-ui 1.11——tunnel-psk §4.1 加密推送通道）：
// GET /remote/forge-stream——forge 侧订阅 host 事件镜像逐帧推送（api-session/*、
// approval/request、user-questions/request、任务进度；assistant 流式帧 =
// sessionQuery.observeSession 镜像）。隧道域（PSK 配置在场）逐帧 AEAD 加密 + host
// Ed25519 签名；LAN/回环维持明文镜像（旧门语义——生效域 A3 裁决同源）。
// 模块 = 纯帧化核（fake emitter 可测）+ 官方事件订阅装配 helper（fail-soft——事件名
// 缺席/ctx.on 拒绝 = 零订阅，宿主不受影响）。

/** 镜像事件（帧体——加密域内层） */
export interface ForgeStreamEvent {
  readonly type: string
  readonly payload: unknown
  readonly at: number
}

/** 帧加密缝（隧道域 = PSK sealReply 同族；LAN = 明文直传） */
export type FrameSeal = (event: ForgeStreamEvent) => string

/** 官方事件订阅缝（缺席/失败 = 零订阅 fail-soft） */
export interface ForgeStreamDeps {
  /** 官方事件源订阅（child 装配 ctx.on 同缝） */
  readonly subscribe: (handler: (event: ForgeStreamEvent) => void) => () => void
  /** 帧加密（隧道域注入 sealFrameOf；LAN 注入恒等明文） */
  readonly seal: FrameSeal
  readonly diag: (line: string) => void
  /** 心跳间隔（判活——mobile sse 引擎 15s/30s 判死口径对齐） */
  readonly heartbeatMs?: number
}

export const FORGE_STREAM_PATH = '/remote/forge-stream'

/** SSE 响应窄面（真身 http.ServerResponse 结构兼容——fake 可测） */
export interface ForgeStreamRes {
  writeHead(code: number, headers?: object): unknown
  write(chunk: string): unknown
  on(event: string, cb: () => void): unknown
}

/** GET /remote/forge-stream 命中判定（静态路由先于此分流） */
export function isForgeStreamRequest(method: string, requestUrl: string): boolean {
  if (method !== 'GET') return false
  let pathname = ''
  try {
    pathname = new URL(requestUrl, 'http://dsh.invalid').pathname
  } catch {
    return false
  }
  return pathname === FORGE_STREAM_PATH
}

/**
 * SSE handler 工厂：headers → 订阅镜像 → 逐帧 `event: frame` 推送 → 心跳注释行判活。
 * 永不 reject；res 关闭即退订（teardown 纪律——timer/订阅随连接销毁，禁串台）。
 */
export function createForgeStreamHandler(deps: ForgeStreamDeps): (req: unknown, res: ForgeStreamRes) => void {
  return (_req, res) => {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    })
    let closed = false
    let heartbeat: ReturnType<typeof setInterval> | undefined
    const close = (): void => {
      if (closed) return
      closed = true
      if (heartbeat !== undefined) clearInterval(heartbeat)
    }
    const push = (event: ForgeStreamEvent): void => {
      if (closed) return
      try {
        res.write(`event: frame\ndata: ${deps.seal(event)}\n\n`)
      } catch (cause) {
        deps.diag(`[pair-diag] ${FORGE_STREAM_PATH} frame write fail：${String(cause)}`)
        close()
      }
    }
    const unsubscribe = deps.subscribe(push)
    res.on?.('close', () => {
      unsubscribe()
      close()
    })
    const heartbeat2 = setInterval(() => {
      if (closed) return
      try {
        res.write(`: ping\n\n`)
      } catch {
        close()
      }
    }, deps.heartbeatMs ?? 15_000)
    heartbeat = heartbeat2
    if (typeof heartbeat2.unref === 'function') heartbeat2.unref()
  }
}

/** 官方事件名目录（api-handbook §6.2.1 转发清单 + 任务进度——emit/waterfall 不分，mobile 同帧消费） */
export const FORGE_STREAM_EVENT_NAMES = [
  'api-session/added',
  'api-session/removed',
  'api-session/status',
  'api-session/activity',
  'api-session/error',
  'approval/request',
  'user-questions/request',
  'forge/progress',
] as const

/**
 * 官方事件订阅装配（child.ts 消费——ctx.on 逐名尝试，缺席/拒绝 = 零订阅 fail-soft 留痕）。
 * 返回聚合退订（注册成功的名字逐一退订——teardown 纪律）。
 */
export function subscribeOfficialEvents(
  ctxOn: (event: string, handler: (payload: unknown) => void) => unknown,
  emit: (event: ForgeStreamEvent) => void,
  diag: (line: string) => void,
): () => void {
  const unsubscribes: Array<() => void> = []
  for (const name of FORGE_STREAM_EVENT_NAMES) {
    try {
      const off = ctxOn(name, (payload) => emit({ type: name, payload, at: Date.now() }))
      if (typeof off === 'function') unsubscribes.push(off as () => void)
      else unsubscribes.push(() => {}) // 官方监听器无显式退注缝 = 注册面幂等容忍
    } catch (cause) {
      diag(`[pair-diag] ${FORGE_STREAM_PATH} 订阅缺席 name=${name}：${String(cause)}`)
    }
  }
  return () => {
    for (const off of unsubscribes) {
      try {
        off()
      } catch {
        // 退订失败不阻关停链
      }
    }
  }
}
