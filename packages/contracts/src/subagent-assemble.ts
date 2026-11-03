// 子会话组装内核纯函数（架构裁决 verification-report §5.1 ⑤ 最小增量——expert-squad
// 与 plugin-forge 同根因重复实现的「persona 合成 / agentOptions 折叠」族单源）：
// - composePersonaText：人设全文拼接（身份头 + 人设 Markdown trimEnd）——forge 的 S2
//   persona 合成与 expert 档案人设合成共用拼接语义（条目面经窄结构注入，零插件域类型）；
// - workerAgentOptionsOf：agentOptions 三级 first-def 折叠公式（条目 > 档案 > 默认基座
//   > 父会话继承）；
// - reconcileWorkerReasoning：档位兼容收口（异步纯折叠——目录解析器注入缝，零运行期依赖）。
// 定位与 tool-projection.ts 同判据：中立域纯逻辑，官方机械仅经 type-only import 触达，
// 运行期零 cordis 依赖（contracts 零逻辑零依赖铁律——无运行期官方包依赖）。
import type { ReasoningEffortLevel } from './dto/forge.js'

/**
 * 人设合成条目窄面（结构子面——expert-squad ExpertRecord 等满足即兼容，contracts
 * 不反向依赖插件域类型）。
 */
export interface PersonaComposeSource {
  /** 英文键正本 */
  readonly name: string
  /** 岗位/简介头 */
  readonly title: string
  /** 选人依据简介 */
  readonly description: string
  /** 人设 Markdown 原文（尾部空白 trimEnd 后拼接） */
  readonly personaMd: string
}

/** 人设全文合成：身份头（键/岗位/简介）+ 人设 Markdown 原文。 */
export function composePersonaText(entry: PersonaComposeSource): string {
  return [
    `# ${entry.title}（${entry.name}）`,
    "",
    entry.description,
    "",
    entry.personaMd.trimEnd(),
    "",
  ].join("\n");
}

/**
 * 路由级形状（expert-squad-default-routing——四级链各级同形）：provider/model 整组同给
 * 同缺（官方 AgentOptions 成对语义）；reasoning 缺省 = 该级不下发档位。
 */
export interface WorkerRouteLevel {
  readonly provider?: string
  readonly model?: string
  readonly reasoning?: ReasoningEffortLevel
}

/**
 * worker agentOptions 组装（expert-squad-default-routing——配置主权归 expert-squad，
 * forgeSettings.worker 机械读取径退役）：
 *
 * 优先级链（proposal「优先级链」/verification.md §0.3 first-def fold）：
 *   ① experts 条目 agentOptions（experts 服务 get 应答——条目叠加 + 档案 + defaults 已由
 *     expert-squad 侧折叠；本面按整组语义消费）
 *   > ② 档案 provider+model 成对（a599db30 语义：成对即自带完整路由对）
 *   > ③ defaultAgentOptions（全局默认基座；② 单边位与③基座逐位合成——V1-EX1 收口）
 *   > ④ 父会话继承（返回 undefined——spawn 请求零 agentOptions 键）。
 *
 * reasoning 三级合成（同构 first-def）：① entry.reasoning > ② profile.reasoning
 * （档案 frontmatter 出厂值）> ③ defaults.reasoning > 不下发 effort；档位兼容收口
 * 由 reconcileWorkerReasoning 在组装后统一承担（本面零目录知识）。
 *
 * 生产径取数：①②③ 的现值经既有 experts 服务取用面（resolver → experts.get）每次派发
 * 现查（AGENTS 1.6 检测永不缓存——消费点惰性求值，volatile 配置变更即派发即生效）；
 * expert-squad 缺席 = 三级全空 → undefined 回落父继承（语义完整，可移植性）。
 */
export function workerAgentOptionsOf(levels: {
  /** ① experts 条目 agentOptions（含 expert-squad 侧折叠应答时即最终路由级） */
  readonly entry?: WorkerRouteLevel
  /** ② 档案级（provider+model 成对整组；reasoning = frontmatter 出厂值） */
  readonly profile?: WorkerRouteLevel
  /** ③ defaultAgentOptions 全局默认基座 */
  readonly defaults?: WorkerRouteLevel
}): { provider: string; model: string; reasoningEffort?: ReasoningEffortLevel } | undefined {
  // 基座 = ② 成对整组（自带完整路由对，a599db30），不成对回落 ③；② 单边位与 ③ 逐位
  // 合成（仅 model 并入③基座——V1-EX1；仅 provider 不落位回落基座——既有语义）。
  const profilePaired = levels.profile?.provider !== undefined && levels.profile?.model !== undefined
  const base = {
    provider: profilePaired ? levels.profile?.provider : (levels.defaults?.provider ?? levels.profile?.provider),
    model: profilePaired ? levels.profile?.model : (levels.defaults?.model ?? levels.profile?.model),
  }
  const provider = levels.entry?.provider ?? base.provider
  const model = levels.entry?.model ?? base.model
  // 成对判据：provider+model 皆在场才有路由——任一缺席 = ④ 父会话继承（undefined）。
  if (provider === undefined || model === undefined) return undefined
  const route = { provider, model }
  const reasoning = levels.entry?.reasoning ?? levels.profile?.reasoning ?? levels.defaults?.reasoning
  if (reasoning === undefined) return route
  return { ...route, reasoningEffort: reasoning }
}

/**
 * 档位兼容收口（不同 provider/model 支持集不同——「无法兼容就不设置」）：
 * 目录已知（efforts 非 undefined）且配置档位不在支持集 → 剥离 reasoningEffort（回落
 * provider/模型默认档），杜绝 UNSUPPORTED_REASONING_EFFORT 级 worker 启动即崩；
 * 目录不可知（解析器缺席/模型不可解析）= 不判，原样携带。
 */
export async function reconcileWorkerReasoning(
  options: { provider: string; model: string; reasoningEffort?: ReasoningEffortLevel } | undefined,
  resolveModelReasoning: ((provider: string, model: string) => Promise<readonly string[] | undefined>) | undefined,
): Promise<{ provider: string; model: string; reasoningEffort?: ReasoningEffortLevel } | undefined> {
  if (options === undefined || options.reasoningEffort === undefined) return options
  if (resolveModelReasoning === undefined) return options
  let efforts: readonly string[] | undefined
  try {
    efforts = await resolveModelReasoning(options.provider, options.model)
  } catch {
    return options // 解析失败 = 目录不可知——不判
  }
  if (efforts === undefined) return options
  if (efforts.includes(options.reasoningEffort)) return options
  return { provider: options.provider, model: options.model } // 不支持 → 不设置
}
