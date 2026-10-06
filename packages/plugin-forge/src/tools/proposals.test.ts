// 3.2 单测 —— 提案域两 tool（createProposal / transitionProposal）：词表收窄 +
// projectId 路由 + 映射 + render（身份与名称分离：proposalId 锚 + 裁决时刻注记）。
// transitionProposal 与 transitionTask 的面分治注记：前者 tool 在册（提案裁决 agent 可
// 承载），后者人类通道专属（plugin.test.ts G1-11 pin 断言缺席）。
import { describe, expect, it } from 'vitest'
import type { CreateProposalInput, ForgeProposalsService, ProposalRow, TransitionProposalInput } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import { createCreateProposalTool, parseCreateProposalArgs } from './create-proposal.js'
import { createTransitionProposalTool, parseTransitionProposalArgs } from './transition-proposal.js'
import type { ForgeToolDeps } from './index.js'
import { WorkspaceNotRegisteredError } from './session.js'

const EXEC: ToolExecFace = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

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
      return row
    },
    transitionProposal: async (input: TransitionProposalInput) => {
      transitioned.push(input)
      return { ...row, proposalStatus: input.toStatus, decidedAt: '2026-01-02T00:00:00.000Z' }
    },
  } as unknown as ForgeProposalsService
  const deps: ForgeToolDeps = {
    tasks: {} as ForgeToolDeps['tasks'],
    proposals,
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
  }
  return { deps, created, transitioned }
}

describe('createProposal', () => {
  it('parse：slug/title 必填；status 词表收窄；rel_path 可选', () => {
    expect(parseCreateProposalArgs({ slug: 'idea', title: 'T' })).toEqual({ slug: 'idea', title: 'T' })
    expect(() => parseCreateProposalArgs({ slug: 'idea', title: 'T', status: 'approved' })).toThrow(
      /status must be one of/,
    )
    expect(parseCreateProposalArgs({ slug: 'idea', title: 'T', rel_path: 'proposals/idea/proposal.md' })).toMatchObject({
      rel_path: 'proposals/idea/proposal.md',
    })
  })

  it('execute：projectId 路由 + camelCase 映射（relPath/status）', async () => {
    const { deps, created } = depsWithCapture()
    const tool = createCreateProposalTool(deps)
    await tool.execute({ slug: 'idea', title: 'T', rel_path: 'proposals/idea/proposal.md', status: 'under-review' }, EXEC)
    expect(created).toEqual([
      {
        projectId: 'p-1',
        slug: 'idea',
        title: 'T',
        relPath: 'proposals/idea/proposal.md',
        status: 'under-review',
      },
    ])
  })

  it('cwd 未命中 → WorkspaceNotRegisteredError；render：身份与文档行', async () => {
    const { deps } = depsWithCapture()
    const tool = createCreateProposalTool(deps)
    await expect(
      tool.execute({ slug: 'a', title: 'T' }, { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\x' } } } }),
    ).rejects.toThrow(WorkspaceNotRegisteredError)
    const text = tool.output.render({}, { ...row, relPath: 'p.md' })[0]?.text ?? ''
    expect(text).toContain('Proposal idea [draft]')
    expect(text).toContain('proposalId: pr-1')
    expect(text).toContain('doc: p.md')
  })
})

describe('transitionProposal', () => {
  it('parse：proposal_id 必填；to_status 词表收窄', () => {
    expect(parseTransitionProposalArgs({ proposal_id: 'pr-1', to_status: 'accepted' })).toEqual({
      proposal_id: 'pr-1',
      to_status: 'accepted',
    })
    expect(() => parseTransitionProposalArgs({ proposal_id: 'pr-1', to_status: 'done' })).toThrow(
      /to_status must be one of/,
    )
    expect(() => parseTransitionProposalArgs({ to_status: 'accepted' })).toThrow(/proposal_id/)
  })

  it('execute：proposalId/toStatus 映射 + projectId 路由；render：裁决时刻注记', async () => {
    const { deps, transitioned } = depsWithCapture()
    const tool = createTransitionProposalTool(deps)
    const result = await tool.execute({ proposal_id: 'pr-1', to_status: 'accepted' }, EXEC)
    expect(transitioned).toEqual([{ projectId: 'p-1', proposalId: 'pr-1', toStatus: 'accepted' }])
    const text = tool.output.render({}, result)[0]?.text ?? ''
    expect(text).toContain('Proposal idea [accepted]')
    expect(text).toContain('decided: 2026-01-02T00:00:00.000Z')
  })

  it('cwd 未命中 → WorkspaceNotRegisteredError（写动词同口径拒）', async () => {
    const { deps } = depsWithCapture()
    const tool = createTransitionProposalTool(deps)
    await expect(
      tool.execute(
        { proposal_id: 'pr-1', to_status: 'accepted' },
        { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\x' } } } },
      ),
    ).rejects.toThrow(WorkspaceNotRegisteredError)
  })
})
