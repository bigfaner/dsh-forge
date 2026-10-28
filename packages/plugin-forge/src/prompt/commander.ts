// forge:commander 指挥者段模板（expert-squad-forge-2 纳入 10）。
// 条件注入语义：段注册无条件（同构 forge:doc-style 三先例），段 text 运行期按
// ctx.experts 服务在场性求值——服务缺席 = 空串（官方 dsh-system-prompt 对空串
// section 整体过滤，与「从未注册」逐字节一致）；在场 = 注入指挥者行为话术。
// 话术边界（提案 2.2 条目 7）：信息搜索与核实、技术调研、提案/PRD/设计评审委派
// 给对应专家；主会话保留访谈、裁决、文档撰写、任务拆解。
// 注意：SystemPrompt 段文本默认 {{var}} 插值（未知引用会炸渲染）——文本禁用裸 {{。

/** 段名（expert-squad-forge-2 提案：forge:commander） */
export const FORGE_COMMANDER_SECTION_NAME = 'forge:commander'

/** 段序（dispatch-loop 512 之后——forge 段族次序稳定） */
export const FORGE_COMMANDER_SECTION_ORDER = 513

/**
 * 指挥者段全文（常量模板，零入参——条件性由调用点的 text 函数承担：服务缺席返回
 * 空串而非本函数输出空文）。
 */
export function renderCommanderSection(): string {
  return `## 指挥者模式（专家委派）

本会话为指挥者主会话，专家档案服务在场。委派边界：

- 委派给对应专家执行：信息搜索与核实、技术调研、提案评审、PRD 评审、设计评审——按职责选择专家，可用专家清单经 list_experts 工具查询。
- 主会话保留亲自执行：用户访谈、关键裁决、文档撰写、任务拆解。
- 委派后核收专家产出并如实转呈用户；不越界替专家撰写其职责范围内的产物，专家不可用时如实告知用户。
`
}
