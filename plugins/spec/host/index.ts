// spec 插件装配面（plugin-spec 1.8 提示段 + 1.4 域服务/工具族 cordis 注册）。
// A1 自含形态：提示段注册恒在（段注册无条件、text 运行期按装配求值——同构
// forge:doc-style 三先例）；presetBinding 注入判据由段 text 回调现求值承担
// （核销报告 research/official-verification.md §3）。包本体零预设知识——
// presetBinding 仅作不透明字符串透传。
// 1.4 起 host/index.ts 兼作 cordis 装配入口（loader 只认 default 导出函数，
// 组合层 cordis.patch.yml 单行 insert 挂载）：
//   ① 单装缺省装配：assembleSpecServices（db 缺省路径 / forgeSpecs 服务常驻 / 文档写缝
//      真实现三件单源，assembly/default-assembly.ts）；
//   ② 具名服务 provide：forgeSpecs（cordis reflect.provide 官方面——域逻辑唯一事实源）；
//   ③ 单装工具族注册：六动词经官方 ctx.tools.register 正门逐枚注册（unmount 全撤回；
//      注册三态可观测——完成/缺席降级/注销三径诊断留痕）；
//   ④ AC 投影现查缝：task-loop forgeTasks 每次调用期防御读取（AGENTS 1.6 不缓存）。
import { consoleDiagFallback, type DiagLevel } from "@dsh-forge/lib-diag";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FORGE_SPECS_SERVICE_KEY } from "../shared/contract-constants.js";
import {
  assembleSpecServices,
  type SpecAssembly,
  type SpecAssemblyConfig,
} from "./assembly/default-assembly.js";
import {
  acSettlementsFaceOf,
  assembleSpecToolFamily,
} from "./assembly/tool-family.js";
import {
  forgeProjectsIdentityOf,
  registerSpecTypertRemotes,
  type TypertAssemblyCtxFace,
} from "./assembly/typert-remotes.js"
import { CORDIS_ROOT } from "@dsh-forge/lib-util";
import type { TransitionActor } from "./db/row-types.js";
import { createForgeToolServices } from "./domain/specs/tool-service.js";
import type { SpecContextFace } from "./faces.js";
import {
  FORGE_DOC_STYLE_SECTION_NAME,
  FORGE_DOC_STYLE_SECTION_ORDER,
  FORGE_PIPELINE_SECTION_NAME,
  FORGE_PIPELINE_SECTION_ORDER,
  renderDocStyleSection,
  specPipelineSectionText,
} from "./prompt/index.js";

// docs 读域（plugin-spec 1.10 收编——forgeDocs 双锚兼容读域出口；装配层 consume）
export { createDocsService, type DocsServiceDeps } from "./docs/index.js"
export { DocPathInvalidError, type DocPathInvalidData } from "./docs/errors.js"

import { assertInstallMutex } from "./install-mutex.js"

/** spec 插件装配入参（spec 行 config；presetBinding 缺省 = 无条件注入） */
export interface SpecPluginConfig {
  /** forge 组合器（M5）经 config 约定缝下发的预设绑定值；缺省 = 无条件注入 */
  readonly presetBinding?: string
  /** INV-3 组合装载标记（forge patch 成员行下发 comboMark: true——solo patch 行越装缺此键） */
  readonly comboMark?: boolean
}

/** host 装配 config（全部可选——缺省面 = DSH_HOME + 缺省 db 落点；同 task-loop 形态）。 */
export interface SpecHostConfig extends SpecAssemblyConfig, SpecPluginConfig {
  /** 诊断缝（缺省 console 按级分流兜底——lib-diag consoleDiagFallback 单面）。 */
  readonly diag?: (line: string, level?: DiagLevel) => void
}

/** cordis 插件装载形态（loader 只认 default 导出函数）。 */
interface SpecCordisPlugin {
  (ctx: unknown, config?: SpecHostConfig): () => void
  inject: readonly string[]
}

