// 1.1 AC1/AC2/AC5 —— forge 四域 DTO / 通道负载映射 / 桥事件信封 pin。
// 权威来源：tech-design §Interface 1–5（方法签名与身份双轨）/ §Interface 6（BridgeEventMessage）/
// §Interface 7（负载映射键 = 通道族键）。接口形状为编译期面——期望断言锚键结构，
// expectTypeOf 锚经 lint:test-types（tsc -p packages/contracts/tsconfig.test.json）机械执行。
// 1.1（M3）增补：mode 词汇/ContainerRef/settings DTO 判别 + 服务签名容器化改写 +
// ForgePluginEvent 两层联合 exhaustiveness + proposals/settings 负载映射扩池。
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  DOCS_CHANNELS,
  FEATURES_CHANNELS,
  FORGE_EVENT_CHANNELS,
  PROJECTS_M2_CHANNELS,
  PROPOSALS_CHANNELS,
  REMOTE_CHANNELS,
  SETTINGS_CHANNELS,
  TASKS_CHANNELS,
} from '../channels.js'
import type { TasksChangedEvent } from './forge.js'
import type { ForgeEventChannel } from '../channels.js'
import type { ErrorCode } from '../errors.js'
import {
  BEFORE_SUCCESSOR_ALLOWED_STATUSES,
  CONTAINER_KINDS,
  DEFAULT_EXPERT_MAPPING,
  FEATURE_RECORD_VERBS,
  FIX_CHAIN_DEPTH_LIMIT,
  FORGE_PLUGIN_EVENT_TYPES,
  MODES,
  PAUSE_TASK_TRANSITION,
  REASONING_LEVELS,
} from './forge.js'
import type { BeforeSuccessorAllowedStatus, ExpertsSettings, ReasoningEffortLevel } from './forge.js'
import type { ProjectPatch, ProjectSummary } from './project.js'
import type { TaskType } from '../labels.js'
import type {
  AddTaskInput,
  BridgeEventMessage,
  ClaimTaskInput,
  ContainerRef,
  CreateProposalInput,
  DocContent,
  DocsChannelRequests,
  FeatureCard,
  FeatureRow,
  FeaturesChannelRequests,
  ForgeDocsService,
  ForgeFeaturesService,
  ForgeProposalsService,
  ForgeSettings,
  ForgeSettingsService,
  ForgeTasksService,
  ForgePluginEvent,
  ForgePluginEventEnvelope,
  ForgePluginEventType,
  ListProposalDocsQuery,
  ListTasksQuery,
  Mode,
  ProjectServiceM2,
  ProposalCard,
  ProposalCreatedPayload,
  RemoteApprovalDecision,
  RemoteApprovalDecisionInput,
  RemoteApprovalForwardResult,
  RemoteChannelRequests,
  RemoteChannelResponses,
  RemoteProgressSnapshot,
  ProposalDocRow,
  ProposalsChannelRequests,
  ProposalRow,
  QueryTaskResult,
  SessionTaskLinkCard,
  SettingsChannelRequests,
  SettingsChannelResponses,
  SetProposalModeInput,
  TaskCard,
  TaskClaimedPayload,
  TaskContainerSummary,
  TaskDetail,
  TaskGraphQuery,
  TaskProgressPayload,
  TaskProgressPhase,
  TaskSpawnedPayload,
  TaskStats,
  TaskStatsQuery,
  TaskSubmittedPayload,
  TaskWorkerDonePayload,
  TriageDecisionAction,
  TriageDecidedPayload,
  TriageOutcomePayload,
  TasksChannelRequests,
  TaskSnapshot,
  ToolErrorPayload,
  TransitionProposalInput,
  TransitionProposalResult,
  UpdateTaskInput,
  ValidateReport,
} from './forge.js'

