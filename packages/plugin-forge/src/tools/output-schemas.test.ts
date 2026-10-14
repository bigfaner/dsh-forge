// 注册面输出 schema ↔ 实际返回值形状对验（host oneOf 回执校验的仓内镜像）。
// 定位：回归锚——tool-row-lossless-json-fix 先例的类级泛化。host 对 tool 输出做 JSON Schema
// oneOf 校验（成功支 | 失败 DTO 支），schema 与值脱节 → matched 0 → 回执序列化错而服务端
// 写已落地（静默成功，agent 误判重试——bug 台账 9 连重实证）。本测试用 ajv 复刻该校验：
// 每工具一个代表性成功值，必须命中其 output.schema 的成功支。
// 值为各 core 服务返回 DTO 的代表性全形（contracts 单源形状——BugCard/TaskSnapshot/
// ProposalRow/AddTaskResult/SubmitTaskResult/TaskStats/DispatchTaskResult）。
import { expect, describe, it } from 'vitest'
import AjvModule from 'ajv'
import type { BugCard, ProposalRow, TaskCard, TaskSnapshot } from '@dsh-forge/contracts'
import type { ForgeToolDeps } from './index.js'
import { createAddTaskTool } from './add-task.js'
import { createQueryTaskTool } from './query-task.js'
import { createUpdateTaskTool } from './update-task.js'
import { createListTasksTool, projectCards } from './list-tasks.js'
import { createTaskStatsTool } from './task-stats.js'
import { createSubmitTaskTool } from './submit-task.js'
import { createRecordBugTool } from './record-bug.js'
import { createResolveBugTool } from './resolve-bug.js'
import { createCreateProposalTool } from './create-proposal.js'
import { createTransitionProposalTool } from './transition-proposal.js'
import { createDispatchTaskTool } from './dispatch-task.js'

/** 工厂仅闭包 deps（执行期才用）——空壳即可读 output.schema */
const DEPS = {} as ForgeToolDeps
const DISPATCH_DEPS = {} as Parameters<typeof createDispatchTaskTool>[0]

/** ajv CJS 默认导出在 NodeNext+verbatimModuleSyntax 下的类型面窄化（运行时为类——已实证可构造） */
interface AjvErrorLike {
  instancePath: string
  message?: string
}
type ValidateFn = ((data: unknown) => boolean) & { errors?: AjvErrorLike[] | null }
const Ajv = AjvModule as unknown as new (options?: { allErrors?: boolean }) => {
  compile(schema: object): ValidateFn
}
const ajv = new Ajv({ allErrors: true })

function schemaOf(tool: { output: { schema: unknown } }): object {
  return tool.output.schema as object
}

function expectValid(label: string, schema: object, value: unknown): void {
  const validate = ajv.compile(schema)
  const ok = validate(value)
  const errors = (validate.errors ?? []).map((e: AjvErrorLike) => `${e.instancePath} ${e.message}`).join('; ')
  expect(ok, `${label} 值须命中 schema（ajv: ${errors}）`).toBe(true)
}

/** TaskCard 代表卡（含全部可选副行字段——projectCards 投影前的 core 形状） */
const TASK_CARD: TaskCard = {
  taskId: 't-1',
  slug: 'md-mermaid-plugin',
  localId: '1.1',
  title: 'md-mermaid 包骨架与三面出口',
  taskType: 'coding-feature',
  taskStatus: 'completed',
  priority: 'P0',
  estimatedTime: '1-2h',
  actualDurationMs: 123456,
  prerequisites: [
    { slug: 'md-mermaid-plugin', localId: '1.2', taskStatus: 'completed' },
    { slug: 'md-mermaid-plugin', localId: '1.3', taskStatus: 'pending' },
  ],
  sessionCount: 2,
  sourceTask: { slug: 'md-mermaid-plugin', localId: '1.12' },
  source: { kind: 'proposal', slug: 'md-mermaid-plugin' },
}

