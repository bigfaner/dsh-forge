// @dsh-forge/project · host/assembly/host-side.ts —— worktree 域 host 侧装配段
//（plugin-project 1.17 批二「卸旧装新」：自 apps/host/src/boot/child.ts 513-670 装配段 +
// apps/host/src/ipc/worktree-identity.ts 运行时等价下沉——装配缝归属插件域，AGENTS 1.3
// 插件可移植性：宿主只留注册行）。承载三面：
//   ① GIT_WORKTREE_IDENTITY_SERVICE 注入缝 provide（createWorktreeIdentity——集成层扩展点
//      实现：归并 resolveProject + worktree_dir 提供者；函数值扩展点不可经 YAML config
//      承载——cordis ctx 服务面唯一跨插件缝；插件惰性 reflect.get 消费）；
//   ② forgeWorktree 桥服务装配（createHostWorktreeRpc——worktree RPC 通道域本体 +
//      发送拦截装配门 + 建会话 meta.cwd 注入 + 封存判定快照；gitWorktree 能力服务惰性
//      具名取法——provide 晚于本装配段可达）；
//   ③ 缺席/失败 = 零装配 fail-soft（通道未注册、拦截不接线——宿主不受影响）。
// 外部行为不变：装配逻辑逐字自 child.ts 平移（能力解析留痕 8s / 60s 拦截放弃门全保留）；
// knowledge 绑定表刷新（host ipc/bindings 域——零反向依赖）经依赖缝注入。
import type { ProjectService } from '@dsh-forge/contracts'
import {
  createHostWorktreeRpc,
  GIT_WORKTREE_IDENTITY_SERVICE,
  type LiveSessionFace,
  type SessionControllerFace,
  type SessionPersistenceFace,
  type WorktreeRpcService,
} from '../worktrees/index.js'
import { createWorktreeIdentity } from './worktree-identity.js'

/** cordis ctx 的服务解析窄面（reflect.provide 的逆查询；真 Context.get 结构兼容） */
interface ServiceGetFace {
  get(name: string): unknown
}

/** host 侧装配 ctx 窄面（官方事件监听/广播/具名能力服务的结构化取法——真 Context 结构兼容） */
interface HostSideCtxFace extends ServiceGetFace {
  /** 官方事件监听缝（session/created——fork 亦发布，ignorable 事件直写合法缝） */
  on(event: string, listener: (payload: unknown) => void): unknown
  /** 官方广播缝（forge/binding-mismatch 漂移推送 → /remote/forge-stream 镜像） */
  emit?(event: string, payload: unknown): void
}

/** knowledge 绑定表全量刷新缝（host ipc/bindings 域本体——依赖缝注入，零反向 import） */
export type KnowledgeBindingsRefresher = (
  projects: Pick<ProjectService, 'listProjects'>,
  bindingsFile: string,
  log: (line: string) => void,
) => Promise<unknown>

/** 装配依赖缝（host 侧诊断 emit 面 + 绑定表失效锚——child.ts 既有 emitDiag 闭包透传） */
export interface ProjectHostSideDeps {
  /** knowledge 绑定表文件（onWorktreeSetChanged 全量刷新锚——boot overlay 注入单值） */
  readonly bindingsFile: string
  /** 诊断缝（child diag——桥 diag 消息 + console 双写） */
  readonly diag: (line: string) => void
  /** binding-derivation §2.2：留痕 append 失败诊断 emit 缝（warn 级） */
  readonly bindWarnDiag: (message: string) => void
  /** G7① 拦截层 fail-open 降级诊断缝（方案 9） */
  readonly failOpenWarn: (message: string) => void
  /** binding-derivation 流程 A：workspace 前移创建失败诊断 emit 缝（worktree-create 域） */
  readonly createDiag: (message: string) => void
  /** binding-derivation §2.6：session-bind 推导判定诊断 emit 缝（info 级） */
  readonly bindDiag: (message: string) => void
  /** binding-derivation §2.6：bind-drift 漂移埋点 emit 缝（info 级——触发与消除） */
  readonly bindDriftDiag: (message: string) => void
  /** knowledge 绑定表全量刷新缝（host 域本体注入——缺席 = 零刷新面） */
  readonly refreshKnowledgeBindings: KnowledgeBindingsRefresher
}

/** 装配返回面：service → forgeWorktree 桥服务；revokeSendGuard → 宿主关停链撤销缝 */
export interface ProjectHostSideAssembly {
  readonly service: WorktreeRpcService | undefined
  readonly revokeSendGuard: (() => void) | undefined
}

/**
 * worktree 域 host 侧装配段（child.ts 513-670 平移——apps/host 只留注册行）。
 * 调用门 = 插件行在场（child.ts productPackagePresent 注行门）；装配失败 fail-soft
 * 不阻 boot（两段 try/catch 与原装配段同构）。
 */