describe('AC1 身份双轨（TaskSnapshot/TaskCard/TaskDetail 恒含 taskId + slug + localId）', () => {
  it('三 DTO 均含 { taskId, slug, localId }（taskId 代理主键锚 + TaskRef 自然键）', () => {
    expectTypeOf<TaskSnapshot>().toHaveProperty('taskId')
    expectTypeOf<TaskSnapshot>().toHaveProperty('slug')
    expectTypeOf<TaskSnapshot>().toHaveProperty('localId')
    expectTypeOf<TaskCard>().toHaveProperty('taskId')
    expectTypeOf<TaskCard>().toHaveProperty('slug')
    expectTypeOf<TaskCard>().toHaveProperty('localId')
    expectTypeOf<TaskDetail>().toHaveProperty('taskId')
    expectTypeOf<TaskDetail>().toHaveProperty('slug')
    expectTypeOf<TaskDetail>().toHaveProperty('localId')
  })

  it('TaskDetail ⊇ TaskCard（详情 = 列表卡全量 + 深字段）', () => {
    expectTypeOf<Pick<TaskDetail, keyof TaskCard>>().toEqualTypeOf<TaskCard>()
  })

  it('TaskCard.source 可选任务源（S2——run-tasks-host-command 无参 /run-dag-tasks 单查询双轨枚举的 kind 判别面；加性扩面）', () => {
    expectTypeOf<TaskCard>().toHaveProperty('source')
    const ref: ContainerRef = { kind: 'proposal', slug: 'run-tasks-host-command' }
    const card: TaskCard = {
      taskId: 't-1',
      slug: 'run-tasks-host-command',
      localId: '1.6',
      title: 'S2',
      taskType: 'coding-feature',
      taskStatus: 'in_progress',
      prerequisites: [],
      sessionCount: 0,
      source: ref,
    }
    expect(card.source).toEqual(ref)
  })
})

describe('AC1 服务面方法签名锚（Interface 1–5 逐项在场）', () => {
  it('ForgeTasksService 十二法（动词×5 含 updateTask + 校验 + 读面×6）', () => {
    const methods: readonly (keyof ForgeTasksService)[] = [
      'addTask',
      'claimTask',
      'submitTask',
      'transitionTask',
      'updateTask',
      'queryTask',
      'validateFeatureTasks',
      'listTasks',
      'taskStats',
      'taskGraph',
      'taskDetail',
      'sessionLinks',
    ]
    expect(methods).toHaveLength(12)
  })

  it('ForgeFeaturesService 五法 / ForgeProposalsService 五法（M3 +setProposalMode/listProposalDocs）/ ForgeDocsService 一法', () => {
    const featureMethods: readonly (keyof ForgeFeaturesService)[] = [
      'registerFeature',
      'transitionFeature',
      'upsertFeatureDoc',
      'listFeatures',
      'listFeatureDocs',
    ]
    const proposalMethods: readonly (keyof ForgeProposalsService)[] = [
      'createProposal',
      'transitionProposal',
      'setProposalMode',
      'listProposals',
      'listProposalDocs',
    ]
    const docsMethods: readonly (keyof ForgeDocsService)[] = ['read']
    expect(featureMethods).toHaveLength(5)
    expect(proposalMethods).toHaveLength(5)
    expect(docsMethods).toHaveLength(1)
  })

  it('ProjectServiceM2 = P1 五法 + deriveTaskStoreDir（Interface 5 扩族）', () => {
    expectTypeOf<ProjectServiceM2>().toHaveProperty('deriveTaskStoreDir')
    expectTypeOf<ProjectServiceM2>().toHaveProperty('registerProject')
    expectTypeOf<ProjectServiceM2>().toHaveProperty('reconcileAtStartup')
  })

  it('project-manual-order 类型面：ProjectSummary 可选 sortOrder 随行 + update patch sortOrders 键编译期生效', () => {
    expectTypeOf<ProjectSummary['sortOrder']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<ProjectPatch['sortOrders']>().toEqualTypeOf<Record<string, number> | undefined>()
    expectTypeOf<ProjectPatch['name']>().toEqualTypeOf<string | undefined>()
    // 编译期赋值面：拖拽全量重编号负载合法
    const patch: ProjectPatch = { sortOrders: { 'p1': 1, 'p2': 2 } }
    expect(patch.sortOrders).toBeDefined()
    const summary: ProjectSummary = { id: 'p1', workspaceId: 'w1', name: 'n', wsPath: 'Z:\\p', archived: false }
    expect(summary.sortOrder).toBeUndefined() // 可选——存量/未排序行缺席合法
  })

  it('读面返回体锚：listTasks → TaskCard[] / listFeatures → FeatureCard[] / listProposals → ProposalCard[]', () => {
    expectTypeOf<ReturnType<ForgeTasksService['listTasks']>>().toEqualTypeOf<Promise<TaskCard[]>>()
    expectTypeOf<ReturnType<ForgeFeaturesService['listFeatures']>>().toEqualTypeOf<
      Promise<FeatureCard[]>
    >()
    expectTypeOf<ReturnType<ForgeProposalsService['listProposals']>>().toEqualTypeOf<
      Promise<ProposalCard[]>
    >()
    expectTypeOf<ReturnType<ForgeTasksService['validateFeatureTasks']>>().toEqualTypeOf<
      Promise<ValidateReport>
    >()
    expectTypeOf<ReturnType<ForgeDocsService['read']>>().toEqualTypeOf<Promise<DocContent>>()
  })
})