/** 插件 ctx 结构化消费面（真 Context 结构兼容——provide 具名服务 + 可选 emit/防御 get） */
interface SpecPluginCtx {
  /** 服务注册官方面（cordis reflect.provide——Service 基类同径） */
  readonly reflect?: {
    provide?(name: string, value?: unknown): unknown
    get?(name: string): unknown
  }
  /** cordis 事件混入（diag/log 事件域诊断埋点；缺席 = console 兜底） */
  readonly emit?: (event: string, payload: Record<string, unknown>) => void
  /** 官方 dsh tools 注册缝（单装工具族注册正门——inject 名单显式声明，缺席 = 零注册降级） */
  readonly tools?: {
    register?(definition: unknown): () => void
  }
  /** 宿主事件总线订阅面（internal/service 迟到补偿挂点；缺席 = 补偿通道降级跳过） */
  readonly on?: ((event: string, listener: (...args: unknown[]) => unknown) => () => unknown) | undefined
  /** 宿主 effect 面（补偿监听 disposer 消费——cordis effect 契约，卸载级联摘除） */
  readonly effect?: ((dispose: () => unknown) => unknown) | undefined
}

/**
 * 注册 spec 提示词面（forge:pipeline + forge:doc-style 两段；返回注销器——
 * 插件卸载级摘除）。
 */
export function registerSpecPromptSections(
  ctx: Pick<SpecContextFace, 'systemPrompt'>,
  config: SpecPluginConfig = {},
): () => void {
  const disposePipeline = ctx.systemPrompt.section({
    name: FORGE_PIPELINE_SECTION_NAME,
    order: FORGE_PIPELINE_SECTION_ORDER,
    text: (context) => specPipelineSectionText(context, { presetBinding: config.presetBinding }),
  })
  const disposeDocStyle = ctx.systemPrompt.section({
    name: FORGE_DOC_STYLE_SECTION_NAME,
    order: FORGE_DOC_STYLE_SECTION_ORDER,
    text: renderDocStyleSection(),
  })
  return () => {
    disposePipeline()
    disposeDocStyle()
  }
}

/** forgeSpecs 域服务 provide（常驻 provider——装配期一次；缺席径由装配面承担）。 */
function provideSpecsService(ctx: unknown, services: SpecAssembly, diag: (line: string, level?: DiagLevel) => void): void {
  const reflect = (ctx as SpecPluginCtx).reflect
  if (typeof reflect?.provide !== "function") {
    diag("[spec] ctx.reflect.provide 缺席（非 cordis 宿主）——forgeSpecs 零 provide（降级不阻载）", "warn")
    return
  }
  try {
    // 方法调用形态（receiver = reflect 官方面——cordis 4 Proxy 方法解绑 this 即崩判例同避）
    reflect.provide(FORGE_SPECS_SERVICE_KEY, services.specs)
    diag("[spec] 域服务 provide 完成：forgeSpecs（常驻 provider——域逻辑唯一事实源）", "info")
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    diag(`[spec] 域服务 provide 失败——降级不阻载：${message}`, "error")
  }
}

/** 官方 tools 缝防御读取（cordis inject 门：属性访问未被 inject 声明即抛——try/catch fail-soft） */
function toolsFaceOf(ctx: unknown): SpecPluginCtx["tools"] | undefined {
  try {
    const face = (ctx as SpecPluginCtx).tools
    return face !== null && typeof face === "object" ? face : undefined
  } catch {
    return undefined
  }
}

/**
 * Typert 遥控器装配缝（plugin-spec 1.5——forgeSpecs host 半根 ctx plugin 注册，三态
 * 可观测 registered/degraded/pending；fail-soft 不阻载，诊断留痕分级分流）。
 */