export function assembleProjectHostSide(
  rawCtx: unknown,
  deps: ProjectHostSideDeps,
): ProjectHostSideAssembly {
  const ctx = rawCtx as HostSideCtxFace
  const { diag } = deps
  // worktree-branch-management 1.7 扩展点注入装配：插件行在 profile 树时，把归并实现 +
  // worktree_dir 提供者注入插件缝服务（函数值扩展点不可经 YAML config 承载——cordis ctx
  // 服务面唯一跨插件缝；插件惰性 reflect.get 消费，激活早于本 provide 不受阻）。
  // forgeProjects 缺席 / provide 失败 = 零注入 fail-soft（插件退默认实现 = 独立 worktree 模式）。
  const servicesFace = ctx as ServiceGetFace
  try {
    const forgeProjects = servicesFace.get('forgeProjects') as
      | Pick<ProjectService, 'listProjects' | 'getProject'>
      | undefined
    const provide = (
      ctx as unknown as { reflect?: { provide?: (name: string, value?: unknown) => unknown } }
    ).reflect?.provide
    if (forgeProjects !== undefined && typeof provide === 'function') {
      provide.call(
        (ctx as unknown as { reflect: object }).reflect,
        GIT_WORKTREE_IDENTITY_SERVICE,
        createWorktreeIdentity(forgeProjects, undefined, (line) => diag(line)),
      )
    } else {
      diag('[git-worktree] forgeProjects 缺席或 reflect.provide 不可用——扩展点零注入（插件退独立模式）')
    }
  } catch (cause) {
    diag(`[git-worktree] 扩展点注入失败（插件退独立模式，宿主不受影响）：${String(cause)}`)
  }
  try {
    // fix-4 具名消费（AGENTS.md Cordis 具名服务取法裁决）：gitWorktree 能力服务经模块
    // 扩充的具名属性取（类型面 = worktrees/index.ts declare module 扩充——type-only
    // 官方包裁决同径）；运行期存在性检查承担 fail-soft（provide 异步晚于本装配段
    // 可达——惰性取法；具名访问在服务缺席时由 ctx proxy 抛错 → catch 降级独立模式）。
    let capabilitySeen = false
    const getGitWorktree = (): unknown => {
      try {
        const capability: unknown = (ctx as unknown as { gitWorktree?: unknown }).gitWorktree
        if (capability !== undefined && capability !== null && !capabilitySeen) {
          capabilitySeen = true
          diag('[git-worktree] gitWorktree 能力服务已解析（具名消费）')
        }
        return capability ?? undefined
      } catch {
        return undefined // 服务未 provide（探测未收口/插件未装载）——独立模式面
      }
    }
    // fix-4 解析留痕：装配 8s 后仍缺席 → diag 留痕（harness.log 可见——插件行未装载/
    // git 缺席/provide 失败三态共因收口，不再静默恒独立模式）
    setTimeout(() => {
      if (!capabilitySeen) {
        diag('[git-worktree] gitWorktree 能力服务未解析（插件未装载/git 缺席/provide 失败）——worktree RPC 恒独立模式')
      }
    }, 8_000).unref?.()
    // worktree-domain-migration 1.2 注入点重构：宿主只做官方服务对象取法（惰性取法闭包
    // 在插件工厂调用前成立）+ 注入缝传参；deps 组装与发送拦截装配门在插件导出工厂
    // createHostWorktreeRpc（host/worktrees/host-assembly.ts）。
    // 官方服务取法 root 锚定优先（sessionPersistence/sessionController provide 于根 ctx；
    // 插件 ctx 属性访问在无 inject 声明宿主可能拒绝/缺席——root ?? ctx 双探针惰性取法，
    // AGENTS 1.6 检测永不缓存同径）。
    const rootFace = (((rawCtx as { root?: unknown }).root ?? rawCtx) as unknown) as ServiceGetFace
    const safeGet = (face: ServiceGetFace, name: string): unknown => {
      try {
        const value = face.get(name)
        return value === undefined || value === null ? undefined : value
      } catch {
        return undefined
      }
    }
    const sessionController = (safeGet(rootFace, 'sessionController') ?? safeGet(servicesFace, 'sessionController')) as SessionControllerFace | undefined
    const sessionPersistence = (safeGet(rootFace, 'sessionPersistence') ?? safeGet(servicesFace, 'sessionPersistence')) as SessionPersistenceFace | undefined
    if (sessionPersistence !== undefined) diag('[git-worktree] sessionPersistence 已解析（root 锚定取法）')
    else diag('[git-worktree] sessionPersistence 缺席（root/插件 ctx 双探针落空）——seal 判定退独立模式')
    // bug 925c96d5：官方 workspaceRegistry 惰性取法（具名 ctx 属性 + 运行期存在性检查
    // ——AGENTS.md Cordis 可选具名服务取法裁决同径）；缺席 = 零归属面降级（宿主不受影响）。
    const getWorkspaceRegistry = (): unknown => {
      try {
        const registry: unknown = (ctx as unknown as { workspaceRegistry?: unknown }).workspaceRegistry
        return registry ?? undefined
      } catch {
        return undefined // 服务未装载（旧环境/插件行缺席）——零归属面
      }
    }
    const assembled = createHostWorktreeRpc({
      getGitWorktree: getGitWorktree as never,
      sessionController,
      sessionPersistence,
      getWorkspaceRegistry: getWorkspaceRegistry as never,
      // 绑定表失效锚（worktree 集合变化——建/删树）：
      // 全量现算重写 knowledge-bindings.json（boot/registerProject 两锚之外的第三锚，
      // 消费端 knowledge 插件/forge 工具路由零改动）。服务缺席 = 零刷新 fail-soft。
      // bug 9eb9d6cb 后续性能收口：带 worktreePath 的调用（预铸挂会话——每次新会话点击）
      // 先查绑定行在册，在册即跳过（省 N×git worktree list + 文件重写，~百 ms/点击）；
      // 缺席（新树首次使用/建删树无路径）才全量刷新。读失败 = 现状全量刷新（fail-soft）。
      onWorktreeSetChanged: async (worktreePath?: string) => {
        let projects: Pick<ProjectService, 'listProjects'> | undefined
        try {
          projects = servicesFace.get('forgeProjects') as Pick<ProjectService, 'listProjects'> | undefined
        } catch {
          projects = undefined
        }
        if (projects === undefined) return
        if (worktreePath !== undefined) {
          try {
            const { readFileSync } = await import('node:fs')
            const raw = readFileSync(deps.bindingsFile, 'utf8')
            const parsed = JSON.parse(raw) as { projects?: readonly { wsPath?: unknown }[] }
            const normalized = worktreePath.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
            const present = (parsed.projects ?? []).some(
              (row) =>
                typeof row.wsPath === 'string' &&
                row.wsPath.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase() === normalized,
            )
            if (present) return // 绑定行已在册——锚目的（首次入表）已达成，零刷新
          } catch {
            // 读失败（首建/损坏）→ 落全量刷新现状
          }
        }
        await deps.refreshKnowledgeBindings(projects, deps.bindingsFile, (line) => diag(line))
      },
      // binding-derivation §2.2：留痕 append 失败诊断 emit 缝（warn 级）
      bindWarnDiag: deps.bindWarnDiag,
      // binding-derivation §2.2：session/created 监听装配缝（提案裁决：ctx.on 监听装配留
      // host——官方事件，fork 亦发布，同径覆盖；进程内 Session.append 直调 = ignorable
      // 事件直写合法缝）。注册失败 fail-soft（留痕由 seal 漂移校验惰性补写兜底）。
      onSessionCreated: (handler) => {
        try {
          return ctx.on('session/created', (session) => handler((session as { id: string }).id)) as
            | (() => void)
            | undefined
        } catch {
          return undefined
        }
      },
      // binding-derivation §2.2：活会话解析缝（官方 sessions store——留痕 append 面解析）
      liveSessions: () => {
        try {
          return servicesFace.get('sessions') as { get(id: string): LiveSessionFace | undefined } | undefined
        } catch {
          return undefined
        }
      },
      warn: (line) => diag(line),
      // G7① 拦截层 fail-open 降级诊断缝（方案 9）
      failOpenWarn: deps.failOpenWarn,
      // binding-derivation 流程 A：workspace 前移创建失败诊断 emit 缝（worktree-create 域）
      createDiag: deps.createDiag,
      // binding-derivation §2.6：session-bind 推导判定诊断 emit 缝（info 级）
      bindDiag: deps.bindDiag,
      // binding-derivation §2.6：bind-drift 漂移埋点 emit 缝（info 级——触发与消除）
      bindDriftDiag: deps.bindDriftDiag,
      // binding-derivation M6：forge/binding-mismatch 漂移推送（ctx.emit → /remote/forge-stream
      // 镜像目录逐帧推送——mobile banner 消费面）
      bindingMismatchEmit: (payload) => {
        try {
          ctx.emit?.('forge/binding-mismatch', payload)
        } catch {
          // 推送失败不反压 seal 判定链（fail-soft）
        }
      },
    })
    // G7① 发送拦截撤销缝（装配门在工厂内——能力解析后 install，关停链 revoke）
    return { service: assembled.service, revokeSendGuard: assembled.revokeSendGuard }
  } catch (cause) {
    diag(`[git-worktree] forgeWorktree 服务装配失败（RPC/拦截零装配，宿主不受影响）：${String(cause)}`)
    return { service: undefined, revokeSendGuard: undefined }
  }
}