describe('AC2 通道负载映射键 = 通道族键（三处一体的 DTO 侧）', () => {
  it('四族 + projects 扩族请求/响应映射键集与族常量逐一对齐', () => {
    expectTypeOf<Exclude<keyof TasksChannelRequests, keyof typeof TASKS_CHANNELS>>().toEqualTypeOf<never>()
    expectTypeOf<Exclude<keyof typeof TASKS_CHANNELS, keyof TasksChannelRequests>>().toEqualTypeOf<never>()
    expectTypeOf<Exclude<keyof FeaturesChannelRequests, keyof typeof FEATURES_CHANNELS>>().toEqualTypeOf<never>()
    expectTypeOf<Exclude<keyof typeof FEATURES_CHANNELS, keyof FeaturesChannelRequests>>().toEqualTypeOf<never>()
    expectTypeOf<Exclude<keyof ProposalsChannelRequests, keyof typeof PROPOSALS_CHANNELS>>().toEqualTypeOf<never>()
    expectTypeOf<Exclude<keyof typeof PROPOSALS_CHANNELS, keyof ProposalsChannelRequests>>().toEqualTypeOf<never>()
    expectTypeOf<Exclude<keyof DocsChannelRequests, keyof typeof DOCS_CHANNELS>>().toEqualTypeOf<never>()
    expectTypeOf<Exclude<keyof typeof DOCS_CHANNELS, keyof DocsChannelRequests>>().toEqualTypeOf<never>()
    expectTypeOf<keyof typeof PROJECTS_M2_CHANNELS>().toEqualTypeOf<'deriveTaskStoreDir'>()
  })

  it('写动词不入请求负载映射键（映射键 = 族键承重 + channels.test 族键断言 → 传递排除）', () => {
    expectTypeOf<TasksChannelRequests>().not.toHaveProperty('addTask')
    expectTypeOf<TasksChannelRequests>().not.toHaveProperty('claimTask')
    expectTypeOf<TasksChannelRequests>().not.toHaveProperty('submitTask')
    expectTypeOf<ProposalsChannelRequests>().not.toHaveProperty('createProposal')
    // M3 drift 修订：transitionProposal 双面上 RPC（Interface 4）——负载映射含 transition 键
    expectTypeOf<ProposalsChannelRequests>().toHaveProperty('transition')
  })

  it('M3 扩池：proposals 负载映射四键 + settings 负载映射两键（键 = 族常量键）', () => {
    expectTypeOf<Exclude<keyof ProposalsChannelRequests, keyof typeof PROPOSALS_CHANNELS>>().toEqualTypeOf<never>()
    expectTypeOf<Exclude<keyof typeof PROPOSALS_CHANNELS, keyof ProposalsChannelRequests>>().toEqualTypeOf<never>()
    expectTypeOf<Exclude<keyof SettingsChannelRequests, keyof typeof SETTINGS_CHANNELS>>().toEqualTypeOf<never>()
    expectTypeOf<Exclude<keyof typeof SETTINGS_CHANNELS, keyof SettingsChannelRequests>>().toEqualTypeOf<never>()
    expectTypeOf<SettingsChannelRequests['get']>().toEqualTypeOf<void>()
    expectTypeOf<SettingsChannelResponses['get']>().toEqualTypeOf<ForgeSettings>()
    expectTypeOf<SettingsChannelResponses['set']>().toEqualTypeOf<void>()
  })

  it('mobile-remote-approval：remote 负载映射两键（progress/approval——键 = REMOTE_CHANNELS 族键；approval 转发缺席 = forwarded:false + reason unavailable）', () => {
    expectTypeOf<Exclude<keyof RemoteChannelRequests, keyof typeof REMOTE_CHANNELS>>().toEqualTypeOf<never>()
    expectTypeOf<Exclude<keyof typeof REMOTE_CHANNELS, keyof RemoteChannelRequests>>().toEqualTypeOf<never>()
    expectTypeOf<RemoteChannelResponses['progress']>().toEqualTypeOf<RemoteProgressSnapshot>()
    expectTypeOf<RemoteChannelResponses['approval']>().toEqualTypeOf<RemoteApprovalForwardResult>()
    expectTypeOf<RemoteApprovalDecisionInput['decision']>().toEqualTypeOf<RemoteApprovalDecision>()
  })
})

