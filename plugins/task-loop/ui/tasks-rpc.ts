// forgeTasks Typert namespace client 窄面（1.13——ui-slots.md §③ B2 处方：dsh web /
// desktop 正门 = task-loop 自有 Typert Remote namespace 快照方法族，键名沿用
// forge:tasks/* 读面、transport 改型；快照方法族返回聚合 DTO——TaskCard 扩展 acProgress
// 批水化在 host 半单点完成，client 零拼装）。
//
// face 安装：entry apply 期 ctx.inject(['remote', 'remote.forgeTasks']) 子 fiber 安装解析缝
// （官方 client-ui-forge mount.ts:339 同型——namespace 服务由 host 半 TypertRemoteService
// 经 gateway 下发，子 fiber 停驻至 namespace 在场后激活）；缺席宿主 = 调用期诚实降级
// （typed Error + 诊断留痕，不炸组合）。泛型基型实例化点单点收口：方法签名/DTO 载荷/
// Result 信封均以本文件为 client 半唯一实例化面（code-design §2 类型面守则）。
import { RpcClientError, forgeRemoteFaceOf, namespaceFaceOf, type ForgeRemoteFace, type ForgeRemoteNamespaceFace } from "./rpc.js";

// ── 聚合 DTO 结构镜像（host 半 host/assembly/typert-remotes.ts 单源——client 束自含纪律：
// type-only 形态经本镜像收口；两侧同形由 tests/ui 结构赋值机检 pin）──

/** AC 核销进度（最新结算行判据核销计数——done = met 数、total = 判据总数） */
export interface AcProgress {
  readonly done: number;
  readonly total: number;
}

/** 任务卡（host TaskCard 同形切片——概览行渲染所需字段族） */
export interface TaskCardView {
  readonly taskId: string;
  readonly slug: string;
  readonly localId: string;
  readonly title: string;
  readonly taskType: string;
  readonly taskStatus: string;
  readonly containerSlug: string;
  readonly acProgress?: AcProgress;
}

/** 容器任务图 DTO（cards 全量水化 AC 进度 + 边三元组） */
export interface TaskGraphDtoView {
  readonly tasks: readonly TaskCardView[];
  readonly edges: readonly { readonly from: string; readonly to: string; readonly origin?: string }[];
}

/** 任务板快照（follow 流帧载荷——cards + stats 一次取齐） */
export interface TaskBoardDtoView {
  readonly projectKey: string;
  readonly cards: readonly TaskCardView[];
  readonly stats: {
    readonly total: number;
    readonly byStatus: Readonly<Record<string, number>>;
    readonly unmetPending?: number;
    readonly gatedPending?: number;
  };
}

/** follow 流全量快照信封（Envelope<T>——baseline 帧 seq=0，泛型基型实例化点） */
export interface TasksBoardEnvelope {
  readonly seq: number;
  readonly snapshot: TaskBoardDtoView;
}

/** list 查询参（host TasksRemoteListQuery 消费切片——身份官方语境 projectId，bug 9407ff29
 *  修型：客户端零投影零派生，host 半 forge.projects 缝解析归属键） */
export interface TasksListQuery {
  readonly projectId: string;
  readonly slug?: string;
  readonly search?: string;
  readonly sort?: "created" | "priority";
}

/** follow 查询参（list 同形作用域——容器限定可选） */
export interface TasksFollowQuery {
  readonly projectId: string;
  readonly slug?: string;
}

/** forgeTasks namespace 方法族消费切片（host ForgeTasksRemote 同形——快照读 + follow 流） */
export interface ForgeTasksNamespaceFace {
  readonly [method: string]: ((...args: never[]) => unknown) | undefined;
}

/** 解析缝（entry apply 期安装——逐调用现查不缓存，AGENTS 1.6） */
let forgeTasksResolver: (() => ForgeTasksNamespaceFace | undefined) | undefined;
let tasksDiag: ((line: string) => void) | undefined;

/** 官方 ctx.remote face 窄形（forgeTasks 可选族——归一取法经 namespaceFaceOf 三形态回退） */
type RemoteFaceWithTasks = ForgeRemoteFace & { readonly forgeTasks?: ForgeRemoteNamespaceFace };

/**
 * 安装 forgeTasks namespace 解析缝（entry apply 期 ctx.inject 子 fiber 调用一次）；
 * onDiag = 降级诊断注入（client 束豁免面 console 兜底）。
 */
export function installForgeTasksFace(
  resolver: () => ForgeTasksNamespaceFace | undefined,
  onDiag?: (line: string) => void,
): void {
  forgeTasksResolver = resolver;
  if (onDiag !== undefined) tasksDiag = onDiag;
}

/** forgeTasks namespace 现查（本地缝优先；缺席 = undefined——调用方诚实降级） */
export function forgeTasksFaceOf(): ForgeTasksNamespaceFace | undefined {
  const local = forgeTasksResolver?.();
  if (local !== undefined) return local;
  try {
    const face = forgeRemoteFaceOf() as RemoteFaceWithTasks | undefined;
    return face === undefined ? undefined : namespaceFaceOf(face, "forgeTasks" as never) as ForgeTasksNamespaceFace | undefined;
  } catch {
    return undefined;
  }
}

/** 方法取法（缺席/非函数 = typed 降级 throw——诊断留痕不静默炸装配） */
function methodOf(method: string): (...args: unknown[]) => unknown {
  const ns = forgeTasksFaceOf();
  const fn = ns?.[method] as unknown;
  if (typeof fn !== "function") {
    const line = `dsh-forge task-loop client: forgeTasks namespace 缺席（${method}）——快照方法族不可达（诚实降级）`;
    (tasksDiag ?? ((l) => console.warn(`[forge-tasks-rpc] ${l}`)))(line);
    throw new Error(line);
  }
  return fn as (...args: unknown[]) => unknown;
}

/** Result 信封投影（ok → data；error → RpcClientError——形状非法 fail-loud） */
async function envelopeOf<T>(raw: unknown, method: string): Promise<T> {
  if (raw === null || typeof raw !== "object" || !("ok" in raw)) {
    throw new Error(`dsh-forge task-loop client: forgeTasks/${method} 响应形状非法（期望 Result 信封）`);
  }
  const result = raw as { ok: boolean; value?: unknown; error?: { code?: unknown; message?: unknown; details?: unknown } };
  if (result.ok) return result.value as T;
  throw new RpcClientError({
    code: (typeof result.error?.code === "string" ? result.error.code : "internal") as never,
    message: typeof result.error?.message === "string" ? result.error.message : "forgeTasks failure",
    data: result.error?.details,
  });
}

/** forgeTasks 读面 client（概览 tab 数据单门——降级重取与降级终态由调用面编排） */
export interface ForgeTasksRpc {
  list(q: TasksListQuery): Promise<TaskCardView[]>;
  graph(q: TasksListQuery): Promise<TaskGraphDtoView>;
  follow(q: TasksFollowQuery): AsyncIterable<TasksBoardEnvelope>;
}

export function createForgeTasksClient(): ForgeTasksRpc {
  return {
    list: (q) => envelopeOf<TaskCardView[]>(methodOf("list")(q), "list"),
    graph: (q) => envelopeOf<TaskGraphDtoView>(methodOf("graph")(q), "graph"),
    follow: (q) => methodOf("follow")(q) as AsyncIterable<TasksBoardEnvelope>,
  };
}

/** client 构造器类型（注入 = 测试面覆写） */
export type ForgeTasksClientFactory = () => ForgeTasksRpc;