/** TaskSnapshot 代表值（updateTask 返回——全必填 + 代表性可选） */
const TASK_SNAPSHOT: TaskSnapshot = {
  taskId: 't-1',
  slug: 'md-mermaid-plugin',
  localId: '1.1',
  source: { kind: 'proposal', slug: 'md-mermaid-plugin' },
  title: 'md-mermaid 包骨架与三面出口',
  taskType: 'coding-feature',
  taskStatus: 'pending',
  taskDesc: 'desc payload',
  priority: 'P0',
  estimatedTime: '1-2h',
  vars: { KEY: 'VALUE' },
  sourceTaskId: 't-src',
  blockedReason: 'waiting fix',
  mode: 'blitz',
  acceptanceCriteria: ['AC1'],
  breaking: false,
  coverage: 0.8,
  complexity: 'low',
  surfaceKey: 'docs',
  surfaceType: 'web',
  createdAt: '2026-10-14T00:00:00.000Z',
  updatedAt: '2026-10-14T01:00:00.000Z',
}

/** BugCard 代表值（recordBug 登记面——open 全必填 + 可选标注） */
const BUG_CARD_OPEN: BugCard = {
  bugId: 'b-1',
  summary: '一句话摘要',
  bugDesc: 'desc',
  triggerDesc: 'trigger',
  expected: 'expected',
  actual: 'actual',
  suspected: 'file.ts:1',
  errorType: 'stale-anchor',
  bugStatus: 'open',
  reportSessionId: 'session-1',
  sourceTaskId: 't-src',
  reporter: 'faner',
  createdAt: '2026-10-14T00:00:00.000Z',
  updatedAt: '2026-10-14T00:00:00.000Z',
}

/** BugCard 代表值（resolveBug 回填面——fixed 证据三件 + 修复者/会话） */
/** resolveBug 回填面——fixed 证据三件 + 修复者/会话） */
const BUG_CARD_FIXED: BugCard = {
  ...BUG_CARD_OPEN,
  bugStatus: 'fixed',
  commitHash: '3b0f41f9224a41c798fa977522cbc25f98519254',
  worktree: 'Z:/project/dsh/dsh-forge',
  branch: 'main',
  fixer: 'faner',
  fixSessionId: 'session-2',
}

/** ProposalRow 代表值（全可选键在场——含 author 白名单位） */
const PROPOSAL_ROW: ProposalRow = {
  proposalId: 'p-1',
  slug: 'md-mermaid-plugin',
  title: 'md-mermaid cordis 插件',
  proposalStatus: 'accepted',
  relPath: 'proposals/md-mermaid-plugin/proposal.md',
  author: 'faner',
  decidedAt: '2026-10-13T12:00:00.000Z',
  mode: 'blitz',
  supersededBy: 'p-2',
  createdAt: '2026-10-13T10:00:00.000Z',
  updatedAt: '2026-10-13T12:00:00.000Z',
}

const POOL = { pending: 1, inProgress: 0, blocked: 0, unmetPending: 1 }