describe('AC5 BridgeEventMessage 信封（Interface 6：channel/payload 只读）', () => {
  it('信封 channel = forge:events/tasks-changed 常量本尊；载荷 { projectId } 只读', () => {
    const message: BridgeEventMessage = {
      type: 'event',
      channel: FORGE_EVENT_CHANNELS.tasksChanged,
      payload: { projectId: 'p-1' },
    }
    expect(message.channel).toBe('forge:events/tasks-changed')
    expect((message.payload as TasksChangedEvent).projectId).toBe('p-1')
    expectTypeOf<BridgeEventMessage['channel']>().toEqualTypeOf<ForgeEventChannel>()
    expectTypeOf<BridgeEventMessage['payload']>().toEqualTypeOf<TasksChangedEvent>()
  })

  it('sessionLinks 双源分型卡（links=派发 / record=执行；SC6③ 双源相异断言面）', () => {
    const card: SessionTaskLinkCard = {
      taskId: 't-1',
      slug: 'm2',
      localId: '1.1',
      title: '任务',
      taskStatus: 'in_progress',
      sessionId: 's-1',
      source: 'record',
    }
    expectTypeOf<SessionTaskLinkCard['source']>().toEqualTypeOf<'link' | 'record'>()
    expectTypeOf<SessionTaskLinkCard['claimedAt']>().toEqualTypeOf<string | undefined>() // D34 ③ 加性可选读字段
    expect(card.source).toBe('record')
  })
})

// ─────────────────────────── M3（1.1）契约面扩池 ───────────────────────────

