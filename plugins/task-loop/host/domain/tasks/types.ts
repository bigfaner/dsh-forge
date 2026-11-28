// tasks 域共享类型面（plugin-task-loop 1.7 内联迁移——core forge/tasks 直迁 + 容器语义
// slug 化改造，code-design §1/§6）。contracts 同名 DTO 的容器双轨面（source_kind/source_id/
// mode/surface）在本域退役：容器 = slug 本身（通用执行容器，project_key 内唯一）——
// 本文件为包内 host 面 DTO 单源（C2 裁决：包内两半共享载荷留包内不出包）。
import type { TaskStatus, TaskType } from "@dsh-forge/lib-api/labels";

export type { TaskStatus, TaskType };

/** 任务自然键（project_key 内唯一——uq_task_tasks_project_slug_local）。 */
export interface TaskRef {
  readonly slug: string;
  readonly localId: string;
}

export type TaskPriority = "P0" | "P1" | "P2";
export type TaskComplexity = "low" | "medium" | "high";

/** 受影响文件范围（结构化对象——三键封闭枚举、元素 = 相对项目根路径字符串）。 */
export interface TaskScope {
  readonly created?: readonly string[];
  readonly modified?: readonly string[];
  readonly removed?: readonly string[];
}

/** 容器引用（slug 化终态——单键 slug；source_kind 判别词退役）。 */
export interface ContainerRef {
  readonly slug: string;
}

