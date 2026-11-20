// @dsh-forge/md-mermaid/validate —— 校验面（零 React 纯逻辑）。
// 引擎注册表 Record<format, adapter>（机械分派不经 LLM）+ fence 提取正则单源 +
// auto 首行头词探测 + 裁决归一形状（source / docRel 双模）。
import { parseMermaidSource, type EngineParseResult } from './mermaid-engine.js'

export type { EngineParseResult }

export interface EngineAdapter {
  parse(source: string): Promise<EngineParseResult>
}

/** 引擎注册表：本期唯一成员 mermaid（结构预留，依赖不预支） */
export const ENGINE_REGISTRY: Record<string, EngineAdapter> = {
  mermaid: {
    parse: (source) => parseMermaidSource(source),
  },
}

/** fence 提取正则单源（随能力入包） */
export const MD_MERMAID_VALIDATE_FENCE_RE = /```mermaid\r?\n([\s\S]*?)```/g

/** mermaid 头词表（首行图型关键字，小写比对；覆盖提案附录 C 门控表） */
const MERMAID_HEAD_WORDS = new Set([
  'flowchart',
  'graph',
  'sequencediagram',
  'classdiagram',
  'statediagram',
  'statediagram-v2',
  'erdiagram',
  'journey',
  'gantt',
  'pie',
  'mindmap',
  'gitgraph',
  'timeline',
  'quadrantchart',
  'sankey-beta',
  'xychart-beta',
  'block-beta',
  'architecture-beta',
  'packet-beta',
  'kanban',
  'radar-beta',
  'requirementdiagram',
  'c4context',
  'c4container',
])

/** 头词所在行（1-based）——unsupported 裁决的行号依据 */
function headWordInfo(source: string): { word: string; line: number } {
  const lines = source.split(/\r?\n/)
  let i = 0
  if (lines[0]?.trim() === '---') {
    i = 1
    while (i < lines.length && lines[i]?.trim() !== '---') i++
    i++ // 越过闭合 ---
  }
  while (i < lines.length && lines[i]?.trim() === '') i++
  const word = lines[i]?.trim().split(/\s+/)[0] ?? ''
  return { word, line: i + 1 }
}

/**
 * auto 探测：首行头词 → 引擎 format（'mermaid'）| null（未知头词，显式 unsupported）。
 * 跳过 YAML frontmatter（--- 界定）与空行，取首个非空词。
 */
export function detectFormat(source: string): string | null {
  const { word } = headWordInfo(source)
  const head = word.toLowerCase()
  if (!head) return null
  return MERMAID_HEAD_WORDS.has(head) ? 'mermaid' : null
}

export interface SourceVerdict {
  ok: boolean
  format: string
  line?: number
  message?: string
  /** 显式 unsupported 标记（未知引擎/未知头词——不假失败） */
  unsupported?: boolean
}

export interface FenceVerdict {
  line: number
  format: string
  ok: boolean
  message?: string
  unsupported?: boolean
}

export interface DocVerdict {
  fences: FenceVerdict[]
}

const EMPTY_MESSAGE = '空源（零内容/纯空白）'

function verdictToVerdictShape(format: string, r: EngineParseResult, unsupported = false): SourceVerdict {
  if (r.ok) return { ok: true, format }
  // 可选字段缺席 = 键缺席（lossless JSON——显式 undefined 属性会被 harness 输出边界整值拒绝，
  // bug 62211111：引擎失败报错曾被「value is not lossless JSON」吞掉）。
  return {
    ok: false,
    format,
    ...(r.line !== undefined && { line: r.line }),
    ...(r.message !== undefined && { message: r.message }),
    ...(unsupported && { unsupported: true }),
  }
}

/**
 * source 模式（单图源，严格单枚）：{ok, format, line?, message?}。
 * - format 'auto'（缺省）= 首行头词机械探测；未知头词 → ok:false + unsupported:true。
 * - 显式未知 format → ok:false + unsupported:true（注册表机械分派）。
 */
export async function validateSource(
  source: string,
  opts: { format?: string } = {},
): Promise<SourceVerdict> {
  if (source.trim() === '') return { ok: false, format: opts.format ?? 'auto', message: EMPTY_MESSAGE }

  let format = opts.format ?? 'auto'
  if (format === 'auto') {
    const detected = detectFormat(source)
    if (detected === null) {
      const { word: head, line } = headWordInfo(source)
      return { ok: false, format: head, line, unsupported: true, message: `unsupported diagram head: "${head}"` }
    }
    format = detected
  }

  const adapter = ENGINE_REGISTRY[format]
  if (!adapter) return { ok: false, format, unsupported: true, message: `unsupported format: "${format}"` }

  return verdictToVerdictShape(format, await adapter.parse(source))
}

/**
 * docRel 模式：扫全部 mermaid fence 逐枚裁决（行号 = fence 起始行，1-based）。
 * {fences: [{line, format, ok, message?}]}；空源/纯空白 fence 快速失败。
 */
export async function validateDocFences(doc: string): Promise<DocVerdict> {
  const re = new RegExp(MD_MERMAID_VALIDATE_FENCE_RE.source, MD_MERMAID_VALIDATE_FENCE_RE.flags)
  const fences: FenceVerdict[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(doc)) !== null) {
    const line = doc.slice(0, m.index).split('\n').length
    const body = m[1] ?? ''
    if (body.trim() === '') {
      fences.push({ line, format: 'mermaid', ok: false, message: EMPTY_MESSAGE })
      continue
    }
    const detected = detectFormat(body)
    if (detected === null) {
      const { word: head } = headWordInfo(body)
      fences.push({ line, format: head, ok: false, unsupported: true, message: `unsupported diagram head: "${head}"` })
      continue
    }
    const adapter = ENGINE_REGISTRY[detected]
    if (!adapter) {
      fences.push({ line, format: detected, ok: false, unsupported: true, message: `unsupported format: "${detected}"` })
      continue
    }
    const r = await adapter.parse(body)
    if (r.ok) {
      fences.push({ line, format: detected, ok: true })
    } else {
      fences.push({ line, format: detected, ok: false, message: r.message })
    }
  }
  // 未闭合 fence 探测：```mermaid 开标记未被任何成对命中消费 = 漏写闭合 ```（bug b3b92a1c——
  // 成对正则零命中会静默返回空集假绿，此处补显式 invalid 裁决）。
  const openRe = /```mermaid(?=\r?\n)/g
  const pairStarts = new Set<number>()
  const pairRe = new RegExp(MD_MERMAID_VALIDATE_FENCE_RE.source, MD_MERMAID_VALIDATE_FENCE_RE.flags)
  let pm: RegExpExecArray | null
  while ((pm = pairRe.exec(doc)) !== null) pairStarts.add(pm.index)
  let om: RegExpExecArray | null
  while ((om = openRe.exec(doc)) !== null) {
    if (!pairStarts.has(om.index)) {
      fences.push({
        line: doc.slice(0, om.index).split('\n').length,
        format: 'mermaid',
        ok: false,
        message: 'mermaid fence 未闭合（缺闭合 ```）',
      })
      break
    }
  }
  return { fences }
}
