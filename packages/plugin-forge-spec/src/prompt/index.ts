// forge:spec 系统提示段渲染（定位：业务——M3 Interface「plugin-forge-spec 行」；
// plugin-forge prompt / knowledge prompt 同型）。一段式：规格产出经 tool 读写状态层
// 的纪律说明（文档 → upsertFeatureDoc / 任务 → addTask + registerFeature / 诊断 →
// validateFeatureTasks——动词以自然语言表述并点名 forge 动词，工具参数面由 dsh
// tool 注册面自描述，本段不复制参数说明，防「提示词与注册面双源漂移」）。
// 段文本不携 XML 包裹标签（knowledge 段同形——XML 标签集四枚封闭，G1-14 pin 不扩）。
// 注意：SystemPrompt 段文本默认 {{var}} 插值（未知引用会炸渲染）——文本禁用裸 {{。

/** 段名（M3 Interface 定死） */
export const SPEC_SECTION_NAME = 'forge:spec'

/** 段序（升序拼接：knowledge 500 → forge:pipeline 510 → forge:spec 520——规格段居管线段之后） */
export const SPEC_SECTION_ORDER = 520

/**
 * 规格段全文（纯函数）。三部分：规格状态层说明 / 经 tool 读写纪律一段式 / 边界声明。
 */
export function renderForgeSpecSection(): string {
  const body = [
    '## Forge spec chain',
    '',
    'Specification work in this workspace is state-backed: every feature keeps its phase, registered documents, and task graph in the per-workspace state layer. Documents on disk are artifacts; the state layer is the source of truth for what exists and where the chain stands. Never edit that state by hand — it changes only through the forge verbs.',
    '',
    'Spec artifacts go through the tools, one path per artifact kind:',
    '1. Documents (PRD, user stories, UI functions, tech design, ER diagram, SQL schema, page map): write the file, then register it with upsertFeatureDoc so the feature phase advances. Registering is monotonic — a phase never regresses.',
    '2. Task breakdown: register the feature itself with registerFeature when linking explicitly (the accepted-expedition chain registers automatically; do not duplicate it), then create tasks with addTask against that feature container.',
    '3. Diagnostics: validate the feature container with validateFeatureTasks after breakdown, or when execution seems stuck; every reported violation names the offending task key so the fix can go straight to it.',
    '',
    'Boundary notes:',
    '- Proposal mode changes and feature-level transitions are human decisions: surface them to the user instead of working around them.',
    '- When a spec artifact is rejected or reworked, register the updated document again rather than editing state directly.',
  ].join('\n')
  return body
}
