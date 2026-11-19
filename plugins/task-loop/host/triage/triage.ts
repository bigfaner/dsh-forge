// triage · 处置代理面板（S1c 第二层——LoopTriageHook 实装）。blocked 无 follow-up 时由
// 循环驱动器触发：spawn 一次性处置 subagent（与 worker 同款 in-process 形态——decisions
// #16/#23：同进程、同一 SpawnWorker 真绑定、agentOptions 继承链一致），输入 = 任务简报/
// blocked reason 全文/池快照/最近记录四件套，终态 output 经结构化决策解析交还宿主忠实执行。
//
// 决策权与执行权分离：处置代理只持只读台账两工具（deriveTriageToolFilter——getBug/listBugs
// 只读放开供台账深挖，loop-recurrence-hardening §2.2.1；缺陷写面/任务写面/shell/fs 恒 deny
// ——越权动作结构性不可达），只能以终态文本产出一行 JSON 决策；解析失败/越权动作 →
// TriageDecisionInvalidError（宿主计处置失败入重试上限——R2 模型失误爆炸半径有界）。
//
// 依赖方向：triage → loop（钩子接口/决策类型）/ dispatch-core（spawn 契约与组装面）/
// 任务域读面单向；驱动器不 import 本面（装配方注入 deps.triage——可拆卸，缺席 = 仅落盘续领）。
//
// 人格解析单点（1.12 直迁改造）：resolveTriagePersona 本文件单点导出——experts 取用缝在
// 场 = settings.experts.mapping?.triage 覆盖 > 预设键（键链原样）；取用缝缺席（experts
// 服务缺席，AGENTS 1.6 现查不缓存）= fail-soft 走程序段缺省人格 GENERIC_TRIAGE_PERSONA
// + emitDiag info 留痕；取用缝在场但档案键坏 = fail-loud 上抛（现有行为）。
import type { ForgeSettingsService } from "@dsh-forge/contracts";
import {
  deriveTriageToolFilter,
  poolOf,
  reconcileWorkerReasoning,
  sameSeamCountOf,
  workerAgentOptionsOf,
} from "../dispatch-core/index.js";
import type { PoolSnapshot, SameSeamRecurrenceFace, SpawnWorker } from "../dispatch-core/index.js";
import type { LoopTriageDecisionResult, LoopTriageHook, LoopTriageInput } from "../loop/index.js";
import { TRIAGE_EXPERT_KEY } from "../loop/index.js";
import type { ExpertProfileResolver, ForgeExpertProfile, ForgeDiagEmitFace } from "../faces.js";
import { emitForgeDiag } from "../faces.js";
import type { TaskBlockClassification, TaskRecordEntry } from "../domain/tasks/types.js";
import type { TasksService } from "../domain/tasks/service.js";
import { parseTriageDecision } from "./decision.js";
import { composeTriagePrompt } from "./prompt.js";
import type { TriageRecurrenceSignal, TriageSignals } from "./prompt.js";


/**
 * 程序段缺省人格（GENERIC 档——experts 取用缝缺席时的 fail-soft 兜底文本档，非空）：
 * 通用处置分析员纪律——决策与建议只出、执行不做、证据指针化、无把握上浮。
 */
export const GENERIC_TRIAGE_PERSONA = [
  "你是派发循环的异常处置分析员（通用兜底人格——专家档案服务缺席时的程序段缺省档）。",
  "职责：基于任务简报、阻塞原因全文、池快照与最近记录研判处置方案；必要时经只读台账工具深挖同族缺陷背景。",
  "信条：只做决策与建议，不执行任何处置操作；台账证据以指针化引用携带，不整段搬运；无把握宁可上浮 escalate。",
].join("\n")

/** 档案人格段（与 core claim 链 renderExpertProfileSection 同构——身份头 + personaMd 正文；
 *  本包不依赖 core 包（类型出自 faces 投影），组装面就地同形承载，persona 单源纪律不变） */
function personaSectionOf(profile: ForgeExpertProfile): string {
  const title = profile.title ?? profile.name;
  const gap = /^[A-Za-z]/.test(title) ? " " : "";
  return `你是${gap}${title}。\n\n${profile.personaMd}`
}

/**
 * 父会话真机已注册全局工具名读取位（bug 989997bd——triage deny 表与真机工具面求交的
 * 取数缝）：结构化读 parent.ctx.tools.schemas()（官方 dsh-tools 公开投影面，逐 schema
 * 取 name——child restrictableNames 的父域投影）。任一环缺席/形状不符/调用抛错 =
 * undefined（取数失败回落全表 deny——与修复前 loud 行为一致，不静默收窄成空表）。
 */