describe('AC1 mode 词汇 + ContainerRef + settings DTO 判别（Interface 1 M3 面）', () => {
  it('MODES 恰 expedition/blitz 双值（proposals.mode CHECK 与 tasks.mode 快照共用词汇）', () => {
    expect(MODES).toEqual(['expedition', 'blitz'])
    expectTypeOf<Mode>().toEqualTypeOf<'expedition' | 'blitz'>()
  })

  it('ContainerRef = { kind: feature|proposal 判别, slug }（通用源头双列 agent 面 DTO）', () => {
    expect(CONTAINER_KINDS).toEqual(['feature', 'proposal'])
    const featureRef: ContainerRef = { kind: 'feature', slug: 'm3-bootstrap' }
    const proposalRef: ContainerRef = { kind: 'proposal', slug: 'm3-bootstrap' }
    expect(featureRef.kind).toBe('feature')
    expect(proposalRef.kind).toBe('proposal')
    expectTypeOf<ContainerRef['kind']>().toEqualTypeOf<'feature' | 'proposal'>()
  })

  it('settings DTO：worker 三项（provider/model/reasoning——四档含默认值 default=不下发 effort）', () => {
    expect(REASONING_LEVELS).toEqual(['default', 'low', 'medium', 'high'])
    const settings: ForgeSettings = { worker: { provider: 'deepseek', model: 'reasoner', reasoning: 'high' } }
    expect(settings.worker?.reasoning).toBe('high')
    const defaulted: ForgeSettings = { worker: { provider: 'zai', model: 'glm-5.3-flash', reasoning: 'default' } }
    expect(defaulted.worker?.reasoning).toBe('default')
    const empty: ForgeSettings = {}
    expect(empty.worker).toBeUndefined() // 未配置 = 键缺席 → 不携带 agentOptions 回退父会话继承
    expectTypeOf<ReasoningEffortLevel>().toEqualTypeOf<'low' | 'medium' | 'high'>()
    expectTypeOf<ForgeSettingsService['get']>().toBeCallableWith()
    expectTypeOf<ReturnType<ForgeSettingsService['get']>>().toEqualTypeOf<Promise<ForgeSettings>>()
    expectTypeOf<ReturnType<ForgeSettingsService['set']>>().toEqualTypeOf<Promise<void>>()
    // worktree 分节：跨分支风险「不再提示」持久化（可选布尔，键缺席 = 未配置不抑制）
    const worktreeSettings: ForgeSettings = { worktree: { crossBranchRiskDismissed: true } }
    expect(worktreeSettings.worktree?.crossBranchRiskDismissed).toBe(true)
    expectTypeOf<NonNullable<ForgeSettings['worktree']>['crossBranchRiskDismissed']>().toEqualTypeOf<boolean | undefined>()
  })

  it('experts 分节：DEFAULT_EXPERT_MAPPING = 17 键类型→人格键映射（随包预设 17 档案人格化）+ mapping 用户可改', () => {
    // 17 键齐备（validation-code 与 eval 两类型不带预设档案——两段缺键 → resolver 返回 undefined，persona 仅程序段），值 = 人格键非恒等
    expect(Object.keys(DEFAULT_EXPERT_MAPPING).sort()).toEqual([
      'code-quality-simplify', 'coding-cleanup', 'coding-enhancement', 'coding-feature', 'coding-fix', 'coding-refactor',
      'doc', 'doc-consolidate', 'doc-drift', 'doc-review', 'doc-summary', 'gate', 'test-run',
      'validation-ux', 'test-gen-journeys', 'test-gen-contracts', 'test-gen-scripts',
    ].sort())
    expect(DEFAULT_EXPERT_MAPPING['coding-fix']).toBe('bug-hunter')
    expect(DEFAULT_EXPERT_MAPPING['gate']).toBe('gate-keeper')
    expect(DEFAULT_EXPERT_MAPPING['doc']).toBe('tech-writer')
    expect(DEFAULT_EXPERT_MAPPING['test-run']).toBe('test-runner') // expert-squad-forge-2 验收 6：run-tests 技能退役，编排纪律正本随 test-runner 档案；test-conductor 影子档案已随专家团去冗删除
    expect(DEFAULT_EXPERT_MAPPING['validation-ux']).toBe('ui-craftsman')
    expect(DEFAULT_EXPERT_MAPPING['test-gen-journeys']).toBe('test-journey-author')
    expect(DEFAULT_EXPERT_MAPPING['test-gen-contracts']).toBe('test-contract-author')
    expect(DEFAULT_EXPERT_MAPPING['test-gen-scripts']).toBe('test-script-author')
    expect(DEFAULT_EXPERT_MAPPING['validation-code']).toBeUndefined() // 未纳入类型 = 无预设档案
    // experts 段形状：mapping Partial（只列要改指的键；值 = ctx.experts 专家键名——人格键）
    const expertsSettings: ExpertsSettings = { mapping: { 'coding-fix': 'my-fix-expert' } }
    const settings: ForgeSettings = { experts: expertsSettings }
    expect(settings.experts?.mapping?.['coding-fix']).toBe('my-fix-expert')
    expect(settings.experts?.mapping?.['gate']).toBeUndefined() // 缺键 = 默认映射生效
    expectTypeOf<NonNullable<ForgeSettings['experts']>['mapping']>().toEqualTypeOf<Partial<Record<TaskType | 'triage', string>> | undefined>()
    // set 入参同面（分节覆写语义一致）
    expectTypeOf<Parameters<ForgeSettingsService['set']>[0]['experts']>().toEqualTypeOf<ForgeSettings['experts']>()
  })
})

