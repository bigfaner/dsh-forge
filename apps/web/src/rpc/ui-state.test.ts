// 2.4 AC5——错误码 → UI 状态映射：全码穷举 + 三态口径（空态/错误条/横幅）。
// 1.1（M2）扩池：15 新码先行落通用错误条兜底层（tech-design Propagation Strategy
// 「未映射码 → 通用错误条兜底」；按码精化归 3.1）。
import { describe, expect, it } from 'vitest'
import { ERROR_CODES } from '@dsh-forge/contracts'
import { RPC_UI_STATE_BY_CODE, rpcUiState, type RpcUiStateKind } from './ui-state.js'

const EXPECTED: Record<(typeof ERROR_CODES)[number], RpcUiStateKind> = {
  ERR_WORKSPACE_CREATE: 'error-bar',
  ERR_PROJECT_WRITE: 'error-bar',
  ERR_COMPENSATION: 'banner',
  ERR_ENTRY_NOT_FOUND: 'empty-state',
  ERR_INDEX_STALE: 'empty-state',
  ERR_INVALID_KNOWLEDGE_DIR: 'empty-state',
  // M2 15 新码（1.1 承接）：通用错误条兜底层——按码精化归 3.1
  ERR_TASK_NOT_FOUND: 'error-bar',
  ERR_INVALID_TRANSITION: 'error-bar',
  ERR_DEPENDENCIES_UNMET: 'error-bar',
  ERR_CYCLE_DETECTED: 'error-bar',
  ERR_CHAIN_DEPTH_EXCEEDED: 'error-bar',
  ERR_REASON_REQUIRED: 'error-bar',
  ERR_SUMMARY_REQUIRED: 'error-bar',
  ERR_TASK_EXISTS: 'error-bar',
  ERR_FEATURE_NOT_FOUND: 'error-bar',
  ERR_FEATURE_EXISTS: 'error-bar',
  ERR_PROPOSAL_NOT_FOUND: 'error-bar',
  ERR_WORKSPACE_NOT_REGISTERED: 'error-bar',
  ERR_WORKSPACE_DB_UNAVAILABLE: 'error-bar',
  ERR_SUSPECTED_MOVE: 'error-bar',
  ERR_DOC_PATH_INVALID: 'error-bar',
}

describe('rpcUiState（UI 按 code 映射状态的最简消费约定）', () => {
  it('contracts 全码逐码映射符合约定表', () => {
    for (const code of ERROR_CODES) {
      expect(rpcUiState(code)).toBe(EXPECTED[code])
    }
  })

  it('全码穷举：每个 ERROR_CODES 成员都在约定表中（增码即红）', () => {
    expect(Object.keys(RPC_UI_STATE_BY_CODE).sort()).toEqual([...ERROR_CODES].sort())
  })

  it('三态口径封闭：映射值 ∈ { error-bar, banner, empty-state }', () => {
    for (const kind of Object.values(RPC_UI_STATE_BY_CODE)) {
      expect(['error-bar', 'banner', 'empty-state']).toContain(kind)
    }
  })
})