function registeredToolNamesOf(parent: unknown): readonly string[] | undefined {
  if (typeof parent !== "object" || parent === null) return undefined;
  const ctx = (parent as { ctx?: unknown }).ctx;
  if (typeof ctx !== "object" || ctx === null) return undefined;
  const tools = (ctx as { tools?: unknown }).tools;
  if (typeof tools !== "object" || tools === null) return undefined;
  const schemas = (tools as { schemas?: unknown }).schemas;
  if (typeof schemas !== "function") return undefined;
  let projected: unknown;
  try {
    projected = (schemas as (this: unknown) => unknown).call(tools)
  } catch {
    return undefined;
  }
  if (!Array.isArray(projected)) return undefined;
  const names: string[] = [];
  for (const schema of projected) {
    if (typeof schema !== "object" || schema === null) return undefined;
    const name = (schema as { name?: unknown }).name;
    if (typeof name !== "string") return undefined;
    names.push(name)
  }
  return names;
}

/** 处置代理依赖（装配注入——服务面一次性绑定；循环身份不经此，每循环载体走 LoopTriageInput） */
export interface TriageHookDeps {
  /** 任务域服务读面（池快照 taskStats + 最近记录 queryTask——输入四件套之③④） */
  readonly tasks: Pick<TasksService, "taskStats" | "queryTask">;
  /** in-process driver spawn 真绑定（与 worker 同一装配单例） */
  readonly spawn: SpawnWorker;
  /** forgeSettings 服务面（可选——persona 键链 experts.mapping 读取，缺席回退预设键） */
  readonly settings?: Pick<ForgeSettingsService, "get">;
  /** 模型推理档位目录解析（可选——组装面兼容收口同 worker） */
  readonly resolveModelReasoning?: (provider: string, model: string) => Promise<readonly string[] | undefined>;
  /** 专家档案取用缝（可选——triage persona 档案合成；缺席 = GENERIC_TRIAGE_PERSONA 兜底
   *  + diag info 留痕（fail-soft）；在场但档案键坏 = fail-loud 上抛（现有行为）） */
  readonly resolveExpertProfile?: ExpertProfileResolver;
  /** 台账 recurrence 候选只读检索面（loop-recurrence-hardening §2.2.1 两信号之一——结构兼容
   *  claim 守卫 T3 注入形；缺席/故障 = 信号退化，fail-soft 不阻处置主链） */
  readonly findRecurrenceCandidates?: SameSeamRecurrenceFace;
  /** 诊断发射缝（AGENTS §7——降级径留痕：experts 缺席 info / 台账读故障 warn；缺席 = console 兜底） */
  readonly diag?: ForgeDiagEmitFace;
  /**
   * 全局工具注册名读取缝（plugin-task-loop/1.18-a 判例——parent 投影在官方 harness 形状
   * 不命中时 deny 未知名拆 spawn）：优先取跨 preset 并集探针（异步——global ∪ preset scope
   * 并集，plugin-forge index 同径配方）；缺席/undefined 回落 parent 探针。
   */
  readonly globalToolNames?: () => readonly string[] | undefined | Promise<readonly string[] | undefined>;
}

/** 人格解析依赖（resolveTriagePersona 入参面——TriageHookDeps 的 persona 相关子集） */
export interface TriagePersonaDeps {
  /** forgeSettings 服务面（可选——experts.mapping.triage 键覆盖；缺席 = 预设键） */
  readonly settings?: Pick<ForgeSettingsService, "get">;
  /** 专家档案取用缝（可选——experts 服务缺席面；缺席 = GENERIC 档 + info 留痕） */
  readonly resolveExpertProfile?: ExpertProfileResolver;
  /** 诊断发射缝（缺席 = console 兜底） */
  readonly diag?: ForgeDiagEmitFace;
}

/** 人格解析上下文（诊断载荷定位字段——taskKey 呈现键 'slug/localId'） */
export interface TriagePersonaCtx {
  readonly projectId?: string;
  readonly taskKey?: string;
}

