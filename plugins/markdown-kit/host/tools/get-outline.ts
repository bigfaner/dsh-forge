// getOutline tool 壳（定位：装配——schema 收窄（docRel 必填 + depth? 截断层级）+
// 路由到 ./outline 纯逻辑单源 + typed error 归一 + 成功/失败 emitDiag（md-outline
// 前缀，零静默）。壳零业务逻辑：ATX 解析/围栏跳过/setext 标注/depth 截断全在
// ./outline 单源。读取锚 = session.cwd（exec.agent.session.header.cwd——
// convertDocument 同构取数位，缺席即 ERR_IO 拒绝）+ 注入 fs 缝（缺省 node:fs）；
// 读取失败沿 validateMermaid 既有口径映射 ERR_INVALID_ARGS + cannot read document
// 语义（只读工具不设独立 ERR_IO 分支，cwd 缺席/路径穿越除外）。可选键 undefined
// 剔除后整值返回（lossless JSON 整值边界——判例 223ba5b3 径）。
import { isAbsolute, resolve, sep } from 'node:path'
import type { MermaidToolDefinition, TextContentBlock, ToolExecFace } from '../faces.js'
import { parseMarkdownOutline, renderOutlineTree, type OutlineNode, type OutlineResult } from '../outline/index.js'
import { defaultConvertFs, type ConvertFsSeam } from '../convert/index.js'
import { emitConvertDiag, type DiagEmitter } from '../convert/diag.js'

/** 工具名（字面量单源导出——MERMAID_TOOL_NAME 同法） */
export const GET_MD_OUTLINE = 'getOutline' as const

/** 本 tool typed 错误码闭集 */
export type GetOutlineToolErrorCode = 'ERR_INVALID_ARGS' | 'ERR_IO'

/** typed error（code 承载——tool-error 语义的判别锚） */
export class GetOutlineError extends Error {
  readonly code: GetOutlineToolErrorCode

  constructor(code: GetOutlineToolErrorCode, message: string) {
    super(message)
    this.name = 'GetOutlineError'
    this.code = code
  }
}

/** typed error 判别（结构面宽松自证——跨序列化附载后仍可识别） */
export function isGetOutlineError(e: unknown): e is GetOutlineError {
  return (
    e instanceof GetOutlineError ||
    (typeof e === 'object' &&
      e !== null &&
      (e as { name?: unknown }).name === 'GetOutlineError' &&
      typeof (e as { code?: unknown }).code === 'string')
  )
}

/** agent 面参数 */
export interface GetOutlineToolArgs {
  readonly docRel: string
  readonly depth?: number
}

/** 参数防御性收窄（形状全在此一步——convertDocument 同法） */
export function parseGetOutlineArgs(args: unknown): GetOutlineToolArgs {
  const tool = GET_MD_OUTLINE
  if (typeof args !== 'object' || args === null) {
    throw new GetOutlineError('ERR_INVALID_ARGS', `${tool}: arguments must be an object`)
  }
  const a = args as Record<string, unknown>
  const docRel = a.docRel
  if (typeof docRel !== 'string' || docRel.trim() === '') {
    throw new GetOutlineError('ERR_INVALID_ARGS', `${tool}: docRel must be a non-empty string (path relative to the workspace root)`)
  }
  const depth = a.depth
  if (depth !== undefined) {
    if (typeof depth !== 'number' || !Number.isInteger(depth) || depth < 1 || depth > 6) {
      throw new GetOutlineError('ERR_INVALID_ARGS', `${tool}: depth must be an integer in [1, 6]`)
    }
  }
  return { docRel, ...(depth !== undefined ? { depth } : {}) }
}

/** 结果 → 模型可见文本（纯投影——树形缩进 + setext 显式标注按在场呈现） */
export function renderOutline(value: OutlineResult): readonly TextContentBlock[] {
  const lines: string[] = []
  const tree = renderOutlineTree(value.nodes)
  if (tree !== '') lines.push(tree)
  else lines.push('(empty document — no headings)')
  if (value.setextUnsupportedLines !== undefined) {
    lines.push(`! setext-style headings are not supported — underline lines: ${value.setextUnsupportedLines.join(', ')}`)
  }
  return [{ type: 'text', text: lines.join('\n') }]
}

/** 注册面输出 schema（成功值单支——失败走 tool-error，不进 schema 值域） */
const GET_OUTLINE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    nodes: {
      type: 'array',
      description: 'Nested heading tree (children in document order).',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          level: { type: 'integer', description: '1-6 (ATX # level).' },
          line: { type: 'integer', description: '1-based line anchor in the source document.' },
          children: { type: 'array', description: 'Nested child headings; empty array = leaf.' },
        },
        required: ['title', 'level', 'line', 'children'],
      },
    },
    setextUnsupportedLines: {
      type: 'array',
      description: 'Present only when setext-style (===/--- underline) headings were detected: their 1-based underline line numbers. Setext is explicitly unsupported — not silently skipped.',
      items: { type: 'integer' },
    },
  },
  required: ['nodes'],
} as const

/** 注册面依赖（注入点——fs 缝与诊断发射面；缺省 node:fs + console 按级兜底） */
export interface GetOutlineToolDeps {
  readonly fs?: ConvertFsSeam
  readonly emit?: DiagEmitter
}

