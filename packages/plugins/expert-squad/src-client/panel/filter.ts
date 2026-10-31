// panel/filter —— 卡片网格纯逻辑面（ui-design F1）：搜索即时过滤（名称/英文标识/
// 技能）、状态过滤（全部/启用/禁用）、页脚计数文案、人设摘要 Markdown 剥离、更新
// 时间标签、同键全层聚组（1.60 用户裁决：组容器 + 生效卡 + 被遮蔽折叠行 + 差异
// 对比标记）。零副作用零 DOM——视图层（expert-panel.tsx）与单测共同消费的唯一决策面。

/** 面板卡片数据视图（/api/expert-squad/list 载荷的消费切片；updatedAt/effective 容缺——旧宿主载荷漂移容忍）。 */
export interface ExpertView {
  /** 英文键正本（派发字符串键；卡片名称与标识 chip 同源）。 */
  readonly name: string
  /** 岗位。 */
  readonly title: string
  /** 简介（何时委派我）。 */
  readonly description: string
  /** 人设 Markdown 原文（卡片只取纯文本摘要三行截断）。 */
  readonly personaMd: string
  readonly tools: readonly string[]
  readonly skills: readonly string[]
  /** 派发路由 provider（可选——成对语义，旧载荷/未配置档案缺席）。 */
  readonly provider?: string
  /** 派发路由 model（可选——成对语义，旧载荷/未配置档案缺席）。 */
  readonly model?: string
  readonly origin: string
  readonly enabled: boolean
  readonly updatedAt?: string
  /** 生效位（1.60）：true/缺席 = 遮蔽胜出层；false = 被遮蔽层（只读展示）。 */
  readonly effective?: boolean
  /** 来源文件绝对路径（条目身份键——同键同 origin 可有多份内置注册）。 */
  readonly sourcePath?: string
}

/** 条目身份键（sourcePath 优先；同键同 origin 可有多份内置注册，origin 不足以区分）。 */
export function entryIdOf(entry: ExpertView): string {
  return entry.sourcePath ?? `${entry.origin}:${entry.name}`
}

/**
 * 来源路径反推插件名（内置多来源区分用）：
 * · 仓内形态 `…/packages/plugins/<pkg>/experts/…` → `<pkg>`；
 * · 仓内形态 `…/packages/<pkg>/experts/…`（plugin-forge 直挂）→ `<pkg>`；
 * · 安装形态 `…/node_modules/@dsh-forge/<pkg>/experts/…` → `@dsh-forge/<pkg>`；
 * 不可解析（user 手放等）→ undefined。
 */
export function pluginNameOfSource(sourcePath: string | undefined): string | undefined {
  if (sourcePath === undefined || sourcePath === "") return undefined;
  const segments = sourcePath.split(/[\\/]+/);
  const packagesAt = segments.indexOf("packages");
  if (packagesAt !== -1 && packagesAt + 1 < segments.length) {
    const next = segments[packagesAt + 1]!;
    return next === "plugins" ? segments[packagesAt + 2] : next;
  }
  const scopeAt = segments.indexOf("@dsh-forge");
  if (scopeAt !== -1 && scopeAt + 1 < segments.length) {
    return `@dsh-forge/${segments[scopeAt + 1]!}`;
  }
  return undefined;
}

/** 来源角标文案：plugin 层可反推插件名时具名「内置 · <插件名>」（多内置来源区分面）。 */
export function originBadgeLabel(
  entry: Pick<ExpertView, "origin" | "sourcePath">,
  projectName?: string,
): string {
  if (entry.origin === "plugin") {
    const plugin = pluginNameOfSource(entry.sourcePath);
    if (plugin !== undefined) return `内置 · ${plugin}`;
  }
  return originLabel(entry.origin, projectName);
}

/** 状态过滤枚举（F1：全部/启用/禁用）。 */
export type StatusFilter = "all" | "enabled" | "disabled"

/** 来源过滤枚举（1.61 裁决②：全部来源/项目/用户/内置——与搜索、状态 AND 叠加）。 */
export type OriginFilter = "all" | "project" | "user" | "plugin"

