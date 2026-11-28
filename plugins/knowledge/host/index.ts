// @dsh-forge/knowledge 插件定义（定位：装配——3.4；1.7 A2 服务切换：自有服务面）。
// 形态：Cordis Plugin.Function（loader 取 default 导出）：
//   inject = ['tools', 'systemPrompt', 'connection', 'workspaceRegistry'] —— 零 core 依赖（SC-2）：五通道供数 = 自有
//   'knowledge' 服务（reflect.provide；core 八法随迁 service/，自持库 storage/ 供数），
//   tools / systemPrompt 为 dsh 官方面；connection = fix-9 /api 共享通道 interceptor 注册边
//   （knowledge.*/projects.* 端点——UI 数据层官方宿主正缝，host/connection-rpc.ts）；
//   workspaceRegistry = fix-9 projects 端点官方宿主数据源边（具名服务消费以 inject 声明
//   承担——project host 同款先例；运行期存在性检查仍承担 fail-soft）。
// 装配：自持存储自启（失败/锚缺席 fail-soft 降级零注册）→ 'knowledge' 服务 provide →
// 六 tool 注册（tools/register——search/readAbstract/write/read/supersede/reinstate，
// 裁决 #1 修订 2026-11-05：supersede/reinstate 开为 agent tool）+ 提示词两段装配（均全局
// 注册，随插件 fiber 注销）：静态段 forge:knowledge(910)（fix-11 裁决 B 侧 Interface 3——
// plugin load 时点先于一切会话装配，首轮请求即在场；bug be4bac44 判例）+ 动态段
// forge:knowledge-domains(911)（text(context) 每步按 context.agent 现取会话 cwd 求值——
// service/session-prompt.ts）+
// knowledge 目录键声明（root/global 两键——根 scope provide('dirKeys.knowledge', entries)
// 约定名——跨 scope 反向拉取终态缝，bug 04d445f4）；交出合并 disposer。
// projectId 解析缝（用户裁决 Q19）：纯 config 静态注入——config.projects 绑定表为唯一
// 数据源；服务面两级解析 projectId→wsPath→注册行。
import { createKnowledgeTools, createProjectResolver, createWsPathResolver } from './tools/index.js'
// 声明合并文件随源引入（跨程序编译——tests/e2e 传递包含本文件时不经包级 include，
// 不引入则 ForgeDirs 增强缺席 satisfies 受检失效）
import type {} from './forge-dirs.js'
import {
  KNOWLEDGE_DOMAINS_SECTION_NAME,
  KNOWLEDGE_DOMAINS_SECTION_ORDER,
  KNOWLEDGE_SECTION_NAME,
  KNOWLEDGE_SECTION_ORDER,
  renderKnowledgeStaticSection,
} from './prompt/index.js'
import type { ProjectIdResolver, WsPathResolver } from './tools/index.js'
import { domainTreeIndexOf } from './service/internal.js'
import { createKnowledgeDomainsText, type KnowledgePromptBindDeps } from './service/session-prompt.js'
import { createKnowledgeService } from './service/index.js'
import {
  startSelfHostedStorage,
  resolveForgeRootOf,
  globalKnowledgeDir,
  type DshHomePathProbe,
} from './storage/index.js'
import { canonicalWsPath } from './storage/registry.js'
import { DIAG_EVENT, type DiagEventPayload } from '@dsh-forge/lib-api/diag'
import { joinDirSegment } from '@dsh-forge/lib-path'
import { projectKeyOf, type ForgeDirs } from '@dsh-forge/lib-path'
import { defaultKnowledgeDirOf, resolveKnowledgeDir, type KnowledgeDirSetting } from './knowledge-dir.js'
import {
  isForgeProjectsSource,
  isWorkspaceRegistryFace,
  registryProjectsSource,
  registerKnowledgeConnectionRpc,
  type ForgeProjectsSource,
  type HostConnectionFace,
} from './connection-rpc.js'
import type { BackflowConfig } from './service/types.js'
import type { KnowledgeContextFace } from './tools/index.js'

