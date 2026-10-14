// resolveBug tool 单测（fix-bug 两写径·终态回填）：参数防御收窄（bug_id/outcome 必填，
// outcome 词表收窄 fixed|unresolved）+ 路由映射（bug_id→bugId、commit_hash→commitHash、
// unresolved_reason→unresolvedReason；fix_session_id = 执行会话注入；worktree/branch/fixer
// agent 不可提交——服务端 hash 锚定反查）+ 双友好返回面（✓ 终态/证据 / typed 错误 → 失败 DTO）。
import { describe, expect, it } from 'vitest'
import type { BugCard } from '@dsh-forge/contracts'
import type { ToolExecFace } from '../faces.js'
import { createResolveBugTool, parseResolveBugArgs } from './resolve-bug.js'
import type { ForgeBugsToolFace, ForgeToolDeps } from './index.js'

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
    listBugs: async () => {
      throw new Error('not used')
    },
  }
  const deps: ForgeToolDeps = {
    tasks: {} as ForgeToolDeps['tasks'],
    proposals: {} as ForgeToolDeps['proposals'],
    bugs,
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
      },
      resolveProjectId: () => 'p-1',
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