/** 可选键 undefined 剔除（lossless JSON 整值边界——判例 223ba5b3 同径） */
function stripUndefined(value: OutlineResult): OutlineResult {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as unknown as OutlineResult
}

/** session.cwd 锚解析（convertDocument sessionCwdOf 同构——cwd 兼容位双读） */
function sessionCwdOf(exec: ToolExecFace | undefined): string | undefined {
  const session = exec?.agent?.session
  if (session === undefined) return undefined
  return session.header?.cwd ?? session.cwd
}

/** 路径穿越守卫（拒绝先于任何 IO——convertDocument assertRelUnderRoot 同构） */
function assertRelUnderRoot(rootAbs: string, rel: string): string {
  const tool = GET_MD_OUTLINE
  if (isAbsolute(rel) || /^(?:\\\\|\/)/.test(rel) || /^[A-Za-z]:[\\/]/.test(rel)) {
    throw new GetOutlineError('ERR_IO', `${tool}: docRel must be relative to the workspace root — absolute paths are rejected: ${rel}`)
  }
  if (rel.split(/[\\/]+/).includes('..')) {
    throw new GetOutlineError('ERR_IO', `${tool}: docRel must stay inside the workspace root — ".." path traversal is rejected: ${rel}`)
  }
  const abs = resolve(rootAbs, rel)
  const normRoot = rootAbs.endsWith(sep) ? rootAbs.slice(0, -1) : rootAbs
  if (abs !== normRoot && !abs.startsWith(normRoot + sep)) {
    throw new GetOutlineError('ERR_IO', `${tool}: docRel resolves outside the workspace root: ${rel}`)
  }
  return abs
}

/** tool 定义工厂 */
export function createGetOutlineTool(deps: GetOutlineToolDeps = {}): MermaidToolDefinition {
  const emit = deps.emit
  const failDiag = (message: string, extra: { docRel?: string; stack?: string }): void => {
    emitConvertDiag(emit, { level: 'error', event: MD_OUTLINE_FAIL_EVENT, message, process: 'main', ...extra })
  }
  return {
    name: GET_MD_OUTLINE,
    description:
      'Extract the heading outline (nested tree) of a markdown document in the workspace. ATX headings (# to ######) become a tree of { title, level, line, children } with 1-based line anchors; # lines inside ``` fenced code blocks are never mistaken for headings; setext-style (===/--- underline) headings are unsupported and explicitly reported, not silently skipped. Optional depth truncates the tree to that many levels.',
    parameters: {
      type: 'object',
      properties: {
        docRel: { type: 'string', description: 'Markdown document path relative to the workspace root (required).' },
        depth: { type: 'integer', description: 'Truncate the tree to this many heading levels (1-6); omit for full depth.' },
      },
      required: ['docRel'],
    },
    output: { schema: GET_OUTLINE_OUTPUT_SCHEMA, render: (_args, value) => renderOutline(value as OutlineResult) },
    async execute(args: unknown, exec?: ToolExecFace): Promise<OutlineResult> {
      const parsed = parseGetOutlineArgs(args)
      const cwd = sessionCwdOf(exec)
      if (cwd === undefined || cwd.trim() === '') {
        failDiag(`${GET_MD_OUTLINE}: no session workspace in this call context — the document path cannot be anchored`, { docRel: parsed.docRel })
        throw new GetOutlineError(
          'ERR_IO',
          `${GET_MD_OUTLINE}: no session workspace in this call context — the document path cannot be anchored to a workspace root`,
        )
      }
      try {
        const fs = deps.fs ?? defaultConvertFs
        const abs = assertRelUnderRoot(resolve(cwd), parsed.docRel)
        let doc: string
        try {
          doc = fs.readFile(abs).toString('utf8')
        } catch (e) {
          // 读取失败不按 errno 猜在性（validateMermaid 同径）——如实报不可读并附 errno
          const errno = (e as NodeJS.ErrnoException).code
          throw new GetOutlineError(
            'ERR_INVALID_ARGS',
            `${GET_MD_OUTLINE}: cannot read document: ${parsed.docRel} — not found or not readable (check the path relative to the workspace root${errno !== undefined ? `; errno ${errno}` : ''})`,
          )
        }
        const result = parseMarkdownOutline(doc, parsed.depth !== undefined ? { depth: parsed.depth } : {})
        emitConvertDiag(emit, {
          level: 'info',
          event: MD_OUTLINE_EVENT,
          message: `outline extracted: ${parsed.docRel} (${countNodes(result.nodes)} headings)`,
          process: 'main',
          cwd,
          docRel: parsed.docRel,
        })
        return stripUndefined(result)
      } catch (e) {
        if (isGetOutlineError(e)) {
          failDiag(`${GET_MD_OUTLINE}: ${e.code} — ${e.message}`, {
            docRel: parsed.docRel,
            stack: e instanceof Error ? e.stack : undefined,
          })
          throw e
        }
        // typed error 归一：解析层意外错误不裸抛（tool-error 语义单点承载）
        throw new GetOutlineError('ERR_IO', `${GET_MD_OUTLINE}: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
  }
}

/** 叶节点计数（成功埋点消息用） */
function countNodes(nodes: readonly OutlineNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0)
}

/** md-outline 域埋点事件名（diag 前缀单源） */
export const MD_OUTLINE_EVENT = 'md-outline'
export const MD_OUTLINE_FAIL_EVENT = 'md-outline-fail'
