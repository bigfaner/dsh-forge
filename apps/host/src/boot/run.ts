// dsh 宿主 boot（定位：基础）——child 形态进程编排（fix-1）。
// 动机：direct-in-main 形态（runProfile 跑 Electron main）boot 可跑但 agent 工具派发
// 恒挂起（4.2 dogfood 插桩实证：模型往返正常、任意工具 3min+ 不返回、ToolRuntime
// prepare/dispatch 全未进入、会话文件不落盘）——官方 Desktop 素以 child 形态跑宿主
// （ELECTRON_RUN_AS_NODE=1 --expose-internals 子进程，S1 spike run3 验证 boot）。
// 本文件 = 进程编排面：spawn → ready 等待 → manifest + 双服务 RPC 代理面世 →
// 有界关停。协议纯逻辑在 bridge.ts；boot 本体（loadProfileDirectory → overlay →
// runProfile，direct 形态原路径原序）在 child.ts。
// 缝（S1 实测签名，上游 0.2.0-rc.2）：
//   loadProfileDirectory(binName, dir, installAnchor, {userLayer?}) → Profile
//   runProfile({environment, profile, resolvedProfile, patchFiles, args, packageManager?})
//     → { ctx, shutdown }；就绪后 ctx.connection.authenticatedUrl(base) + ctx.webServer.collectIndexInjections()
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  BrowseKnowledgeService,
  ForgeBugsService,
  ForgeDocsService,
  ForgeFeaturesService,
  ForgeProposalsService,
  ForgeSettingsService,
  ForgeTasksService,
  ProjectServiceM2,
  TasksChangedEvent,
} from '@dsh-forge/contracts'
import {
  APPROVAL_SERVICE_METHODS,
  asEventMessage,
  asDiagMessage,
  asPairConnectedMessage,
  asPairMessage,
  asReadyMessage,
  asTunnelMessage,
  createBridgeProxy,
  DOCS_SERVICE_METHODS,
  FEATURES_SERVICE_METHODS,
  KNOWLEDGE_SERVICE_METHODS,
  PROJECT_SERVICE_METHODS,
  PROJECTS_M2_SERVICE_METHODS,
  PROPOSALS_SERVICE_METHODS,
  rebuildBridgeError,
  BUGS_SERVICE_METHODS,
  SETTINGS_SERVICE_METHODS,
  TASKS_SERVICE_METHODS,
  type BridgeApprovalRelay,
  type BridgeFatalMessage,
  type BridgeReadyMessage,
  type BridgeRpcResultMessage,
  type BridgeServiceName,
  type MainToChildMessage,
} from './bridge.js'
import { WORKTREE_RPC_METHODS, type WorktreeRpcService } from '../ipc/worktree-rpc.js'
import { buildBootManifest, tunnelStateOf, type BootManifest } from './manifest.js'

export interface BootDshOptions {
  profileDir: string
  installAnchor: string
  /** webserver 监听端口（main 侧解析后传入） */
  port: number
  /** 应用状态库绝对路径（core 插件 dbFile——boot overlay 注入；4.2） */
  stateDb: string
  /** knowledge 绑定表文件绝对路径（bindingsFile——boot overlay 注入；4.2。预设底稿行内
   *  plugin-forge[+spec] 增量行同文件物化——Interface 8 cwd 路由数据缝单一绑定表） */
  bindingsFile: string
  /** M2 派生根绝对路径（3.4：boot overlay 注 core 行 config.tasksHome；缺席 = M2 四域降级） */
  tasksHome?: string
  /** plugin-forge skills 物理挂载目录（M3 3.7 起仅作预设装配 customSkillDirs[core] 物化锚
   *  ——产品裁决 2026-10-09：全局 skill-filesystem 行已废除，标准模式零 forge 技能；
   *  缺席 = 预设技能目录剔除 fail-soft） */
  skillsDir?: string
  /** plugin-forge-spec skills 物理挂载目录（M3 3.7：预设装配 customSkillDirs[spec]——仅远征
   *  组合携带；缺席 = spec 技能面降级 fail-soft 不注入） */
  specSkillsDir?: string
  /** plugin-forge skills-blitz 突击专属技能挂载目录（预设装配 customSkillDirs[blitz]——仅
   *  突击组合携带；缺席 = blitz 技能面降级 fail-soft 不注入） */
  blitzSkillsDir?: string
  /** 设置域存储文件绝对路径（M3 3.8：boot overlay 注 core 行 config.settingsFile——
   *  {userData}/forge-settings.json；缺席 = forgeSettings 服务降级缺席（六服务形制）） */
  settingsFile?: string
  /** 真 home 凭据文档桥路径（fix-26；boot overlay credentials 行 config.path 注入——
   *  undefined = USER_DATA 隔离态（e2e/测试）不桥） */
  credentialsPath?: string
  /** 安装包 resources 根（4.1 打包形态；boot child 取 runtime/host-dist 真实文件入口） */
  resourcesDir?: string
}

