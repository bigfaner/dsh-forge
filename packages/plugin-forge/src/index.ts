// @dsh-forge/plugin-forge 插件定义（定位：装配；knowledge index.ts 同型——3.4 物理挂载）。
// 形态：Cordis Plugin.Function（loader 取 default 导出，与 core/index.ts 同型）：
//   inject = ['forgeTasks', 'forgeProposals', 'forgeBugs', 'forgeProjects', 'tools', 'systemPrompt']
//   —— 对 core 的依赖 = 任务/提案/bug/项目四域服务（Interface 1/3 类型 +
//   ProjectServiceM2.deriveTaskStoreDir——事件日志落位目录单源派生，插件不复制；
//   forgeBugs = fix-bug bug 域服务——recordBug/resolveBug 两写径）；
//   forgeSettings = 可选服务（经官方 reflect.get 防御读取——cordis 4.0.4 无 '?'
//   可选 inject 后缀；缺席 = dispatchTask 不携带 agentOptions 回退父会话继承）；
//   tools / systemPrompt 为 dsh 官方面（非 core）。
// S2（run-tasks-host-command）：指令两枚 /run-dag-tasks、/stop-dag-tasks 经
// ctx.reflect.get('commands') 防御读取注册（同先例配方——服务缺席 = 指令不注册
// fail-soft，R3）+ 宿主派发循环装配单例（agents 注册表叙述通道 + userQuestions 裁决挂钩）。
// 装配（3.4 终态）：事件总线（产品自建）+ 事件 sink（emit 面 + 会话目录记忆）+
// 日志监听器挂接（logs/{slug}.jsonl 唯一写者——事件→工作区映射 = 装配方闭包：
// sink.prepare 在 tool 执行点经 core deriveTaskStoreDir 解析并记忆，监听器
// resolveContainerDir 消费同一记忆）+ tool 注册（六员——名 = 动词透传；dispatchTask
// spawn 面 = spawn/in-process-driver.ts 真绑定）+ forge:pipeline 段注册（order 510）；
// 交出合并 disposer（fiber 卸载即全注销）。
// projectId 解析缝 = bindingsFile 机制（Interface 8 cwd 数据缝——host 维护
// {wsPath,projectId} JSON 经插件 config 进入，生产端 3.4）。
import { join } from 'node:path'
import type { ForgeSettingsService, ProjectServiceM2 } from '@dsh-forge/contracts'
import { createForgeCommands } from './commands/index.js'
import { attachForgeLogListener } from './events/log-listener.js'
import { createForgeEventBus } from './events/bus.js'
import { createForgeEventSink } from './events/sink.js'
import { adaptAgentNarrationChannel, adaptDispatchJobs, createProjectContainerDirs } from './faces.js'
import type { AgentLookupFace, CommandRegisterFace, DispatchJobsFace, DispatchJobsRegistryFace, SessionActivationFace } from './faces.js'
import { attachBugMentionPrestep } from './agent/bug-mention-prestep.js'
import { attachQuoteMentionPrestep, createQuoteSnapshotStore } from './agent/quote-mention-prestep.js'
import { createIncidentStore, createNarrator } from './notify/index.js'
import type { NarrationChannel } from './notify/index.js'
import { adaptSessionProgressAppend, registerProgressEventVocabulary } from './progress/index.js'
import { createLoopDriver, createE2eBaselineFace, createUserQuestionsEscalation } from './loop/index.js'
import type { EscalationAskFace } from './loop/index.js'
import { FORGE_DISPATCH_LOOP_SECTION_NAME, FORGE_DISPATCH_LOOP_SECTION_ORDER_OFFSET, renderInjection } from './loop/injection.js'
import { createLoopRegistry } from './loop/registry.js'
import { createForgeDispatchLoopProjection } from './projection/index.js'
import { createTriageHook } from './triage/index.js'
import { FORGE_DOC_STYLE_SECTION_NAME, FORGE_DOC_STYLE_SECTION_ORDER, FORGE_SECTION_NAME, FORGE_SECTION_ORDER, modeOf, renderDocStyleSection, renderForgePipelineSection } from './prompt/index.js'
import { createInProcessDriverSpawn } from './spawn/in-process-driver.js'
import { createPlanReplaySpawn, loadReplayPlanFromEnv, takeForgeSpawnOverride } from './spawn/seam.js'
import { defaultWorkerTreeGuard } from './spawn/job-tree.js'
import type { SpawnWorker } from './dispatch-core/index.js'
import { bindingProjectIds, createForgeTools, createProjectResolver } from './tools/index.js'
import type { ForgeContextFace } from './tools/index.js'
import type { ProjectBinding } from './tools/index.js'

/** 插件配置（profile cordis.patch.yml 行 config；cwd 绑定数据经 boot overlay 注入） */
export interface ForgePluginConfig {
  /** 会话 cwd → projectId 绑定表（wsPath 与 projects.ws_path 同口径 canonical path） */
  projects?: readonly ProjectBinding[]
  /** 绑定表文件路径（host 装配方维护——tool 执行点惰性读取，条目优先于静态表） */
  bindingsFile?: string
  /** 管线模式（preset yml plugin-forge 行 config 的 mode 键——expedition/blitz，缺省回退远征） */
  mode?: string
  /**
   * e2e 红灯基线门开关（用户裁决 2026-10-18 缺省 **false 禁用**——全量套件 >10min 超预算，
   * 每次循环启动白烧超时窗）。true = 循环启动时后台跑全量 e2e 套件建基线（红灯清单随
   * 简报递达 worker + 逐用例归因卡 + HEAD 键控持久缓存）。重启用前置 = 基线口径收敛到
   * 可承受时长（分片/受影响 spec/增量基线）。
   */
  e2eBaselineGate?: boolean
}

