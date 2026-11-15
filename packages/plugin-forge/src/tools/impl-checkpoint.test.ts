// 机械⑥ impl-checkpoint 三工具单测（forge-verification-hardening）：record 落标记行
// （参数映射 + 快照缺省零）/ query 时序查 + 标记过滤 + 四项硬指标 / list 跨容器清单。
// 面 = ① 检查点域薄封装——桩 face 捕获入参，业务规则归域（本壳不重验）。
import { describe, expect, it } from 'vitest'
import type { ToolExecFace } from '../faces.js'
import {
  computeCheckpointMetrics,
  createListImplCheckpointsTool,
  createQueryImplCheckpointTool,
  createRecordImplCheckpointTool,
  parseListImplCheckpointsArgs,
  parseQueryImplCheckpointArgs,
  parseRecordImplCheckpointArgs,
  type CheckpointRow,
  type ForgeCheckpointsToolFace,
} from './impl-checkpoint.js'
import type { ForgeToolDeps } from './index.js'

const EXEC: ToolExecFace = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

function row(overrides: Partial<CheckpointRow> & { id: string }): CheckpointRow {
  return {
    projectKey: 'proj-1',
    slug: 'forge-x',
    mark: 'first-pass-complete',
    createdAt: '2026-10-24T00:00:00.000Z',
    baseCommitHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    tasksTotal: 4,
    commitsTotal: 4,
    fixesTotal: 0,
    evidenceDebtsTotal: 0,
    ...overrides,
  }
}

function depsWithFace(
  face: Omit<ForgeCheckpointsToolFace, 'ensureCheckpoint'> & Partial<Pick<ForgeCheckpointsToolFace, 'ensureCheckpoint'>>,
  tasks?: ForgeToolDeps['tasks'],
): ForgeToolDeps {
  return {
    tasks:
      tasks ??
      ({
        listTasks: async () => {
          throw new Error('not used')
        },
      } as unknown as ForgeToolDeps['tasks']),
    bugs: {} as ForgeToolDeps['bugs'],
    checkpoints: {
      ...face,
      ensureCheckpoint:
        face.ensureCheckpoint ??
        (async () => {
          throw new Error('not used')
        }),
    },
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'proj-1' : undefined),
  }
}

describe('参数防御收窄', () => {
  it('record：四参 AC 形状齐备；wave_seq/快照可选；词表外 mark 拒；必填缺席拒', () => {
    expect(
      parseRecordImplCheckpointArgs({
        slug: 'forge-x',
        mark: 'review-wave-N',
        wave_seq: 2,
        base_commit_hash: 'abc',
        snapshots: { tasksTotal: 3, commitsTotal: 5, fixesTotal: 1, evidenceDebtsTotal: 1 },
      }),
    ).toEqual({
      slug: 'forge-x',
      mark: 'review-wave-N',
      wave_seq: 2,
      base_commit_hash: 'abc',
      snapshots: { tasksTotal: 3, commitsTotal: 5, fixesTotal: 1, evidenceDebtsTotal: 1 },
    })
    expect(parseRecordImplCheckpointArgs({ slug: 'p', mark: 'merged', base_commit_hash: 'h' })).toEqual({
      slug: 'p',
      mark: 'merged',
      base_commit_hash: 'h',
    })
    expect(() => parseRecordImplCheckpointArgs({ slug: 'p', mark: 'nope', base_commit_hash: 'h' })).toThrow(
      /mark must be one of/,
    )
    expect(() => parseRecordImplCheckpointArgs({ mark: 'merged', base_commit_hash: 'h' })).toThrow(/slug/)
    expect(() => parseRecordImplCheckpointArgs({ slug: 'p', mark: 'merged', wave_seq: 0, base_commit_hash: 'h' })).toThrow(
      /wave_seq must be a positive integer/,
    )
  })

  it('query：slug 必带；marks 词表过滤；词表外元素拒', () => {
    expect(parseQueryImplCheckpointArgs({ slug: 'p', marks: ['merged', 'stabilized'] })).toEqual({
      slug: 'p',
      marks: ['merged', 'stabilized'],
    })
    expect(parseQueryImplCheckpointArgs({ slug: 'p' })).toEqual({ slug: 'p' })
    expect(() => parseQueryImplCheckpointArgs({ slug: 'p', marks: ['done'] })).toThrow(/marks must only contain/)
    expect(() => parseQueryImplCheckpointArgs({})).toThrow(/slug/)
  })

  it('list：mark 过滤可选——词表外元素拒；非对象根拒', () => {
    expect(parseListImplCheckpointsArgs({})).toEqual({})
    expect(parseListImplCheckpointsArgs({ marks: ['merged'] })).toEqual({ marks: ['merged'] })
    expect(() => parseListImplCheckpointsArgs({ marks: ['nope'] })).toThrow(/marks must only contain/)
    expect(() => parseListImplCheckpointsArgs(null)).toThrow(/arguments must be an object/)
  })
})