/**
 * 人格解析单点（1.12 直迁改造——本面唯一 persona 消费口，消费点现查不缓存）：
 * - 取用缝在场（experts 服务在）：键 = settings.experts.mapping?.triage ?? 预设键（键链
 *   原样）→ 档案 → personaSectionOf；档案键坏（resolver 抛错）= fail-loud 原样上抛。
 * - 取用缝缺席（experts 服务缺）：fail-soft 走 GENERIC_TRIAGE_PERSONA 程序段缺省档 +
 *   emitDiag info 留痕（AGENTS 1.6 配方）。
 * 返回 persona + profile（profile 供 agentOptions 路由对组装——档案 provider+model 成对
 * 在场必须与 worker 同径进 agentOptions，bug 14984d4f 同族防线）。
 */
export async function resolveTriagePersona(
  deps: TriagePersonaDeps,
  ctx: TriagePersonaCtx = {},
): Promise<{ persona?: string; profile?: ForgeExpertProfile }> {
  if (deps.resolveExpertProfile === undefined) {
    // experts 服务缺席 = fail-soft 通用兜底档 + info 留痕（检测结果现查不缓存——每调用求值）
    emitForgeDiag(deps.diag, {
      level: "info",
      event: "experts-absent",
      message: `triage 人格降级：experts 取用缝缺席${ctx.taskKey !== undefined ? `（${ctx.taskKey}）` : ""}——走 GENERIC_TRIAGE_PERSONA 程序段缺省档（核销装配面接线）`,
      ...(ctx.projectId !== undefined ? { projectId: ctx.projectId } : {}),
    })
    return { persona: GENERIC_TRIAGE_PERSONA }
  }
  const settings = deps.settings !== undefined ? await deps.settings.get() : undefined;
  const key = settings?.experts?.mapping?.triage ?? TRIAGE_EXPERT_KEY;
  const profile = await deps.resolveExpertProfile("triage", key)
  // 键恒在场（预设兜底）→ profile 恒定义；undefined 仅为类型面收窄，防御性回退 GENERIC 档
  if (profile === undefined) {
    return { persona: GENERIC_TRIAGE_PERSONA }
  }
  return { persona: personaSectionOf(profile), profile }
}

/** blocked submit 记录的结构化归类提取（records 载荷投影——v1 列面 blockClassification 走
 *  payload 结构化键；新 → 旧取首个携带者，零载荷行跳过 = 信号缺席） */
function classificationOf(records: readonly TaskRecordEntry[]): TaskBlockClassification | undefined {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const entry = records[index];
    if (entry === undefined || entry.verb !== "submit" || entry.toStatus !== "blocked") continue;
    const payload: unknown = entry.payload;
    if (typeof payload !== "object" || payload === null) continue;
    const classification = (payload as { blockClassification?: unknown }).blockClassification;
    if (typeof classification === "object" && classification !== null) {
      const kind = (classification as { kind?: unknown }).kind;
      if (kind === "new-problem" || kind === "same-family-recurrence") return classification as TaskBlockClassification;
    }
  }
  return undefined;
}

/**
 * 建处置代理钩子（LoopTriageHook 实装——装配方注入循环驱动器 deps.triage）：
 * run = 输入四件套现读（池 taskStats + 任务 queryTask records）→ 类型化提示词组装 →
 * in-process spawn（一次性、全收窄工具面）→ await handle.result → dispose → 决策解析。
 * 任何一步失败（读面/spawn/解析）原样上抛——驱动器按处置失败计入重试上限。
 */