function registerSpecTypertFromCordis(
  ctx: unknown,
  services: SpecAssembly,
  diag: (line: string, level?: DiagLevel) => void,
): void {
  // 工具面动词实例单点组装（actor 注入缝——tool/UI 两径，闭包零域逻辑重复）
  const makeTypertVerbs = (actor: TransitionActor | undefined) =>
    createForgeToolServices({
      db: services.db.db,
      repos: services.db.repos,
      specs: services.specs,
      ...(actor !== undefined ? { actor } : {}),
      acSettlementsOf: acSettlementsFaceOf(ctx),
      onDiag: (payload) => diag(`[${payload.event}] ${payload.message}`, payload.level),
    });
  try {
    // 根 ctx 取法走符号键（bug 2801eeeb 同族复发——source.root 属性访问触发 cordis 1.1.0
    // inject 门控；face 携符号键指向树根，typert-remotes 侧 rootCtxOf 同键消费）
    const source = ctx as { plugin?: unknown; inject?: unknown }
    const rootValue = (ctx as Record<PropertyKey, unknown>)[CORDIS_ROOT]
    const face: TypertAssemblyCtxFace = {
      ...(rootValue !== undefined ? { [CORDIS_ROOT]: rootValue } : {}),
      ...(typeof source.plugin === "function"
        ? { plugin: source.plugin as TypertAssemblyCtxFace["plugin"] }
        : {}),
      ...(typeof source.inject === "function"
        ? { inject: source.inject as TypertAssemblyCtxFace["inject"] }
        : {}),
    }
    const result = registerSpecTypertRemotes(face, {
      specs: () => services.specs,
      // M4a 五端点族缝（1.9）：工具面动词双实例——tool 径（actor 缺省 plugin-tool）+
      // UI 径（actor='ui'，human-only 写边审计锚）；goalBoard 台账/复核现读走 repo 缝。
      tools: () => makeTypertVerbs(undefined),
      uiTools: () => makeTypertVerbs("ui"),
      repos: () => services.db.repos,
      acSettlementsOf: acSettlementsFaceOf(ctx),
      identity: forgeProjectsIdentityOf(ctx, (line) => diag(line, "warn")),
      diag: (line) => diag(line, /失败|缺席|降级|抛错/.test(line) ? "warn" : "info"),
    })
    diag(
      `[spec-typert] 装配完成：registered=[${result.registered.join(", ")}] degraded=[${result.degraded.join(", ")}] pending=[${result.pending.join(", ")}]`,
      "info",
    )
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    diag(`[spec-typert] Typert 遥控器装配异常（fail-soft 不阻载）：${message}`, "error")
  }
}

/**
 * 单装工具族注册缝：官方 ctx.tools.register 正门逐枚注册六动词（unmount 全撤回）；
 * 单枚注册抛错不静默截断（loud 缝——失败 error 留痕其余照常）。缝缺席/劣形 = 工具面
 * 零注册 + warn 留痕（降级诚实不阻载）。
 */
export function registerSpecToolFamily(
  ctx: unknown,
  services: SpecAssembly,
  diag: (line: string, level?: DiagLevel) => void,
): { dispose: () => void } {
  const toolsFace = toolsFaceOf(ctx)
  const register = typeof toolsFace?.register === "function" ? toolsFace.register.bind(toolsFace) : undefined
  if (register === undefined) {
    diag("[spec] ctx.tools.register 缺席（官方 tools 缝缺失）——spec 工具面零注册（22 动词对本宿主不可达，降级不阻载）", "warn")
    return { dispose: () => {} }
  }
  const family = assembleSpecToolFamily({ services, ctx, diag })
  const disposers: (() => void)[] = []
  for (const definition of family.tools) {
    try {
      disposers.push(register(definition))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      diag(`[spec] tool register failed (${definition.name}): ${message}`, "error")
    }
  }
  diag(`[spec] 单装工具族注册完成：${String(family.tools.length)} 员经官方 ctx.tools.register（unmount 全撤回）`, "info")
  return {
    dispose: () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          // 宿主注销面异常隔离——卸载收口不外抛
        }
      }
      diag("[spec] 工具族注销收口：22 动词注册全量撤回", "info")
    },
  }
}