/** 产品七服务（core 插件 provide；child 内经 RPC 桥面世供 main 接 forge:* 通道——类型 = contracts 单一来源） */
export interface DshHostServices {
  /** P1 五法 + M2 派生行第六法（Interface 5；tasksHome 缺席时子侧服务无扩法——代理调用失败面） */
  forgeProjects: ProjectServiceM2
  /** Interface 2 七法 + browse 聚合第八法（3.5：forge:knowledge/browse 通道挂接；
   * fix-33 起 = contracts BrowseKnowledgeService 命名类型——第八法四处手工同步收口） */
  forgeKnowledge: BrowseKnowledgeService
  // ── M2 四域（Interface 1–4；tasksHome 注入时 core provide，缺席 = M2 面降级 undefined） ──
  forgeTasks: ForgeTasksService
  forgeFeatures: ForgeFeaturesService
  forgeProposals: ForgeProposalsService
  forgeDocs: ForgeDocsService
  /** M3 3.8 设置域（Interface 1 M3；settingsFile 注入时 core provide，缺席 = 设置域降级 undefined） */
  forgeSettings: ForgeSettingsService
  /** fix-bug bug 域（Interface 1 扩池；tasksHome 注入时 core provide，缺席 = bugs 面降级 undefined） */
  forgeBugs: ForgeBugsService
  /** mobile-remote-approval fix-2 审批桥（官方 ctx.approval 在场时 worker provide 内存中继——
   *  缺席 = 审批转发面降级 undefined，forge:remote/approval fail-soft unavailable） */
  approval: BridgeApprovalRelay
  /** fix-2 worktree RPC 域（gitWorktree 插件行在场时 worker 侧装配——缺席 = 通道族未注册） */
  forgeWorktree: WorktreeRpcService
}

export interface DshHostHandle {
  manifest: BootManifest
  /** 产品七服务（缺席任一 = core 插件行未装载 / 对应装配缝降级——main 侧 fail-soft 记日志不注册对应通道族） */
  services: Partial<DshHostServices>
  /**
   * boot 就绪时子进程 ToolRuntime 已注册 tool 名全集（3.4 冒烟观测面——plugin-forge
   * 六动词经 spawn 链路可达的机械判据；读取失败/旧 child = 空清单，装配断言由冒烟承载）。
   */
  toolNames: readonly string[]
  /**
   * 写推送事件订阅（交互二事件链中段：core emitTasksChanged → process.send(event) →
   * 本分支 → 订阅方 → main webContents.send('forge:events/tasks-changed')）。返回退订器；
   * 订阅方异常隔离（不阻断其余订阅与 RPC 面）。
   */
  onEvent: (listener: (payload: TasksChangedEvent) => void) => () => void
  /**
   * fix-23：诊断日志行订阅（child [pair-diag] 决策链经桥消息回流——main.ts 消费
   * noteHarnessLog 落 harness.log；返回退订器；订阅方异常隔离）。
   */
  onDiag: (listener: (line: string) => void) => () => void
  /**
   * fix-10：断开连接缝（forge:remote/disconnect 消费——connected 粘性位收回，UI 回等待
   * 扫码）。缺席 = 旧 boot 会话/降级（remote rpc fail-soft revoked:false）。
   */
  clearRemoteDeviceConnected?(): void
  /**
   * fix-17 ②：tab 切换重连缝（UI 切互联网 tab 隧道不在线时消费——转发 tunnel-toggle
   * 消息至 child 侧隧道分支；缺席 = 旧 boot 会话降级，UI fail-soft）。
   */
  toggleTunnel?(): void
  /**
   * fix-18：显式换线缝（UI 换线链接触发——转发 tunnel-fallback 消息至 child 侧隧道分支；
   * 缺席 = 旧 boot 会话降级，UI fail-soft）。
   */
  fallbackTunnel?(): void
  /**
   * fix-18：连接密码重置缝（UI PIN 方框「重置密码」触发——转发 pin-reset 消息至 child
   * 侧 pinIssuer.rotate 缝；缺席 = 旧 boot 会话降级，UI fail-soft）。
   */
  resetPin?(): void
  /**
   * fix-26：长效密码开关缝（UI consent checkbox 触发——转发 pin-consent 消息至 child
   * 侧 pinIssuer.setDurable 缝；缺席 = 旧 boot 会话降级，UI fail-soft）。
   */
  consentPin?(consent: boolean): void
  /** dsh 应用树优雅关停（shutdown 消息 → 子侧有界处置；5s 升级 + kill 兜底；before-quit 消费） */
  shutdown: () => Promise<void>
}

