// dispatchPrompt / 系统提示段 XML 标签集常量（tech-design §Interface 9 标签总表）。
// 标签集封闭于四枚——新增 = 契约面变更（G1 pin 锚定；core 快照测试断言三标签在场 +
// 块序 + 人格段在场）。值为裸标签名（不含尖括号）——包裹与组成序属 core prompt
// 合成逻辑（Interface 9：人格段无标签 → <constraints> → <task-context> → <type-policy>）。
// 定位铁律：纯常量，零逻辑零依赖。

/** XML 标签集（四枚封闭；键 = 载体语义名） */
export const XML_TAGS = {
  /** 系统提示段·最外层唯一（forge 管线系统提示——老 forge hook 注入文本平移；不含 tool 说明） */
  forgePipeline: 'forge-pipeline',
  /** dispatchPrompt 块级：约束块（单一 TS 源：失败分诊/质量门序列/提交纪律/不越权） */
  constraints: 'constraints',
  /** dispatchPrompt 块级：动态信息块（TASK_ID/FILE/TYPE/CATEGORY/BLOCKERS/PHASE_SUMMARY/COVERAGE/PRIORITY/标记） */
  taskContext: 'task-context',
  /** dispatchPrompt 块级：类型策略块（20 类型模板函数族） */
  typePolicy: 'type-policy',
} as const

export type XmlTag = (typeof XML_TAGS)[keyof typeof XML_TAGS]

/** 标签集封闭面（四枚）——消费者与 G1 pin 以此为全集 */
export const XML_TAG_SET: readonly XmlTag[] = Object.values(XML_TAGS)