describe('AC6 forgeTasks/forgeProposals 服务签名容器化改写（Interface 1 M3 面）', () => {
  it('输入面：AddTaskInput/ClaimTaskInput/ListTasksQuery/TaskStatsQuery/TaskGraphQuery 恒 source: ContainerRef 族', () => {
    expectTypeOf<AddTaskInput['source']>().toEqualTypeOf<ContainerRef>()
    expectTypeOf<ClaimTaskInput['source']>().toEqualTypeOf<ContainerRef | undefined>()
    expectTypeOf<ListTasksQuery['source']>().toEqualTypeOf<ContainerRef | undefined>()
    expectTypeOf<TaskStatsQuery['source']>().toEqualTypeOf<ContainerRef | undefined>()
    expectTypeOf<TaskGraphQuery['source']>().toEqualTypeOf<ContainerRef>()
    expectTypeOf<AddTaskInput>().not.toHaveProperty('featureSlug')
    expectTypeOf<AddTaskInput>().not.toHaveProperty('mainSession') // 裁决⑦砍除
    expectTypeOf<AddTaskInput['acceptanceCriteria']>().toEqualTypeOf<string[] | undefined>() // → ac_json
  })

  it('输出面：TaskSnapshot.source/mode/acceptanceCriteria + QueryTaskResult/TaskDetail container 水化 + TaskStats.unmetPending', () => {
    expectTypeOf<TaskSnapshot['source']>().toEqualTypeOf<ContainerRef>()
    expectTypeOf<TaskSnapshot>().not.toHaveProperty('featureId')
    expectTypeOf<TaskSnapshot>().not.toHaveProperty('mainSession')
    expectTypeOf<TaskSnapshot['mode']>().toEqualTypeOf<Mode | undefined>() // 创建快照·NULL 键缺席
    expectTypeOf<TaskSnapshot['acceptanceCriteria']>().toEqualTypeOf<string[] | undefined>()
    expectTypeOf<QueryTaskResult['container']>().toEqualTypeOf<TaskContainerSummary>()
    expectTypeOf<TaskDetail['container']>().toEqualTypeOf<TaskContainerSummary>()
    expectTypeOf<TaskDetail>().not.toHaveProperty('featureId')
    expectTypeOf<TaskDetail>().not.toHaveProperty('mainSession')
    expectTypeOf<TaskStats['unmetPending']>().toEqualTypeOf<number>()
    const summary: TaskContainerSummary = { kind: 'feature', slug: 'm3', title: 'M3', mode: 'expedition', phase: 'tasks' }
    expect(summary.phase).toBe('tasks') // phase 仅 feature 容器（proposal 无相位域）
  })

  it('提案域：createProposal.mode 透传 + transitionProposal supersededBy/chained + setProposalMode/listProposalDocs 新面', () => {
    expectTypeOf<CreateProposalInput['mode']>().toEqualTypeOf<Mode | undefined>()
    expectTypeOf<TransitionProposalInput['supersededBy']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<ReturnType<ForgeProposalsService['transitionProposal']>>().toEqualTypeOf<
      Promise<TransitionProposalResult>
    >()
    expectTypeOf<TransitionProposalResult['chained']>().toEqualTypeOf<FeatureRow | undefined>()
    expectTypeOf<SetProposalModeInput>().toEqualTypeOf<{
      projectId: string
      proposalId: string
      mode: Mode
      reason: string
    }>()
    expectTypeOf<ListProposalDocsQuery>().toEqualTypeOf<{ projectId: string; slug: string }>()
    expectTypeOf<ReturnType<ForgeProposalsService['listProposalDocs']>>().toEqualTypeOf<Promise<ProposalDocRow[]>>()
  })

  it('ProposalRow 增 mode/supersededBy；ProposalCard = 行 + taskCount（容器 pill「有任务的提案」判据）', () => {
    expectTypeOf<ProposalRow['mode']>().toEqualTypeOf<Mode | undefined>() // NULL = 键缺席缺省占位
    expectTypeOf<ProposalRow['supersededBy']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<ProposalCard['taskCount']>().toEqualTypeOf<number>()
    const card: ProposalCard = {
      proposalId: 'pr-1',
      slug: 'm3',
      title: 'M3',
      proposalStatus: 'draft',
      taskCount: 0,
      createdAt: '2026-10-07T00:00:00.000Z',
      updatedAt: '2026-10-07T00:00:00.000Z',
    }
    expect(card.taskCount).toBe(0)
  })
})