/** boot child 优雅关停上限（子侧 ProcessShutdown 内部 5s 升级强退——上限略高于之为 kill 兜底位） */
const SHUTDOWN_GRACE_MS = 6_000

/**
 * child 进程最小消费面（spawn 产物结构兼容——run.test.ts 以 EventEmitter 替身注入，
 * 进程编排与桥通道解耦后事件分支可纯逻辑单测。send 返回 boolean | null：
 * null = IPC 通道缺席，与 false 同按发送失败结算）。
 */
export interface BridgeChildFace {
  on(event: 'message', listener: (message: unknown) => void): unknown
  once(event: 'close', listener: () => void): unknown
  send(message: unknown, callback?: (error: Error | null) => void): boolean | null
}

/** 桥通道：RPC pending 结算 + 事件扇出（bootDshHost 装配素材；独立工厂以便替身测试） */
export interface BridgeChannel {
  /** 主 → 子 RPC 调用（rpc-result 按 id 结算；child 退出 → 全量拒绝） */
  call(service: BridgeServiceName, method: string, args: readonly unknown[]): Promise<unknown>
  /** 子 → 主事件订阅（event 分支——asEventMessage 守卫通过者扇出） */
  onEvent(listener: (payload: TasksChangedEvent) => void): () => void
  /** fix-23 子 → 主诊断行订阅（diag 分支——[pair-diag] 决策链落 harness.log 的通道半边） */
  onDiag(listener: (line: string) => void): () => void
}

/**
 * 装配桥通道（消息分流：event → 事件监听扇出；rpc-result → pending 按 id 结算——失败
 * 结算 = 双形态错误解码重建（fix-28）：结构化 error → 带 code/data 的 Error，代理面
 * reject 经 rpcEnvelope 判型走带内 RpcErr 信封（typed 保真），string 旧形态不变；
 * child close → pending 全量拒绝（forge:* 面信封化降级））。监听先于 ready 等待挂上
 * ——事件与早到 rpc-result 零丢失窗。
 */
