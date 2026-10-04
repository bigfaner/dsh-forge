// frontmatter 契约执行面（tech-design §frontmatter 最小契约——常量归 @dsh-forge/contracts，
// 本解析器执行：必填口径 / 缺省规则 / 类型容错 / 域深校验 / digest）。定位：业务（3.1）。
// 容错纪律：summary/keywords 缺失或类型不符、域超 3 层 → 条目不入索引（调用方报告计数），
// 不硬拒（硬拒收归 M4 写入面）；可选字段错型一律走缺省（title 缺省单独生效——仅缺 title 仍可入）。
// isNonEmptyString/normalizeUpdated 与浏览面（3.3）同源自 ./shared.ts（fix-35 收编）；
// defaultTitleFromRelPath/digestOf 模块私有（外部消费零——经 parseKnowledgeFile 间接面）。
import { createHash } from 'node:crypto'
import matter from 'gray-matter'
import {
  FRONTMATTER_DOMAIN_MAX_DEPTH,
  FRONTMATTER_STATUS_DEFAULT,
  type KnowledgeFrontmatter,
} from '@dsh-forge/contracts'
import { isNonEmptyString, normalizeUpdated } from './shared.js'

/** 拒收原因（IndexReport 只计数量；reason 供测试与日志诊断） */
export type ParseRejectReason =
  | 'frontmatter' // YAML 解析失败 / 无分隔块导致必填无从满足
  | 'summary' // 必填缺失或非字符串/空白
  | 'keywords' // 必填缺失或非字符串数组
  | 'domain-depth' // 域层数超 FRONTMATTER_DOMAIN_MAX_DEPTH（超层标 invalid）

/** 解析产物（契约校验通过、缺省已应用） */
export interface ParsedEntry {
  frontmatter: KnowledgeFrontmatter
  /** 域 = 目录路径派生（随行透传，单一事实源在目录路径） */
  domainPath: string
  /** 全文内容摘要 sha256 hex（变更检测——场景⑦数据侧） */
  digest: string
}

export type ParseOutcome =
  | { ok: true; entry: ParsedEntry }
  | { ok: false; reason: ParseRejectReason; message: string }

/** 解析输入（扫描层产出：路径派生信息 + 全文 + mtime 展示位缺省源） */
export interface ParseKnowledgeFileInput {
  /** 规范化相对路径（'/' 分隔，含文件名）——title 缺省源 */
  relPath: string
  /** 域路径（目录段 '/' 连接，根文件 = ''） */
  domainPath: string
  /** 域层数（根文件 = 0） */
  domainDepth: number
  /** 文件全文（UTF-8；digest 摘全文 = frontmatter + 正文） */
  content: string
  /** 文件 mtime（updated 缺省源） */
  mtime: Date
}

/** title 缺省 = 文件名去扩展名（如 `安全编码规范.md` → `安全编码规范`） */
function defaultTitleFromRelPath(relPath: string): string {
  const filename = relPath.split('/').pop() ?? relPath
  return filename.replace(/\.[^./]*$/, '')
}

/**
 * 执行 frontmatter 最小契约：必填（summary/keywords）不满足或域超层 → { ok: false }；
 * 通过 → 缺省已应用的 KnowledgeFrontmatter + digest。校验顺序确定（域深 → YAML →
 * summary → keywords），同一文件多缺陷时首个原因稳定。
 */
export function parseKnowledgeFile(input: ParseKnowledgeFileInput): ParseOutcome {
  // 域深前置（无需解析内容；超层标 invalid——契约常量裁决，解析器执行）
  if (input.domainDepth > FRONTMATTER_DOMAIN_MAX_DEPTH) {
    return {
      ok: false,
      reason: 'domain-depth',
      message: `域层数 ${input.domainDepth} 超上限 ${FRONTMATTER_DOMAIN_MAX_DEPTH}：${input.domainPath}`,
    }
  }

  let data: Record<string, unknown>
  try {
    data = matter(input.content).data as Record<string, unknown>
  } catch (cause) {
    return { ok: false, reason: 'frontmatter', message: `frontmatter 解析失败：${String(cause)}` }
  }

  // 必填：summary（string 非空白）/ keywords（string[]；空数组合法——在位且类型正确）
  if (!isNonEmptyString(data.summary)) {
    return { ok: false, reason: 'summary', message: `summary 必填缺失或类型不符：${input.relPath}` }
  }
  if (
    !Array.isArray(data.keywords) ||
    !data.keywords.every((k) => typeof k === 'string')
  ) {
    return { ok: false, reason: 'keywords', message: `keywords 必填缺失或非字符串数组：${input.relPath}` }
  }

  // 可选字段：错型一律缺省（容错口径——title 缺省单独生效，仅缺 title 仍可入索引）
  const frontmatter: KnowledgeFrontmatter = {
    title: isNonEmptyString(data.title) ? data.title : defaultTitleFromRelPath(input.relPath),
    summary: data.summary,
    keywords: data.keywords,
    status: isNonEmptyString(data.status) ? data.status : FRONTMATTER_STATUS_DEFAULT,
    ...(isNonEmptyString(data.id) ? { id: data.id } : {}), // 存而不强求（M6 转正锚点）
    ...(isNonEmptyString(data.authors) ? { authors: data.authors } : {}), // 展示位（3.3 详情面消费）
    updated: normalizeUpdated(data.updated, input.mtime.getTime()), // 缺省取 mtime；日期字面量 ISO 化
  }

  return {
    ok: true,
    entry: { frontmatter, domainPath: input.domainPath, digest: digestOf(input.content) },
  }
}

/** 全文内容摘要（sha256 hex）——外部修改对账的变更检测信号（模块私有，经 ParsedEntry.digest 消费） */
function digestOf(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}
