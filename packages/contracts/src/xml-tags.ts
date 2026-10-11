// dispatchPrompt / 系统提示段 XML 标签集常量（tech-design §Interface 9 标签总表）。
// 标签集封闭于四枚——新增 = 契约面变更（G1 pin 锚定）。值为裸标签名（不含尖括号）——
// 包裹与组成序属 core prompt 合成逻辑。S2b（worker-lean-execution）后 dispatchPrompt
// 渲染面收窄为 <task-context> 单块（无人格段/约束块/类型策略段——agent 级内容迁
// persona，system 面承载）；constraints/typePolicy 两常量保留 = 词汇封闭面不破（G1 pin），
// 现无 dispatchPrompt 渲染消费者。
// 定位铁律：纯常量，零逻辑零依赖。

/** XML 标签集（四枚封闭；键 = 载体语义名） */
export const XML_TAGS = {
  /** 系统提示段·最外层唯一（forge 管线系统提示——老 forge hook 注入文本平移；不含 tool 说明） */
  forgePipeline: 'forge-pipeline',
  /** 块级词汇：约束块（S2b 后 dispatchPrompt 不再渲染——失败分诊/门序列/提交纪律迁 persona） */
  constraints: 'constraints',
  /** dispatchPrompt 块级（S2b 渲染面唯一块）：动态信息块（TASK_ID/SOURCE/TITLE/TYPE/CATEGORY/SURFACE/BLOCKERS/PHASE_SUMMARY/COVERAGE/PRIORITY/标记/VARS + GOAL/AC + 结算出口） */
  taskContext: 'task-context',
  /** 块级词汇：类型策略块（S2b 后 dispatchPrompt 不再渲染——20 类型工作流/门纪律迁 persona 变体表） */
  typePolicy: 'type-policy',
} as const

export type XmlTag = (typeof XML_TAGS)[keyof typeof XML_TAGS]

/** 标签集封闭面（四枚）——消费者与 G1 pin 以此为全集 */
export const XML_TAG_SET: readonly XmlTag[] = Object.values(XML_TAGS)