describe('AC3 ForgePluginEvent 两层事件联合（Interface 3：信封 × 八事件判别 + exhaustiveness）', () => {
  it('事件类型全集 = 初集八事件 + triage 两台账事件（FORGE_PLUGIN_EVENT_TYPES 常量本尊）', () => {
    expect(FORGE_PLUGIN_EVENT_TYPES).toEqual([
      'task-claimed',
      'task-spawned',
      'task-progress',
      'task-submitted',
      'task-worker-done',
      'no-ready-task',
      'tool-error',
      'proposal-created',
      'triage-decided',
      'triage-outcome',
    ])
  })

  it('信封恒 { ts, sessionId, slug }（事件必从某会话发出；slug = 归属容器单源）', () => {
    const event: ForgePluginEvent = {
      ts: 1760222400000,
      sessionId: 'sess-1',
      slug: 'm3-bootstrap',
      type: 'no-ready-task',
      payload: { contextSlug: 'm3-bootstrap' },
    }
    expectTypeOf<ForgePluginEventEnvelope>().toHaveProperty('ts')
    expectTypeOf<ForgePluginEventEnvelope>().toHaveProperty('sessionId')
    expectTypeOf<ForgePluginEventEnvelope>().toHaveProperty('slug')
    expect(event.type).toBe('no-ready-task')
  })

  it('type 判别 exhaustiveness：十 type 穷举 switch 无 default 即编译期封闭（Record 键 = 全集）——新 type 漏处理即红', () => {
    const typeByEvent: Record<ForgePluginEvent['type'], ForgePluginEventType> = {
      'task-claimed': 'task-claimed',
      'task-spawned': 'task-spawned',
      'task-progress': 'task-progress',
      'task-submitted': 'task-submitted',
      'task-worker-done': 'task-worker-done',
      'no-ready-task': 'no-ready-task',
      'tool-error': 'tool-error',
      'proposal-created': 'proposal-created',
      'triage-decided': 'triage-decided',
      'triage-outcome': 'triage-outcome',
    }
    expect(Object.keys(typeByEvent).sort()).toEqual([...FORGE_PLUGIN_EVENT_TYPES].sort())
  })

  it('载荷形状锚：task-claimed(digest) / task-spawned(workerSessionId+toolFilter) / task-progress(phase closed set) / submitted(outcome) / worker-done(durationMs) / tool-error(code: ErrorCode)', () => {
    const claimed: TaskClaimedPayload = { taskKey: 'm3/1.1', taskType: 'coding-feature', dispatchDigest: 'abc123def456' }
    expect(claimed.dispatchDigest).toHaveLength(12)
    const spawned: TaskSpawnedPayload = {
      taskKey: 'm3/1.1',
      workerSessionId: 'worker-1',
      toolFilter: ['fs.read', 'shell.exec', 'submitTask', 'addTask'],
      model: 'deepseek-reasoner',
    }
    expect(spawned.toolFilter).toContain('submitTask')
    const progress: TaskProgressPayload = { taskKey: 'm3/1.1', phase: 'running', ts: 1_760_222_400_000 }
    expect(progress.phase).toBe('running')
    expectTypeOf<TaskProgressPayload['phase']>().toEqualTypeOf<TaskProgressPhase>()
    expectTypeOf<TaskProgressPayload['ts']>().toEqualTypeOf<number>()
    const submitted: TaskSubmittedPayload = { taskKey: 'm3/1.1', outcome: 'blocked', reason: '门红' }
    expect(submitted.outcome).toBe('blocked')
    expectTypeOf<TaskSubmittedPayload['outcome']>().toEqualTypeOf<'success' | 'blocked'>()
    const done: TaskWorkerDonePayload = { taskKey: 'm3/1.1', workerSessionId: 'worker-1', outcome: 'success', durationMs: 900_000 }
    expect(done.durationMs).toBeGreaterThan(0)
    const toolError: ToolErrorPayload = { verb: 'submitTask', code: 'ERR_TEST_EVIDENCE_REQUIRED', message: '缺测试证据' }
    expect(toolError.code).toBe('ERR_TEST_EVIDENCE_REQUIRED')
    expectTypeOf<ToolErrorPayload['code']>().toEqualTypeOf<ErrorCode>()
    const proposalCreated: ProposalCreatedPayload = { proposalId: 'pr-1', mode: 'blitz' }
    expect(proposalCreated.mode).toBe('blitz')
  })

  it('triage 两台账事件载荷形状（triage-progress-row）：decided（决策） / outcome（执行回执）', () => {
    const decided: TriageDecidedPayload = {
      taskKey: 'm3/1.1',
      attempt: 1,
      action: 'add-fix',
      note: '依赖不满足，补修复任务',
      inputDigest: 'blocked: 依赖不满足 | history: 无',
      workerSessionId: 'triage-1',
      expertKey: 'triage-analyst',
    }
    expect(decided.action).toBe('add-fix')
    expectTypeOf<TriageDecidedPayload['action']>().toEqualTypeOf<TriageDecisionAction>()
    expectTypeOf<TriageDecidedPayload['workerSessionId']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<TriageDecidedPayload['expertKey']>().toEqualTypeOf<string | undefined>()
    const outcome: TriageOutcomePayload = {
      taskKey: 'm3/1.1',
      attempt: 1,
      outcome: 'add-fix',
      fixTaskKey: 'm3/2.1',
      workerSessionId: 'triage-1',
      expertKey: 'triage-analyst',
    }
    expect(outcome.fixTaskKey).toBe('m3/2.1')
    expectTypeOf<TriageOutcomePayload['outcome']>().toEqualTypeOf<TriageDecisionAction | 'failed'>()
    expectTypeOf<TriageOutcomePayload['replayed']>().toEqualTypeOf<boolean | undefined>()
    expectTypeOf<TriageOutcomePayload['splitTaskKey']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<TriageOutcomePayload['failureReason']>().toEqualTypeOf<string | undefined>()
  })

  it('workerSessionId 缺席语义契约化：spawn 失败径 = 两事件载荷缺席该字段仍合法（台账行照记，失败原因走 outcome.failureReason）', () => {
    const decided: TriageDecidedPayload = { taskKey: 'm3/1.1', attempt: 2, action: 'escalate' }
    expect(decided.workerSessionId).toBeUndefined()
    const failed: TriageOutcomePayload = { taskKey: 'm3/1.1', attempt: 2, outcome: 'failed', failureReason: '处置子会话 spawn 失败' }
    expect(failed.workerSessionId).toBeUndefined()
    expect(failed.failureReason).toContain('spawn 失败')
    const replayed: TriageOutcomePayload = { taskKey: 'm3/1.1', attempt: 1, outcome: 'wait-external' }
    expect(replayed.replayed).toBeUndefined() // 重放径不发 decided——replayed 缺席 = 非重放（本次执行有 decided 行在先）
  })
})

