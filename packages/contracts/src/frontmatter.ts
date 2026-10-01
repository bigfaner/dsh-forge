// frontmatter 最小契约常量（tech-design §frontmatter 最小契约——contracts 出常量，解析器执行）。
// 执行面（校验/缺省/容错）归 core 知识域解析器（3.1 消费本常量，不重复定义契约）。
// 定位铁律：纯常量与类型，零逻辑零依赖。

/** 契约字段全集（行序 = 契约表行序） */
export const FRONTMATTER_KEYS = [
  'title', // ✗ 缺省 = 文档名称去掉扩展名（如「安全编码规范.md」→「安全编码规范」）
  'summary', // ✓ 摘要先行（卡片与 read-abstract 返回体）
  'keywords', // ✓ 域内细分（检索维度）
  'status', // ✗ 默认 draft（P1 仅承载，审核流 M4）
  'id', // ✗ 稳定 ID（P1 存而不强求，M6 转正）
  'authors', // ✗ 展示用
  'updated', // ✗ 展示用（缺省取文件 mtime）
] as const

export type FrontmatterKey = (typeof FRONTMATTER_KEYS)[number]

/** 必填字段（缺失 → 条目不入索引，rebuild 报告计数，UI 空态提示；硬拒收归 M4 写入面） */
export const FRONTMATTER_REQUIRED_KEYS = ['summary', 'keywords'] as const
export type FrontmatterRequiredKey = (typeof FRONTMATTER_REQUIRED_KEYS)[number]

/** 可选字段（全集 − 必填） */
export const FRONTMATTER_OPTIONAL_KEYS = ['title', 'status', 'id', 'authors', 'updated'] as const
export type FrontmatterOptionalKey = (typeof FRONTMATTER_OPTIONAL_KEYS)[number]

/** status 字段缺省值 */
export const FRONTMATTER_STATUS_DEFAULT = 'draft'

/** 域 = 目录路径派生（无 frontmatter 字段，单一事实源），层级上限；超层条目不入索引（标 invalid） */
export const FRONTMATTER_DOMAIN_MAX_DEPTH = 3

/** 契约校验通过后的 frontmatter 形状（解析器产出，缺省已应用） */
export interface KnowledgeFrontmatter {
  /** 缺省 = 文件名去扩展名 */
  title: string
  /** 必填 */
  summary: string
  /** 必填 */
  keywords: string[]
  /** 默认 FRONTMATTER_STATUS_DEFAULT */
  status: string
  /** 存而不强求（M6 转正锚点） */
  id?: string
  authors?: string
  /** 缺省取文件 mtime */
  updated?: string
}
