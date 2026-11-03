// resolveBug tool 单测（fix-bug 两写径·终态回填）：参数防御收窄（bug_id/outcome 必填，
// outcome 词表收窄 fixed|unresolved）+ 路由映射（bug_id→bugId、commit_hash→commitHash、
// unresolved_reason→unresolvedReason；fix_session_id = 执行会话注入；worktree/branch/fixer
// agent 不可提交——服务端 hash 锚定反查）+ 双友好返回面（✓ 终态/证据 / typed 错误 → 失败 DTO）。
import { describe, expect, it } from 'vitest'
import type { BugCard, Project } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import { createResolveBugTool, parseResolveBugArgs } from './resolve-bug.js'
import type { ForgeBugsToolFace, ForgeToolDeps } from './index.js'

/** projects 行全量桩（Project DTO 形状——getProject 桩面契约同步） */
function projectRow(wsPath: string): Project {
  return {
    id: 'p-1',
    workspaceId: 'ws-1',
    name: 'demo',
    wsPath,
    forgeDir: `${wsPath}/.forge`,
    forgeDirExternal: false,
    knowledgeDir: `${wsPath}/.knowledge`,
    archived: false,
    createdAt: '2026-11-02T00:00:00.000Z',
    updatedAt: '2026-11-02T00:00:00.000Z',
  }
}

const checkpoints: ForgeToolDeps['checkpoints'] = {
  appendCheckpoint: async () => {
    throw new Error('not used')
  },
  listCheckpoints: async () => [],
  ensureCheckpoint: async () => {
    throw new Error('not used')
  },
}

const EXEC: ToolExecFace = { agent: { session: { id: 'sess-1', header: { cwd: 'C:\\ws\\demo' } } } }

function fixedCard(): BugCard {
  return {
    bugId: 'bug-1',
    summary: '登录接口 500',
    bugDesc: 'd',
    triggerDesc: 't',
    expected: 'e',
    actual: 'a',
    bugStatus: 'fixed',
    commitHash: 'a1b2c3d',
    worktree: 'Z:/wt-x',
    branch: 'fix/x',
    reporter: 'faner',
    fixer: 'faner',
    createdAt: '2026-10-13T00:00:00.000Z',
    updatedAt: '2026-10-13T01:00:00.000Z',
  }
}

interface CapturedInput {
  projectId: string
  bugId: string
  outcome: string
  commitHash?: string
  unresolvedReason?: string
  fixApproach?: string
  fixSessionId?: string
}

function toolWithCapture(resolve: (input: CapturedInput) => Promise<BugCard>): { tool: ReturnType<typeof createResolveBugTool>; captured: CapturedInput[] } {
  const captured: CapturedInput[] = []
  const bugs: ForgeBugsToolFace = {
    registerBug: async () => {
      throw new Error('not used')
    },
    resolveBug: async (input) => {
      captured.push({
        projectId: input.projectId,
        bugId: input.bugId,
        outcome: input.outcome,
        commitHash: input.commitHash,
        unresolvedReason: input.unresolvedReason,
        fixApproach: input.fixApproach,
        fixSessionId: input.fixSessionId,
      })
      return resolve(captured[captured.length - 1]!)
    },
    listBugs: async () => [],
    findRecurrenceCandidates: async () => [],
    aggregateByErrorType: async () => [],
    getBug: async () => {
      throw new Error('not used')
    },
  }
  const deps: ForgeToolDeps = {
    tasks: {} as ForgeToolDeps['tasks'],
    proposals: {} as ForgeToolDeps['proposals'],
    bugs,
    checkpoints,
    resolveProjectId: (cwd: string) => (cwd.toLowerCase().includes('demo') ? 'p-1' : undefined),
  }
  return { tool: createResolveBugTool(deps), captured }
}

