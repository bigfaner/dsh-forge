// 1.1 AC1/AC2/AC5 —— forge 四域 DTO / 通道负载映射 / 桥事件信封 pin。
// 权威来源：tech-design §Interface 1–5（方法签名与身份双轨）/ §Interface 6（BridgeEventMessage）/
// §Interface 7（负载映射键 = 通道族键）。接口形状为编译期面——期望断言锚键结构，
// expectTypeOf 锚经 lint:test-types（tsc -p packages/contracts/tsconfig.test.json）机械执行。
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  DOCS_CHANNELS,
  FEATURES_CHANNELS,
  FORGE_EVENT_CHANNELS,
  PROJECTS_M2_CHANNELS,
  PROPOSALS_CHANNELS,
  TASKS_CHANNELS,
} from '../channels.js'
import type {
  BridgeEventMessage,
  DocContent,
  DocsChannelRequests,
  FeatureCard,
  FeaturesChannelRequests,
  ForgeDocsService,
  ForgeFeaturesService,
  ForgeProposalsService,
  ForgeTasksService,
  ProjectServiceM2,
  ProposalCard,
  ProposalsChannelRequests,
  SessionTaskLinkCard,
  TaskCard,
  TaskDetail,
  TasksChannelRequests,
  TaskSnapshot,
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

  it('ForgeFeaturesService 五法 / ForgeProposalsService 三法 / ForgeDocsService 一法', () => {
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
      'listProposals',
    ]
    const docsMethods: readonly (keyof ForgeDocsService)[] = ['read']
    expect(featureMethods).toHaveLength(5)
    expect(proposalMethods).toHaveLength(3)
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
    expectTypeOf<ProposalsChannelRequests>().not.toHaveProperty('transitionProposal')
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
