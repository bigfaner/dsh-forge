// tools-exclude —— preset 行内全局工具排除件（forge-aggregate-bundle 1.37）：
// preset 子树一行（config.deny = office 族候选名单）。apply 期对 preset scope 调官方
// ctx.tools.restrict({ deny: 交集 })——deny 名单先与全局已注册名求交（fail-soft）：
// restrict 对未知名 loud 校验（expert-restrict 判例：tools.restrict() names unknown
// global tools），交集子集 ⊆ 宿主实注册名 ⇒ 零 throw 面；掩码随 preset scope 继承——
// 绑定该 preset 的会话全继承，restrictions intersect，子树自注册工具豁免掩码。
// tools 面缺席/形状失配/交集空 = fail-soft 跳过（不炸 preset 装载——registry audit
// 零 warn 面）。office 技能侧不在本件范围（SkillRegistry 无 restrict 原语——宿主债务
// 1.35 口径维持）：本件是 deny 声明非 office 能力行，forge/expert-squad 正本零 office 能力。
//
// 通道核销（cordis-plugin-loader src/resolve.ts + src/config/tree.ts import + 官方仓
// packages/preset/agent-preset-registry/src/mount.ts）：preset 子树行 name = 字面量
//（!!js 仅 config/disabled 求值，name 不插值），行导入基点 = profile 根（Node 解析）
// ⇒ 每通道只认「该通道已安装包」的裸名：web 档 profile node_modules 全成员可解析、
// desktop bundle 档仅 @dsh-forge/forge 可解析（五成员 esbuild 内联）、solo 档仅安装件
// 本身可解析 ⇒ forge 与 expert-squad 各持同源副本、各自 patch 引用本包副本（双通道
// 兼容；bundle 交付搬移块由 package-release.mjs 重写行名指 forge 副本——机检 pin）。

/** 官方 ToolRestriction 结构子面（真源 @deepseek-ai/dsh-tools——deny 单字段即足）。 */
interface ToolRestriction {
  readonly deny?: readonly string[];
}

/** 官方 tools 服务窄面（restrict 正门 + schemas 全局视图等价查询）。 */
interface ExcludeFace {
  restrict(filter: ToolRestriction): () => void;
  schemas(): readonly { readonly name: string }[];
}

/** 行运行上下文窄面（cordis ctx：tools 正门 + effect disposer 缝）。 */
interface ExcludeCtx {
  readonly tools?: ExcludeFace;
  effect(dispose: () => unknown): unknown;
}

/** 行 config 形状（deny = office 族候选名单——宿主未注册名 fail-soft 剔除）。 */
export interface ToolsExcludeConfig {
  readonly deny?: readonly string[];
}

/**
 * office 族全局工具候选名单（正本——desktop 已知实注册名实锚 + 官方 desktop-office
 * 注册面待实机枚举补全；未注册名经求交 fail-soft 剔除，零 throw 面）。
 * 契约：plugins/forge/host/tools-exclude.ts 同源副本逐字节一致（两包契约测试双 pin）。
 */
export const OFFICE_TOOL_DENY_CANDIDATES: readonly string[] = [
  "office_template",
  "office_template_write",
  "ppt_get_template_pages",
  "ppt_get_template_reference",
  "ppt_list_templates",
  "ppt_template_create_project",
  "pptd_add_asset",
  "pptd_check",
  "pptd_import",
  "pptd_list_files",
  "pptd_read_file",
  "pptd_render",
  "pptd_write_file",
];

/**
 * preset 行插件：apply 期对 preset scope 落 deny 掩码；disposer 经 ctx.effect 挂行
 * 生命周期（preset 撤行/换代即解除）。
 */
export function toolsExclude(ctx: ExcludeCtx, config: ToolsExcludeConfig): void {
  const candidates = [...(config.deny ?? [])];
  if (candidates.length === 0) return;
  const tools = ctx.tools;
  if (typeof tools?.restrict !== "function" || typeof tools.schemas !== "function") return;
  let known: ReadonlySet<string>;
  try {
    known = new Set(tools.schemas().map((definition) => definition.name));
  } catch {
    return; // 全局视图查询失败 fail-soft——掩码不落地，不炸 preset 装载
  }
  const deny = candidates.filter((name) => known.has(name));
  if (deny.length === 0) return;
  const disposer = tools.restrict({ deny });
  if (typeof ctx.effect === "function") {
    ctx.effect(() => disposer);
  }
}

// inject 声明边（cordis 守卫：官方 dsh-tools 声明 tools 非可选、宿主恒供——
// 同 expert-restrict 先例；preset scope 普通查找回落 Host realm）。
(toolsExclude as { inject?: string[] }).inject = ["tools"];

export default toolsExclude;
