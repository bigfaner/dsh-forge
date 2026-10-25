// host 装配缝（worktree-domain-migration 1.2——自 apps/host/src/boot/child.ts 注入点核迁）。
// 装配缝归属插件域（AGENTS 1.3 插件可移植性）：本文件把「官方服务对象 → WorktreeRpcService
// deps 组装 + 发送拦截装配门」收敛为插件导出工厂 createHostWorktreeRpc——宿主（boot/child.ts）
// 只做两件事：① servicesFace/ctx 惰性取法取官方服务对象（取法闭包在工厂调用前成立）；
// ② 调用本工厂并消费返回面（service → forgeWorktree 桥服务；revokeSendGuard → 关停链）。
// 边界保位（提案 §2 裁决）：ctx.on('session/created') 监听装配与 forge:proxy/session-create
// guardedCreate 硬门留 host——经注入缝（onSessionCreated）与既有 host 代码承载，本文件零触及。
// 零行为变化：装配逻辑逐字自 child.ts 平移（能力解析留痕/8s 缺席诊断/60s 拦截放弃门全保留）。
import type { ForgeBindingMismatchEvent } from '@dsh-forge/contracts'
import {
  createWorktreeRpcService,
  type GitWorktreeServiceFace,
  type LiveSessionFace,
  type SessionControllerFace,
  type SessionPersistenceFace,
  type WorktreeRpcService,
  type WorkspaceRegistryFace,
} from './rpc-service.js'
import { interceptSessionSends } from './session-send-wrap.js'

/**
 * 宿主注入缝（现成 Face 契约 + 官方机械装配缝）。全部字段由宿主在调用工厂前成立：
 * 惰性取法闭包（getGitWorktree / getWorkspaceRegistry / liveSessions）允许服务 provide
 * 晚于工厂调用（每次消费现取），官方服务对象（sessionController / sessionPersistence）
 * 允许缺席（缺席 = 对应能力降级，宿主不受影响）。
 */
export interface WorktreeRpcHostInjection {
  /** 插件能力服务惰性取法（ctx.gitWorktree 具名消费 + 存在性检查——插件未装载/解析中 = undefined） */
  readonly getGitWorktree: () => GitWorktreeServiceFace | undefined
  /** 官方 SessionController（发送拦截面——缺席 = 封存硬保证降级 + diag 留痕） */
  readonly sessionController?: SessionControllerFace | undefined
  /** 官方 SessionPersistence（留痕反查/头读取面） */
  readonly sessionPersistence?: SessionPersistenceFace | undefined
  /** 官方 workspaceRegistry 惰性取法（缺席 = 旧环境零归属面降级） */
  readonly getWorkspaceRegistry: () => WorkspaceRegistryFace | undefined
  /** 绑定表失效锚（host 单源——knowledge-bindings.json 刷新编排留宿主） */
  readonly onWorktreeSetChanged?: ((worktreePath?: string) => Promise<void> | void) | undefined
  /** 留痕 append 失败诊断 emit 缝（host emitDiag('session-bind', warn)） */
  readonly bindWarnDiag?: ((message: string) => void) | undefined
  /** session/created 监听装配缝（宿主 ctx.on 接线——提案裁决监听装配留 host） */
  readonly onSessionCreated?: ((handler: (sessionId: string) => void) => (() => void) | undefined) | undefined
  /** 活会话解析缝（官方 sessions store——留痕 append 的会话解析面） */
  readonly liveSessions?: (() => { get(id: string): LiveSessionFace | undefined } | undefined) | undefined
  /** 诊断缝（宿主 diag——harness.log 链） */
  readonly warn: (message: string) => void
  /** 拦截层 fail-open 降级诊断缝（host emitDiag('fail-open', warn)） */
  readonly failOpenWarn: (message: string) => void
  /** workspace 前移创建失败诊断 emit 缝（host emitDiag('worktree-create', warn)） */
  readonly createDiag?: ((message: string) => void) | undefined
  /** seal 推导判定诊断 emit 缝（host emitDiag('session-bind', info)） */
  readonly bindDiag?: ((message: string) => void) | undefined
  /** bind-drift 漂移埋点 emit 缝（host emitDiag('bind-drift', info)） */
  readonly bindDriftDiag?: ((message: string) => void) | undefined
  /** forge/binding-mismatch 漂移推送缝（host ctx.emit → forge-stream 镜像） */
  readonly bindingMismatchEmit?: ((payload: ForgeBindingMismatchEvent) => void) | undefined
}

/** 装配返回面：service → forgeWorktree 桥服务；revokeSendGuard → 宿主关停链撤销缝 */
export interface WorktreeRpcHostAssembly {
  readonly service: WorktreeRpcService
  /** 发送拦截撤销（未装配 = no-op——幂等 fail-soft 同 child.ts 既有口径） */
  revokeSendGuard(): void
}

/**
 * host 注入点装配工厂：deps 组装（6 Face 契约）+ 发送拦截装配门（G7① wrap 装配门，
 * 1.30）——拦截 wrap 只在 gitWorktree 能力解析成功后装配，git 缺席宿主零 wrap、零每消息
 * 开销。能力 provide 异步晚于工厂调用可达：轮询探测，60s 仍未解析 = 放弃（diag 留痕）。
 */
export function createHostWorktreeRpc(injection: WorktreeRpcHostInjection): WorktreeRpcHostAssembly {
  const {
    getGitWorktree,
    sessionController,
    sessionPersistence,
    getWorkspaceRegistry,
    onWorktreeSetChanged,
    bindWarnDiag,
    onSessionCreated,
    liveSessions,
    warn,
    failOpenWarn,
    createDiag,
    bindDiag,
    bindDriftDiag,
    bindingMismatchEmit,
  } = injection
  const service: WorktreeRpcService = createWorktreeRpcService({
    gitWorktree: getGitWorktree,
    sessionPersistence,
    workspaceRegistry: getWorkspaceRegistry,
    onWorktreeSetChanged,
    bindWarnDiag,
    onSessionCreated,
    liveSessions,
    warn,
    createDiag,
    bindDiag,
    bindDriftDiag,
    bindingMismatchEmit,
  })
  let revoke: (() => void) | undefined
  let sendGuardInstalled = false
  const installSendGuard = (): void => {
    if (sendGuardInstalled) return
    sendGuardInstalled = true
    if (sessionController === undefined) {
      warn('[git-worktree] sessionController 缺席——发送拦截未接线（封存硬保证降级）')
      return
    }
    const disposers: Array<() => void> = []
    disposers.push(interceptSessionSends(sessionController, (sessionId) => service.seal({ sessionId }), failOpenWarn))
    revoke = () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          // 拦截撤销失败不阻关停链
        }
      }
    }
  }
  const wrapGate = setInterval(() => {
    if (getGitWorktree() !== undefined) {
      clearInterval(wrapGate)
      installSendGuard()
    }
  }, 250)
  wrapGate.unref?.()
  setTimeout(() => {
    clearInterval(wrapGate)
    if (!sendGuardInstalled) {
      warn('[git-worktree] gitWorktree 能力未解析（60s 放弃）——发送拦截保持零装配（零 wrap 零固定税）')
    }
  }, 60_000).unref?.()
  return {
    service,
    revokeSendGuard: () => {
      try {
        revoke?.()
      } catch {
        // 拦截撤销失败不阻关停链（幂等 fail-soft 同口径）
      }
    },
  }
}