export function createBridgeChannel(child: BridgeChildFace, traceIdOf?: () => string | undefined): BridgeChannel {
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  let nextId = 1
  const eventListeners = new Set<(payload: TasksChangedEvent) => void>()
  const diagListeners = new Set<(line: string) => void>()
  // bug ae1f737a 死闩（熔断）：通道死亡（close / send 失败）后后续 call 立即以首因拒绝——
  // 零 send 尝试、观测行同因只落一次。现场（2026-10-21 06:26Z）：child 运行期死亡零 exit
  // 记录（死因失明）+ host 带死通道 23 分钟逐发逐报同因错误。
  let deadError: Error | undefined
  const markDead = (error: Error, alarm?: string): void => {
    if (deadError !== undefined) return
    deadError = error
    if (alarm !== undefined && !gracefulShutdownChildren.has(child as unknown as object)) console.error(alarm)
  }
  child.on('message', (message) => {
    // fix-23 diag 分支：诊断日志行 → onDiag 订阅方扇出（main.ts → harness.log；畸形信封静默忽略）
    const diag = asDiagMessage(message)
    if (diag !== undefined) {
      for (const listener of diagListeners) {
        try {
          listener(diag.line)
        } catch {
          // 订阅方异常隔离——落盘链失败不阻 boot/RPC 面
        }
      }
      return
    }
    // event 分支（3.1 交互二）：写推送事件 → onEvent 订阅方扇出（畸形信封静默忽略）
    const event = asEventMessage(message)
    if (event !== undefined) {
      for (const listener of eventListeners) {
        try {
          listener(event.payload)
        } catch {
          // 订阅方异常隔离——其余订阅与 RPC 面照常
        }
      }
      return
    }
    const m = message as BridgeRpcResultMessage
    if (m?.type !== 'rpc-result') return
    const waiter = pending.get(m.id)
    if (waiter === undefined) return
    pending.delete(m.id)
    if (m.ok) waiter.resolve(m.data)
    else waiter.reject(rebuildBridgeError(m.error ?? `bridge rpc #${String(m.id)} 失败（无错误信息）`))
  })
  child.once('close', (code?: number | null, signal?: string | null) => {
    // 观测行（bug ae1f737a）：运行期退出 code/signal 落诊断链一次——死因可考（此前
    // ready 后零 exit 挂接，崩溃/被杀/OOM 全部无声）；优雅关停（shutdownChild）不告警。
    markDead(
      new Error('boot child 已退出——RPC 面不可用'),
      `[boot] boot child exited code=${String(code ?? 'null')}${signal ? ` signal=${String(signal)}` : ''} — bridge rpc 面熔断（后续调用快速拒绝）`,
    )
    for (const waiter of pending.values()) waiter.reject(new Error('boot child 已退出——RPC 面不可用'))
    pending.clear()
  })
  return {
    call: (service, method, args) =>
      new Promise((resolve, reject) => {
        // 死闩熔断：通道已死 → 立即以首因拒绝（零 send、零逐发报错）
        if (deadError !== undefined) {
          reject(deadError)
          return
        }
        const id = nextId++
        // trace_id 显式携带（ALS 过 IPC 序列化断点——main 侧读数随请求面入 child）
        const traceId = traceIdOf?.()
        pending.set(id, { resolve, reject })
        if (!sendToChild(child, { type: 'rpc', id, service, method, args, ...(traceId !== undefined && traceId !== '' ? { traceId } : {}) })) {
          pending.delete(id)
          const failure = new Error(`bridge rpc ${service}.${method} 发送失败（IPC 通道已关）`)
          // 首因胜出观测：send 失败径（close 事件未达/不达的窗口）同样留一次退出行——
          // 随后 close 事件到来时 markDead 已置位，零重复（同因去重）。
          markDead(
            failure,
            '[boot] boot child exited (send failed: IPC channel closed) — bridge rpc 面熔断（后续调用快速拒绝）',
          )
          reject(failure)
        }
      }),
    onEvent: (listener) => {
      eventListeners.add(listener)
      return () => {
        eventListeners.delete(listener)
      }
    },
    onDiag: (listener) => {
      diagListeners.add(listener)
      return () => {
        diagListeners.delete(listener)
      }
    },
  }
}

/**
 * child stdio 管道消费（app-observability 1.2）：逐行读 stdout/stderr 管道 → sink 转译
 * （main 侧 emit 诊断事件）+ 回显 process 直写（dev 终端可见性补偿——评审 Note-2）。
 * 背压保护（红线②）：消费侧只做同步转译 + 无等待 write，child console 调用永不被
 * main 拖住；行残段跨 chunk 缓存拼接。
 */
export function wireChildPipes(
  child: Pick<ChildProcess, 'stdout' | 'stderr'>,
  sink?: (stream: 'stdout' | 'stderr', line: string) => void,
): void {
  const wire = (stream: NodeJS.ReadableStream | null, name: 'stdout' | 'stderr'): void => {
    if (stream === null) return
    let buffer = ''
    stream.on('data', (chunk: Buffer | string) => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      let idx = buffer.indexOf('\n')
      while (idx >= 0) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        deliverLine(name, line, sink)
        idx = buffer.indexOf('\n')
      }
    })
    stream.on('end', () => {
      if (buffer !== '') deliverLine(name, buffer, sink)
      buffer = ''
    })
  }
  wire(child.stdout, 'stdout')
  wire(child.stderr, 'stderr')
}