describe('parseResolveBugArgs（防御收窄）', () => {
  it('fixed 最小集：bug_id + outcome 解析；commit_hash/fix_approach/unresolved_reason 可选透传', () => {
    expect(
      parseResolveBugArgs({ bug_id: 'bug-1', outcome: 'fixed', commit_hash: 'a1b2c3d', fix_approach: '事实落库取代启发式' }),
    ).toEqual({
      bug_id: 'bug-1',
      outcome: 'fixed',
      commit_hash: 'a1b2c3d',
      fix_approach: '事实落库取代启发式',
    })
    expect(parseResolveBugArgs({ bug_id: 'bug-1', outcome: 'unresolved', unresolved_reason: '不可复现' })).toEqual({
      bug_id: 'bug-1',
      outcome: 'unresolved',
      unresolved_reason: '不可复现',
    })
    expect(parseResolveBugArgs({ bug_id: 'bug-1', outcome: 'fixed' })).not.toHaveProperty('commit_hash')
    expect(parseResolveBugArgs({ bug_id: 'bug-1', outcome: 'fixed' })).not.toHaveProperty('fix_approach')
  })

  it('bug_id/outcome 必填；outcome 词表收窄；非对象根拒', () => {
    expect(() => parseResolveBugArgs({ outcome: 'fixed' })).toThrow(/bug_id/)
    expect(() => parseResolveBugArgs({ bug_id: 'bug-1' })).toThrow(/outcome must be one of/)
    expect(() => parseResolveBugArgs({ bug_id: 'bug-1', outcome: 'wontfix' })).toThrow(/outcome must be one of/)
    expect(() => parseResolveBugArgs(null)).toThrow(/arguments must be an object/)
  })
})

describe('resolveBug execute（路由 + 服务端解析径）', () => {
  it('fixed：snake_case → camelCase 映射 + fix_session_id 执行会话注入（fix_approach 同映射透传）', async () => {
    const { tool, captured } = toolWithCapture(async () => fixedCard())
    const result = await tool.execute(
      { bug_id: 'bug-1', outcome: 'fixed', commit_hash: 'a1b2c3d', fix_approach: '最小外科修复' },
      EXEC,
    )
    expect(result).toMatchObject({ bugId: 'bug-1', bugStatus: 'fixed', commitHash: 'a1b2c3d' })
    expect(captured).toEqual([
      {
        projectId: 'p-1',
        bugId: 'bug-1',
        outcome: 'fixed',
        commitHash: 'a1b2c3d',
        fixApproach: '最小外科修复',
        fixSessionId: 'sess-1',
      },
    ])
  })

  it('unresolved：unresolved_reason 透传 + fix_session_id 注入（可复现停机路径落 unresolved 记录）', async () => {
    const { tool, captured } = toolWithCapture(async (input) => ({
      ...fixedCard(),
      bugStatus: 'unresolved',
      unresolvedReason: input.unresolvedReason,
      commitHash: undefined,
      worktree: undefined,
      branch: undefined,
      fixer: undefined,
    }))
    await tool.execute({ bug_id: 'bug-1', outcome: 'unresolved', unresolved_reason: '仅 release 构建出现' }, EXEC)
    expect(captured[0]).toMatchObject({
      projectId: 'p-1',
      bugId: 'bug-1',
      outcome: 'unresolved',
      unresolvedReason: '仅 release 构建出现',
      fixSessionId: 'sess-1',
    })
    expect(captured[0]!.commitHash).toBeUndefined()
  })

  it('cwd 未绑定 → ERR_WORKSPACE_NOT_REGISTERED；fixed 缺 commit_hash → ERR_COMMIT_HASH_REQUIRED 失败 DTO', async () => {
    const { tool } = toolWithCapture(async () => fixedCard())
    const unregistered = await tool.execute({ bug_id: 'bug-1', outcome: 'fixed' }, {
      agent: { session: { id: 'sess-2', header: { cwd: 'C:\\other' } } },
    })
    expect(unregistered).toMatchObject({ ok: false, code: 'ERR_WORKSPACE_NOT_REGISTERED' })

    const failing: ForgeToolDeps = {
      tasks: {} as ForgeToolDeps['tasks'],
      proposals: {} as ForgeToolDeps['proposals'],
      bugs: {
        registerBug: async () => {
          throw new Error('not used')
        },
        resolveBug: async () => {
          throw Object.assign(new Error('resolveBug(fixed) 需要 commit_hash（agent 原子提交后捕获）：bug-1'), {
            code: 'ERR_COMMIT_HASH_REQUIRED',
            data: { bugId: 'bug-1' },
          })
        },
        listBugs: async () => [],
        findRecurrenceCandidates: async () => [],
        aggregateByErrorType: async () => [],
        getBug: async () => {
          throw new Error('not used')
        },
      },
      resolveProjectId: () => 'p-1',
      checkpoints,
    }
    const result = await createResolveBugTool(failing).execute({ bug_id: 'bug-1', outcome: 'fixed' }, EXEC)
    expect(result).toMatchObject({ ok: false, code: 'ERR_COMMIT_HASH_REQUIRED' })
  })

  it('渲染面：fixed ✓ 证据行 / unresolved ✓ reason 行（双友好）', async () => {
    const { tool } = toolWithCapture(async () => fixedCard())
    const value = await tool.execute({ bug_id: 'bug-1', outcome: 'fixed', commit_hash: 'a1b2c3d' }, EXEC)
    const rendered = tool.output?.render?.({}, value) as { type: string; text: string }[]
    expect(rendered[0]!.text).toContain('✓ Bug bug-1 resolved — fixed')
    expect(rendered[0]!.text).toContain('- commit: a1b2c3d')
  })
})