describe('注册面输出 schema ↔ 返回值形状对验（host oneOf 回执校验镜像）', () => {
  it('addTask：AddTaskResult 四键', () => {
    expectValid('addTask', schemaOf(createAddTaskTool(DEPS)), {
      taskId: 't-1',
      slug: 'md-mermaid-plugin',
      localId: 'fix-1',
      reused: false,
    })
  })

  it('queryTask：快照 + 容器 + 前置/等待节', () => {
    expectValid(
      'queryTask',
      schemaOf(createQueryTaskTool(DEPS)),
      {
        task: {
          taskId: 't-1',
          slug: 'md-mermaid-plugin',
          localId: '1.1',
          title: 'title',
          taskType: 'coding-feature',
          taskStatus: 'completed',
          blockedReason: 'r',
          mode: 'blitz',
        },
        container: { kind: 'proposal', slug: 'md-mermaid-plugin', title: '容器', summary: 's', mode: 'blitz', phase: 'tasks' },
        prerequisites: [{ slug: 'md-mermaid-plugin', localId: '1.2', taskStatus: 'completed' }],
        waitingOnMe: [{ slug: 'md-mermaid-plugin', localId: '1.3', taskStatus: 'pending' }],
      },
    )
  })

  it('updateTask：TaskSnapshot 全形', () => {
    expectValid('updateTask', schemaOf(createUpdateTaskTool(DEPS)), TASK_SNAPSHOT)
  })

  it('listTasks：projectCards 投影值（前置 = localId 字符串数组）', () => {
    expectValid('listTasks', schemaOf(createListTasksTool(DEPS)), projectCards([TASK_CARD]))
  })

  it('taskStats：total + 八态闭集分布 + unmetPending', () => {
    expectValid('taskStats', schemaOf(createTaskStatsTool(DEPS)), {
      total: 3,
      byStatus: {
        pending: 1,
        in_progress: 0,
        completed: 2,
        blocked: 0,
        suspended: 0,
        interrupted: 0,
        skipped: 0,
        rejected: 0,
      },
      unmetPending: 1,
    })
  })

  it('submitTask：restored = TaskRef 对象数组', () => {
    expectValid('submitTask', schemaOf(createSubmitTaskTool(DEPS)), {
      taskId: 't-9',
      status: 'completed',
      restored: [{ slug: 'md-mermaid-plugin', localId: '1.12' }],
    })
  })

  it('recordBug：BugCard 登记面全形', () => {
    expectValid('recordBug', schemaOf(createRecordBugTool(DEPS)), BUG_CARD_OPEN)
  })

  it('resolveBug：BugCard 回填面全形（fixed 证据）', () => {
    expectValid('resolveBug', schemaOf(createResolveBugTool(DEPS)), BUG_CARD_FIXED)
  })

  it('createProposal：ProposalRow 全形（含 author）', () => {
    expectValid('createProposal', schemaOf(createCreateProposalTool(DEPS)), PROPOSAL_ROW)
  })

  it('transitionProposal：ProposalRow + chained feature 行', () => {
    expectValid('transitionProposal', schemaOf(createTransitionProposalTool(DEPS)), {
      ...PROPOSAL_ROW,
      chained: {
        featureId: 'f-1',
        slug: 'md-mermaid-plugin',
        title: 'md-mermaid cordis 插件',
        featureStatus: 'active',
        summary: 's',
        proposalId: 'p-1',
        createdAt: PROPOSAL_ROW.createdAt,
        updatedAt: PROPOSAL_ROW.updatedAt,
      },
    })
  })

  it('dispatchTask：dispatched / spawned / no-task 三回执分支', () => {
    const schema = schemaOf(createDispatchTaskTool(DISPATCH_DEPS))
    expectValid('dispatchTask:dispatched', schema, {
      kind: 'dispatched',
      taskRef: { slug: 'md-mermaid-plugin', localId: 'fix-1' },
      title: 'Fix',
      type: 'coding-fix',
      workerSessionId: 'session-w',
      jobId: 'forge-dispatch-1',
      pool: POOL,
      reEntered: false,
    })
    expectValid('dispatchTask:spawned', schema, {
      kind: 'spawned',
      outcome: 'success',
      taskRef: { slug: 'md-mermaid-plugin', localId: '1.12' },
      title: 'gate',
      type: 'test-run',
      mode: 'blitz',
      digest: 'abc123',
      summary: 'ok',
      commitHash: '3b0f41f9224a41c798fa977522cbc25f98519254',
      files: ['e2e/specs/blitz/md-mermaid-plugin.spec.ts'],
      pool: POOL,
    })
    expectValid('dispatchTask:no-task', schema, { kind: 'no-task', pool: POOL })
  })
})