/** 单行投递：sink 转译 + process 回显（双写——评审 Note-2；回显失败静默） */
function deliverLine(
  name: 'stdout' | 'stderr',
  line: string,
  sink?: (stream: 'stdout' | 'stderr', line: string) => void,
): void {
  try {
    sink?.(name, line)
  } catch {
    // sink 异常不反压管道消费（诊断面零阻塞——红线②同构）
  }
  try {
    const out = name === 'stdout' ? process.stdout : process.stderr
    out.write(`${line}\n`)
  } catch {
    // 回显失败静默
  }
}

/** spawn child 形态 boot（官方 Desktop 同款：ELECTRON_RUN_AS_NODE=1 --expose-internals）。
 *  spawnOverrides 为 spawn 驱动面覆盖（不序列化入子进程 argv）：execPath = 派生可执行
 *  （缺省 process.execPath——Electron main 下即 electron.exe；3.4 冒烟经 node/vitest 驱动
 *  时注入 electron 二进制，spawn 链路同款）；childEntry = child 入口（缺省本模块同目录
 *  dist 形态解析——vitest(src) 驱动时须显式指 dist 产物）。 */
export interface BootSpawnOverrides {
  readonly execPath?: string
  readonly childEntry?: string
  /** child stdio 管道行消费缝（app-observability 1.2——main 读 pipe 转译为诊断事件 +
   *  dev 终端回显；缺省 = 仅回显 process.stdout/stderr 直写，dev:debug 终端可见性不丢） */
  readonly stdioSink?: (stream: 'stdout' | 'stderr', line: string) => void
  /** main 侧诊断 ALS（trace_id 读数源——bridge rpc 调用显式携带到 child；不序列化入 argv） */
  readonly diagAls?: import('../telemetry/diag-context.js').DiagContextStore
}