/** workspace 归属路径 → 项目具名（末段 basename，正反斜杠均容——①④ 徽标/筛选具名源）。 */
export function projectNameOf(workspacePath: string | undefined): string | undefined {
  if (workspacePath === undefined || workspacePath === "") return undefined
  const base = workspacePath.split(/[\\/]/).filter((segment) => segment !== "").pop()
  return base === undefined || base === "" ? undefined : base
}

/** 来源角标文案（origin → 角标文本；project 携项目名具名「项目 · <名>」——1.61 裁决④；未知原值透传）。 */
export function originLabel(origin: string, projectName?: string): string {
  if (origin === "project") return projectName === undefined ? "项目" : `项目 · ${projectName}`
  if (origin === "user") return "用户"
  if (origin === "plugin") return "内置"
  return origin
}

/** 查询命中判定（名称/英文标识/技能包含，大小写不敏感——即时过滤语义）。 */
export function matchesQuery(entry: ExpertView, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (q === "") return true
  if (entry.name.toLowerCase().includes(q)) return true
  return entry.skills.some((skill) => skill.toLowerCase().includes(q))
}

/** 状态过滤判定。 */
function matchesStatus(entry: ExpertView, status: StatusFilter): boolean {
  if (status === "all") return true
  return status === "enabled" ? entry.enabled : !entry.enabled
}

/** 来源过滤判定（all 恒真——1.61 裁决②）。 */
export function matchesOrigin(entry: ExpertView, origin: OriginFilter): boolean {
  return origin === "all" || entry.origin === origin
}

/**
 * 搜索 × 状态 × 来源叠加过滤（AND 语义；纯函数——输入不可变消费）。
 * origin 为可选参（缺省 all——1.61 前调用面零改动）。
 */
export function filterExperts(
  entries: readonly ExpertView[],
  query: string,
  status: StatusFilter,
  origin: OriginFilter = "all",
): readonly ExpertView[] {
  return entries.filter(
    (entry) => matchesQuery(entry, query) && matchesStatus(entry, status) && matchesOrigin(entry, origin),
  )
}

/** 面板页脚计数文案（原型 F1 逐位：`N 位专家 · 显示 M`；零专家短文案）。 */
export function footerText(total: number, shown: number): string {
  return total === 0 ? "0 位专家" : `${total} 位专家 · 显示 ${shown}`
}

