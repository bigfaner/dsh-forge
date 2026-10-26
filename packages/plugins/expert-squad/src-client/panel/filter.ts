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
  readonly origin: string
  readonly enabled: boolean
  readonly updatedAt?: string
  /** 生效位（1.60）：true/缺席 = 遮蔽胜出层；false = 被遮蔽层（只读展示）。 */
  readonly effective?: boolean
}

/** 状态过滤枚举（F1：全部/启用/禁用）。 */
export type StatusFilter = "all" | "enabled" | "disabled"

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

/** 搜索 × 状态叠加过滤（AND 语义；纯函数——输入不可变消费）。 */
export function filterExperts(
  entries: readonly ExpertView[],
  query: string,
  status: StatusFilter,
): readonly ExpertView[] {
  return entries.filter((entry) => matchesQuery(entry, query) && matchesStatus(entry, status))
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

/** 来源角标三态文案（origin → 角标文本；未知原值透传——载荷漂移容忍）。 */
export function originLabel(origin: string): string {
  if (origin === "project") return "项目"
  if (origin === "user") return "用户"
  if (origin === "plugin") return "内置"
  return origin
}

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

/** 对比字段清单（键 → 中文段标；AC 钉死五字段：岗位/简介/人设/工具白名单/技能）。 */
export const COMPARE_FIELDS: readonly { readonly field: keyof ExpertView; readonly label: string }[] = [
  { field: "title", label: "岗位" },
  { field: "description", label: "简介" },
  { field: "personaMd", label: "人设" },
  { field: "tools", label: "工具白名单" },
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
