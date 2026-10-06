// forge 三小域（features/proposals/docs——2.7 合并单目录承载，服务面四分是契约、文件布局
// 非契约）typed errors。code 字面量锚定 @dsh-forge/contracts ERROR_CODES（tech-design
// §Error Handling 表：ERR_FEATURE_NOT_FOUND / ERR_FEATURE_EXISTS / ERR_PROPOSAL_NOT_FOUND /
// ERR_DOC_PATH_INVALID / ERR_INVALID_TRANSITION（feature/proposal 非法转移复用——from≠to
// 校验同源）/ ERR_REASON_REQUIRED（transitionFeature 空因））；类名/name 手写字面量
// （contracts 不持运行期名映射——表 Name 列为文档性对照）。RPC 边界（3.1）序列化为
// RpcErrorPayload { code, message, data }，UI 按 code 映射状态。
// 与 forge/tasks/errors.ts 的 InvalidTransitionError/ReasonRequiredError 同 code 异类：
// 四域互禁 import 彼此（Hard Rule），typed 类按域就近落位，跨 IPC 以 code 判别。

/** ERR_FEATURE_NOT_FOUND 附载（slug 与 id 两解析面共用——定位键随入参） */
export interface FeatureNotFoundData {
  readonly projectId: string
  /** slug→id 服务内解析（upsertFeatureDoc）未命中的 slug */
  readonly featureSlug?: string
  /** featureId 直接定位（transitionFeature）未命中的 id */
  readonly featureId?: string
}

/** feature 解析未命中（404）：featureSlug 解析未命中 / featureId 未命中 */
export class FeatureNotFoundError extends Error {
  readonly code = 'ERR_FEATURE_NOT_FOUND' as const
  readonly data: FeatureNotFoundData

  constructor(data: FeatureNotFoundData) {
    super(`feature 未命中：${data.featureSlug ?? data.featureId ?? '(空)'}（project ${data.projectId}）`)
    this.name = 'FeatureNotFoundError'
    this.data = data
  }
}

/** ERR_FEATURE_EXISTS 附载 */
export interface FeatureExistsData {
  readonly projectId: string
  readonly slug: string
}

/** registerFeature slug UNIQUE 冲突（409） */
export class FeatureExistsError extends Error {
  readonly code = 'ERR_FEATURE_EXISTS' as const
  readonly data: FeatureExistsData

  constructor(data: FeatureExistsData) {
    super(`feature 已存在：${data.slug}（project ${data.projectId}）——slug UNIQUE 冲突`)
    this.name = 'FeatureExistsError'
    this.data = data
  }
}

/** ERR_PROPOSAL_NOT_FOUND 附载 */
export interface ProposalNotFoundData {
  readonly projectId: string
  readonly proposalId: string
}

/** proposalId 未命中（404）：transitionProposal 定位 / registerFeature 谱系 FK 预检 */
export class ProposalNotFoundError extends Error {
  readonly code = 'ERR_PROPOSAL_NOT_FOUND' as const
  readonly data: ProposalNotFoundData

  constructor(data: ProposalNotFoundData) {
    super(`提案未命中：${data.proposalId}（project ${data.projectId}）`)
    this.name = 'ProposalNotFoundError'
    this.data = data
  }
}

/** ERR_DOC_PATH_INVALID 附载（readDoc 路径守卫拒绝面——威胁 ①） */
export interface DocPathInvalidData {
  readonly projectId: string
  readonly docRel: string
  /** 守卫基准（canonical(forge_dir)——诊断面；本机路径非敏感） */
  readonly forgeDir: string
}

/** readDoc 路径越界（400）：resolve 后不 startsWith(canonical(forge_dir)) */
export class DocPathInvalidError extends Error {
  readonly code = 'ERR_DOC_PATH_INVALID' as const
  readonly data: DocPathInvalidData

  constructor(data: DocPathInvalidData) {
    super(`文档路径越界拒绝：${data.docRel} 不在 forge 目录（${data.forgeDir}）内——ERR_DOC_PATH_INVALID`)
    this.name = 'DocPathInvalidError'
    this.data = data
  }
}

/** 转移域（feature 六态 / proposal 五态——非法转移复用 ERR_INVALID_TRANSITION 的同源校验面） */
export type SmallDomainTransitionKind = 'feature' | 'proposal'

/** ERR_INVALID_TRANSITION 附载（from≠to 校验同源：allowed = 词汇 − 当前态，机械排除自身） */
export interface SmallDomainInvalidTransitionData {
  readonly kind: SmallDomainTransitionKind
  readonly current: string
  readonly to: string
  /** 合法目标全集（词汇 − 当前态——零漂移证物） */
  readonly allowed: readonly string[]
}

/** feature/proposal 非法转移（409）：to === current（from≠to）或词汇外值 */
export class SmallDomainInvalidTransitionError extends Error {
  readonly code = 'ERR_INVALID_TRANSITION' as const
  readonly data: SmallDomainInvalidTransitionData

  constructor(data: SmallDomainInvalidTransitionData) {
    super(
      `非法${data.kind === 'feature' ? ' feature ' : '提案'}转移：${data.current} → ${data.to}` +
        `——合法目标 [${data.allowed.join(', ')}]`,
    )
    this.name = 'SmallDomainInvalidTransitionError'
    this.data = data
  }
}

/**
 * from≠to 同源校验（tech-design §Propagation Strategy「feature/proposal 非法转移复用
 * ERR_INVALID_TRANSITION（from≠to 校验同源）」）：allowed = 词汇机械排除当前态（人类纠偏面
 * 全列——与任务域 transitionTargets(current,'human') 同构），to ∉ allowed 即拒（涵盖
 * to === current 与词汇外值两形）。
 */
export function assertDomainTransition<T extends string>(
  kind: SmallDomainTransitionKind,
  vocab: readonly T[],
  current: T,
  to: T,
): void {
  const allowed = vocab.filter((s) => s !== current)
  if (!(allowed as readonly string[]).includes(to)) {
    throw new SmallDomainInvalidTransitionError({ kind, current, to, allowed })
  }
}

/** ERR_REASON_REQUIRED 附载（transitionFeature 空因——与任务域 transitionTask 同语义） */
export interface ReasonRequiredData {
  readonly verb: string
}

/** 转移动词空因（400）：reason trim 后为空 */
export class ReasonRequiredError extends Error {
  readonly code = 'ERR_REASON_REQUIRED' as const
  readonly data: ReasonRequiredData

  constructor(data: ReasonRequiredData) {
    super(`${data.verb} 需要 reason（转移缘由必带——空因拒绝）`)
    this.name = 'ReasonRequiredError'
    this.data = data
  }
}