/** 启动对账降级告警（fail-soft 单行——console.warn；降级 = 遗留 in_progress 原样，下次重启重试） */
function warnReconcileDegraded(projectId: string, cause: unknown): void {
  const message = cause instanceof Error ? cause.message : String(cause)
  console.warn(`forge 启动对账降级（fail-soft，下次重启重试）：${projectId}——${message}`)
}

/** 函数插件形状（Plugin.Function + inject 元数据） */
export interface ForgePlugin {
  (ctx: ForgeContextFace, config?: ForgePluginConfig): () => void
  /** 依赖声明：声明服务齐备才加载（core 面 = forgeTasks + forgeProposals + forgeBugs +
   *  forgeProjects 四服务；forgeSettings 可选消费不走 inject 声明——缺席不阻载） */
  readonly inject: readonly string[]
}

const forgePlugin: ForgePlugin = Object.assign(
  (ctx: ForgeContextFace, config: ForgePluginConfig = {}): (() => void) => {
    // 词汇注册先行（#35——'forge/progress' 进已知事件集：未注册时持久化读路径拒绝
    // 解读含该事件的日志=历史加载失败；fire-and-forget 毫秒级，先于任何会话观测）。
    registerProgressEventVocabulary()
    // 事件链装配（3.3/3.4）：总线 → sink（emit + 会话目录记忆——core deriveTaskStoreDir
    // 单源）→ 监听器（唯一写者——容器维度 logs/{slug}.jsonl；dirOf 未命中 = fail-soft 丢行·绝不落相对路径）
    const bus = createForgeEventBus()
    const sink = createForgeEventSink({
      bus,
      resolveDir: (workspaceDir) =>
        ctx.forgeProjects.deriveTaskStoreDir({ workspaceDir }).then((r) => r.dir).catch(() => undefined),
    })
    // forgeSettings 可选消费（cordis 4.0.4 无 '?' 可选 inject 后缀——settingsFile 缺席 =
    // core 不注册该服务，注入声明会阻载整个插件；经官方 reflect.get 防御读取：
    // 缺席/异常 = undefined → dispatchTask 不携带 agentOptions 回退父会话继承）
    let settingsService: Pick<ForgeSettingsService, 'get'> | undefined
    try {
      const viaReflect = ctx.reflect?.get('forgeSettings') as Pick<ForgeSettingsService, 'get'> | undefined
      if (viaReflect !== undefined && typeof viaReflect.get === 'function') settingsService = viaReflect
    } catch {
      settingsService = undefined
    }
    // llm 服务可选消费（同 reflect.get 懒读配方）：resolveModelInfo → 模型推理档位支持集。
    // dispatchTask 组装面消费——配置档位不被模型支持时剥离 effort（无法兼容就不设置，
    // 杜绝 UNSUPPORTED_REASONING_EFFORT 级 worker 启动即崩）；服务缺席/异常 = 不判。
    let resolveModelReasoning:
      | ((provider: string, model: string) => Promise<readonly string[] | undefined>)
      | undefined
    try {
      const llm = ctx.reflect?.get('llm') as
        | {
            resolveModelInfo?: (
              provider: string,
              model: string,
            ) => Promise<{ reasoning?: { efforts?: readonly { id?: unknown }[] } } | undefined>
          }
        | undefined
      const resolveModelInfo = llm?.resolveModelInfo
      if (typeof resolveModelInfo === 'function') {
        resolveModelReasoning = async (provider, model) => {
          try {
            const info = await resolveModelInfo.call(llm, provider, model)
            const efforts = info?.reasoning?.efforts
            if (!Array.isArray(efforts)) return undefined // 非推理模型/无能力面 = 目录不可知（不判）
            return efforts.flatMap((effort) => (typeof effort?.id === 'string' ? [effort.id] : []))
          } catch {
            return undefined // 不可解析（未知 provider/model 等）= 不判
          }
        }
      }
    } catch {
      resolveModelReasoning = undefined
    }
    // jobs 注册表可选消费（async-dispatch §7——同 forgeSettings/llm reflect.get 防御读取
    // 双先例）：适配为 DispatchJobsFace 收窄面注入 dispatchTask（channel:'log' 全仓单点
    // 硬编码于 adaptDispatchJobs——appendLog 唯一写入口，默认通道/updateProgress 结构性
    // 不可达）。服务缺席/异常 = jobs 面不注入——run_in_background 调用被拒绝并提示
    // （events/settings 同型可选降级模式），前台派发路径零变化。
    let jobsFace: DispatchJobsFace | undefined
    try {
      const viaReflect = ctx.reflect?.get('jobs') as DispatchJobsRegistryFace | undefined
      if (viaReflect !== undefined && typeof viaReflect.start === 'function') jobsFace = adaptDispatchJobs(viaReflect)
    } catch {
      jobsFace = undefined
    }
    // agents 注册表可选消费（S2——叙述通道/裁决问询的活根解析，同 reflect.get 防御读取
    // 三先例）：适配为 NarrationChannel（notice=agent.inject 零模型回合 / followup=agent
    // .followup 新回合，decisions #17/#28）。服务缺席/异常 = 通道降级为 no-op（R4——叙述
    // 静默缺席，循环正确性只依赖宿主事件）。
    let agentsRegistry: AgentLookupFace | undefined
    try {
      const viaReflect = ctx.reflect?.get('agents') as AgentLookupFace | undefined
      if (viaReflect !== undefined && typeof viaReflect.get === 'function') agentsRegistry = viaReflect
    } catch {
      agentsRegistry = undefined
    }
    // sessionController 面可选消费（1.19——未进入会话激活：host SessionController.resolveAgent
    // = 上游 prompt 径同款「resolve or resume」进入机制）。1.21 调用期惰性解析（真机定罪：
    // apply 时点 reflect.get('sessionController') 未命中——服务晚于插件装配实例化，先取先得
    // 的闭包捕获把激活面恒置空 = 1.19 修复从未在运行时生效；web 侧 agentPresets 同款
    // 「调用期惰性解析」先例）：激活闭包在指令调用时点 reflect.get——缺席/异常/非函数面 =
    // undefined（handler warn 留痕 + 回执指引，fail-soft 同源不外抛）。
    const enterAgent = async (ownerSessionId: string): Promise<unknown> => {
      let activation: SessionActivationFace | undefined
      try {
        const viaReflect = ctx.reflect?.get('sessionController') as SessionActivationFace | undefined
        if (viaReflect !== undefined && typeof viaReflect.resolveAgent === 'function') activation = viaReflect
      } catch {
        activation = undefined
      }
      if (activation === undefined) return undefined
      try {
        const result = await activation.resolveAgent(ownerSessionId)
        return 'agent' in result ? (result as { readonly agent: unknown }).agent : undefined
      } catch {
        return undefined // 激活面故障 = 未进入（handler warn 留痕 + 回执指引，不外抛）
      }
    }
    // userQuestions 面可选消费（S2——无参枚举问询 + 第三层裁决投递，同防御读取先例）：
    // 缺席 = 问询降级（枚举路径指引带参直通；裁决静默终局——问询非循环正确性依赖）。
    let askFace: EscalationAskFace | undefined
    try {
      const viaReflect = ctx.reflect?.get('userQuestions') as EscalationAskFace | undefined
      if (viaReflect !== undefined && typeof viaReflect.ask === 'function') askFace = viaReflect
    } catch {
      askFace = undefined
    }
    const narrationChannel: NarrationChannel =
      agentsRegistry !== undefined ? adaptAgentNarrationChannel(agentsRegistry) : { notice: async () => {}, followup: async () => {} }
    // 1.17 循环进度 append 面（'forge/progress' 会话事件——同 agents 注册表鸭子消费，
    // 链 = agent.session.append；注册表缺席 = 面不注入，驱动器零发射 fail-soft）。
    const progressAppend = adaptSessionProgressAppend(agentsRegistry)
    // S2 宿主派发循环装配单例（run-tasks-host-command S1b/S1c/S4 接线）：驱动器 + 叙述面 +
    // 第三层裁决挂钩 + 第二层处置钩子真绑定（1.11 装配接线收口——LoopTriageInput 每循环
    // 身份载体 ownerSessionId/parent/signal 逐调用绑定，钩子服务面 tasks/spawn 与驱动器
    // 同源同单例；活循环 blocked 无 follow-up 即处置代理真实 spawn）。deps.projectId 缺席
    // ——指令面按敲指令会话 cwd 逐会话解析（LoopStartInput.projectId 覆盖）。
    // spawn 替换缝（worker-exec-evidence-replay fix-1——B 层回放注入面）：装配单例不再
    // 硬绑定 in-process 真绑定，按「程序化替换缝 > 回放计划（env DSH_FORGE_REPLAY_PLAN
    // ——e2e 零模型注入）> in-process 默认」三级解析。回放计划 spawn 的 runTool 闭包
    // 引用六 tool 组（后文装配——派发时点早已就绪；装配序前向引用 = let 惰性解引用），
    // forge 工具调用经真 handler 执行（submitTask/addTask 落账 actor/session 链与真实
    // worker 同产品写路径——SC7 会话链断言结构保留）， fabricated 会话上下文：
    // sessionId = 回放 worker 裸 uuid、cwd = 计划工作区根（绑定表路由 projectId）。
    let forgeToolsRef: ReturnType<typeof createForgeTools> | undefined
    // 进程树守卫真装配（dispatch-loop-hardening 改进 4）：worker 任意终态 Job Object
    // 整树回收——真机绑定 defaultWorkerTreeGuard（fail-soft：非 win32/装配失败 = no-op）
    const treeGuard = (): ReturnType<typeof defaultWorkerTreeGuard> => defaultWorkerTreeGuard()
    const replayPlan = loadReplayPlanFromEnv()
    const planSpawn: SpawnWorker | undefined =
      replayPlan !== undefined
        ? createPlanReplaySpawn(replayPlan, (name, args, sessionId) => {
            const tools = forgeToolsRef
            if (tools === undefined) throw new Error('[replay-plan] forge 工具组未装配（装配序违例——runTool 先于 createForgeTools 触达）')
            const def = (tools as unknown as Record<string, { execute(args: unknown, exec: unknown): Promise<unknown> }>)[name]
            if (def === undefined || typeof def.execute !== 'function') {
              throw new Error(`[replay-plan] forge 工具不在面：${name}（终态六员之外——回放面拒绝）`)
            }
            return def.execute(args, {
              agent: { session: { id: sessionId, header: { cwd: replayPlan.workspaceDir } } },
            })
          }, { treeGuard })
        : undefined
    const spawn = takeForgeSpawnOverride() ?? planSpawn ?? createInProcessDriverSpawn({ treeGuard }) // 装配单例（工具壳与循环驱动器同一 spawn 真绑定）
    // 容器目录解析缝（projectId→workspaceDir 反向解析——incident-log 落盘面，1.11 收口）：
    // 装配期逐绑定项目预热 + 未命中懒解析记忆化（faces.createProjectContainerDirs——解析链
    // getProject→ws_path→deriveTaskStoreDir 单源）；未命中/失败 = 该次详情行省略（fail-soft
    // 不拖垮叙述，绝不落相对路径）。
    const projectDirs = createProjectContainerDirs(ctx.forgeProjects)
    const boundProjectIds = bindingProjectIds(config.projects ?? [], config.bindingsFile)
    projectDirs.warm(boundProjectIds)
    const narrator = createNarrator({
      channel: narrationChannel,
      incidents: createIncidentStore({
        resolveContainerDir: (projectId) => (projectId !== undefined ? projectDirs.resolve(projectId) : undefined),
      }),
    })
    // 宿主循环日志落位记忆（fix-4）：循环不经 tool 执行点，sink.prepare 的 cwd 缝不可达
    // ——启动包装在循环启动时点以 projectId 反解容器库目录直记 sink，logs/<slug>.jsonl
    // 里程碑（task-claimed/tool-error 族）不再整流丢弃。解析未命中 = 不记忆（sink fail-soft
    // 丢行原语义不变）。stop/activeOf 直通原驱动器——落位记忆只属启动径。
    // 改进 6⑤ 已知容器集读面（wait-external.externalSlug 存在性校验数据源）：feature +
    // proposal 双轨 slug 并集，逐调用现读（fail-soft：任一读面故障 = 空并集——校验按缺席
    // 处理见 driver）；forgeFeatures 服务经 reflect 防御读取（同 forgeSettings 配方——
    // core 装配同块恒提供，缺席形态仅剩降级容错）
    let knownContainers: ((projectId: string) => Promise<readonly string[]>) | undefined
    try {
      const features = ctx.reflect?.get('forgeFeatures') as
        | { listFeatures?(q: { projectId: string }): Promise<readonly { slug: string }[]> }
        | undefined
      if (typeof features?.listFeatures === 'function') {
        knownContainers = async (projectId) => {
          const [featureRows, proposalRows] = await Promise.all([
            features.listFeatures!({ projectId }).catch(() => []),
            ctx.forgeProposals.listProposals({ projectId }).catch(() => []),
          ])
          return [...featureRows.map((r) => r.slug), ...proposalRows.map((r) => r.slug)]
        }
      }
    } catch {
      knownContainers = undefined
    }
    // 3b 注入面 registry 单例（装配方持有——驱动器 deps 注入共享同一登记表；section 回调
    // 闭包直读同一单例。注入为 registry 纯投影、零影子状态：登记状态变即输出变、登记删除
    // 即零注入——官方 dsh-system-prompt 对空串 section 整体过滤，与「从未注册」逐字节一致）。
    const loopRegistry = createLoopRegistry()
    // e2e 红灯基线门（改进7）：**config.e2eBaselineGate 配置项控制，缺省 false 禁用**
    // （用户裁决 2026-10-18「全量太重，先禁用」——真机全量套件 >10min，600s 超时必命中：
    // 每次循环启动白烧 10 分钟后 fail-soft 关闭）。true = 接线基线面：循环启动后台跑全量
    // e2e 套件建基线（红灯清单随简报递达 worker + 逐用例归因卡 + HEAD 键控持久缓存
    // `{worktree}/.forge/caches/{slug}/e2e-baseline/`——跨实例/重启同 HEAD 零重跑）。
    // 机制本体（driver/e2e-baseline/持久化/归因卡）完整保留并有测试覆盖；重启用前置 =
    // 基线口径收敛到可承受时长（分片/受影响 spec/增量基线）。
    const e2eBaseline =
      config.e2eBaselineGate === true
        ? {
            ...createE2eBaselineFace({ cwd: process.cwd() }),
            cacheFile: (input: { readonly slug: string; readonly worktree?: string }): string | undefined =>
              input.worktree === undefined
                ? undefined
                : join(input.worktree, '.forge', 'caches', input.slug, 'e2e-baseline', 'cache.json'),
          }
        : undefined
    const loopDriverBase = createLoopDriver({
      registry: loopRegistry,
      ...(e2eBaseline !== undefined ? { e2eBaseline } : {}),
      tasks: ctx.forgeTasks,
      spawn,
      narrator,
      events: sink,
      ...(progressAppend !== undefined ? { progress: progressAppend } : {}),
      ...(settingsService !== undefined ? { settings: settingsService } : {}),
      ...(resolveModelReasoning !== undefined ? { resolveModelReasoning } : {}),
      ...(knownContainers !== undefined ? { knownContainers } : {}),
      triage: createTriageHook({
        tasks: ctx.forgeTasks,
        spawn,
        ...(settingsService !== undefined ? { settings: settingsService } : {}),
        ...(resolveModelReasoning !== undefined ? { resolveModelReasoning } : {}),
      }),
      ...(askFace !== undefined
        ? {
            escalation: createUserQuestionsEscalation({
              ask: askFace,
              // 裁决回执经叙述通道注入主会话（agent.inject 零模型回合——闭环断环修复：
              // 裁决绕主会话、回执不绕；通道缺席形态 notice 已为 no-op，fail-soft 同源）
              notifyReceipt: (sessionId, text, headline) => narrationChannel.notice(sessionId, text, headline),
              ...(agentsRegistry !== undefined ? { resolveAgent: (ownerSessionId: string) => agentsRegistry?.get(ownerSessionId) } : {}),
            }),
          }
        : {}),
    })
    const loopDriver: typeof loopDriverBase = {
      ...loopDriverBase,
      start: async (input) => {
        // resolve 首调仅触发懒解析（记忆化桥接——同步读数恒 undefined）；有界轮询等解析
        // 收敛（≤2s——装配期 warm 未覆盖的运行期注册项目），未命中 = 不记忆（fail-soft 丢行）
        if (input.projectId !== undefined) {
          const deadline = Date.now() + 2_000
          for (;;) {
            const dir = projectDirs.resolve(input.projectId)
            if (dir !== undefined) {
              sink.remember(input.ownerSessionId, dir)
              break
            }
            if (Date.now() >= deadline) break
            await new Promise((r) => setTimeout(r, 50))
          }
        }
        return loopDriverBase.start(input)
      },
    }
    const resolveProjectId = createProjectResolver(config.projects ?? [], config.bindingsFile)
    // bug mention 发送期展开 pre-step（bug-mention-prestep——'agent/pre-step' waterfall
    // global 挂接，approval relay 同径）：扫描直接用户消息 @[…](bug:<uuid36>)，台账现查
    // （cwd→projectId 绑定优先 + 注册项目有界遍历）后追加九字段块；幂等 + fail-soft。
    // ctx.on 缺席/注册抛错 = 不挂接 fail-soft（同 commands/agents 防御读取先例）。
    let disposePrestep: (() => void) | undefined
    try {
      disposePrestep = attachBugMentionPrestep(ctx, {
        bugs: ctx.forgeBugs,
        projects: ctx.forgeProjects,
        resolveProjectId,
      })
    } catch {
      disposePrestep = undefined
    }
    // quote mention 发送期展开 pre-step（super-composer §2.3——bug-mention-prestep 同位）：
    // 内存快照存储（插件侧 cache 入口后续装配接线；当前空表 = 快照缺失跳过 fail-soft）
    // + 'agent/pre-step' waterfall global 挂接：扫描 @[…](quote:<uuid36>)，快照在场 →
    // 尾部追加 <quote id source>全文</quote> 块；幂等 + 永不抛错。ctx.on 缺席/注册
    // 抛错 = 不挂接 fail-soft。
    const quoteSnapshotStore = createQuoteSnapshotStore()
    let disposeQuotePrestep: (() => void) | undefined
    try {
      disposeQuotePrestep = attachQuoteMentionPrestep(ctx, { resolveQuote: quoteSnapshotStore.get })
    } catch {
      disposeQuotePrestep = undefined
    }
    const tools = createForgeTools({
      tasks: ctx.forgeTasks,
      proposals: ctx.forgeProposals,
      bugs: ctx.forgeBugs,
      resolveProjectId,
      events: sink,
      ...(settingsService !== undefined ? { settings: settingsService } : {}),
      ...(resolveModelReasoning !== undefined ? { resolveModelReasoning } : {}),
      ...(jobsFace !== undefined ? { jobs: jobsFace } : {}),
      // 3b 循环工具装配缝：dispatchTask/stopTaskLoop 与 /run-dag-tasks 指令同源同一循环核心
      // （驱动器 + 登记表单例注入——守卫判活/接管集/单活门控双入口同 registry）。
      loop: { driver: loopDriver, registry: loopRegistry },
    })
    forgeToolsRef = tools // 回放计划 runTool 的执行面回填（见 spawn 替换缝注记）
    // S7 会话投影键注册（run-tasks-host-command——sessionProjections 注册表可选消费，
    // reflect.get 防御读取第五先例）：注册表缺席/异常/非函数面 = 键不注册 fail-soft
    // 不阻载（capability absence = key absence——上游 session-projection 既定语义）。
    // 注册为 effect：注销器并入插件 disposer（fiber 卸载 = 键自快照消失）。fold 只读
    // 既有 command/run+command/done 日志派生 {sourceSlug, status}——零新增记录。
    let disposeProjection: (() => void) | undefined
    try {
      const projections = ctx.reflect?.get('sessionProjections') as
        | { register?: (definition: unknown) => () => void }
        | undefined
      if (projections !== undefined && typeof projections.register === 'function') {
        disposeProjection = projections.register(createForgeDispatchLoopProjection())
      }
    } catch {
      disposeProjection = undefined
    }
    // S2 指令两枚注册（ctx.inject(['commands']) 的防御读取形态——cordis 4.0.4 无 '?'
    // 可选 inject 后缀，同 forgeSettings/llm/jobs/agents 四先例）：commands 服务缺席 =
    // 指令不注册 fail-soft（R3——不阻载插件，六 tool 面零影响）；注销器并入插件 disposer。
    let disposeCommands: (() => void) | undefined
    try {
      const commands = ctx.reflect?.get('commands') as CommandRegisterFace | undefined
      if (commands !== undefined && typeof commands.register === 'function') {
        const forgeCommands = createForgeCommands({
          driver: loopDriver,
          tasks: ctx.forgeTasks,
          resolveProjectId,
          ...(askFace !== undefined ? { ask: askFace } : {}),
          // 1.18 活根解析随载（同 escalation 装配形态）——指令单行 followup 目标经 agentsRegistry
          // 解析活根，registry 未命中才退回 ctx.parent fallback（真机 undefined.send 定罪修复）
          ...(agentsRegistry !== undefined ? { resolveAgent: (ownerSessionId: string) => agentsRegistry?.get(ownerSessionId) } : {}),
          // 1.19 未进入会话激活随载（先进入再提交再启动——undefined.send 深层根因修复）
          ...(enterAgent !== undefined ? { enterAgent } : {}),
        })
        const registered = [commands.register(forgeCommands.runDagTasks), commands.register(forgeCommands.stopDagTasks)]
        disposeCommands = () => {
          for (const dispose of registered) dispose()
        }
      }
    } catch {
      disposeCommands = undefined
    }
    // S3 启动对账（run-tasks-host-command 图 D）：进程重启 → 插件装配 → reconcileInterrupted
    // 逐绑定项目 fail-soft 触发。三重判据（in_progress ∧ claim 记录循环来源标记 ∧ 登记表空）
    // 之③在装配时点恒真——循环登记表进程内不持久化，重启即空（活循环启动只会晚于装配），
    // registryEmpty=true 为装配期结构事实。fire-and-forget：失败不阻载装配（对账降级 = 遗留
    // in_progress 原样——skill 幂等重入语义不受伤，下次进程重启重试）。
    for (const projectId of boundProjectIds) {
      try {
        void ctx.forgeTasks
          .reconcileInterrupted({ projectId, registryEmpty: true })
          .catch((cause: unknown) => {
            warnReconcileDegraded(projectId, cause)
          })
      } catch (cause) {
        warnReconcileDegraded(projectId, cause) // 同步抛（服务面缺席等）——fail-soft 同径
      }
    }
    // 1.16 文档位置按会话工作区注入（bug 5adb5960 根治：段此前取 boundProjectIds[0]
    // 首个绑定项目，多项目宿主下所有会话共享同一（错误项目的）文档根）：段 text 用
    // 官方 PromptSection 函数形态——每次 system prompt 装配按上下文 agent.id（SessionId）
    // 查 session/created 预热的 sessionId→forgeDir 缓存求值；缓存缺席（预热未完成/
    // 项目未注册/面缺席）= 缺省段（省略文档位置，绝不注入其他项目的路径，fail-soft）。
    // mode 仍由 preset yml plugin-forge 行 config 注入（缺省回退远征）。doc-style
    // 独立段常量文本双模式共用（一次注册不重注册）。
    // Root cause: 段是进程级单文本，forgeDir 却是每会话事实——首个绑定项目被当成了全宿主默认。
    const pipelineMode = modeOf(config.mode)
    const sessionForgeDirs = new Map<string, string>()
    const warmSessionForgeDir = (session: { id?: unknown; header?: { cwd?: unknown } }): void => {
      try {
        const id = session?.id
        const cwd = session?.header?.cwd
        if (typeof id !== 'string' || typeof cwd !== 'string') return
        const projectId = resolveProjectId(cwd)
        if (projectId === undefined) return
        void (async () => {
          try {
            const projects = ctx.forgeProjects as Partial<ProjectServiceM2>
            if (typeof projects.getProject !== 'function') return
            const project = await projects.getProject(projectId)
            const forgeDir = project?.forgeDir
            if (typeof forgeDir === 'string' && forgeDir.trim() !== '') sessionForgeDirs.set(id, forgeDir)
          } catch {
            /* 预热失败 = 该会话回落缺省段（fail-soft 零外抛） */
          }
        })()
      } catch {
        /* 事件面形状异常 = 忽略（fail-soft） */
      }
    }
    if (typeof ctx.on === 'function') {
      // { global: true }（bug 4e9bf600）：session/* 经 scope carrier 过滤派发，插件装配 ctx
      // 携带作用域标签时，不带 global 的监听收不到他作用域会话——预热缓存恒空（同插件
      // prestep 与 dsh-session invariant 同径先例）。
      ctx.on('session/created', warmSessionForgeDir, { global: true })
      ctx.on(
        'session/disposed',
        (session: { id?: unknown }) => {
          if (typeof session?.id === 'string') sessionForgeDirs.delete(session.id)
        },
        { global: true },
      )
    }
    const disposeDocStyle = ctx.systemPrompt.section({
      name: FORGE_DOC_STYLE_SECTION_NAME,
      order: FORGE_DOC_STYLE_SECTION_ORDER,
      text: renderDocStyleSection(),
    })
    const disposePipeline = ctx.systemPrompt.section({
      name: FORGE_SECTION_NAME,
      order: FORGE_SECTION_ORDER,
      text: (context) =>
        renderForgePipelineSection({
          forgeDir: context?.agent?.id === undefined ? undefined : sessionForgeDirs.get(context.agent.id),
          mode: pipelineMode,
        }),
    })
    // 3b 协作面驻留段（P1 驻留 / 挂起 P3+P9——injection-spec 载体分配：P1/P9 永走系统提示词）。
    // 段 text 每回合现调：agent.id 缺席 = 空串；registry 投影无命中 = 空串（零固定税——
    // 协作外会话提示词与无此插件时逐字节一致）；占位符残留段 fail-soft 跳段（injection.ts 落盘告警）。
    const disposeDispatchLoop = ctx.systemPrompt.section({
      name: FORGE_DISPATCH_LOOP_SECTION_NAME,
      order: FORGE_DOC_STYLE_SECTION_ORDER + FORGE_DISPATCH_LOOP_SECTION_ORDER_OFFSET, // 512（doc-style 511 之后——forge 段族次序稳定）
      text: (context) => (context?.agent?.id === undefined ? '' : renderInjection(context.agent.id, loopRegistry)),
    })
    const disposers = [
      ctx.tools.register(tools.addTask),
      ctx.tools.register(tools.submitTask),
      ctx.tools.register(tools.queryTask),
      ctx.tools.register(tools.createProposal),
      ctx.tools.register(tools.transitionProposal),
      ctx.tools.register(tools.dispatchTask),
      ctx.tools.register(tools.stopTaskLoop),
      ctx.tools.register(tools.updateTask),
      ctx.tools.register(tools.taskStats),
      ctx.tools.register(tools.listTasks),
      ctx.tools.register(tools.recordBug),
      ctx.tools.register(tools.resolveBug),
      ctx.tools.register(tools.listBugs),
      ctx.tools.register(tools.getBug),
      attachForgeLogListener(bus, { resolveContainerDir: (event) => sink.dirOf(event.sessionId) }),
      // 段文本 = dual-mode-overhaul 三段结构（总纲/文档位置与存储约束/流程），
      // 不含 tool 说明——dsh tool 注册面自带（Interface 9 标签表行 1）；
      // pipeline 段函数形态单次注册（按装配求值，无重注册升级面）；doc-style
      // 独立段双模式共用（disposeDocStyle 恰一份）。
      () => disposePipeline(),
      () => disposeDispatchLoop(), // forge:dispatch-loop 段——插件卸载级摘除（section() 返回 Cordis disposer）
      () => disposeDocStyle(),
      ...(disposeCommands !== undefined ? [disposeCommands] : []), // S2 指令两枚（commands 面在场时）
      ...(disposeProjection !== undefined ? [disposeProjection] : []), // S7 会话投影键（sessionProjections 面在场时）
      ...(disposePrestep !== undefined ? [disposePrestep] : []), // bug mention pre-step（ctx.on 面在场时）
      ...(disposeQuotePrestep !== undefined ? [disposeQuotePrestep] : []), // quote mention pre-step（ctx.on 面在场时）
      () => loopDriverBase.dispose(), // fiber 卸载收口：活循环同步终态（不收口则 DB 关闭后循环异常终止——fix-bug ea86ea00）
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  },
  {
    inject: ['forgeTasks', 'forgeProposals', 'forgeBugs', 'forgeProjects', 'tools', 'systemPrompt'] as const,
  },
)

export default forgePlugin
export {
  FORGE_DOC_STYLE_SECTION_NAME,
  FORGE_DOC_STYLE_SECTION_ORDER,
  FORGE_SECTION_NAME,
  FORGE_SECTION_ORDER,
  modeOf,
  renderDocStyleSection,
  renderForgePipelineSection,
} from './prompt/index.js'
export type { ForgePipelineMode, ForgePipelineSectionVars } from './prompt/index.js'
// M3 3.3/3.4：产品自建事件总线 + 日志监听器 + 事件 sink（logs/{slug}.jsonl 唯一写者）——
// tool 面 emit 点已接线（dispatchTask 五事件 + submitTask task-submitted + 全 tool-error）。
export { assertForgeEventEnvelope, createForgeEventBus } from './events/bus.js'
export type { ForgeEventBus, ForgeEventHandler } from './events/bus.js'
// bug mention 发送期展开 pre-step（'agent/pre-step' waterfall——扫描/投影/取数纯函数 + 挂接）。
export {
  attachBugMentionPrestep,
  expandBugMentions,
  hasBugBlock,
  scanBugMentions,
  serializeBugCardBlock,
  UUID36_PATTERN_SOURCE,
} from './agent/bug-mention-prestep.js'
export type {
  BugMentionLookupFace,
  BugMentionPrestepDeps,
  BugMentionProjectsFace,
  PreStepDecisionFace,
  PreStepRegisterFace,
  PrestepAgentFace,
  PrestepPayloadFace,
  PrestepUserMessageFace,
} from './agent/bug-mention-prestep.js'
// quote mention 发送期展开 pre-step（super-composer 提案 §2.3——'agent/pre-step' waterfall
// 扫描/投影/快照取数纯函数 + 挂接 + 内存快照存储）。
export {
  attachQuoteMentionPrestep,
  createQuoteSnapshotStore,
  expandQuoteMentions,
  hasQuoteBlock,
  scanQuoteMentions,
  serializeQuoteBlock,
} from './agent/quote-mention-prestep.js'
export type {
  PreStepDecisionFace as QuotePreStepDecisionFace,
  PreStepRegisterFace as QuotePreStepRegisterFace,
  PrestepPayloadFace as QuotePrestepPayloadFace,
  PrestepUserMessageFace as QuotePrestepUserMessageFace,
  QuoteMentionPrestepDeps,
  QuoteSnapshotFace,
  QuoteSnapshotLookupFace,
  QuoteSnapshotStore,
} from './agent/quote-mention-prestep.js'
export {
  attachForgeLogListener,
  createForgeLogListener,
  forgeLogFileOf,
  FORGE_LOG_POOL_SLUG,
  FORGE_LOGS_DIR,
  readForgeEventLog,
  resolveLogSlug,
  standardizeEvent,
} from './events/log-listener.js'
export type { ForgeLogListener, ForgeLogListenerOptions } from './events/log-listener.js'
export { createForgeEventSink, emitToolError, slugOfToolArgs } from './events/sink.js'
export type { ForgeEventSink, ForgeEventSinkDeps } from './events/sink.js'
export { createForgeTools, createProjectResolver, FORGE_TOOL_NAMES, adaptDispatchJobs } from './tools/index.js'
export type {
  DispatchJobHooks,
  DispatchJobOutcome,
  DispatchJobRunHandle,
  DispatchJobSpec,
  DispatchJobsFace,
  DispatchJobsRegistryFace,
  ForgeBugsToolFace,
  ForgeTools,
  ForgeToolDeps,
  DispatchForgeToolDeps,
  ForgeToolName,
  ProjectBinding,
  ProjectIdResolver,
  ToolSessionContext,
  WorkspaceNotRegisteredData,
} from './tools/index.js'
export { WorkspaceNotRegisteredError, isWorkspaceNotRegisteredError } from './tools/index.js'
export type { ForgeContextFace as PluginContextFace, ForgeToolDefinition } from './tools/index.js'
export { classifyPool, deriveWorkerToolFilter, poolOf, reconcileWorkerReasoning, workerAgentOptionsOf } from './tools/index.js'
export type { DispatchTaskResult, PoolSnapshot, PoolVerdict, SpawnWorker, SpawnWorkerHandle, SpawnWorkerRequest } from './tools/index.js'
export { createInProcessDriverSpawn } from './spawn/in-process-driver.js'
export {
  createPlanReplaySpawn,
  loadReplayPlanFromEnv,
  setForgeSpawnOverride,
  takeForgeSpawnOverride,
  writeReplayPlan,
  REPLAY_PLAN_ENV,
  type PlanAction,
  type PlanEntry,
  type PlanFsWriteAction,
  type PlanGitCommitAction,
  type PlanToolAction,
  type PlanToolRunner,
  type ReplayPlan,
} from './spawn/seam.js'
export {
  createReplayDriverSpawn,
  digestOfPrompt,
  type ReplayAction,
  type ReplayScript,
  type ReplayTextAction,
  type ReplayToolAction,
  type ReplayToolRunner,
} from './spawn/replay-driver.js'
// S4（run-tasks-host-command）叙述通知模块——17 场景模板 + 双通道 + 长内容落盘（纯模块，
// 循环驱动器后续接线；规格锚 = notification-samples.md 全谱 + decisions #24/#25/#26/#27/#28）。
export {
  failSoftNarrationChannel,
  createIncidentStore,
  createNarrator,
  incidentDirNameOf,
  incidentRelPathOf,
  renderNarrative,
  sanitizeIncidentSegment,
  SCENARIOS,
  summarizeReason,
  validateNarrative,
  findMechanismWords,
  MECHANISM_WORDS,
} from './notify/index.js'
export type {
  NarrationChannel,
  NarrationRoute,
  Narrator,
  NarratorDeps,
  ScenarioId,
  NarrativePayloadMap,
  IncidentInput,
  IncidentStore,
  IncidentStoreDeps,
} from './notify/index.js'
// S1b（run-tasks-host-command）宿主派发循环驱动器——runRound 状态机（v1 严格串行）+ 运行时
// 登记表 + 生命周期入口（start/stop，S2 指令层消费）+ 处置钩子接口（S1c 实装注入）。
export {
  backoffDelayMs,
  LOOP_BACKOFF_BASE_MS,
  LOOP_INSTRUCTION_ALL_DONE,
  LOOP_PATIENCE_MAX_WAIT_ROUNDS,
  LOOP_PATIENCE_PAUSE_MS,
  LOOP_STOP_TRANSITION_REASON,
  LOOP_TRIAGE_MAX_ATTEMPTS,
  LOOP_WORKER_ABORT_MAX_RETRIES,
  createLoopDriver,
  createLoopRegistry,
  createUserQuestionsEscalation,
  loopInstructionOf,
  renderEscalationAsk,
} from './loop/index.js'
export type {
  EscalationAskFace,
  EscalationAskMaterial,
  EscalationAskOption,
  EscalationAskQuestion,
  LoopDriver,
  LoopDriverDeps,
  LoopEscalation,
  LoopEscalationHook,
  LoopInFlight,
  LoopInstanceId,
  LoopRecord,
  LoopRegistry,
  LoopSourceRef,
  LoopStartInput,
  LoopStartResult,
  LoopStopResult,
  LoopTriageDecision,
  LoopTriageHook,
  LoopTriageInput,
  UserQuestionsEscalationDeps,
} from './loop/index.js'
// S1c（run-tasks-host-command）第二层处置代理——一次性 subagent（与 worker 同款 in-process
// 形态：类型化提示词 + 全收窄工具面 + 结构化三动作决策输出，宿主忠实执行）。
export { composeTriagePrompt, createTriageHook, extractDecisionJson, parseTriageDecision, TriageDecisionInvalidError } from './triage/index.js'
export type { TriageHookDeps, TriagePromptInput } from './triage/index.js'
// S1c 循环独占守卫（活循环任务源拒绝外部 dispatchTask——显式 slug 与盲选两径，claim 面消费）
export {
  clearExclusiveLoopSource,
  exclusiveLoopSourceOf,
  exclusiveScopedRejection,
  externalExclusivityGuard,
  hasExclusiveLoopSources,
  LOOP_EXCLUSIVE_GUIDANCE,
  LoopSourceExclusiveError,
  resetExclusiveLoopSources,
  setExclusiveLoopSource,
} from './dispatch-core/index.js'
// S2（run-tasks-host-command）指令两枚——/run-dag-tasks 与 /stop-dag-tasks（UI command
// plane 执行零模型消息；注册面 = 装配方 reflect.get('commands') 防御读取 fail-soft）。
export { createForgeCommands, FORGE_COMMAND_NAMES, NO_ACTIVE_LOOP_TEXT, nonTerminalSourcesOf } from './commands/index.js'
export type { ForgeCommands, ForgeCommandsDeps, RunDagTasksDeps, SourceCandidate, StopDagTasksDeps } from './commands/index.js'
// S2 宿主服务收窄面与适配层（faces.ts 增员——commands 注册表/agents 注册表 + 叙述通道适配
// + 项目容器目录解析缝）。
export {
  adaptAgentNarrationChannel,
  createProjectContainerDirs,
  FORGE_NOTICE_SOURCE_KIND,
} from './faces.js'
export type {
  AgentLookupFace,
  CommandRegisterFace,
  ForgeCommandDefinition,
  ForgeCommandInvocation,
  ForgeCommandResult,
  ProjectContainerDirs,
  ProjectDirServiceFace,
  SessionActivationFace,
} from './faces.js'
// 1.17 循环进度事件族（'forge/progress'——declare-module 合并 + append 适配面）。
export { adaptSessionProgressAppend, FORGE_PROGRESS_EVENT_TYPE, isForgeProgressData } from './progress/index.js'
export type { ForgeProgressCounts, ForgeProgressEventData, ProgressAppendFace } from './progress/index.js'
