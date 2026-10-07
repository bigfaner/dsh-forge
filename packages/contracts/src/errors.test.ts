// 1.3 AC1 —— 六错误码 typed 定义 pin（tech-design §Error Handling「Error Types & Codes」表逐行对照）。
// fix-34：ERROR_NAMES/ErrorCodeNameMap 零生产消费已删——Name 列降格为 errors.ts 行尾文档性映射，
// 本文件只 pin code 面（行序/语义），名映射不再有运行期形状可断言。
// 1.1（M2）增补：扩池 15 新码（M2 Error Handling 表逐行）+ 三码 data 载荷形状 pin。
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  type CycleDetectedData,
  type DependenciesUnmetData,
  ERROR_CODES,
  type SuspectedMoveData,
  type TestEvidenceRequiredData,
  type UnmetDependency,
} from './errors.js'

// Error Handling 表本体（code ｜ Name 两列；行序 = 表行序——Name 列为文档性对照）
const ERROR_TABLE = [
  ['ERR_WORKSPACE_CREATE', 'WorkspaceCreateError'],
  ['ERR_PROJECT_WRITE', 'ProjectWriteError'],
  ['ERR_COMPENSATION', 'CompensationError'],
  ['ERR_ENTRY_NOT_FOUND', 'EntryNotFoundError'],
  ['ERR_INDEX_STALE', 'IndexStaleError'],
  ['ERR_INVALID_KNOWLEDGE_DIR', 'InvalidKnowledgeDirError'],
] as const

// M2 Error Handling 表（15 新码；行序 = 表行序）
const M2_ERROR_TABLE = [
  ['ERR_TASK_NOT_FOUND', 'TaskNotFoundError'],
  ['ERR_INVALID_TRANSITION', 'InvalidTransitionError'],
  ['ERR_DEPENDENCIES_UNMET', 'DependenciesUnmetError'],
  ['ERR_CYCLE_DETECTED', 'CycleDetectedError'],
  ['ERR_CHAIN_DEPTH_EXCEEDED', 'ChainDepthExceededError'],
  ['ERR_REASON_REQUIRED', 'ReasonRequiredError'],
  ['ERR_SUMMARY_REQUIRED', 'SummaryRequiredError'],
  ['ERR_TASK_EXISTS', 'TaskExistsError'],
  ['ERR_FEATURE_NOT_FOUND', 'FeatureNotFoundError'],
  ['ERR_FEATURE_EXISTS', 'FeatureExistsError'],
  ['ERR_PROPOSAL_NOT_FOUND', 'ProposalNotFoundError'],
  ['ERR_WORKSPACE_NOT_REGISTERED', 'WorkspaceNotRegisteredError'],
  ['ERR_WORKSPACE_DB_UNAVAILABLE', 'WorkspaceDbUnavailableError'],
  ['ERR_SUSPECTED_MOVE', 'SuspectedMoveError'],
  ['ERR_DOC_PATH_INVALID', 'DocPathInvalidError'],
] as const

// M3 Interface 6 表（3 新码；行序 = 表行序）
const M3_ERROR_TABLE = [
  ['ERR_TEST_EVIDENCE_REQUIRED', 'TestEvidenceRequiredError'],
  ['ERR_GATE_SUMMARY_REQUIRED', 'GateSummaryRequiredError'],
  ['ERR_SPAWN_FAILED', 'SpawnFailedError'],
] as const

describe('AC1 六错误码与 Error Handling 表一致（P1 面不动）', () => {
  it('ERROR_CODES 前六码齐备且行序与表一致', () => {
    expect([...ERROR_CODES].slice(0, 6)).toEqual(ERROR_TABLE.map(([code]) => code))
  })
})

describe('AC3 errors.ts 扩池 15 新码（M2 表逐条一致）', () => {
  it('M2 段十五码：P1 六码前缀不动 + 行序一致（M3 三码随 AC5 段续后）', () => {
    expect([...ERROR_CODES].slice(6, 21)).toEqual(M2_ERROR_TABLE.map(([code]) => code))
    expect([...ERROR_CODES].slice(0, 6)).toEqual(ERROR_TABLE.map(([code]) => code))
  })

  it('新码命名一律 ERR_ 前缀（与 P1 面同构）', () => {
    for (const code of ERROR_CODES.slice(6)) {
      expect(code.startsWith('ERR_')).toBe(true)
    }
  })
})

describe('AC5 errors.ts 扩池 3 新码（M3 Interface 6 表逐条一致）', () => {
  it('ERROR_CODES = 24 码：P1 六码 + M2 十五码前缀不动 + M3 三码行序一致', () => {
    expect([...ERROR_CODES]).toHaveLength(24)
    expect([...ERROR_CODES].slice(21)).toEqual(M3_ERROR_TABLE.map(([code]) => code))
    expect(new Set(ERROR_CODES).size).toBe(24)
  })

  it('M3 新码命名一律 ERR_ 前缀（与 P1/M2 面同构）', () => {
    for (const code of ERROR_CODES.slice(21)) {
      expect(code.startsWith('ERR_')).toBe(true)
    }
  })

  it('ERR_TEST_EVIDENCE_REQUIRED data = AC 清单（submitTask 证据门判据原样带回）', () => {
    const sample: TestEvidenceRequiredData = { acceptanceCriteria: ['[AC-1] 通道常量齐备', '[AC-2] allowlist 一致'] }
    expect(sample.acceptanceCriteria).toHaveLength(2)
    expectTypeOf<TestEvidenceRequiredData['acceptanceCriteria']>().toMatchTypeOf<readonly string[]>()
  })
})

describe('AC3 三码 data 载荷形状（Implementation Notes：未满足清单 / 环路径 / 手工指引）', () => {
  it('ERR_DEPENDENCIES_UNMET data = 未满足清单（自然键 + 当前状态）', () => {
    const sample: DependenciesUnmetData = {
      unmet: [
        { slug: 'dsh-forge-m2-pipeline', localId: '1.1', taskStatus: 'pending' },
        { slug: 'dsh-forge-m2-pipeline', localId: '1.2', taskStatus: 'blocked' },
      ],
    }
    expect(sample.unmet).toHaveLength(2)
    expectTypeOf<UnmetDependency>().toHaveProperty('taskStatus')
    expectTypeOf<UnmetDependency>().toHaveProperty('slug')
    expectTypeOf<UnmetDependency>().toHaveProperty('localId')
  })

  it('ERR_CYCLE_DETECTED data = 完整环路径（有序节点列，首尾相接）', () => {
    const sample: CycleDetectedData = { cycle: ['m2/2.2', 'm2/T', 'm2/2.4', 'm2/2.2'] }
    expect(sample.cycle.at(0)).toBe(sample.cycle.at(-1))
    expectTypeOf<CycleDetectedData['cycle']>().toMatchTypeOf<readonly string[]>()
  })

  it('ERR_SUSPECTED_MOVE data = 手工指引 + 同主体异 hash8 目录对', () => {
    const sample: SuspectedMoveData = {
      existingDir: 'Z:/forge-workspaces/ws@a1b2c3d4',
      derivedDir: 'Z:/forge-workspaces/ws@e5f6a7b8',
      guidance: '删孤儿目录或改回原名（认领对话框 = M3）',
    }
    expect(sample.guidance.length).toBeGreaterThan(0)
    expectTypeOf<SuspectedMoveData>().toHaveProperty('guidance')
    expectTypeOf<SuspectedMoveData>().toHaveProperty('existingDir')
    expectTypeOf<SuspectedMoveData>().toHaveProperty('derivedDir')
  })
})