// T4 锚有效性预检（loop-recurrence-hardening 提案 §2.2 T4 + AC4）——plugin-forge 旁挂侧：
// 复发家族（recurrenceOf 在场）fixed 携 anchor: 行时，锚指向的卷宗正本必须以文件在场
// （相对锚经项目根 wsPath 解析）；失效经拒绝路径退回失败 DTO，resolveBug 写径零触达——
// core 零文件 IO（presence 门在 core bugs 域，另测）。
function captureBugsFace(
  captured: CapturedInput[],
  resolve: (input: CapturedInput) => Promise<BugCard>,
  getBugCard: BugCard,
): ForgeBugsToolFace {
  return {
    registerBug: async () => {
      throw new Error('not used')
    },
    resolveBug: async (input) => {
      captured.push({
        projectId: input.projectId,
        bugId: input.bugId,
        outcome: input.outcome,
        commitHash: input.commitHash,
        unresolvedReason: input.unresolvedReason,
        fixApproach: input.fixApproach,
        fixSessionId: input.fixSessionId,
      })
      return resolve(captured[captured.length - 1]!)
    },
    listBugs: async () => [],
    findRecurrenceCandidates: async () => [],
    aggregateByErrorType: async () => [],
    getBug: async () => ({ card: getBugCard }),
  }
}