import { assertInstallMutex } from './install-mutex.js'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** 插件配置（profile cordis.patch.yml 行 config；应用装配期路径经 boot overlay 注入） */
export interface KnowledgePluginConfig {
  /**
   * 会话 cwd → projectId 绑定表（纯 config 静态注入——Q19 裁决；wsPath 与自持注册表
   * ws_path 同口径 canonical path）。服务面两级解析第一级（反向：projectId → wsPath）。
   */
  projects?: readonly import('./tools/index.js').ProjectBinding[]
  /**
   * 自持库文件路径（config 可配——裁决① 2026-11-19）；缺席按宿主数据域子目录缺省解析
   * （dsh-forge → 数据域根/knowledge/，dsh desktop → DSH_HOME/knowledge/）。
   * 自启缺席（裸环境）/开库失败 = fail-soft 零注册零供数（不向 ~/.dsh 静默落盘）。
   */
  dbFile?: string
  /**
   * 旧 core state.db 路径（种子迁移源——host 装配注入；缺席 = 常规路径零迁移）。
   * 轻量种子迁移（裁决 2026-11-19）：注册行唯一种子 / entries 零迁 / recall_logs best-effort。
   */
  legacyStateDb?: string
  /**
   * 回流配置面（stage② §2.4：阈值归插件 config，非代码常量——0.4/0.2 两档轻量索引
   * 回流的检索分阈 + 滞回（每对限次 + 冷却窗））。
   */
  backflow?: BackflowConfig
  /**
   * 项目知识目录覆盖面（1.5 提案项 4）：字面量（全项目单目录）或 per-project map
   * （键 = 项目工作区目录 projectDir/wsPath）。缺席 = 缺省 {projectDir}/.knowledge；
   * 非法值 = 消费点 fail-soft 回退缺省 + warn 埋点（不静默）。物化在消费点（读时
   * mkdir recursive——不在 apply 期预建，WYSIWYG + ACL 时序；解析纯函数见
   * host/knowledge-dir.ts）。
   */
  knowledgeDir?: KnowledgeDirSetting
  /** INV-3 组合装载标记（forge patch 成员行下发 comboMark: true——solo patch 行越装缺此键） */
  comboMark?: boolean
}

/** 函数插件形状（Plugin.Function + inject 元数据） */
export interface KnowledgePlugin {
  (ctx: KnowledgeContextFace, config?: KnowledgePluginConfig): () => void
  /** 依赖声明：dsh 官方面齐备才加载（零 core 面） */
  readonly inject: readonly string[]
}

// ─────────────────── knowledge 目录键声明（forge-dirs-unification §2.2/§2.5） ───────────────────

/**
 * knowledge 两个目录键（声明合并 host/forge-dirs.d.ts 的运行期登记面——键与声明逐一
 * 相同，satisfies Partial<ForgeDirs> 编译期受检；description 与 forge_dirs 输出同源；
 * resolve 纯函数零 IO，deps 由注册表先解析）。
 */
export const KNOWLEDGE_DIR_ENTRIES = {
  'knowledge.root': {
    description: '项目知识库（.knowledge/——conventions/lessons/examples 三类沉淀所在）',
    deps: ['workspaceRoot'],
    resolve: (deps: { workspaceRoot: string }): string => joinDirSegment(deps.workspaceRoot, '.knowledge'),
  },
  'knowledge.global': {
    description: '全局知识库目录（{forge.home}/knowledge/global——只随 forge 根，不随库文件路径）',
    deps: ['forge.home'],
    resolve: (deps: { 'forge.home': string }): string =>
      joinDirSegment(joinDirSegment(deps['forge.home'], 'knowledge'), 'global'),
  },
} as const satisfies Partial<ForgeDirs>

