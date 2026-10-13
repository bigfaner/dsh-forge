// 3.5 单测 —— 提案域两 tool（createProposal / transitionProposal）：词表收窄 +
// projectId 路由 + 映射（mode 透传 + 会话预设自动填充 / superseded_by 透传）+
// 双友好返回面渲染（formatOk：身份与名称分离 proposalId 锚 + mode/supersededBy/成链行；
// typed 错误 → 失败 DTO formatErr）。superseded 必带校验经服务 2.2（tool 面纯透传）。
import { describe, expect, it } from 'vitest'
import type {
  CreateProposalInput,
  ForgeProposalsService,
  ProposalRow,
  TransitionProposalInput,
} from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import { createCreateProposalTool, parseCreateProposalArgs, presetModeOf } from './create-proposal.js'
import { createTransitionProposalTool, parseTransitionProposalArgs } from './transition-proposal.js'
import type { ForgeToolDeps } from './index.js'

const EXEC: ToolExecFace = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

/** 带出生预设 id 的 exec（header.agentPreset——出生头回退源夹具；当前值径见 selected 事件回归用例） */
function execWithPreset(agentPreset: string): ToolExecFace {
  return { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo', agentPreset } } } }
}

const row: ProposalRow = {
  proposalId: 'pr-1',
  slug: 'idea',
  title: '提案标题',
  proposalStatus: 'draft',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function depsWithCapture() {
  const created: CreateProposalInput[] = []
  const transitioned: TransitionProposalInput[] = []
  const proposals = {
    createProposal: async (input: CreateProposalInput) => {
      created.push(input)
      return { ...row, mode: input.mode }
    },
    transitionProposal: async (input: TransitionProposalInput) => {
      transitioned.push(input)
      return { ...row, proposalStatus: input.toStatus, decidedAt: '2026-01-02T00:00:00.000Z' }
    },
  } as unknown as ForgeProposalsService
  const deps: ForgeToolDeps = {
    tasks: {} as ForgeToolDeps['tasks'],
    proposals,
    bugs: {} as ForgeToolDeps['bugs'],
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
  }
  return { deps, created, transitioned }
}

describe('createProposal', () => {
  it('parse：slug/title 必填；status/mode 词表收窄；rel_path 可选', () => {
    expect(parseCreateProposalArgs({ slug: 'idea', title: 'T' })).toEqual({ slug: 'idea', title: 'T' })
    expect(() => parseCreateProposalArgs({ slug: 'idea', title: 'T', status: 'approved' })).toThrow(
      /status must be one of/,
    )
    expect(() => parseCreateProposalArgs({ slug: 'idea', title: 'T', mode: 'epic' })).toThrow(/mode must be one of/)
    expect(parseCreateProposalArgs({ slug: 'idea', title: 'T', rel_path: 'proposals/idea/proposal.md' })).toMatchObject({
      rel_path: 'proposals/idea/proposal.md',
    })
  })

  it('mode 透传（M3 溯源——显式参优先）：expedition/blitz 两态映射', async () => {
    const { deps, created } = depsWithCapture()
    const tool = createCreateProposalTool(deps)
    await tool.execute({ slug: 'idea', title: 'T', mode: 'blitz' }, EXEC)
    await tool.execute(
      { slug: 'idea2', title: 'T2', mode: 'expedition', rel_path: 'proposals/idea2/proposal.md', status: 'under-review' },
      EXEC,
    )
    expect(created).toEqual([
      { projectId: 'p-1', slug: 'idea', title: 'T', mode: 'blitz' },
      {
        projectId: 'p-1',
        slug: 'idea2',
        title: 'T2',
        mode: 'expedition',
        relPath: 'proposals/idea2/proposal.md',
        status: 'under-review',
      },
    ])
  })

  it('mode 缺省 → 按会话当前预设自动填充（出生头——未切换会话的回退源）', async () => {
    const { deps, created } = depsWithCapture()
    const tool = createCreateProposalTool(deps)
    await tool.execute({ slug: 'exp-1', title: 'T' }, execWithPreset('expedition'))
    await tool.execute({ slug: 'blz-1', title: 'T' }, execWithPreset('blitz'))
    expect(created.map((i) => [i.slug, i.mode])).toEqual([
      ['exp-1', 'expedition'],
      ['blz-1', 'blitz'],
    ])
  })

  it('mode 缺省自动填充读当前预设：出生头 expedition + selected 事件 blitz → blitz（2026-10-11 实机 incident 回归——出生头冻结不随切换更新）', async () => {
    const { deps, created } = depsWithCapture()
    const tool = createCreateProposalTool(deps)
    const exec: ToolExecFace = {
      agent: {
        session: {
          id: 'sess-1',
          header: { cwd: 'C:\\ws\\demo', agentPreset: 'expedition' },
          snapshotEvents: () => [{ type: 'agent-preset/selected', data: { agentPreset: 'blitz' } }],
        },
      },
    }
    await tool.execute({ slug: 'blz-2', title: 'T' }, exec)
    expect(created[0]?.mode).toBe('blitz')
  })

  it('显式 mode 优先于会话预设（跨容器提案——override 仍可达）', async () => {
    const { deps, created } = depsWithCapture()
    const tool = createCreateProposalTool(deps)
    await tool.execute({ slug: 'x', title: 'T', mode: 'expedition' }, execWithPreset('blitz'))
    expect(created[0]?.mode).toBe('expedition')
  })

  it('预设缺席或词表外值（自定义预设）→ 不填充（NULL 占位——成链门按 NULL 边界）', async () => {
    const { deps, created } = depsWithCapture()
    const tool = createCreateProposalTool(deps)
    await tool.execute({ slug: 'n1', title: 'T' }, EXEC) // 无预设会话
    await tool.execute({ slug: 'n2', title: 'T' }, execWithPreset('cordis-default')) // 词表外
    expect(created.map((i) => 'mode' in i)).toEqual([false, false])
    expect(presetModeOf(undefined)).toBeUndefined()
    expect(presetModeOf('cordis-default')).toBeUndefined()
    expect(presetModeOf('expedition')).toBe('expedition')
    expect(presetModeOf('blitz')).toBe('blitz')
  })

  it('cwd 未命中 → 失败 DTO（ERR_WORKSPACE_NOT_REGISTERED——formatErr 面）', async () => {
    const { deps } = depsWithCapture()
    const tool = createCreateProposalTool(deps)
    const out = await tool.execute(
      { slug: 'a', title: 'T' },
      { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\x' } } } },
    )
    expect(out).toMatchObject({ ok: false, code: 'ERR_WORKSPACE_NOT_REGISTERED' })
  })

  it('返回面渲染（formatOk）：首行 ✓ registered + proposalId/title/mode/doc 键值行', () => {
    const { deps } = depsWithCapture()
    const tool = createCreateProposalTool(deps)
    const text = tool.output.render({}, { ...row, relPath: 'p.md', mode: 'blitz' })[0]?.text ?? ''
    expect(text).toBe(
      '✓ Proposal idea registered [draft]\n- proposalId: pr-1\n- title: 提案标题\n- mode: blitz\n- doc: p.md',
    )
  })
})

describe('transitionProposal', () => {
  it('parse：proposal_id 必填；to_status 词表收窄；superseded_by 可选', () => {
    expect(parseTransitionProposalArgs({ proposal_id: 'pr-1', to_status: 'accepted' })).toEqual({
      proposal_id: 'pr-1',
      to_status: 'accepted',
    })
    expect(() => parseTransitionProposalArgs({ proposal_id: 'pr-1', to_status: 'done' })).toThrow(
      /to_status must be one of/,
    )
    expect(() => parseTransitionProposalArgs({ to_status: 'accepted' })).toThrow(/proposal_id/)
    expect(
      parseTransitionProposalArgs({ proposal_id: 'pr-1', to_status: 'superseded', superseded_by: 'pr-2' }),
    ).toEqual({ proposal_id: 'pr-1', to_status: 'superseded', superseded_by: 'pr-2' })
  })

  it('superseded_by 透传（取代链——必带校验经服务 2.2，tool 面零业务逻辑）', async () => {
    const { deps, transitioned } = depsWithCapture()
    const tool = createTransitionProposalTool(deps)
    await tool.execute({ proposal_id: 'pr-1', to_status: 'superseded', superseded_by: 'pr-2' }, EXEC)
    expect(transitioned).toEqual([
      { projectId: 'p-1', proposalId: 'pr-1', toStatus: 'superseded', supersededBy: 'pr-2' },
    ])
  })

  it('服务侧缺带校验 → 失败 DTO（如目标提案不在场 ERR_PROPOSAL_NOT_FOUND）', async () => {
    const proposals = {
      transitionProposal: async () => {
        const e = new Error('目标提案 pr-404 未命中') as Error & { code: string }
        e.code = 'ERR_PROPOSAL_NOT_FOUND'
        throw e
      },
    } as unknown as ForgeProposalsService
    const deps: ForgeToolDeps = {
      tasks: {} as ForgeToolDeps['tasks'],
      proposals,
      bugs: {} as ForgeToolDeps['bugs'],
      resolveProjectId: () => 'p-1',
    }
    const tool = createTransitionProposalTool(deps)
    const out = await tool.execute(
      { proposal_id: 'pr-1', to_status: 'superseded', superseded_by: 'pr-404' },
      EXEC,
    )
    expect(out).toEqual({ ok: false, code: 'ERR_PROPOSAL_NOT_FOUND', message: '目标提案 pr-404 未命中', violations: [] })
    expect(tool.output.render({}, out)[0]?.text).toBe('✗ ERR_PROPOSAL_NOT_FOUND — 目标提案 pr-404 未命中')
  })

  it('返回面渲染（formatOk）：首行 ✓ → 状态 + 裁决时刻；成链行（chained FeatureRow）', () => {
    const { deps } = depsWithCapture()
    const tool = createTransitionProposalTool(deps)
    const text = tool.output.render(
      {},
      {
        ...row,
        proposalStatus: 'accepted',
        mode: 'expedition',
        decidedAt: '2026-01-02T00:00:00.000Z',
        chained: {
          featureId: 'ft-1',
          slug: 'idea',
          title: '提案标题',
          featureStatus: 'tasks',
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      },
    )[0]?.text ?? ''
    expect(text).toBe(
      '✓ Proposal idea → accepted\n' +
        '- proposalId: pr-1\n' +
        '- title: 提案标题\n' +
        '- mode: expedition\n' +
        '- decided: 2026-01-02T00:00:00.000Z\n' +
        '- chained feature: idea [tasks] (ft-1) — registered in the same transaction',
    )
  })

  it('cwd 未命中 → 失败 DTO（写动词同口径拒——formatErr 面）', async () => {
    const { deps } = depsWithCapture()
    const tool = createTransitionProposalTool(deps)
    const out = await tool.execute(
      { proposal_id: 'pr-1', to_status: 'accepted' },
      { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\x' } } } },
    )
    expect(out).toMatchObject({ ok: false, code: 'ERR_WORKSPACE_NOT_REGISTERED' })
  })
})


// ─────────────────────────── 3.4 tool-error 事件发射 ───────────────────────────

describe('提案域两 tool 事件发射（typed 错误 → tool-error）', () => {
  it('createProposal：typed 错误 → tool-error（归属 = 提案 slug）+ 失败 DTO 照常', async () => {
    const events: import('@dsh-forge/contracts').ForgePluginEvent[] = []
    const proposals = {
      createProposal: async () => {
        throw Object.assign(new Error('提案已存在'), { code: 'ERR_PROPOSAL_NOT_FOUND', data: {} })
      },
    } as unknown as ForgeProposalsService
    const tool = createCreateProposalTool({
      tasks: {} as ForgeToolDeps['tasks'],
      proposals,
      bugs: {} as ForgeToolDeps['bugs'],
      resolveProjectId: () => 'p-1',
      events: { emit: (e) => events.push(e), prepare: async () => {}, dirOf: () => undefined, remember: () => {} },
    })
    const out = await tool.execute({ slug: 'idea', title: 'T' }, EXEC)
    expect(out).toMatchObject({ ok: false, code: 'ERR_PROPOSAL_NOT_FOUND' })
    expect(events[0]).toMatchObject({ slug: 'idea', payload: { verb: 'createProposal' } })
  })

  it('transitionProposal：typed 错误 → tool-error（无 slug 参——归属 _pool 兜底）', async () => {
    const events: import('@dsh-forge/contracts').ForgePluginEvent[] = []
    const proposals = {
      transitionProposal: async () => {
        throw Object.assign(new Error('非法转移'), { code: 'ERR_INVALID_TRANSITION', data: {} })
      },
    } as unknown as ForgeProposalsService
    const tool = createTransitionProposalTool({
      tasks: {} as ForgeToolDeps['tasks'],
      proposals,
      bugs: {} as ForgeToolDeps['bugs'],
      resolveProjectId: () => 'p-1',
      events: { emit: (e) => events.push(e), prepare: async () => {}, dirOf: () => undefined, remember: () => {} },
    })
    const out = await tool.execute({ proposal_id: 'pr-9', to_status: 'accepted' }, EXEC)
    expect(out).toMatchObject({ ok: false, code: 'ERR_INVALID_TRANSITION' })
    expect(events[0]).toMatchObject({ slug: '_pool', payload: { verb: 'transitionProposal' } })
  })
})