describe('T4 锚有效性预检（旁挂侧文件 IO，失效退回拒绝路径）', () => {
  it('AC4-锚失效：复发家族 anchor 指向不在场文件 → ERR_BUG_COVERAGE_ANCHOR_INVALID 失败 DTO，写径零触达', async () => {
    const captured: CapturedInput[] = []
    const card = { ...fixedCard(), bugStatus: 'open' as const, recurrenceOf: 'root-1' }
    const t = createResolveBugTool({
      tasks: {} as ForgeToolDeps['tasks'],
      proposals: {} as ForgeToolDeps['proposals'],
      bugs: captureBugsFace(captured, async () => fixedCard(), card),
      projects: {
        getProject: async () => projectRow('Z:/ws/demo'),
        deriveTaskStoreDir: async () => ({ dir: 'Z:/ws/store' }),
      } as ForgeToolDeps['projects'],
      resolveProjectId: () => 'p-1',
      checkpoints,
    })
    const result = await t.execute(
      {
        bug_id: 'bug-1',
        outcome: 'fixed',
        commit_hash: 'a1b2c3d',
        fix_approach: 'coverage: 覆盖整链共同根因\nanchor: .forge/docs/proposals/x/issues/1/verification-report.md',
      },
      EXEC,
    )
    expect(result).toMatchObject({ ok: false, code: 'ERR_BUG_COVERAGE_ANCHOR_INVALID' })
    expect(captured).toEqual([]) // 写径零触达——失效经拒绝路径退回
  })

  it('AC4-双过：锚指向在场卷宗文件（绝对路径）→ 预检通过，fix_approach 原样透传写径', async () => {
    const { mkdtemp, writeFile } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 't4-anchor-'))
    const report = join(dir, 'verification-report.md')
    await writeFile(report, '# 排查报告', 'utf8')
    const captured: CapturedInput[] = []
    const card = { ...fixedCard(), bugStatus: 'open' as const, recurrenceOf: 'root-1' }
    const t = createResolveBugTool({
      tasks: {} as ForgeToolDeps['tasks'],
      proposals: {} as ForgeToolDeps['proposals'],
      bugs: captureBugsFace(captured, async () => fixedCard(), card),
      projects: {
        getProject: async () => projectRow(dir),
        deriveTaskStoreDir: async () => ({ dir }),
      } as ForgeToolDeps['projects'],
      resolveProjectId: () => 'p-1',
      checkpoints,
    })
    const approach = `coverage: 覆盖整链共同根因\nanchor: ${report}`
    const result = await t.execute({ bug_id: 'bug-1', outcome: 'fixed', commit_hash: 'a1b2c3d', fix_approach: approach }, EXEC)
    expect(result).toMatchObject({ bugId: 'bug-1', bugStatus: 'fixed' })
    expect(captured[0]).toMatchObject({ fixApproach: approach }) // 原样透传——预检不改写
  })

  it('probes 卷宗锚（recurrence-signal-tiering 落点双轨）：anchor 指向 probes/<bugId>/ 在场报告 → 预检通过（专家产物落 probes 后 T4 过闸）', async () => {
    const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 't4-anchor-probes-'))
    const probesDir = join(dir, '.forge', 'docs', 'probes', 'bug-1')
    await mkdir(probesDir, { recursive: true })
    const report = join(probesDir, 'investigation.md')
    await writeFile(report, '# 深挖方案', 'utf8')
    const captured: CapturedInput[] = []
    const card = { ...fixedCard(), bugStatus: 'open' as const, recurrenceOf: 'root-1' }
    const t = createResolveBugTool({
      tasks: {} as ForgeToolDeps['tasks'],
      proposals: {} as ForgeToolDeps['proosals'],
      bugs: captureBugsFace(captured, async () => fixedCard(), card),
      projects: {
        getProject: async () => projectRow(dir),
        deriveTaskStoreDir: async () => ({ dir }),
      } as ForgeToolDeps['projects'],
      resolveProjectId: () => 'p-1',
      checkpoints,
    })
    const approach = `coverage: 覆盖整链共同根因\nanchor: ${report}`
    const result = await t.execute({ bug_id: 'bug-1', outcome: 'fixed', commit_hash: 'a1b2c3d', fix_approach: approach }, EXEC)
    expect(result).toMatchObject({ bugId: 'bug-1', bugStatus: 'fixed' })
    expect(captured[0]).toMatchObject({ fixApproach: approach })
  })

  it('非复发家族：零文件 IO 预检（行为零变化——presence 门归 core）', async () => {
    const captured: CapturedInput[] = []
    const t = createResolveBugTool({
      tasks: {} as ForgeToolDeps['tasks'],
      proposals: {} as ForgeToolDeps['proposals'],
      bugs: captureBugsFace(captured, async () => fixedCard(), fixedCard()), // 无 recurrenceOf
      projects: {
        getProject: async () => {
          throw new Error('projects face must not be touched for non-recurrence bugs')
        },
        deriveTaskStoreDir: async () => ({ dir: 'Z:/ws/store' }),
      } as ForgeToolDeps['projects'],
      resolveProjectId: () => 'p-1',
      checkpoints,
    })
    const result = await t.execute(
      { bug_id: 'bug-1', outcome: 'fixed', commit_hash: 'a1b2c3d', fix_approach: '普通一段话修法' },
      EXEC,
    )
    expect(result).toMatchObject({ bugId: 'bug-1', bugStatus: 'fixed' })
    expect(captured).toHaveLength(1)
  })
})