// 类型出口（装配面锚——宿主/测试消费：六动词定义组与注册名单单源）
export { createSpecTools, FORGE_SPEC_TOOL_NAMES } from "./tools/index.js"
export type { SpecTools, SpecToolDeps } from "./tools/index.js"
export type { SpecToolDefinition } from "./tools/faces.js"
export { assembleSpecServices, createSpecDocWriter, resolveSpecHome } from "./assembly/default-assembly.js"
export { assembleSpecToolFamily, acSettlementsFaceOf } from "./assembly/tool-family.js"
export type { SpecAssembly, SpecAssemblyConfig } from "./assembly/default-assembly.js"

/** 随包 experts/ 目录解析（源 host/index.ts 深包根 1 级、dist bundle dist/host/index.js 深
 * 2 级——双候选取在场目录；均缺席 = undefined 由注册面 warn 留痕）。 */
function bundledExpertsRoot(moduleUrl: string = import.meta.url): string | undefined {
  for (const rel of ["../../experts/", "../experts/"] as const) {
    const dir = fileURLToPath(new URL(rel, moduleUrl));
    if (existsSync(dir)) return dir;
  }
  return undefined;
}

/** 本包包名（experts.registerRoot 的 pluginName 实参——专家实例 ID 前缀 `@dsh-forge/spec#键`）。 */
export const SPEC_PACKAGE_NAME = "@dsh-forge/spec" as const;

/**
 * 随包内置专家档案注册（experts.registerRoot 装配行——AGENTS 1.6 配方）：惰性
 * reflect.get('experts') + try/catch 现查、检测结果零缓存；expert-squad 缺席 =
 * fail-soft + warn 留痕（不阻载本插件）。registerRoot 侧已主动触发全部已建 registry
 * 换代（plugins/expert-squad host/index.ts registerRoot 注记）——本面零 refresh 调用。
 * 迟到补偿（builtin-redistribution 裁决①，修复 t-1.2 真机证伪的静默零注册）：
 * apply 期 experts 缺席时挂接官方 cordis 内建 `internal/service` 事件（官方同语义机械
 * 核销——cordis src/events.ts Events 声明「service events observe dependency
 * registration」；src/reflect.ts `notify()` 在 provide/ACTIVE 换代时 emit；零新机械），
 * experts 服务上场即幂等补注册一次。补偿态（已注册/已终止布尔）是装配事实可缓存；
 * experts 服务引用永不 memoize——每次补触发现查 reflect.get（AGENTS 1.6）。
 * 另有裁决②装配序修正治当前形态，本补偿治一切未来序漂移（含 expert-squad async
 * apply 晚 provide——knowledge 同案）。dev 形态 expert-squad 经 dsh.profile.bundles
 * bundle 层装载；打包形态经用户层 insert 行——序漂移均由本补偿兜底。
 */
export function registerBuiltinExpertsRoot(
  ctx: unknown,
  diag: (line: string, level?: DiagLevel) => void,
): void {
  const on = (ctx as SpecPluginCtx).on;
  const effect = (ctx as SpecPluginCtx).effect;
  // 补偿态 = 装配事实（已注册/已终止即不再补触发）；experts 服务引用每次现查。
  let settled = false;
  const attempt = (phase: "在场" | "迟到补偿"): boolean => {
    let experts: unknown;
    try {
      experts = (ctx as SpecPluginCtx).reflect?.get?.("experts");
    } catch {
      experts = undefined; // 反射异常视同缺席（fail-soft）
    }
    const register = (experts as { registerRoot?: unknown } | undefined)?.registerRoot;
    if (typeof register !== "function") return false;
    const dir = bundledExpertsRoot();
    if (dir === undefined) {
      diag("[spec] 随包 experts/ 目录解析缺席——内置专家档案零注册（fail-soft 不阻载）", "warn");
      return true; // 目录缺席与序无关，终止补偿
    }
    try {
      register.call(experts, ctx, dir, SPEC_PACKAGE_NAME);
      diag(`[spec] 随包内置专家档案注册完成（${phase}）：${dir}（experts.registerRoot——换代由 expert-squad 侧承担）`, "info");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      diag(`[spec] experts.registerRoot 调用失败——随包专家档案零注册（fail-soft 不阻载）：${message}`, "warn");
    }
    return true; // 已注册或已确认失败——均终止补偿
  };
  if (attempt("在场")) {
    settled = true;
    return;
  }
  diag("[spec] experts 服务缺席（expert-squad 未装/未供或晚于本件上场）——随包专家档案暂零注册（fail-soft 不阻载；internal/service 迟到补偿已挂接）", "warn");
  if (typeof on !== "function") return; // 事件总线缺席 = 补偿通道不可用（warn 已留痕）
  let off: (() => unknown) | undefined;
  off = on.call(ctx, "internal/service", (name: unknown) => {
    if (settled || name !== "experts") return;
    if (attempt("迟到补偿")) {
      settled = true;
      if (typeof off === "function") off(); // 补偿完成摘除监听（一次性装配事实）
    }
  });
  if (typeof effect === "function") effect.call(ctx, () => () => off?.());
}