describe('recordImplCheckpoint execute（落标记行——路由映射）', () => {
  it('cwd → projectKey；四参直透域入参（快照缺省零；键缺席式）', async () => {
    const captured: Array<Record<string, unknown>> = []
    const deps = depsWithFace({
      appendCheckpoint: async (input) => {
        captured.push(input as Record<string, unknown>)
        return row({ id: 'cp-7', mark: 'merged', tasksTotal: 6, commitsTotal: 9, fixesTotal: 2, evidenceDebtsTotal: 1 })
      },
      listCheckpoints: async () => {
        throw new Error('not used')
      },
    })
    const tool = createRecordImplCheckpointTool(deps)
    const result = await tool.execute({ slug: 'forge-x', mark: 'merged', base_commit_hash: 'deadbeef' }, EXEC)
    expect(captured[0]).toEqual({
      projectKey: 'proj-1',
      containerSlug: 'forge-x',
      mark: 'merged',
      baseCommitHash: 'deadbeef',
      snapshots: { tasksTotal: 0, commitsTotal: 0, fixesTotal: 0, evidenceDebtsTotal: 0 },
    })
    expect(result).toMatchObject({ checkpoint: { id: 'cp-7', mark: 'merged' } })
    const rendered = tool.output?.render?.({}, result)
    expect((rendered as { type: string; text: string }[])[0]!.text).toContain('✓ checkpoint recorded')
  })

  it('review-wave-N 携带 wave_seq 直透；域唯一约束命中 → 失败 DTO', async () => {
    const deps = depsWithFace({
      appendCheckpoint: async () => {
        throw Object.assign(new Error('检查点已存在'), { code: 'ERR_CHECKPOINT_ALREADY_EXISTS' })
      },
      listCheckpoints: async () => [],
    })
    const tool = createRecordImplCheckpointTool(deps)
    const result = await tool.execute({ slug: 'p', mark: 'review-wave-N', wave_seq: 3, base_commit_hash: 'h' }, EXEC)
    expect(result).toMatchObject({ ok: false, code: 'ERR_CHECKPOINT_ALREADY_EXISTS' })
  })
})

