// 1.3 AC1 —— 六错误码 typed 定义 pin（tech-design §Error Handling「Error Types & Codes」表逐行对照）。
import { describe, expect, it } from 'vitest'
import { ERROR_CODES, ERROR_NAMES } from './errors.js'

// Error Handling 表本体（code ｜ Name 两列；行序 = 表行序）
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

  it('code → typed error 名映射与表 Name 列一致', () => {
    expect(ERROR_NAMES).toEqual({
      ERR_WORKSPACE_CREATE: 'WorkspaceCreateError',
      ERR_PROJECT_WRITE: 'ProjectWriteError',
      ERR_COMPENSATION: 'CompensationError',
      ERR_ENTRY_NOT_FOUND: 'EntryNotFoundError',
      ERR_INDEX_STALE: 'IndexStaleError',
      ERR_INVALID_KNOWLEDGE_DIR: 'InvalidKnowledgeDirError',
    })
  })

  it('映射键域与码集一致（无多无漏）', () => {
    expect(Object.keys(ERROR_NAMES).sort()).toEqual([...ERROR_CODES].sort())
  })
})