const specCordisPlugin: SpecCordisPlugin = (ctx: unknown, config: SpecHostConfig = {}): (() => void) => {
  // INV-3 安装互斥 loud-fail 守卫（bug ef3e92ea）——任何装配副作用之前首查。
  assertInstallMutex(ctx, config, "@dsh-forge/spec")
  const diag = config.diag ?? consoleDiagFallback
  // 随包内置专家档案注册（experts.registerRoot 装配行——experts 缺席 fail-soft 不阻载）
  registerBuiltinExpertsRoot(ctx, diag)
  // 提示段注册恒在（A1 自含——1.8 面零变化；段注册无条件、text 运行期按装配求值）
  const disposePromptSections = registerSpecPromptSectionsFromCordis(ctx, config)
  // 单装缺省装配（home 缺席/db 打开失败 = 整体降级零 provide）
  const services = assembleSpecServices(config, diag)
  let disposeToolFamily: (() => void) | undefined
  if (services !== undefined) {
    provideSpecsService(ctx, services, diag)
    disposeToolFamily = registerSpecToolFamily(ctx, services, diag).dispose
    registerSpecTypertFromCordis(ctx, services, diag)
  }
  return () => {
    // 工具族注销（官方 tools 缝 disposer 全量回收）+ 提示段摘除 + 库句柄关闭
    disposeToolFamily?.()
    disposePromptSections()
    services?.dispose()
    diag("[spec] 插件卸载收口完成（工具族/提示段/db 句柄）", "info")
  }
}

/** 提示段注册的 cordis ctx 适配（systemPrompt 缝防御读取——缺席 = 零注册降级留痕） */
function registerSpecPromptSectionsFromCordis(ctx: unknown, config: SpecPluginConfig): () => void {
  try {
    const systemPrompt = (ctx as { systemPrompt?: SpecContextFace["systemPrompt"] }).systemPrompt
    if (systemPrompt !== undefined && typeof systemPrompt.section === "function") {
      return registerSpecPromptSections({ systemPrompt }, config)
    }
  } catch {
    // inject 门拒（未声明环境）= 降级零注册
  }
  consoleDiagFallback("[spec] ctx.systemPrompt 缝缺席——提示段零注册（降级不阻载）", "warn")
  return () => {}
}

// inject 名单：tools = 单装工具族注册缝 + systemPrompt = 提示段注册缝（bug fefd5149 缝①，
// 同缝先例 plugins/knowledge/host/index.ts:341——名单缺席 = ctx 属性访问被 cordis inject
// 门拒恒 undefined，两段提示段零注册）+ workspaceRegistry = identity 回落源具名服务取法门
// （bug b990aa94——纯官方 workspaceId 语境承担）+ forge.projects = identity 正源缝显式入
// 名单（bug ac27ab1a——签发 projectId 的生态正源，点分键 reflect.get 合法径；task-loop
// host/index.ts:309 先例同径，缺席 fail-soft 降级 + 诊断留痕）。
// reflect/emit 经防御读取消费（try/catch fail-soft），不入名单（task-loop 同型——具名服务
// provide 与事件混入为宿主根面）。
specCordisPlugin.inject = ["tools", "systemPrompt", "workspaceRegistry", "forge.projects"] as const

export default specCordisPlugin