/** 任务快照（task_tasks 行水化终态——slug 容器 + acceptance_criteria 自带判据，零 goal/spec 感知）。 */
export interface TaskSnapshot {
  readonly taskId: string;
  readonly slug: string;
  readonly localId: string;
  readonly title: string;
  readonly taskType: TaskType;
  readonly taskStatus: TaskStatus;
  readonly brief?: string;
  readonly priority?: TaskPriority;
  readonly estimatedTime?: string;
  readonly scope?: TaskScope;
  readonly context?: Readonly<Record<string, string>>;
  readonly acceptanceCriteria?: readonly string[];
  /** fix 链前驱任务 id（fix_of_task_id 值域 = task_tasks.id UUID；对外恒逻辑键——卡面用 sourceTask） */
  readonly fixOfTaskId?: string;
  readonly breaking: boolean;
  readonly coverageThreshold?: number;
  readonly complexity: TaskComplexity;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TaskPrerequisiteSummary {
  readonly slug: string;
  readonly localId: string;
  readonly taskStatus: TaskStatus;
}

export type TaskEdgeOrigin = "manual" | "fix-chain" | "autoconfig";

export interface TaskCard {
  readonly taskId: string;
  readonly slug: string;
  readonly localId: string;
  readonly title: string;
  readonly taskType: TaskType;
  readonly taskStatus: TaskStatus;
  readonly priority?: TaskPriority;
  readonly estimatedTime?: string;
  /** 仅 completed——首 claim → 末 submit 时差（ms；缺时间/时差 ≤0 不显示） */
  readonly actualDurationMs?: number;
  readonly prerequisites: readonly TaskPrerequisiteSummary[];
  readonly sessionCount: number;
  /** fix 链源自然键（fix 源标——非 fix 任务缺席） */
  readonly sourceTask?: TaskRef;
  /** run-dag 判别面终态（slug 容器——source_kind 判别词退役，容器即 slug） */
  readonly containerSlug: string;
}

export type TaskActor = "plugin-tool" | "ui" | "core";

/** 任务动词审计行水化（task_records v1 列面——note/payload_json 融合形）。 */
export interface TaskRecordEntry {
  readonly verb: string;
  readonly fromStatus?: TaskStatus;
  readonly toStatus?: TaskStatus;
  /** 非 submit 动词语境载荷（reason+summary 融合；submit 行列面对 submit 载荷封闭） */
  readonly note?: string;
  /** 非 submit 动词的结构化载荷位（update-ac 携新版判据全文等；JSON 对象解码形——
   *  typert 边界门禁 unconstrained unknown，收敛 TaskRecordJsonValue 封闭值域） */
  readonly payload?: Record<string, TaskRecordJsonValue>;
  readonly loopSourced: boolean;
  readonly digest?: string;
  readonly actor: TaskActor;
  readonly sessionId?: string;
  readonly createdAt: string;
}

/** 会话挂接卡（links ∪ records 双源分型）。 */
export interface SessionTaskLinkCard {
  readonly taskId: string;
  readonly slug: string;
  readonly localId: string;
  readonly title: string;
  readonly taskStatus: TaskStatus;
  readonly sessionId: string;
  readonly source: "link" | "record";
  readonly claimedAt?: string;
}

/** 诊断发射缝载荷（宿主侧 emitDiag 同构；本域零直落 console——兜底归装配方）。 */
export interface DiagEventPayload {
  readonly level: "info" | "warn" | "error";
  readonly event: string;
  readonly message: string;
  readonly [key: string]: unknown;
}

/** 写后事件发射器（写动词闭包尾部 emitTasksChanged）。 */
export interface TaskEvents {
  emitTasksChanged(projectKey: string): void;
}

/** 任务记录载荷 JSON 值域（递归封闭 JSON 值——typert 边界门禁 unconstrained unknown） */
export type TaskRecordJsonValue = string | number | boolean | null | readonly TaskRecordJsonValue[] | { readonly [key: string]: TaskRecordJsonValue };

/**
 * 动词装配依赖（旧 ForgeWorkspaceStore.ensureOpen(projectId) 单库句柄 → 新线共享单库
 * project_key 归属谓词注入面）：db = openDomainDb 产物连接（动词零裸开）。
 */
export interface TasksVerbDeps {
  /** task-loop.db 连接（openDomainDb().db——WAL/FK 三参数由连接工厂保证） */
  readonly db: import("@dsh-forge/lib-db").Database;
  /** 写后事件发射器（装配单例——写动词闭包尾部 emitTasksChanged） */
  readonly events: TaskEvents;
  /**
   * 续跑指针探测 + 效度比对（claim 领取瞬间取数触发简报 `<resume>` 段；缺席/undefined =
   * 首跑零段，形态兼容）。checkoutRoot = 效度比对检出根（缺席 = 机制惰性不判）。
   */
  readonly resolveEvidencePointer?: (
    projectKey: string,
    slug: string,
    localId: string,
    checkoutRoot?: string,
  ) => { pointer: string; stale: boolean } | undefined;
  /** worker 任务目录锚点节渲染（缺席/空串 = persona 零追加，形态兼容）。 */
  readonly resolveWorkerContext?: (projectKey: string, source: ContainerRef, localId: string) => string | Promise<string>;
  /** 专家档案取用面（缺席 = persona 仅程序段；档案缺失/禁用 = 实现侧 fail-loud）。 */
  readonly resolveExpertProfile?: (
    taskType: string,
    expertKey?: string,
  ) => Promise<ExpertPersonaProfile | undefined>;
  /** bug 台账 recurrence 候选只读检索（可选注入；缺席 = 交叉校验降级跳过不阻载）。 */
  readonly findRecurrenceCandidates?: (
    projectKey: string,
    scope: { readonly slug: string; readonly localId: string; readonly files: readonly string[] },
  ) => Promise<readonly BugRecurrenceCandidate[]> | readonly BugRecurrenceCandidate[];
  /** 诊断发射缝（降级径留痕；缝缺席 = 装配方 console 按级兜底）。 */
  readonly onDiag?: (payload: DiagEventPayload) => void;
}

/** 专家档案投影（persona 组装所需最小字段集）。 */
export interface ExpertPersonaProfile {
  readonly name: string;
  readonly title?: string;
  readonly personaMd: string;
  readonly expertKey?: string;
}

/** bug 台账 recurrence 候选（submitTask T2 交叉校验只读形状）。 */
export interface BugRecurrenceCandidate {
  readonly bugId: string;
  readonly summary: string;
  readonly status?: string;
  readonly errorType?: string;
  readonly containerSlug?: string;
  readonly suspectedLocation?: string;
  readonly lastSeenAt?: string;
  readonly recurrenceOf?: string;
}

/**
 * blocked 根因归类（T2 归类闸门——contracts TaskBlockClassification 直迁：worker 自报
 * 语义字段，程序只做 presence 校验与落库，永不判断归类真伪；records 载荷结构化键投影）。
 */
export interface TaskBlockClassification {
  /** 归类：new-problem = 新问题｜same-family-recurrence = 同族复发 */
  readonly kind: "new-problem" | "same-family-recurrence";
  /** 同族复发时建议携带：台账 recurrence 链前驱 bug_id（自报初判——链归属评审轮可纠） */
  readonly recurrenceOf?: string;
}

export interface TaskRecurrenceAdvisory {
  readonly kind: "upgrade-hint" | "suspected-family";
  readonly message: string;
  readonly candidates?: readonly BugRecurrenceCandidate[];
}

/** 数字摘要门报告（gate 任务结算必带）。 */
export interface TaskGateReport {
  compile?: boolean;
  fmt?: boolean;
  lint?: boolean;
  test?: boolean;
  coverage?: number;
}

/** AC 核销单项。 */
export interface TaskAcResult {
  readonly criterion: string;
  readonly met: boolean;
  readonly evidence?: string;
}

/** 测试基线简报载荷（驱动器 claim 时现查合成；纯渲染零 IO）。 */
export interface TestBaselineBrief {
  readonly present: boolean;
  readonly path?: string;
  readonly recordedAt?: string;
}