describe('M3 2.1 feature_records 审计面常量（TS 单源无 DB CHECK——1.1 对齐）', () => {
  it('FEATURE_RECORD_VERBS 三值 = register/transition/doc-upsert（三动词闭包伴随）', () => {
    expect(FEATURE_RECORD_VERBS).toEqual(['register', 'transition', 'doc-upsert'])
  })
})

describe('task-pause-primitive contracts 单源面', () => {
  it('FIX_CHAIN_DEPTH_LIMIT = 6（链深上限单一事实源——core addTask 与宿主 triage 镜像值收敛于此）', () => {
    expect(FIX_CHAIN_DEPTH_LIMIT).toBe(6)
  })

  it('PAUSE_TASK_TRANSITION 锚 in_progress → suspended + verb: pause（单源标签面——词汇扩池随消费方任务落）', () => {
    expect(PAUSE_TASK_TRANSITION).toEqual({ from: 'in_progress', to: 'suspended', verb: 'pause' })
    expectTypeOf<typeof PAUSE_TASK_TRANSITION.from>().toEqualTypeOf<'in_progress'>()
    expectTypeOf<typeof PAUSE_TASK_TRANSITION.to>().toEqualTypeOf<'suspended'>()
    expectTypeOf<typeof PAUSE_TASK_TRANSITION.verb>().toEqualTypeOf<'pause'>()
  })

  it('BEFORE_SUCCESSOR_ALLOWED_STATUSES 恰 pending/blocked/suspended 三值（before 后继状态守卫单源）', () => {
    expect(BEFORE_SUCCESSOR_ALLOWED_STATUSES).toEqual(['pending', 'blocked', 'suspended'])
    expectTypeOf<BeforeSuccessorAllowedStatus>().toEqualTypeOf<'pending' | 'blocked' | 'suspended'>()
  })

  it('AddTaskInput.before 可选 string[]（后继 localId 数组——插入序单事务挂边入参）', () => {
    expectTypeOf<AddTaskInput['before']>().toEqualTypeOf<string[] | undefined>()
  })
})

describe('loop-phase-gate B1 contracts DTO 扩列', () => {
  it('UpdateTaskInput.dependsOnAppend 可选 string[]（manual 边增量白通道；与 dependsOn 互斥语义注释成文）', () => {
    expectTypeOf<UpdateTaskInput['dependsOnAppend']>().toEqualTypeOf<string[] | undefined>()
  })

  it('AddTaskInput 不含 e2e_attribution 标记字段（E2E_ATTRIBUTION_COLUMN 标记不经 addTask 参数暴露——硬约束）', () => {
    expectTypeOf<AddTaskInput>().not.toHaveProperty('e2e_attribution')
    expectTypeOf<keyof AddTaskInput>().toEqualTypeOf<
      | 'projectId'
      | 'source'
      | 'title'
      | 'type'
      | 'taskDesc'
      | 'acceptanceCriteria'
      | 'priority'
      | 'estimatedTime'
      | 'vars'
      | 'dependsOn'
      | 'before'
      | 'sourceTask'
      | 'blockSource'
      | 'breaking'
      | 'coverage'
      | 'complexity'
    >()
  })

  it('TaskStats.gatedPending: number（pending ∧ 被容器实现链阶段门持有——CE-1 挂起判据取数面）', () => {
    expectTypeOf<TaskStats['gatedPending']>().toEqualTypeOf<number>()
  })
})