export async function bootDshHost(
  options: BootDshOptions,
  spawnOptions: BootSpawnOverrides = {},
): Promise<DshHostHandle> {
  const childEntry = spawnOptions.childEntry ?? resolveChildEntry(import.meta.url, options.resourcesDir)
  const child = spawn(spawnOptions.execPath ?? process.execPath, ['--expose-internals', childEntry, JSON.stringify(options)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, // DSH_HOME/叠层等经 env 继承（语义与 direct 形态一致）
    // app-observability 1.2：inherit → pipe（评审 Blocker-2 修订——inherit 直通父 stdio
    // 不可拦截，打包版无终端即全丢）。stdout/stderr 双管道 → main 逐行转译（stdioSink
    // 缺省回显 process 直写，dev:debug 终端可见性不丢）。
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  wireChildPipes(child, spawnOptions.stdioSink) // 回显 = appender 转写 + process.stdout 双写（Note-2）
  const channel = createBridgeChannel(
    child,
    () => spawnOptions.diagAls?.getStore()?.traceId, // bridge 显式携带 trace_id（ALS 断点补偿）
  ) // 消息监听先于 ready 挂上（事件零丢失窗）
  const ready = await waitForReady(child)
  const call = channel.call
  // fix-6 配对令牌轮换：child 每 TTL 推 pair 消息 → manifest 原位换新（getBootManifest
  // 每调读最新——桌面 QR 倒计时到期重取即得新 token；官方 reload 轮换的桥载体）。
  let manifest = buildBootManifest(
    ready.url,
    ready.injections,
    ready.remoteHost,
    ready.remotePairUrl,
    ready.remotePairExpiresAt,
    undefined,
    undefined,
    ready.remotePin, // fix-17 ③：PIN 读数入 manifest（互联网 tab PIN 卡单源）
    ready.remotePinExpiresAt,
    ready.remotePinDurable === true, // fix-26：长效位入 manifest（UI hint 双态单源）
    ready.knowledgePlugin === true, // bug 2ffb0a82：knowledge 插件装载位入 manifest（renderer 知识面门控单源）
  )
  child.on('message', (message: unknown) => {
    // fix-7：/pair 握手成功推送 → manifest 抬 remoteDeviceConnected（粘性 until 重启——
    // 轮换 pair 消息经 applyPairMessage 保留该位，connected 态卡不因 token 轮换丢态）
    if (asPairConnectedMessage(message) !== undefined) {
      manifest = applyPairConnected(manifest)
      return
    }
    // dsh-mobile-tunnel：隧道状态推送（激活/换线/TTL 旋转/关闭撤除）→ manifest 隧道面原位重建
    if (asTunnelMessage(message) !== undefined) {
      manifest = applyTunnelMessage(manifest, message)
      return
    }
    manifest = applyPairMessage(manifest, message)
  })
  return {
    get manifest() {
      return manifest
    },
    // fix-10：断开连接缝——connected 粘性位收回（url/绑定/配对/隧道面全保留）
    clearRemoteDeviceConnected: () => {
      manifest = applyPairDisconnected(manifest)
    },
    // fix-17 ②：tab 重连缝——tunnel-toggle 转发 child（通道已关 = 发送失败静默，UI refresh 收敛）
    toggleTunnel: () => {
      sendToChild(child, { type: 'tunnel-toggle' })
    },
    // fix-18：显式换线缝——tunnel-fallback 转发 child（结果经 tunnel 推送 + manifest 轮询单源回流）
    fallbackTunnel: () => {
      sendToChild(child, { type: 'tunnel-fallback' })
    },
    // fix-18：PIN 重置缝——pin-reset 转发 child（新 PIN 经 pair 消息换新回推 manifest）
    resetPin: () => {
      sendToChild(child, { type: 'pin-reset' })
    },
    // fix-26：长效密码开关缝——pin-consent 转发 child（durable 面经 pair 消息回推 manifest）
    consentPin: (consent: boolean) => {
      sendToChild(child, { type: 'pin-consent', consent })
    },
    toolNames: ready.tools ?? [],
    services: {
      forgeProjects: ready.services.forgeProjects
        ? createBridgeProxy<ProjectServiceM2>(
            'forgeProjects',
            [...PROJECT_SERVICE_METHODS, ...PROJECTS_M2_SERVICE_METHODS],
            call,
          )
        : undefined,
      forgeKnowledge: ready.services.forgeKnowledge
        ? createBridgeProxy<DshHostServices['forgeKnowledge']>('forgeKnowledge', KNOWLEDGE_SERVICE_METHODS, call)
        : undefined,
      forgeTasks: ready.services.forgeTasks
        ? createBridgeProxy<DshHostServices['forgeTasks']>('forgeTasks', TASKS_SERVICE_METHODS, call)
        : undefined,
      forgeFeatures: ready.services.forgeFeatures
        ? createBridgeProxy<DshHostServices['forgeFeatures']>('forgeFeatures', FEATURES_SERVICE_METHODS, call)
        : undefined,
      forgeProposals: ready.services.forgeProposals
        ? createBridgeProxy<DshHostServices['forgeProposals']>('forgeProposals', PROPOSALS_SERVICE_METHODS, call)
        : undefined,
      forgeDocs: ready.services.forgeDocs
        ? createBridgeProxy<DshHostServices['forgeDocs']>('forgeDocs', DOCS_SERVICE_METHODS, call)
        : undefined,
      forgeSettings: ready.services.forgeSettings
        ? createBridgeProxy<DshHostServices['forgeSettings']>('forgeSettings', SETTINGS_SERVICE_METHODS, call)
        : undefined,
      forgeBugs: ready.services.forgeBugs
        ? createBridgeProxy<DshHostServices['forgeBugs']>('forgeBugs', BUGS_SERVICE_METHODS, call)
        : undefined,
      // fix-2 审批桥：worker 侧中继 deposit 代理（forge:remote/approval 转发器注入源）
      approval: ready.services.approval
        ? createBridgeProxy<DshHostServices['approval']>('approval', APPROVAL_SERVICE_METHODS, call)
        : undefined,
      // fix-2 worktree RPC 域（九法白名单 = WORKTREE_RPC_METHODS）
      forgeWorktree: ready.services.forgeWorktree
        ? createBridgeProxy<DshHostServices['forgeWorktree']>('forgeWorktree', WORKTREE_RPC_METHODS, call)
        : undefined,
    },
    onEvent: channel.onEvent,
    onDiag: channel.onDiag,
    shutdown: () => shutdownChild(child),
  }
}

/**
 * boot child 真实文件入口解析（4.1 打包形态缝）。
 * dev：本模块同目录 dist（apps/host/dist/boot/child.js——workspace 树解析邻接）。
 * packaged：{resources}/runtime/host-dist/boot/child.js——ELECTRON_RUN_AS_NODE 派生进程
 * 只读真实文件（asar 不可读），且其 ESM import（@deepseek-ai/dsh-app-boot /
 * @deepseek-ai/dsh/profile-boot）沿目录上溯解析，须与运行时 node_modules 同容器相邻
 * （assemble-installer-resources.mjs 物化布局）。resourcesDir 给定但 host-dist 缺席
 * （半成型资源）→ 直接 throw（fix-33 ④：回退 dev 入口的失败面交 spawn ENOENT 兜底——
 * 打包形态下 dev 入口根本不在场且 asar 路径误导排障；早 throw 更早定位装配断裂）。
 */
export function resolveChildEntry(moduleUrl: string, resourcesDir?: string): string {
  if (resourcesDir !== undefined) {
    const packaged = join(resourcesDir, 'runtime', 'host-dist', 'boot', 'child.js')
    if (existsSync(packaged)) return packaged
    throw new Error(
      `host-dist 缺席（半成型资源）：${packaged}——runtime 布局装配断裂（assemble-installer-resources.mjs / dist:stage）`,
    )
  }
  return fileURLToPath(new URL('./child.js', moduleUrl))
}

/** ready/fatal/早退三态等待（close 早于 ready = boot 失败——错误面取退出码；error = spawn 失败） */
function waitForReady(child: ChildProcess): Promise<BridgeReadyMessage> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      child.off('message', onMessage)
      child.off('close', onClose)
      child.off('error', onError)
    }
    const onMessage = (message: unknown): void => {
      const ready = asReadyMessage(message)
      if (ready !== undefined) {
        cleanup()
        resolve(ready)
        return
      }
      if ((message as BridgeFatalMessage)?.type === 'fatal') {
        cleanup()
        reject(new Error(`boot child 致命失败：${String((message as BridgeFatalMessage).message)}`))
      }
    }
    const onClose = (code: number | null): void => {
      cleanup()
      reject(new Error(`boot child 提前退出（code=${String(code)}）`))
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }
    child.on('message', onMessage)
    child.once('close', onClose)
    child.once('error', onError)
  })
}

