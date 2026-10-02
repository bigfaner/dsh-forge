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
import type { DomainNode, KnowledgeService, ProjectService } from '@dsh-forge/contracts'
import {
  asReadyMessage,
  createBridgeProxy,
  KNOWLEDGE_SERVICE_METHODS,
  PROJECT_SERVICE_METHODS,
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
  /** knowledge 绑定表文件绝对路径（bindingsFile——boot overlay 注入；4.2） */
  bindingsFile: string
  /** 安装包 resources 根（4.1 打包形态；boot child 取 runtime/host-dist 真实文件入口） */
  resourcesDir?: string
}

/** 产品双服务（core 插件 provide；child 内经 RPC 桥面世供 main 接 forge:* 通道——类型 = contracts 单一来源） */
export interface DshHostServices {
  forgeProjects: ProjectService
  /** Interface 2 七法 + browse 聚合第八法（3.5：forge:knowledge/browse 通道挂接） */
  forgeKnowledge: KnowledgeService & {
    browse(req: { projectId: string }): Promise<DomainNode[]>
  }
}

export interface DshHostHandle {
  manifest: BootManifest
  /** 产品双服务（缺席任一 = core 插件行未装载——main 侧 fail-soft 记日志不注册 forge:* 面） */
  services: Partial<DshHostServices>
  /** dsh 应用树优雅关停（shutdown 消息 → 子侧有界处置；5s 升级 + kill 兜底；before-quit 消费） */
  shutdown: () => Promise<void>
}

/** boot child 优雅关停上限（子侧 ProcessShutdown 内部 5s 升级强退——上限略高于之为 kill 兜底位） */
const SHUTDOWN_GRACE_MS = 6_000

/** spawn child 形态 boot（官方 Desktop 同款：ELECTRON_RUN_AS_NODE=1 --expose-internals） */
export async function bootDshHost(options: BootDshOptions): Promise<DshHostHandle> {
  const childEntry = resolveChildEntry(import.meta.url, options.resourcesDir)
  const child = spawn(process.execPath, ['--expose-internals', childEntry, JSON.stringify(options)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, // DSH_HOME/叠层等经 env 继承（语义与 direct 形态一致）
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'], // S1 run3 母本同款（子进程日志回流主控台）
  })
  const ready = await waitForReady(child)
  // RPC pending 表：rpc-result 按 id 结算；child 退出 → 全量拒绝（forge:* 面信封化降级）
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  let nextId = 1
  child.on('message', (message) => {
    const m = message as BridgeRpcResultMessage
    if (m?.type !== 'rpc-result') return
    const waiter = pending.get(m.id)
    if (waiter === undefined) return
    pending.delete(m.id)
    if (m.ok) waiter.resolve(m.data)
    else waiter.reject(new Error(m.error ?? `bridge rpc #${String(m.id)} 失败（无错误信息）`))
  })
  child.once('close', () => {
    for (const waiter of pending.values()) waiter.reject(new Error('boot child 已退出——RPC 面不可用'))
    pending.clear()
  })
  const call = (service: BridgeServiceName, method: string, args: readonly unknown[]): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      if (!sendToChild(child, { type: 'rpc', id, service, method, args })) {
        pending.delete(id)
        reject(new Error(`bridge rpc ${service}.${method} 发送失败（IPC 通道已关）`))
      }
    })
  return {
    manifest: buildBootManifest(ready.url, ready.injections),
    services: {
      forgeProjects: ready.services.forgeProjects
        ? createBridgeProxy<ProjectService>('forgeProjects', PROJECT_SERVICE_METHODS, call)
        : undefined,
      forgeKnowledge: ready.services.forgeKnowledge
        ? createBridgeProxy<DshHostServices['forgeKnowledge']>('forgeKnowledge', KNOWLEDGE_SERVICE_METHODS, call)
        : undefined,
    },
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
 * （半成型资源）→ 回退 dev 入口（失败面交 spawn 的 ENOENT 兜底显形）。
 */
export function resolveChildEntry(moduleUrl: string, resourcesDir?: string): string {
  if (resourcesDir !== undefined) {
    const packaged = join(resourcesDir, 'runtime', 'host-dist', 'boot', 'child.js')
    if (existsSync(packaged)) return packaged
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

/** 消息发送（通道已关不抛——返回 false 由调用方结算） */
function sendToChild(child: ChildProcess, message: MainToChildMessage): boolean {
  try {
    return child.send(message)
  } catch {
    return false
  }
}
