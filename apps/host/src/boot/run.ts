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
  ForgeDocsService,
  ForgeFeaturesService,
  ForgeProposalsService,
  ForgeTasksService,
  ProjectServiceM2,
  TasksChangedEvent,
} from '@dsh-forge/contracts'
import {
  asEventMessage,
  asReadyMessage,
  createBridgeProxy,
  DOCS_SERVICE_METHODS,
  FEATURES_SERVICE_METHODS,
  KNOWLEDGE_SERVICE_METHODS,
  PROJECT_SERVICE_METHODS,
  PROJECTS_M2_SERVICE_METHODS,
  PROPOSALS_SERVICE_METHODS,
  rebuildBridgeError,
  TASKS_SERVICE_METHODS,
  type BridgeFatalMessage,
  type BridgeReadyMessage,
  type BridgeRpcResultMessage,
  type BridgeServiceName,
  type MainToChildMessage,
} from './bridge.js'
import { buildBootManifest, type BootManifest } from './manifest.js'

export interface BootDshOptions {
  profileDir: string
  installAnchor: string
  /** webserver 监听端口（main 侧解析后传入） */
  port: number
  /** 应用状态库绝对路径（core 插件 dbFile——boot overlay 注入；4.2） */
  stateDb: string
  /** knowledge 绑定表文件绝对路径（bindingsFile——boot overlay 注入；4.2。M2 起同文件
   *  亦注入 plugin-forge 行——Interface 8 cwd 路由数据缝单一绑定表） */
  bindingsFile: string
  /** M2 派生根绝对路径（3.4：boot overlay 注 core 行 config.tasksHome；缺席 = M2 四域降级） */
  tasksHome?: string
  /** plugin-forge skills 物理挂载目录（3.4：boot overlay 注 skill-filesystem 行；缺席 = 不注入。
   *  M3 3.7 起兼作预设装配 customSkillDirs[core]） */
  skillsDir?: string
  /** plugin-forge-spec skills 物理挂载目录（M3 3.7：预设装配 customSkillDirs[spec]——仅远征
   *  组合携带；缺席 = spec 技能面降级 fail-soft 不注入） */
  specSkillsDir?: string
  /** 真 home 凭据文档桥路径（fix-26；boot overlay credentials 行 config.path 注入——
   *  undefined = USER_DATA 隔离态（e2e/测试）不桥） */
  credentialsPath?: string
  /** 安装包 resources 根（4.1 打包形态；boot child 取 runtime/host-dist 真实文件入口） */
  resourcesDir?: string
}

/** 产品六服务（core 插件 provide；child 内经 RPC 桥面世供 main 接 forge:* 通道——类型 = contracts 单一来源） */
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
}

export interface DshHostHandle {
  manifest: BootManifest
  /** 产品六服务（缺席任一 = core 插件行未装载 / M2 面降级——main 侧 fail-soft 记日志不注册对应通道族） */
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
  send(message: unknown): boolean | null
}

/** 桥通道：RPC pending 结算 + 事件扇出（bootDshHost 装配素材；独立工厂以便替身测试） */
export interface BridgeChannel {
  /** 主 → 子 RPC 调用（rpc-result 按 id 结算；child 退出 → 全量拒绝） */
  call(service: BridgeServiceName, method: string, args: readonly unknown[]): Promise<unknown>
  /** 子 → 主事件订阅（event 分支——asEventMessage 守卫通过者扇出） */
  onEvent(listener: (payload: TasksChangedEvent) => void): () => void
}

/**
 * 装配桥通道（消息分流：event → 事件监听扇出；rpc-result → pending 按 id 结算——失败
 * 结算 = 双形态错误解码重建（fix-28）：结构化 error → 带 code/data 的 Error，代理面
 * reject 经 rpcEnvelope 判型走带内 RpcErr 信封（typed 保真），string 旧形态不变；
 * child close → pending 全量拒绝（forge:* 面信封化降级））。监听先于 ready 等待挂上
 * ——事件与早到 rpc-result 零丢失窗。
 */
export function createBridgeChannel(child: BridgeChildFace): BridgeChannel {
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  let nextId = 1
  const eventListeners = new Set<(payload: TasksChangedEvent) => void>()
  child.on('message', (message) => {
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
  child.once('close', () => {
    for (const waiter of pending.values()) waiter.reject(new Error('boot child 已退出——RPC 面不可用'))
    pending.clear()
  })
  return {
    call: (service, method, args) =>
      new Promise((resolve, reject) => {
        const id = nextId++
        pending.set(id, { resolve, reject })
        if (!sendToChild(child, { type: 'rpc', id, service, method, args })) {
          pending.delete(id)
          reject(new Error(`bridge rpc ${service}.${method} 发送失败（IPC 通道已关）`))
        }
      }),
    onEvent: (listener) => {
      eventListeners.add(listener)
      return () => {
        eventListeners.delete(listener)
      }
    },
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
}

export async function bootDshHost(
  options: BootDshOptions,
  spawnOptions: BootSpawnOverrides = {},
): Promise<DshHostHandle> {
  const childEntry = spawnOptions.childEntry ?? resolveChildEntry(import.meta.url, options.resourcesDir)
  const child = spawn(spawnOptions.execPath ?? process.execPath, ['--expose-internals', childEntry, JSON.stringify(options)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, // DSH_HOME/叠层等经 env 继承（语义与 direct 形态一致）
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'], // S1 run3 母本同款（子进程日志回流主控台）
  })
  const channel = createBridgeChannel(child) // 消息监听先于 ready 挂上（事件零丢失窗）
  const ready = await waitForReady(child)
  const call = channel.call
  return {
    manifest: buildBootManifest(ready.url, ready.injections),
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
    },
    onEvent: channel.onEvent,
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

/** 优雅关停（bounded）：shutdown 消息 → 等退出；超时 kill 兜底（子侧 ProcessShutdown 5s 升级先行） */
async function shutdownChild(child: ChildProcess): Promise<void> {
  if (child.killed) return
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
    return child.send(message) === true
  } catch {
    return false
  }
}