/** 优雅关停中的 child（桥通道观测行不告警——正常关停非事故；bug ae1f737a 配套） */
const gracefulShutdownChildren = new WeakSet<object>()

/** 优雅关停（bounded）：shutdown 消息 → 等退出；超时 kill 兜底（子侧 ProcessShutdown 5s 升级先行） */
async function shutdownChild(child: ChildProcess): Promise<void> {
  if (child.killed) return
  gracefulShutdownChildren.add(child)
  sendToChild(child, { type: 'shutdown' })
  await new Promise<void>((resolve) => {
    const done = (): void => {
      clearTimeout(timer)
      child.off('close', onClose)
      resolve()
    }
    const onClose = (): void => done()
    const timer = setTimeout(() => {
      child.kill()
      done()
    }, SHUTDOWN_GRACE_MS)
    child.once('close', onClose)
  })
}

/** 消息发送（通道已关/缺席不抛——false 由调用方结算；ChildProcess.send 的 null 同失败面） */
function sendToChild(child: Pick<BridgeChildFace, 'send'>, message: MainToChildMessage): boolean {
  try {
    // Root cause: closed IPC 通道上无 callback 的 send() 除返回 false 外还会异步 emit 'error'
    // （ERR_IPC_CHANNEL_CLOSED）到 child 实例——ready 后 waitForReady 的 error 监听已撤，
    // 无监听 = 主进程未捕获异常（2026-10-19 安装版 /run-dag-tasks 崩溃；try/catch 与 false
    // 返回值均不可达该异步路径）。回调恒在场 = 错误进回调留痕，不外溢实例事件；异步写失败
    // 的 pending 结算仍归 close 全量拒绝兜底。
    return (
      child.send(message, (error) => {
        if (error !== undefined && error !== null) console.warn(`boot child IPC 发送失败（fail-soft）: ${String(error)}`)
      }) === true
    )
  } catch {
    return false
  }
}

/**
 * fix-6 pair 消息消费（纯函数）：配对令牌轮换推送 → 以旧 manifest 面（url/injections/
 * remoteHost 不变）重建携新 token + TTL 读数的 manifest；非 pair / 畸形 = 原样返回。
 */