/**
 * 装配期声明（bug 04d445f4 裁定：反向拉取缝——跨 scope 装配形态下推式注册不可达）：
 * knowledge 为全局 overlay 行（根 scope），plugin-forge 按会话隔离实例化——跨 scope 的
 * reflect.get / internal/service 事件均被隔离过滤。改为 knowledge 在根 scope
 * `reflect.provide('dirKeys.knowledge', entries)` 提供声明数组，plugin-forge 每次
 * forgeDirs/forgeResolvePath 查询时枚举 `dirKeys.*` 约定名现取（消费点现查，AGENTS 1.6）。
 * reflect/provide 缺席或抛 = 声明零生效零抛（fail-soft，不阻载本插件）。
 *
 * @returns provide 注销器（已当场 provide 时返回其注销器；缺席环境 no-op）——并入插件 disposers。
 */
const DIR_KEYS_SERVICE_NAME = 'dirKeys.knowledge'

/** knowledge 服务 provide 名（A2 服务切换：去 forge 前缀——host 在场判定/通道句柄同键） */
export const KNOWLEDGE_SERVICE_NAME = 'knowledge'

function declareKnowledgeRootDirKey(ctx: KnowledgeContextFace): () => void {
  const reflect = ctx.reflect
  const provide = reflect?.provide
  if (typeof provide !== 'function') return () => {}
  try {
    const dispose = provide.call(reflect, DIR_KEYS_SERVICE_NAME, KNOWLEDGE_DIR_ENTRIES)
    return typeof dispose === 'function' ? () => dispose() : () => {}
  } catch {
    return () => {} // provide 抛（同名已注册等）= 零生效零抛
  }
}

/** 随包 experts/ 目录解析（源 host/index.ts 深包根 1 级、dist bundle dist/host/index.js 深
 * 2 级——双候选取在场目录；均缺席 = undefined 由注册面 warn 留痕）。 */
function bundledExpertsRoot(moduleUrl: string = import.meta.url): string | undefined {
  for (const rel of ['../../experts/', '../experts/'] as const) {
    const dir = fileURLToPath(new URL(rel, moduleUrl))
    if (existsSync(dir)) return dir
  }
  return undefined
}

/** 本包包名（experts.registerRoot 的 pluginName 实参——专家实例 ID 前缀 `@dsh-forge/knowledge#键`）。 */
export const KNOWLEDGE_PACKAGE_NAME = '@dsh-forge/knowledge' as const

/**
 * 随包内置专家档案注册（experts.registerRoot 装配行——AGENTS 1.6 配方）：惰性
 * reflect.get('experts') + try/catch 现查、检测结果零缓存；expert-squad 缺席 =
 * fail-soft + warn 留痕（不阻载本插件）。registerRoot 侧已主动触发全部已建 registry
 * 换代（plugins/expert-squad host/index.ts registerRoot 注记）——本面零 refresh 调用。
 * SC-2 零依赖红线：knowledge 只注册档案不消费 experts 服务（inject 名单零增）。
 * 迟到补偿（builtin-redistribution 裁决①，修复 t-1.2 真机证伪的静默零注册）：
 * apply 期 experts 缺席时挂接官方 cordis 内建 `internal/service` 事件（官方同语义机械
 * 核销——cordis src/events.ts Events 声明「service events observe dependency
 * registration」；src/reflect.ts `notify()` 在 provide/ACTIVE 换代时 emit；零新机械），
 * experts 服务上场即幂等补注册一次。补偿态（已注册/已终止布尔）是装配事实可缓存；
 * experts 服务引用永不 memoize——每次补触发现查 reflect.get（AGENTS 1.6）。
 * 本案承重事实（t-1.2 真机证伪 + 源码定谳）：expert-squad apply 为 async——storage
 * 可选服务 open 完成后才 provide('experts')（expert-squad host/index.ts 尾段），
 * cordis 对兄弟 fiber 的 async apply 不构成装载序阻塞，故本包 insert 序在后仍先于
 * provide 执行——现查缺席即落补偿，上场事件兜底注册。另有裁决②装配序修正治当前形态。
 */
