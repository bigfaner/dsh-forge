// 1.3 AC1 —— 六错误码 typed 定义 pin（tech-design §Error Handling「Error Types & Codes」表逐行对照）。
// fix-34：ERROR_NAMES/ErrorCodeNameMap 零生产消费已删——Name 列降格为 errors.ts 行尾文档性映射，
// 本文件只 pin code 面（行序/语义），名映射不再有运行期形状可断言。
import { describe, expect, it } from 'vitest'
import { ERROR_CODES } from './errors.js'

// Error Handling 表本体（code ｜ Name 两列；行序 = 表行序——Name 列为文档性对照）
const ERROR_TABLE = [
  ['ERR_WORKSPACE_CREATE', 'WorkspaceCreateError'],
  ['ERR_PROJECT_WRITE', 'ProjectWriteError'],
  ['ERR_COMPENSATION', 'CompensationError'],
  ['ERR_ENTRY_NOT_FOUND', 'EntryNotFoundError'],
  ['ERR_INDEX_STALE', 'IndexStaleError'],
  ['ERR_INVALID_KNOWLEDGE_DIR', 'InvalidKnowledgeDirError'],
] as const

describe('AC1 六错误码与 Error Handling 表一致', () => {
  it('ERROR_CODES 六码齐备且行序与表一致', () => {
    expect([...ERROR_CODES]).toEqual(ERROR_TABLE.map(([code]) => code))
    expect(ERROR_CODES).toHaveLength(6)
  })
})
