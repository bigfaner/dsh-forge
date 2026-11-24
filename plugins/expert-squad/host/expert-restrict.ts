// expert-restrict —— preset 行内白名单段插件（fix-1 agentPreset 通道的工具承载半）：
// 专家 preset 组合中的一行（name = '@dsh-forge/expert-squad/expert-restrict'，
// config.allow = 档案白名单求交产物）。apply 期对 preset scope 调官方
// ctx.tools.restrict({ allow }) —— restrict 语义 fail-closed（dsh-tools README:81：
// allow 外工具从该 scope 继承面消失且拒绝执行；限制随 disposer 抬起，行卸载即解除）。
// Agent scope 继承 preset scope 的注册面——子会话（以本 preset 委派）即被白名单约束。
//
// allow 落地前与 global 视图求交（bug 2026-11-24 全专家 preset 行 mount 失败定谳：
// 官方 restrict 对未知名 loud 校验——档案白名单含 preset scope 层工具名（read/grep/
// pwsh 等，本宿主模型工具装在 preset scope 层）时，allow 原样透传 = restrict 校验
// 硬抛错 → 行 mount 失败 → 整 preset broken → 列表面全专家「加载失败」+ 派发静默
// 降级。同包 tools-exclude 判例同径：交集子集 ⊆ 宿主实注册名 ⇒ 零 throw 面；
// 会话级自注册工具（模型工具族）豁免掩码，白名单约束面 = global 层工具）。
// tools 面缺席/形状失配/视图查询失败/交集空 = fail-soft 跳过（白名单不落地——诚实
// 降级面归 preset 侧 roster broken/委派侧 presetProbe，本行不炸 preset 装载）。

// 官方 ToolRestriction 结构子面（真源 @deepseek-ai/dsh-tools lib/types/index.d.ts:505
// ——allow/deny 双字段；本包不直依赖 dsh-tools，结构同型由 tsc 结构化兼容兜底）。
interface ToolRestriction {
  readonly allow?: readonly string[];
  readonly deny?: readonly string[];
}

/** 本行 config 形状（allow = 白名单；deny 透传官方语义，行构造不用）。 */
export interface ExpertRestrictConfig {
  readonly allow?: readonly string[];
  readonly deny?: readonly string[];
}

/** 官方 tools 服务窄面（ToolRuntime.restrict + schemas 全局视图等价查询）。 */
interface RestrictFace {
  restrict(filter: ToolRestriction): () => void;
  schemas(): readonly { readonly name: string }[];
}

/** 行运行上下文窄面（cordis ctx：tools 正门 + effect disposer 缝）。 */
interface RestrictCtx {
  readonly tools?: RestrictFace;
  effect(dispose: () => unknown): unknown;
}

/** 名单与 global 实注册名求交（未注册名剔除——restrict 对未知名 loud 校验）。 */
function intersectKnown(
  names: readonly string[],
  known: ReadonlySet<string>,
): string[] {
  return names.filter((name) => known.has(name));
}

/**
 * preset 行插件：apply 期 restrict 白名单；disposer 经 ctx.effect 挂行生命周期
 * （preset 行换代/撤行时限制随之解除）。
 */
export function expertToolRestrict(ctx: RestrictCtx, config: ExpertRestrictConfig): void {
  const allow = [...(config.allow ?? [])];
  const deny = [...(config.deny ?? [])];
  if (allow.length === 0 && deny.length === 0) return;
  const tools = ctx.tools;
  if (typeof tools?.restrict !== "function" || typeof tools.schemas !== "function") {
    return; // 形状失配 fail-soft——白名单不落地
  }
  let known: ReadonlySet<string>;
  try {
    known = new Set(tools.schemas().map((definition) => definition.name));
  } catch {
    return; // 全局视图查询失败 fail-soft——白名单不落地，不炸 preset 装载
  }
  // 求交（allow 与 deny 同径——交集子集 ⊆ 实注册名，restrict 校验零 throw 面）；
  // allow 交集空 = 平台不可表达（档案白名单全为非 global 层名）→ fail-soft 跳过
  // restrict（白名单不落地，诚实降级——不落空白 allow 的全掩码语义）。
  const effectiveAllow = allow.length > 0 ? intersectKnown(allow, known) : [];
  const effectiveDeny = deny.length > 0 ? intersectKnown(deny, known) : [];
  if (allow.length > 0 && effectiveAllow.length === 0) return;
  if (effectiveAllow.length === 0 && effectiveDeny.length === 0) return;
  const filter: ToolRestriction = {
    ...(effectiveAllow.length > 0 ? { allow: effectiveAllow } : {}),
    ...(effectiveDeny.length > 0 ? { deny: effectiveDeny } : {}),
  };
  const disposer = tools.restrict(filter);
  if (typeof ctx.effect === "function") {
    ctx.effect(() => disposer);
  }
}

// inject 声明边（cordis 守卫：官方 dsh-tools 声明 tools 非可选、宿主恒供——
// 同 subagents/skills 具名正门先例；preset scope 普通查找回落 Host realm）。
(expertToolRestrict as { inject?: string[] }).inject = ["tools"];

export default expertToolRestrict;