export function registerBuiltinExpertsRoot(
  ctx: KnowledgeContextFace,
  emit?: (payload: DiagEventPayload) => void,
): void {
  const warn = (message: string): void => {
    emit?.({ event: 'knowledge-experts-register', level: 'warn', message, process: 'main' })
  }
  const face = ctx as unknown as {
    reflect?: { get?(name: string): unknown }
    on?(event: string, listener: (...args: unknown[]) => unknown): () => unknown
    effect?(dispose: () => unknown): unknown
  }
  // 补偿态 = 装配事实（已注册/已终止即不再补触发）；experts 服务引用每次现查。
  let settled = false
  const attempt = (phase: '在场' | '迟到补偿'): boolean => {
    let experts: unknown
    try {
      experts = face.reflect?.get?.('experts')
    } catch {
      experts = undefined // 反射异常视同缺席（fail-soft）
    }
    const register = (experts as { registerRoot?: unknown } | undefined)?.registerRoot
    if (typeof register !== 'function') return false
    const dir = bundledExpertsRoot()
    if (dir === undefined) {
      warn('随包 experts/ 目录解析缺席——内置专家档案零注册（fail-soft 不阻载）')
      return true // 目录缺席与序无关，终止补偿
    }
    try {
      register.call(experts, ctx, dir, KNOWLEDGE_PACKAGE_NAME)
      emit?.({
        event: 'knowledge-experts-register',
        level: 'info',
        message: `随包内置专家档案注册完成（${phase}）：${dir}（experts.registerRoot——换代由 expert-squad 侧承担）`,
        process: 'main',
      })
    } catch (cause) {
      warn(`experts.registerRoot 调用失败——随包专家档案零注册（fail-soft 不阻载）：${String(cause)}`)
    }
    return true // 已注册或已确认失败——均终止补偿
  }
  if (attempt('在场')) {
    settled = true
    return
  }
  warn('experts 服务缺席（expert-squad 未装/未供或晚于本件上场）——随包专家档案暂零注册（fail-soft 不阻载；internal/service 迟到补偿已挂接）')
  if (typeof face.on !== 'function') return // 事件总线缺席 = 补偿通道不可用（warn 已留痕）
  let off: (() => unknown) | undefined
  off = face.on('internal/service', (name: unknown) => {
    if (settled || name !== 'experts') return
    if (attempt('迟到补偿')) {
      settled = true
      if (typeof off === 'function') off() // 补偿完成摘除监听（一次性装配事实）
    }
  })
  if (typeof face.effect === 'function') face.effect(() => () => off?.())
}

