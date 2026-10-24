// panel/filter —— 卡片网格纯逻辑面（ui-design F1）：搜索即时过滤（名称/英文标识/
// 技能）、状态过滤（全部/启用/禁用）、页脚计数文案、人设摘要 Markdown 剥离、更新
// 时间标签。零副作用零 DOM——视图层（expert-panel.tsx）与单测共同消费的唯一决策面。

/** 面板卡片数据视图（/api/expert-squad/list 载荷的消费切片；updatedAt 容缺——旧宿主载荷漂移容忍）。 */
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