describe('queryImplCheckpoint execute（时序查 + 过滤 + 四项硬指标）', () => {
  it('slug/marks 直透查询；返回时序流水 + metrics 投影', async () => {
    const captured: Array<Record<string, unknown>> = []
    const deps = depsWithFace({
      appendCheckpoint: async () => {
        throw new Error('not used')
      },
      listCheckpoints: async (q) => {
        captured.push(q as Record<string, unknown>)
        return [
          row({ id: 'cp-1', tasksTotal: 4, commitsTotal: 4, fixesTotal: 0 }),
          row({ id: 'cp-2', mark: 'review-wave-N', waveSeq: 1, createdAt: '2026-10-25T00:00:00.000Z', tasksTotal: 6, commitsTotal: 7, fixesTotal: 2 }),
          row({ id: 'cp-3', mark: 'merged', createdAt: '2026-10-26T00:00:00.000Z', tasksTotal: 8, commitsTotal: 12, fixesTotal: 3, evidenceDebtsTotal: 1 }),
        ]
      },
    })
    const tool = createQueryImplCheckpointTool(deps)
    const result = (await tool.execute({ slug: 'forge-x', marks: ['merged'] }, EXEC)) as {
      checkpoints: CheckpointRow[]
      metrics: ReturnType<typeof computeCheckpointMetrics>
    }
    expect(captured[0]).toEqual({ projectKey: 'proj-1', slug: 'forge-x', marks: ['merged'] })
    expect(result.checkpoints).toHaveLength(3)
    // 四项硬指标：firstPassRate=4/8；reworkCommitRatio=(12−4)/12；reviewWaveCount=1；fixDensity=3/8
    expect(result.metrics).toEqual({
      firstPassRate: 0.5,
      reworkCommitRatio: 8 / 12,
      reviewWaveCount: 1,
      fixDensity: 3 / 8,
    })
  })

  it('空流水：metrics 仅 reviewWaveCount=0（缺帧项键缺席）；渲染 ✓ 计数', async () => {
    const deps = depsWithFace({
      appendCheckpoint: async () => {
        throw new Error('not used')
      },
      listCheckpoints: async () => [],
    })
    const tool = createQueryImplCheckpointTool(deps)
    const result = (await tool.execute({ slug: 'p' }, EXEC)) as { metrics: Record<string, unknown> }
    expect(result.metrics).toEqual({ reviewWaveCount: 0 })
    const rendered = tool.output?.render?.({}, result)
    expect((rendered as { type: string; text: string }[])[0]!.text).toContain('✓ 0 checkpoint(s)')
  })
})

describe('listImplCheckpoints execute（跨容器清单）', () => {
  it('任务域枚举容器 × 逐容器流水组合——行自带容器 slug 注记', async () => {
    const tasks = {
      listTasks: async () => [
        { slug: 'alpha' },
        { slug: 'alpha' },
        { slug: 'beta' },
      ],
    } as unknown as ForgeToolDeps['tasks']
    const queried: string[] = []
    const deps = depsWithFace(
      {
        appendCheckpoint: async () => {
          throw new Error('not used')
        },
        listCheckpoints: async (q) => {
          queried.push(q.slug)
          return q.slug === 'alpha' ? [row({ id: 'cp-1', slug: 'alpha' }), row({ id: 'cp-2', mark: 'merged', slug: 'alpha' })] : []
        },
      },
      tasks,
    )
    const tool = createListImplCheckpointsTool(deps)
    const result = (await tool.execute({}, EXEC)) as { checkpoints: Array<{ slug: string; mark: string }> }
    expect(queried).toEqual(['alpha', 'beta'])
    expect(result.checkpoints).toEqual([
      expect.objectContaining({ id: 'cp-1', slug: 'alpha', mark: 'first-pass-complete' }),
      expect.objectContaining({ id: 'cp-2', slug: 'alpha', mark: 'merged' }),
    ])
    const rendered = tool.output?.render?.({}, result)
    expect((rendered as { type: string; text: string }[])[0]!.text).toContain('✓ 2 checkpoint(s) across containers')
  })
})

describe('computeCheckpointMetrics（四项硬指标纯投影）', () => {
  it('缺 first-pass 帧 → 相关比率项键缺席；分母零 → 键缺席', () => {
    expect(computeCheckpointMetrics([row({ id: 'cp-1', mark: 'retro-done' })])).toEqual({ reviewWaveCount: 0, fixDensity: 0 })
    expect(
      computeCheckpointMetrics([row({ id: 'cp-1' }), row({ id: 'cp-2', mark: 'merged', tasksTotal: 0, commitsTotal: 0 })]),
    ).toEqual({ reviewWaveCount: 0 })
  })
})