export function applyPairMessage(manifest: BootManifest, message: unknown): BootManifest {
  const pair = asPairMessage(message)
  if (pair === undefined) return manifest
  return buildBootManifest(
    manifest.url,
    manifest.injections,
    manifest.remoteHost,
    pair.remotePairUrl,
    pair.remotePairExpiresAt,
    manifest.remoteDeviceConnected, // fix-7：轮换重建保留 connected 读数（粘性 until 重启）
    tunnelStateOf(manifest), // dsh-mobile-tunnel：轮换重建保留隧道面（新 token URL 由后续 tunnel 推送换新）
    pair.remotePin ?? manifest.remotePin, // fix-17 ③：PIN 随轮换换新（零 PIN 载荷 = 保留旧读数）
    pair.remotePinExpiresAt ?? manifest.remotePinExpiresAt,
    pair.remotePinDurable ?? manifest.remotePinDurable === true, // fix-26：长效位随轮换换新/保留
    manifest.knowledgePlugin === true, // bug 2ffb0a82：knowledge 位保留（boot 期事实不随轮换漂移）
  )
}

/**
 * fix-7 /pair 握手成功消费（纯函数）：以旧 manifest 面重建并抬 remoteDeviceConnected
 * 粘性位（url/injections/绑定/配对面全保留；直到宿主重启——官方「手机已连接」态语义）。
 */
export function applyPairConnected(manifest: BootManifest): BootManifest {
  return buildBootManifest(
    manifest.url,
    manifest.injections,
    manifest.remoteHost,
    manifest.remotePairUrl,
    manifest.remotePairExpiresAt,
    true,
    tunnelStateOf(manifest), // dsh-mobile-tunnel：connected 重建保留隧道面
    manifest.remotePin, // fix-17 ③：PIN 读数保留
    manifest.remotePinExpiresAt,
    manifest.remotePinDurable === true, // fix-26：长效位保留
    manifest.knowledgePlugin === true, // bug 2ffb0a82：knowledge 位保留
  )
}

/**
 * fix-10 断开连接消费（纯函数）：以旧 manifest 面重建并收回 remoteDeviceConnected 粘性位
 * （url/injections/绑定/配对/隧道面全保留——UI 回等待扫码；官方锚 :1176 断开连接钮语义）。
 */
export function applyPairDisconnected(manifest: BootManifest): BootManifest {
  return buildBootManifest(
    manifest.url,
    manifest.injections,
    manifest.remoteHost,
    manifest.remotePairUrl,
    manifest.remotePairExpiresAt,
    undefined,
    tunnelStateOf(manifest),
    manifest.remotePin, // fix-17 ③：PIN 读数保留
    manifest.remotePinExpiresAt,
    manifest.remotePinDurable === true, // fix-26：长效位保留
    manifest.knowledgePlugin === true, // bug 2ffb0a82：knowledge 位保留
  )
}

/**
 * dsh-mobile-tunnel tunnel 消息消费（纯函数）：激活态推送 → 以旧 manifest 面重建携隧道
 * 三字段（tunnelUrl / 链路类型 / Pinggy TTL——LAN remotePairUrl 并存不受影响）；零载荷
 * （关闭/失效）→ 隧道字段撤除（WiFi 面保留）；非 tunnel / 畸形 = 原样返回。
 */
export function applyTunnelMessage(manifest: BootManifest, message: unknown): BootManifest {
  const tunnel = asTunnelMessage(message)
  if (tunnel === undefined) return manifest
  return buildBootManifest(
    manifest.url,
    manifest.injections,
    manifest.remoteHost,
    manifest.remotePairUrl,
    manifest.remotePairExpiresAt,
    manifest.remoteDeviceConnected,
    tunnel.tunnelUrl !== undefined && tunnel.tunnelProvider !== undefined
      ? {
          url: tunnel.tunnelUrl,
          provider: tunnel.tunnelProvider,
          ...(tunnel.tunnelExpiresAt !== undefined ? { expiresAt: tunnel.tunnelExpiresAt } : {}),
          // fix-19 ⑦：意外死亡位透传（官方 :1188 unexpectedlyClosed——UI 一次性守卫自动重开）
          ...(tunnel.unexpectedlyClosed === true ? { unexpectedlyClosed: true } : {}),
        }
      : undefined,
    manifest.remotePin, // fix-17 ③：隧道重建保留 PIN 读数
    manifest.remotePinExpiresAt,
    manifest.remotePinDurable === true, // fix-26：长效位保留
    manifest.knowledgePlugin === true, // bug 2ffb0a82：knowledge 位保留
  )
}
