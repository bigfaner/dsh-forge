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
  SETTINGS_CHANNELS,
  TASKS_CHANNELS,
} from '../channels.js'
import type { ErrorCode } from '../errors.js'
import { CONTAINER_KINDS, FORGE_PLUGIN_EVENT_TYPES, MODES, REASONING_LEVELS } from './forge.js'
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
  TaskSpawnedPayload,
  TaskStats,
  TaskStatsQuery,
  TaskSubmittedPayload,
  TaskWorkerDonePayload,
  TasksChannelRequests,
  TaskSnapshot,
  ToolErrorPayload,
  TransitionProposalInput,
  TransitionProposalResult,
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
})

describe('AC1 服务面方法签名锚（Interface 1–5 逐项在场）', () => {
  it('ForgeTasksService 十一法（动词×4 + 校验 + 读面×6）', () => {
    const methods: readonly (keyof ForgeTasksService)[] = [
      'addTask',
      'claimTask',
      'submitTask',
      'transitionTask',
      'queryTask',
      'validateFeatureTasks',
      'listTasks',
      'taskStats',
      'taskGraph',
      'taskDetail',
      'sessionLinks',
    ]
    expect(methods).toHaveLength(11)
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
})

describe('AC5 BridgeEventMessage 信封（Interface 6：channel/payload 只读）', () => {
  it('信封 channel = forge:events/tasks-changed 常量本尊；载荷 { projectId } 只读', () => {
    const message: BridgeEventMessage = {
      type: 'event',
      channel: FORGE_EVENT_CHANNELS.tasksChanged,
      payload: { projectId: 'p-1' },
    }
    expect(message.channel).toBe('forge:events/tasks-changed')
    expect(message.payload.projectId).toBe('p-1')
    expectTypeOf<BridgeEventMessage['channel']>().toEqualTypeOf<
      (typeof FORGE_EVENT_CHANNELS)['tasksChanged']
    >()
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

  it('settings DTO：worker 三项（provider/model/reasoning——reasoning → agentOptions.effort 直映射注记）', () => {
    expect(REASONING_LEVELS).toEqual(['low', 'medium', 'high'])
    const settings: ForgeSettings = { worker: { provider: 'deepseek', model: 'reasoner', reasoning: 'high' } }
    expect(settings.worker?.reasoning).toBe('high')
    const empty: ForgeSettings = {}
    expect(empty.worker).toBeUndefined() // 未配置 = 键缺席 → 不携带 agentOptions 回退父会话继承
    expectTypeOf<ForgeSettingsService['get']>().toBeCallableWith()
    expectTypeOf<ReturnType<ForgeSettingsService['get']>>().toEqualTypeOf<Promise<ForgeSettings>>()
    expectTypeOf<ReturnType<ForgeSettingsService['set']>>().toEqualTypeOf<Promise<void>>()
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

describe('AC3 ForgePluginEvent 两层事件联合（Interface 3：信封 × 七事件判别 + exhaustiveness）', () => {
  it('事件类型全集 = 七事件初集（FORGE_PLUGIN_EVENT_TYPES 常量本尊）', () => {
    expect(FORGE_PLUGIN_EVENT_TYPES).toEqual([
      'task-claimed',
      'task-spawned',
      'task-submitted',
      'task-worker-done',
      'no-ready-task',
      'tool-error',
      'proposal-created',
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

  it('type 判别 exhaustiveness：七 type 穷举 switch 无 default 即编译期封闭（Record 键 = 全集）', () => {
    const typeByEvent: Record<ForgePluginEvent['type'], ForgePluginEventType> = {
      'task-claimed': 'task-claimed',
      'task-spawned': 'task-spawned',
      'task-submitted': 'task-submitted',
      'task-worker-done': 'task-worker-done',
      'no-ready-task': 'no-ready-task',
      'tool-error': 'tool-error',
      'proposal-created': 'proposal-created',
    }
    expect(Object.keys(typeByEvent).sort()).toEqual([...FORGE_PLUGIN_EVENT_TYPES].sort())
  })

  it('载荷形状锚：task-claimed(digest) / task-spawned(workerSessionId+toolFilter) / submitted(outcome) / worker-done(durationMs) / tool-error(code: ErrorCode)', () => {
    const claimed: TaskClaimedPayload = { taskKey: 'm3/1.1', taskType: 'coding-feature', dispatchDigest: 'abc123def456' }
    expect(claimed.dispatchDigest).toHaveLength(12)
    const spawned: TaskSpawnedPayload = {
      taskKey: 'm3/1.1',
      workerSessionId: 'worker-1',
      toolFilter: ['fs.read', 'shell.exec', 'submitTask', 'addTask'],
      model: 'deepseek-reasoner',
    }
    expect(spawned.toolFilter).toContain('submitTask')
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
})
