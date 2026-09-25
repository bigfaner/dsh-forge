// workbench/knowledge/knowledge-error — 知识系/feature 读域错误 + 路径授权(任务 2.2)。
//
// 错误封装形态与 WorkbenchRepoError 同构(code 满足 handlers.ts
// DOMAIN_CODE_PATTERN 即同码透传封装);码表:
//   ERR_PROJECT_NOT_FOUND         未注册项目(AC2:读操作对未注册项目明确提示)
//   ERR_KNOWLEDGE_PATH_INVALID    写目标段形态非法(路径分隔/控制字符/空)
//   ERR_KNOWLEDGE_PATH_OUT_OF_BOUNDS 越界(解析后逃出授权基目录;AC2 越界拒绝)
//   ERR_KNOWLEDGE_ENTRY_EXISTS    add 撞既有条目(不覆写,写路径克制)
//   ERR_KNOWLEDGE_ENTRY_NOT_FOUND get/list 单读未命中
//   ERR_KNOWLEDGE_TABLE_CORRUPT   .forge/fact-table.json JSON 损坏(Go CorruptError)
//   ERR_KNOWLEDGE_INPUT_INVALID   条目校验失败(词表/必填;Go FactEntry.Validate 语义)
//   ERR_FORENSIC_SOURCE_UNREADABLE forensic 只读源不可读(history/transcript/subagents)
//   ERR_FEATURE_NOT_FOUND         feature 目录不存在(Go ErrFeatureNotFound)
//
// 路径授权(Hard Rule:写操作仅落文档根授权路径):
//   - lesson/research 写 → 文档根 = (docLocationPath ?? codeRoot)/docs 之下
//     的 lessons/ / research/(M2 注册链授权面:仓内 = codeRoot,仓外 =
//     显式授权的 docLocationPath);
//   - fact 写 → codeRoot/.forge/fact-table.json(forge 数据模型权威位置,
//     codeRoot 即注册授权根;forge-detect 探测点同源);
//   - 段校验(单段、禁路径分隔/控制字符)+ 解析后包含性复核 = 双闸。

import { isAbsolute, resolve, sep } from 'node:path'

/** 知识系/feature 读域错误(code 同码透传 IPC 封装)。 */
export class KnowledgeDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly detail?: string,
  ) {
    super(message)
    this.name = 'KnowledgeDomainError'
  }
}

/**
 * 单段路径片段判定(与 task 工具面 isSegment 同规则):非空、无 `/`、无
 * `\`、无 C0/DEL 控制字符。lesson 名/research slug/featureSlug 共用。
 */
export function isKnowledgeSegment(segment: string): boolean {
  if (segment === '') return false
  for (const ch of segment) {
    const code = ch.codePointAt(0)
    if (code === undefined) return false
    if (code <= 0x1f || code === 0x7f) return false
    if (ch === '/' || ch === '\\') return false
  }
  return true
}

/** 写目标段断言(违例 → ERR_KNOWLEDGE_PATH_INVALID,消息含原词)。 */
export function assertSegment(kind: string, segment: string): void {
  if (!isKnowledgeSegment(segment)) {
    throw new KnowledgeDomainError(
      'ERR_KNOWLEDGE_PATH_INVALID',
      `${kind} ${JSON.stringify(segment)} must be a single non-empty path segment (no '/', no path separators or control characters)`,
    )
  }
}

/**
 * 越界拒绝(AC2):目标必须落在授权基目录内。解析为绝对路径后做包含性
 * 复核 —— 段校验已排除分隔符,这里是纵深防御(防拼接/规范化逃逸);
 * 绝对路径入参同样在此被折出局(join 的第二参为绝对路径时 Windows 会
 * 丢弃基目录 → 包含性必然失败)。
 */
export function assertInsideBase(base: string, target: string, what: string): string {
  const resolvedBase = resolve(base)
  const resolvedTarget = resolve(resolvedBase, target)
  const prefix = resolvedBase.endsWith(sep) ? resolvedBase : resolvedBase + sep
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(prefix)) {
    throw new KnowledgeDomainError(
      'ERR_KNOWLEDGE_PATH_OUT_OF_BOUNDS',
      `${what} must stay inside the authorized knowledge root ${resolvedBase} (got ${resolvedTarget})`,
    )
  }
  return resolvedTarget
}

/** 绝对路径入参的预拒绝(join 前置:绝对段会把基目录整个顶掉)。 */
export function assertRelativeSegment(target: string, what: string): void {
  if (isAbsolute(target)) {
    throw new KnowledgeDomainError(
      'ERR_KNOWLEDGE_PATH_OUT_OF_BOUNDS',
      `${what} must be a relative name under the authorized knowledge root (got absolute path ${target})`,
    )
  }
}