/** 人设 Markdown → 纯文本摘要（卡片三行截断的输入降级：剥标题、加粗、行内代码与列表符）。 */
export function personaSummary(personaMd: string): string {
  return personaMd
    .split("\n")
    .map((line) =>
      line
        .replace(/^#{1,6}\s*/, "")
        .replace(/^[-*]\s+/, "")
        .replace(/\*\*([^*]*)\*\*/g, "$1")
        .replace(/`([^`]*)`/g, "$1")
        .trim(),
    )
    .filter((line) => line !== "")
    .join("\n")
}

/** 更新时间标签：ISO 即取日期段（YYYY-MM-DD）；缺席 = undefined（页脚时段不呈现）。 */
export function updatedLabel(updatedAt: string | undefined): string | undefined {
  if (updatedAt === undefined) return undefined
  const date = updatedAt.slice(0, "YYYY-MM-DD".length)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined
}

// ---- 同键全层聚组（1.60 用户裁决 2026-10-26）--------------------------------

/** 聚组视图：同键一组——生效卡（首张）+ 被遮蔽卡列表（只读折叠行）。 */
export interface ExpertGroup {
  /** 英文键正本（组标识）。 */
  readonly key: string
  /** 生效卡（遮蔽胜出层；取用/编辑/启停语义附丽）。 */
  readonly effective: ExpertView
  /** 被遮蔽卡（展示层只读；列表载入序）。 */
  readonly shadows: readonly ExpertView[]
}

/** 条目生效位（effective 缺席 = 生效——旧宿主载荷漂移容忍）。 */
function isEffective(entry: ExpertView): boolean {
  return entry.effective !== false
}

/**
 * 同键聚组：列表按名分组，生效位条目为组生效卡（无显式生效位时取首条——单来源
 * 形态即普通卡）；其余为被遮蔽卡。组序 = 首现序（载入排序由数据面承担）。
 */
export function groupExperts(entries: readonly ExpertView[]): readonly ExpertGroup[] {
  const groups = new Map<string, { effective?: ExpertView; shadows: ExpertView[] }>()
  for (const entry of entries) {
    let bucket = groups.get(entry.name);
    if (bucket === undefined) {
      bucket = { shadows: [] };
      groups.set(entry.name, bucket);
    }
    if (isEffective(entry) && bucket.effective === undefined) bucket.effective = entry;
    else bucket.shadows.push(entry);
  }
  return [...groups].map(([key, bucket]) => ({
    key,
    effective: bucket.effective ?? bucket.shadows[0]!,
    shadows: bucket.shadows,
  }))
}

/** 对比字段清单（键 → 中文段标；五字段：岗位/简介/人设/工具/技能）。 */
export const COMPARE_FIELDS: readonly { readonly field: keyof ExpertView; readonly label: string }[] = [
  { field: "title", label: "岗位" },
  { field: "description", label: "简介" },
  { field: "personaMd", label: "人设" },
  { field: "tools", label: "工具" },
  { field: "skills", label: "技能" },
]

function fieldValueText(value: unknown): string {
  return Array.isArray(value) ? value.join(",") : String(value ?? "")
}

/** 单字段差异判定（数组按序拼接比较——顺序敏感，与 chips 呈现序一致）。 */
export function fieldDiffers(field: keyof ExpertView, effective: ExpertView, shadow: ExpertView): boolean {
  return fieldValueText(effective[field]) !== fieldValueText(shadow[field])
}

/** 被遮蔽卡与生效卡的字段差异清单（键序随 COMPARE_FIELDS——对比表行序）。 */
export function diffFields(effective: ExpertView, shadow: ExpertView): readonly string[] {
  return COMPARE_FIELDS.filter(({ field }) => fieldDiffers(field, effective, shadow)).map(({ field }) => field)
}

// ---- 来源筛选 + 组级筛选（1.61 用户裁决②）----------------------------------

/** 组级筛选产物：组（shadow 已按可见性裁剪）+ 被隐藏的未命中 shadow 数。 */
export interface ExpertGroupShown {
  readonly group: ExpertGroup
  /** 被 来源/搜索/状态 筛选隐藏的 shadow 行数（组头「隐藏 N 条未命中」标注）。 */
  readonly hiddenShadows: number
}

/**
 * 组级筛选（1.61 裁决②）：搜索 × 状态 × 来源 AND 叠加。
 * - 组呈现条件：生效卡命中 或 任一 shadow 命中（命中来源的组呈现）；
 * - 组内未命中的 shadow 行隐藏，hiddenShadows 计数供组头标注；
 * - 生效卡恒为组内对比基座，组呈现即在组内保留（用户裁决 2026-10-26 两两口径）。
 */
export function filterGroups(
  entries: readonly ExpertView[],
  query: string,
  status: StatusFilter,
  origin: OriginFilter,
): readonly ExpertGroupShown[] {
  const visible = (entry: ExpertView): boolean =>
    matchesQuery(entry, query) && matchesStatus(entry, status) && matchesOrigin(entry, origin)
  return groupExperts(entries)
    .map((group) => {
      const visibleShadows = group.shadows.filter(visible)
      return {
        group: { ...group, shadows: visibleShadows },
        hiddenShadows: group.shadows.length - visibleShadows.length,
      }
    })
    .filter(({ group }) => visible(group.effective) || group.shadows.length > 0)
}

/** 被遮蔽同名提示文案（① Dialog 来源条右段：`遮蔽同名：用户 / 内置`；空 shadows = undefined）。 */
export function maskedPeersLabel(shadows: readonly ExpertView[]): string | undefined {
  if (shadows.length === 0) return undefined
  return `遮蔽同名：${shadows.map((shadow) => originLabel(shadow.origin)).join(" / ")}`
}
