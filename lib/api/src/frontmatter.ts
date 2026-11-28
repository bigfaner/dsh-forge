// frontmatter 最小契约（tech-design §frontmatter 最小契约）。
// 执行面消费的常量 = STATUS_DEFAULT / DOMAIN_MAX_DEPTH（core 知识域解析器 3.1 消费）；
// 字段全集与必填/可选口径由 KnowledgeFrontmatter 形状承载（parser 手写校验不驱动化，
// fix-34 删零引用清单 FRONTMATTER_KEYS/REQUIRED/OPTIONAL 后注释如实）。
// 定位铁律：纯常量与类型，零逻辑零依赖。

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