const knowledgePlugin: KnowledgePlugin = Object.assign(
  (ctx: KnowledgeContextFace, config: KnowledgePluginConfig = {}): (() => void) => {
    // INV-3 安装互斥 loud-fail 守卫（bug ef3e92ea）——任何装配副作用之前首查。
    assertInstallMutex(ctx, config, "@dsh-forge/knowledge")
    // 诊断发射面（埋点经装配期注入——DIAG_EVENT 类型化 emit，host main 进程位）
    const diagEmit =
      typeof ctx.emit === 'function'
        ? (payload: DiagEventPayload) => ctx.emit!(DIAG_EVENT, { ...payload, process: 'main' })
        : undefined
    // 随包内置专家档案注册（experts.registerRoot 装配行——experts 缺席 fail-soft 不阻载；
    // 先于自持存储装配：存储降级早退不吞注册）
    registerBuiltinExpertsRoot(ctx, diagEmit)
    // 自持存储自启 + 首启轻量种子迁移（开库失败 fail-soft 降级零注册——dbFile 显式与
    // dshHomePath 服务双缺（裸环境）不自启，不向 ~/.dsh 静默落盘）。forge 根消费点现查
    // （AGENTS 1.6）：dshHomePath('forge') 服务 > 降级 ~/.dsh/forge + warn（含「dshHomePath
    // 缺席」字样，经诊断发射面——不直落 console，AGENTS §7）。
    const dshHomePathOf: DshHomePathProbe = (): string | undefined => {
      try {
        const svc: unknown = ctx.reflect?.get?.('dshHomePath')
        if (typeof svc !== 'function') return undefined
        const p = (svc as (segment: string) => unknown).call(svc, 'forge')
        return typeof p === 'string' ? p : undefined
      } catch {
        return undefined
      }
    }
    const forgeRootDegradedWarn = (): void => {
      diagEmit?.({
        event: 'knowledge-forge-root-fallback',
        level: 'warn',
        message: `dshHomePath 缺席——knowledge forge 根降级 ~/.dsh/forge（${resolveForgeRootOf(dshHomePathOf)}）`,
        process: 'main',
      })
    }
    if (dshHomePathOf() === undefined) forgeRootDegradedWarn()
    const storage = startSelfHostedStorage(
      { dbFile: config.dbFile, legacyStateDb: config.legacyStateDb, emit: diagEmit, dshHomePathOf },
    )
    if (storage === undefined) return () => {}

    // SC-1 全局库装配期自启注册（幂等——boot 时序先于服务消费：判例 5e5592dc）。全局目录
    // 只随 forge 根（{forgeRoot}/knowledge/global——不再从库文件路径上推，config.dbFile
    // 显式时也不变）。dshHomePath 服务缺席 = 零全局注册 + warn 留痕（不向 ~/.dsh 兜底
    // 数据域落盘——测试/替代宿主不写宿主缺省域）。失败 fail-soft + error 埋点，不阻载插件。
    try {
      const forgeRoot = dshHomePathOf() // 消费点现查（不缓存——AGENTS 1.6）
      if (forgeRoot !== undefined) {
        storage.registry.registerGlobalIfAbsent(globalKnowledgeDir(forgeRoot), diagEmit)
      } else {
        diagEmit?.({
          event: 'knowledge-register',
          level: 'warn',
          message: 'dshHomePath 缺席——全局知识库目录降级缺省 ~/.dsh/forge/knowledge/global，本装配零全局注册（不向兜底路径落盘）',
          process: 'main',
        })
      }
    } catch (cause) {
      diagEmit?.({
        event: 'knowledge-register',
        level: 'error',
        message: `全局库自启注册意外异常（fail-soft 不阻载）：${String(cause)}`,
        process: 'main',
        stack: cause instanceof Error ? cause.stack : undefined,
      })
    }

    // 两级解析器（config 静态绑定表 + 注册表行回退径——服务面第一级 + scoped 提示词接线共用）。
    // 回退径（bug：Q19 退役 host config.projects 注入后静态表恒空，工具面 cwd→projectId
    // 永远 miss → not bound）：注册表行（ws_path realpath canonical 键 → project_id）为
    // 动态事实源——host 注册链/boot 回填径（5e5592dc）落行后即解析可用。静态表优先（显式
    // config 注入仍是第一正径），miss 时回查注册表。
    const staticResolveProjectId = createProjectResolver(config.projects ?? [])
    const staticResolveWsPath = createWsPathResolver(config.projects ?? [])
    const resolveProjectId: ProjectIdResolver = (cwd) =>
      staticResolveProjectId(cwd)
      ?? storage.registry.findByWsPath(cwd)?.projectId
      // worktree 包含层（bug b979ec34）：循环派发把 worker cwd 钉定到
      // .forge/worktrees/<slug> 检出——整串相等恒 miss → 按保留段路由到主检出项目
      ?? storage.registry.findByWorktreePath(cwd)?.projectId
      ?? undefined
    const resolveWsPath: WsPathResolver = (projectId) =>
      staticResolveWsPath(projectId) ?? storage.registry.findByProjectId(projectId)?.wsPath ?? undefined
    // workspace 域 id 归一步（fix-10——bug bb11c53e）：官方宿主 projects 行 id = workspaceId
    // （workspaceRegistry 投影），不在绑定表/注册行 project_id 域——经 ctx.workspaceRegistry
    // 逐调用现查回查 workspace 行 path（AGENTS 1.6 检测永不缓存）；行缺席/面缺席/抛 = undefined
    // （服务面注册行缺席统一 fail-loud）。dsh-forge 集成宿主 forge projectId 先命中前两级，
    // 本步零参与零变化。
    const workspacePathOf = async (workspaceId: string): Promise<string | undefined> => {
      try {
        const registry: unknown = (ctx as unknown as { workspaceRegistry?: unknown }).workspaceRegistry
        if (!isWorkspaceRegistryFace(registry)) return undefined
        return (await registry.get(workspaceId))?.path
      } catch {
        return undefined
      }
    }
    // 项目知识目录解析缝（1.5 提案项 4）：注册/收编消费点的缺省派生改经 config 纯解析
    // （host/knowledge-dir.ts resolveKnowledgeDir）；非法回退缺省 + warn 埋点（不静默）。
    // 目录物化仍在消费点（读时 mkdir recursive——apply 期零预建）。
    const resolveDefaultKnowledgeDir = (projectDir: string): string => {
      const dir = resolveKnowledgeDir(config, projectDir)
      if (dir !== undefined) return dir
      diagEmit?.({
        event: 'knowledge-dir',
        level: 'warn',
        message: `config.knowledgeDir 非法（回退缺省 {projectDir}/.knowledge）：projectDir=${projectDir}`,
        process: 'main',
      })
      return defaultKnowledgeDirOf(projectDir)
    }

    // A2 服务切换：八法服务面 + stage② 写门三法（自持库供数 + 两级解析第一级 config 静态绑定表）
    const service = createKnowledgeService({
      db: storage.db,
      resolveWsPath,
      resolveWorkspacePath: workspacePathOf,
      emit: diagEmit,
      resolveDefaultKnowledgeDir,
      ...(config.backflow !== undefined ? { backflow: config.backflow } : {}),
    })
    /** 注册库在场判定 + 顶域实时聚合（动态段每步求值供数面——两段均全局注册） */
    const promptBindDeps: KnowledgePromptBindDeps = {
      resolveProjectId,
      resolveWsPath,
      isRegistered: (wsPath) => storage.registry.findByWsPath(wsPath) !== undefined,
      topDomains: (wsPath) => domainTreeIndexOf(storage.db, wsPath),
    }

    // 装载期项目行回填（提案裁决 6——bug d927e8dc）：官方宿主 registerProject 零调用方致
    // registry 零项目行——workspaceRegistry face 在座即枚举其注册行，按 wsPath 幂等回填
    // （行已在座跳过；回填落行跳过 .knowledge 目录物化——延迟至首次条目写入）。回填在本
    // 工厂同步段内启动（SC-1 全局库注册同段——判例 5e5592dc：注册行缺装载期回填致存量
    // 项目报不存在），枚举/落行异步 fire-and-forget：失败 fail-soft + knowledge-register
    // diag（event 走既有缝），不阻载；face 缺席/劣形同样 warn 留痕。projectId 落
    // projectKeyOf(path)（与 projects 投影行 id 同域——fix-11 身份统一）。requireProject
    // 四级解析 fail-loud 收口链不动。
    {
      const registryFace: unknown = (ctx as unknown as { workspaceRegistry?: unknown }).workspaceRegistry
      if (!isWorkspaceRegistryFace(registryFace)) {
        diagEmit?.({
          event: 'knowledge-register',
          level: 'warn',
          message: 'workspaceRegistry face 缺席/劣形——项目行装载期回填跳过（fail-soft 不阻载）',
          process: 'main',
        })
      } else {
        const backfillFace = registryFace
        void (async () => {
          for (const row of await backfillFace.list()) {
            try {
              if (storage.registry.findByWsPath(row.path) !== undefined) continue
              await service.registerProject({
                wsPath: row.path,
                projectId: projectKeyOf(canonicalWsPath(row.path)),
                skipMaterialize: true,
              })
            } catch (cause) {
              diagEmit?.({
                event: 'knowledge-register',
                level: 'error',
                message: `项目行装载期回填失败（fail-soft 不阻载）：${row.path}：${String(cause)}`,
                process: 'main',
                stack: cause instanceof Error ? cause.stack : undefined,
              })
            }
          }
        })().catch((cause) => {
          diagEmit?.({
            event: 'knowledge-register',
            level: 'error',
            message: `项目行装载期回填枚举失败（fail-soft 不阻载）：${String(cause)}`,
            process: 'main',
            stack: cause instanceof Error ? cause.stack : undefined,
          })
        })
      }
    }

    // fix-9 连接 RPC 数据源现查（逐调用现查不缓存——AGENTS 1.6）：① core forgeProjects
    // 具名服务（dsh-forge 集成态——core 行 provide，运营真源单源，与 preload 面同源）；
    // ② 官方 workspaceRegistry 投影（官方宿主——添加项目向导注册行；archived 概念缺席
    // 恒 false）。双缺 = undefined（projects 端点 typed 拒绝，knowledge 端点不受阻）。
    const projectsSourceOf = (): ForgeProjectsSource | undefined => {
      try {
        const raw: unknown = ctx.reflect?.get?.('forgeProjects')
        if (isForgeProjectsSource(raw)) return raw
      } catch {
        // 服务未 provide（官方宿主 core 行缺席）——回落 registry 投影
      }
      try {
        const registry: unknown = (ctx as unknown as { workspaceRegistry?: unknown }).workspaceRegistry
        if (isWorkspaceRegistryFace(registry)) return registryProjectsSource(registry)
      } catch {
        // 服务缺席/劣形（inject 未声明宿主）——projects 端点 typed 拒绝
      }
      return undefined
    }
    // fix-9 连接 RPC 注册（官方 exact Fetch-route 缝——/api/knowledge.*|/api/projects.*
    // 逐 endpoint 一条 POST 精确路由，落座 = connection 服务内建表 + 既有 /api 共享路由
    // 分发，零 webServer 依赖；session-log-export 先例）。
    // cordis inject 语义核销（vendor cordis fiber.ts:603-628 _checkImpl/_refresh）：inject
    // 硬声明的服务缺席时 impl 不入 _store、fiber epoch 置 INACTIVE——插件停在 PENDING 等
    // 待，apply 不执行；服务迟到 provide 后自动装载。故 apply 期 connection 恒在场，
    // 「服务缺席」分支结构性不可达（本插件 inject 硬声明见下方 options）——此处仅保留
    // 形状劣形守卫（fetch.register 非函数 = 零注册零抛 fail-soft 不阻载），diag 留痕
    // 不静默——AGENTS §7。
    const connectionFace = (ctx as unknown as { connection?: HostConnectionFace }).connection
    const connectionDisposers: (() => void)[] = []
    if (typeof connectionFace?.fetch?.register !== 'function') {
      diagEmit?.({
        event: 'knowledge-connection-rpc',
        level: 'warn',
        message: 'ctx.connection.fetch.register 形状劣形——/api 知识端点零注册（fail-soft 不阻载，UI 数据层回落宿主既有运输面）',
        process: 'main',
      })
    } else {
      try {
        const d = registerKnowledgeConnectionRpc(connectionFace, { service, projects: projectsSourceOf })
        connectionDisposers.push(d)
        diagEmit?.({
          event: 'knowledge-connection-rpc',
          level: 'info',
          message: '/api knowledge fetch routes registered（9 端点——connection.fetch.register 官方缝）',
          process: 'main',
        })
      } catch (cause) {
        diagEmit?.({
          event: 'knowledge-connection-rpc',
          level: 'warn',
          message: `/api 知识端点注册失败（fail-soft 零注册不阻载）：${String(cause)}`,
          process: 'main',
        })
      }
    }
    const tools = createKnowledgeTools({
      knowledge: service,
      resolveProjectId,
      emit: diagEmit,
    })

    /** 'knowledge' 服务 provide（host servicesFace.get 消费；缺席 reflect 面 = 零供数不阻载） */
    function provideKnowledgeService(): () => void {
      const reflect = ctx.reflect
      const provide = reflect?.provide
      if (typeof provide !== 'function') return () => {}
      try {
        const dispose = provide.call(reflect, KNOWLEDGE_SERVICE_NAME, service)
        return typeof dispose === 'function' ? () => dispose() : () => {}
      } catch {
        return () => {} // provide 抛（同名已注册等）= 零生效零抛（fail-soft）
      }
    }

    const disposers = [
      () => storage.close(),
      provideKnowledgeService(),
      declareKnowledgeRootDirKey(ctx),
      // 静态段全局注册（fix-11 裁决 B 侧 Interface 3——能力性指引固定文本零会话信息，
      // plugin load 时点注册先于一切会话装配，首轮请求即在场；bug be4bac44 判例）。
      ctx.systemPrompt.section({
        name: KNOWLEDGE_SECTION_NAME,
        order: KNOWLEDGE_SECTION_ORDER,
        text: renderKnowledgeStaticSection(),
      }),
      // 动态域段：全局注册，text(context) 每步按 context.agent 现取会话 cwd 求值（规则段
      // 紧前于域段，同 turn 相邻在场）。求值抛错只让本段缺席，诊断留痕不炸整轮装配。
      ctx.systemPrompt.section({
        name: KNOWLEDGE_DOMAINS_SECTION_NAME,
        order: KNOWLEDGE_DOMAINS_SECTION_ORDER,
        text: createKnowledgeDomainsText(promptBindDeps, (cause) => {
          diagEmit?.({
            event: 'knowledge-domains',
            level: 'warn',
            message: `域树段求值失败（本段缺席，不阻装配）：${String(cause)}`,
            process: 'main',
            stack: cause instanceof Error ? cause.stack : undefined,
          })
        }),
      }),
      ctx.tools.register(tools.search),
      ctx.tools.register(tools.browse),
      ctx.tools.register(tools.readAbstract),
      ctx.tools.register(tools.write),
      ctx.tools.register(tools.read),
      ctx.tools.register(tools.supersede),
      ctx.tools.register(tools.reinstate),
    ]
    return () => {
      for (const dispose of [...disposers, ...connectionDisposers]) dispose()
    }
  },
  { inject: ['tools', 'systemPrompt', 'connection', 'workspaceRegistry'] as const },
)

