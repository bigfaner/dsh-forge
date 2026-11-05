// frontmatter 契约执行面（自持拷——core src/knowledge/parser.ts 同口径，零 core import：
// SC-2 铁律；常量/形状自 contracts 单源）。容错纪律：summary/keywords 缺失或类型不符、
// 域超 3 层 → 条目不入索引（调用方报告计数），不硬拒。
import { createHash } from 'node:crypto'
import matter from 'gray-matter'
import {
  FRONTMATTER_DOMAIN_MAX_DEPTH,
  FRONTMATTER_STATUS_DEFAULT,
  type KnowledgeFrontmatter,
} from '@dsh-forge/contracts'

/** 拒收原因（报告只计数量；reason 供测试与日志诊断） */
export type ParseRejectReason = 'frontmatter' | 'summary' | 'keywords' | 'domain-depth'

/** 解析产物（契约校验通过、缺省已应用） */
export interface ParsedEntry {
  frontmatter: KnowledgeFrontmatter
  /** 域 = 目录路径派生（随行透传，单一事实源在目录路径） */
  domainPath: string
  /** 全文内容摘要 sha256 hex（变更检测） */
  digest: string
  /**
   * stage② 版本化元数据透传（提案 §2.2：正本权威 frontmatter 字段——id/version_ts/
   * supersedes/merged_into/candidate_of/slug_hint/type/procedure）。contracts 最小契约
   * 形状（KnowledgeFrontmatter）不动；本包存储面扩展消费，缺席字段缺省（存量收编前旧文件可无）。
   */
  meta: KnowledgeEntryMetadata
}

/** stage② 版本化元数据（frontmatter 透传面——全部可选，调用方判空走缺省链） */
export interface KnowledgeEntryMetadata {
  id?: string
  versionTs?: string
  supersedes?: string
  mergedInto?: string
  candidateOf?: string
  slugHint?: string
  type?: string
  procedure?: boolean
  /**
   * 双轨归并降指向（1.6）：非空 = 本条目以 docs 正本为权威（纯约定 docs=治理正册），
   * 检索层出索引（rebuild 不入实体表），值 = docs 正本仓库相对路径。
   */
  canonical?: string
}

export type ParseOutcome =
  | { ok: true; entry: ParsedEntry }
  | { ok: false; reason: ParseRejectReason; message: string }

/** 解析输入（扫描层产出：路径派生信息 + 全文 + mtime 展示位缺省源） */
export interface ParseKnowledgeFileInput {
  relPath: string
  domainPath: string
  domainDepth: number
  content: string
  mtime: Date
}

/** 非空字符串判定（空串/纯空白视同缺失） */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

/** updated 展示位归一：非空串直传 / Date 字面量 ISO 化 / 其余取缺省（fallbackMs 毫秒） */
function normalizeUpdated(value: unknown, fallbackMs: number): string {
  if (isNonEmptyString(value)) return value
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  return new Date(fallbackMs).toISOString()
}

/** title 缺省 = 文件名去扩展名 */
function defaultTitleFromRelPath(relPath: string): string {
  const filename = relPath.split('/').pop() ?? relPath
  return filename.replace(/\.[^./]*$/, '')
}

/**
 * 执行 frontmatter 最小契约：必填（summary/keywords）不满足或域超层 → { ok: false }；
 * 通过 → 缺省已应用的 KnowledgeFrontmatter + digest。校验顺序确定（域深 → YAML →
 * summary → keywords）。
 */
export function parseKnowledgeFile(input: ParseKnowledgeFileInput): ParseOutcome {
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

  if (!isNonEmptyString(data.summary)) {
    return { ok: false, reason: 'summary', message: `summary 必填缺失或类型不符：${input.relPath}` }
  }
  if (!Array.isArray(data.keywords) || !data.keywords.every((k) => typeof k === 'string')) {
    return { ok: false, reason: 'keywords', message: `keywords 必填缺失或非字符串数组：${input.relPath}` }
  }

  const frontmatter: KnowledgeFrontmatter = {
    title: isNonEmptyString(data.title) ? data.title : defaultTitleFromRelPath(input.relPath),
    summary: data.summary,
    keywords: data.keywords,
    status: isNonEmptyString(data.status) ? data.status : FRONTMATTER_STATUS_DEFAULT,
    ...(isNonEmptyString(data.id) ? { id: data.id } : {}),
    ...(isNonEmptyString(data.authors) ? { authors: data.authors } : {}),
    updated: normalizeUpdated(data.updated, input.mtime.getTime()),
  }

  const meta: KnowledgeEntryMetadata = {
    ...(isNonEmptyString(data.id) ? { id: data.id } : {}),
    ...(isNonEmptyString(data.version_ts)
      ? { versionTs: data.version_ts }
      : data.version_ts instanceof Date && !Number.isNaN(data.version_ts.getTime())
        ? { versionTs: data.version_ts.toISOString() }
        : {}),
    ...(isNonEmptyString(data.supersedes)
      ? { supersedes: data.supersedes }
      : data.supersedes instanceof Date && !Number.isNaN(data.supersedes.getTime())
        ? { supersedes: data.supersedes.toISOString() }
        : {}),
    ...(isNonEmptyString(data.merged_into) ? { mergedInto: data.merged_into } : {}),
    ...(isNonEmptyString(data.candidate_of) ? { candidateOf: data.candidate_of } : {}),
    ...(isNonEmptyString(data.slug_hint) ? { slugHint: data.slug_hint } : {}),
    ...(isNonEmptyString(data.type) ? { type: data.type } : {}),
    ...(isNonEmptyString(data.canonical) ? { canonical: data.canonical } : {}),
    ...(typeof data.procedure === 'boolean'
      ? { procedure: data.procedure }
      : data.procedure === 'true'
        ? { procedure: true }
        : data.procedure === 'false'
          ? { procedure: false }
          : {}),
  }

  return {
    ok: true,
    entry: {
      frontmatter,
      domainPath: input.domainPath,
      digest: digestOf(input.content),
      meta,
    },
  }
}

/** 全文内容摘要（sha256 hex） */
function digestOf(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}
