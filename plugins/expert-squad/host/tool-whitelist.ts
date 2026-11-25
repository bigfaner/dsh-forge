// tool-whitelist —— 专家子会话工具白名单的 agent/created 落定面（纯函数——监听器逻辑
// 单源，单测直测；host/index.ts 只做 wiring）。
//
// 机制（2026-11-25 真机定谳）：子 agent scope 的父链指向专家 preset scope，preset 层
// 工具对其为 inherited → 可掩（dsh-tools view()）；restrict 落子 agent scope 即收窄模型
// 可见面（真机：挂行不落 = 80 个，落后 = 3 个）。preset scope 内落则掩不到同层工具行。
//
// 硬约束（2026-11-25 宿主崩溃判例）：agent/created 由官方 announce() 串行 await——监听器
// 抛错 = agent 创建事务回滚 = 宿主 fatal；返回 rejected Promise 走 unhandled rejection
// 同样 fatal。故本面：① 同步（永不返回 Promise）；② 整体 try/catch 零外抛，异常仅经
// diag 留痕；③ 服务经 agent.ctx.tools（Agent 对象本体不挂服务）；④ 逐层可选链。

/** 官方 tools 服务消费切片（restrict 结构子面）。 */
interface ChildToolsFace {
  restrict(filter: object): () => void;
}

/** 子 agent ctx 消费切片（tools 具名服务 + effect disposer 缝）。 */
interface ChildCtxFace {
  tools?: ChildToolsFace;
  effect?(factory: () => () => void, label?: string): unknown;
}

/** agent/created 载荷中的 agent 切片（只读本面消费的字段）。 */
interface CreatedAgentFace {
  session?: { header?: { agentPreset?: string } };
  ctx?: ChildCtxFace;
}

/** 白名单台账读面（ExpertPresetSync.allowOf 结构子面——undefined = 非专家/未注册）。 */
export type AllowLookup = (key: string | undefined) => readonly string[] | undefined;

/** 诊断发射面（warn 留痕——AGENTS §7 不静默）。 */
export type WhitelistDiag = (event: string, message: string) => void;

export type WhitelistOutcome =
  | "not-expert" // 非专家子会话（或未注册/空名单）——零动作
  | "applied" // 白名单已落子 agent scope
  | "no-tools-service" // ctx.tools.restrict 缺席——fail-open（全集）+ warn
  | "failed"; // restrict 抛错——fail-open（全集）+ warn

/** diag 调用兜底（diag 自身抛错不得外溢——最后一道防线：外层 catch 内再调 diag 抛错 会穿出监听器）。 */
function diagSafe(diag: WhitelistDiag, event: string, message: string): void {
  try {
    diag(event, message);
  } catch {
    // 诊断面异常静默——零外抛优先于留痕
  }
}

/**
 * 对一个新建 agent 落专家工具白名单（同步、零外抛）。
 * @param payload - agent/created 事件载荷（unknown——官方签名）
 * @param allowOf - 白名单台账读面
 * @param diag - 诊断发射面
 * @returns 处置结果（测试断言面；生产调用方忽略）
 */
export function applyExpertToolWhitelist(payload: unknown, allowOf: AllowLookup, diag: WhitelistDiag): WhitelistOutcome {
  try {
    const agent = (payload as { agent?: CreatedAgentFace } | undefined)?.agent;
    const allow = allowOf(agent?.session?.header?.agentPreset);
    if (allow === undefined || allow.length === 0) return "not-expert";
    const childCtx = agent?.ctx;
    const tools = childCtx?.tools;
    if (childCtx === undefined || typeof tools?.restrict !== "function") {
      diagSafe(diag, "expert-squad-whitelist-no-tools", "专家子会话 ctx.tools.restrict 缺席——白名单未落（该会话工具面为全集）");
      return "no-tools-service";
    }
    const lift = tools.restrict({ allow: [...allow] });
    if (typeof childCtx.effect === "function") childCtx.effect(() => lift, "expert-squad: tool whitelist");
    return "applied";
  } catch (error) {
    diagSafe(diag, "expert-squad-whitelist-fail", `专家子会话白名单落定失败（该会话工具面为全集）: ${String((error as Error)?.message ?? error)}`);
    return "failed";
  }
}