export default knowledgePlugin
export {
  KNOWLEDGE_DOMAINS_MAX_ROWS,
  KNOWLEDGE_DOMAINS_ROWS_PER_TOP,
  KNOWLEDGE_DOMAINS_SECTION_NAME,
  KNOWLEDGE_DOMAINS_SECTION_ORDER,
  KNOWLEDGE_SECTION_NAME,
  KNOWLEDGE_SECTION_ORDER,
  renderKnowledgeDomainsSection,
  renderKnowledgeStaticSection,
} from './prompt/index.js'
export { createKnowledgeDomainsText } from './service/session-prompt.js'
export type { KnowledgeAssembleContext, KnowledgePromptBindDeps } from './service/session-prompt.js'
export { createKnowledgeTools, createProjectResolver, createWsPathResolver } from './tools/index.js'
export type {
  KnowledgeTools,
  KnowledgeToolDeps,
  ProjectBinding,
  ProjectIdResolver,
  WsPathResolver,
} from './tools/index.js'
export type { KnowledgeDirKeyDeclaration } from './tools/faces.js'
export {
  defaultKnowledgeDirOf,
  KNOWLEDGE_DIR_DEFAULT_SEGMENT,
  resolveKnowledgeDir,
} from './knowledge-dir.js'
export type { KnowledgeDirSetting } from './knowledge-dir.js'
export {
  createKnowledgeService,
  EntryNotFoundError,
  IndexStaleError,
  InvalidKnowledgeDirError,
} from './service/index.js'
export type {
  BackflowConfig,
  BrowseKnowledgeService,
  EntryAbstract,
  IndexReport,
  KnowledgeConfirmOutcome,
  KnowledgeConfirmQuery,
  KnowledgeReadOutcome,
  KnowledgeReadQuery,
  KnowledgeRegistryWriter,
  KnowledgeService,
  KnowledgeServiceDeps,
  KnowledgeWriteOutcome,
  KnowledgeWriteQuery,
  MergeSuggestion,
  NecessityAnswers,
  ReadAbstractQuery,
  RegisterProjectWrite,
  SearchHit,
  SearchQuery,
} from './service/index.js'