export function createTriageHook(deps: TriageHookDeps): LoopTriageHook {
  return {
    async run(input: LoopTriageInput): Promise<LoopTriageDecisionResult> {
      // ① 输入四件套之③④：池快照 + 最近记录（现读——处置瞬间取数）
      const [stats, detail] = await Promise.all([
        deps.tasks.taskStats({ projectKey: input.projectId, slug: input.source.slug }),
        deps.tasks.queryTask({
          projectKey: input.projectId,
          taskRef: { slug: input.task.slug, localId: input.task.localId },
          include: { records: true },
        }),
      ])
      const pool: PoolSnapshot = poolOf(stats)
      const records: readonly TaskRecordEntry[] = detail.records ?? [];
      // ② 两信号（loop-recurrence-hardening §2.2.1——程序面现读结构化事实，语义判断留 agent）：
      //    blocked 归类 = blocked submit 记录载荷的结构化键；recurrence 链 = 只读 face 现查
      //    （fail-soft 同 claim 守卫——数据源不洁不阻断处置主链）。
      const classification: TaskBlockClassification | undefined = classificationOf(records)
      let recurrence: TriageRecurrenceSignal | undefined;
      if (deps.findRecurrenceCandidates === undefined) {
        // AGENTS §7 降级留痕：face 缺席 = 处置两信号之一生产静默关停（bug 0db72bcb 教训）
        emitForgeDiag(deps.diag, {
          level: "info",
          event: "recurrence-face-absent",
          message: `triage 处置信号降级：findRecurrenceCandidates face 缺席（${input.task.slug}/${input.task.localId}）——recurrence 链信号缺席（核销装配面接线）`,
          projectId: input.projectId,
        })
      } else {
        try {
          const candidates = await deps.findRecurrenceCandidates(input.projectId, {
            slug: input.task.slug,
            localId: input.task.localId,
            sourceTaskId: input.task.fixOfTaskId,
          })
          if (candidates.length > 0) {
            // recurrence-signal-tiering：全史候选列表透传（呈现限幅归提示词组装）+
            // 同缝计数 = fullEdgeCount 最大值（单一计数源，core face 恒产出）
            recurrence = { candidates, count: sameSeamCountOf(candidates) }
          }
        } catch (cause) {
          // fail-soft：台账读故障降级——两信号缺席，提示词照常组装 + warn 留痕
          emitForgeDiag(deps.diag, {
            level: "warn",
            event: "recurrence-face-error",
            message: `triage 处置信号降级：台账候选检索故障（${input.task.slug}/${input.task.localId}）——${cause instanceof Error ? cause.message : String(cause)}`,
            projectId: input.projectId,
          })
        }
      }
      const signals: TriageSignals | undefined =
        classification !== undefined || recurrence !== undefined ? { ...(classification !== undefined ? { classification } : {}), ...(recurrence !== undefined ? { recurrence } : {}) } : undefined;
      // ③ 类型化提示词（任务简报 + reason 全文 + 池快照 + 最近记录 + 改进 6 增补件 +
      //    两信号：输入面在场才注入，缺席 = 退化现状提示词）
      const prompt = composeTriagePrompt({
        task: input.task,
        reason: input.reason,
        pool,
        records,
        ...(input.lastFailure !== undefined ? { lastFailure: input.lastFailure } : {}),
        ...(input.fixChain !== undefined ? { fixChain: input.fixChain } : {}),
        ...(input.noProgress === true ? { noProgress: true } : {}),
        ...(signals !== undefined ? { signals } : {}),
      })
      // ③ in-process spawn（与 worker 同款形态；agentOptions 继承链一致；parent/signal =
      //    每循环身份载体——输入面逐调用绑定，装配期烘焙无效）
      // 人格解析（单点 resolveTriagePersona）：experts 缺席 = GENERIC 档 fail-soft；键坏 =
      // fail-loud 上抛（宿主计处置失败入重试上限）。
      const { persona, profile } = await resolveTriagePersona(deps, {
        projectId: input.projectId,
        taskKey: `${input.task.slug}/${input.task.localId}`,
      })
      // Root cause（bug 14984d4f 同族——处置代理与 worker 同一丢失面）：档案 provider+model
      // 成对在场 = 自带完整路由对，必须与 worker 同径进入 agentOptions 组装；此前仅 persona
      // 消费档案、路由对被丢弃回落父继承（task-spawned 审计 model='inherit' 同位证）。
      // expert-squad-default-routing：路由源 = experts 服务折叠应答（profile）——与 worker
      // 同一取用面，forgeSettings.worker 机械读取径退役（settings 仅存 experts.mapping 键）。
      const agentOptions = await reconcileWorkerReasoning(
        workerAgentOptionsOf({ entry: profile }),
        deps.resolveModelReasoning,
      )
      const handle = await deps.spawn({
        prompt,
        parent: input.parent,
        signal: input.signal,
        toolFilter: deriveTriageToolFilter(
          (await deps.globalToolNames?.()) ?? registeredToolNamesOf(input.parent),
        ),
        ...(agentOptions !== undefined ? { agentOptions } : {}),
        ...(persona !== undefined ? { persona } : {}),
        label: `${input.task.slug}/${input.task.localId} · 处置分析`,
      })
      // ④ 终态 output → 结构化决策 + 处置子会话 id 上浮（triage-progress-row 契约定形——
      //    spawn 产物 handle 直取 workerSessionId；dispose 幂等收尾——成功失败同径）
      let output: string;
      try {
        ;({ output } = await handle.result)
      } finally {
        await handle.dispose()
      }
      return { decision: parseTriageDecision(output), workerSessionId: handle.workerSessionId }
    },
  }
}
