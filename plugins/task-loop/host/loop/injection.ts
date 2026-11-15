// loop · 动态注入切片（plugin-forge src/loop/injection.ts 直迁——proposal plugin-task-loop
// 任务 1.11 只迁 payloadOf + escalationNarrative + renderP3 + interpolate/
// detectResidualPlaceholder 所需切片；slug 化：InjectionPayload.sourceKind 字段退役，
// renderP3 模板双参措辞改 slug 单参。其余模板（P1/P5-P9/renderInjection section 投影）
// 随循环驱动器迁移任务落位）。占位符沿用「模板 + 类型化载荷」渲染机制；残留 <...> =
// 渲染失败（调用方 fail-soft 处置）。
import type { LoopEscalation } from "./driver-face.js";
import type { LoopRecord } from "./registry.js";

/** 类型化载荷（渲染插值面——数值与键名取自登记与结算读数，机制侧补齐） */
export interface InjectionPayload {
  readonly slug: string;
  readonly ownerSessionId: string;
  /** 呈现键 'slug/localId'（叙述口径短形——P3 用） */
  readonly taskKey: string;
  readonly reason: string;
  /** 处置历史（逐次记录——'；' 连接单行化） */
  readonly history: string;
  /** 结束族计数（驻留段不含） */
  readonly completed: number;
  readonly blocked: number;
}

/** 从升级事件派生叙述三元组（reason/history/taskKey——联合类型逐分支收窄） */
function escalationNarrative(escalation: LoopEscalation): {
  readonly reason: string;
  readonly history: readonly string[];
  readonly taskKey: string;
} {
  if ("task" in escalation) {
    return {
      reason: escalation.reason,
      history: "history" in escalation ? escalation.history : [],
      taskKey: `${escalation.task.slug}/${escalation.task.localId}`,
    };
  }
  if ("taskKey" in escalation) {
    return { reason: "reason" in escalation ? escalation.reason : "", history: [], taskKey: escalation.taskKey };
  }
  if ("blockedItems" in escalation) {
    return { reason: "", history: [], taskKey: escalation.blockedItems[0]?.taskKey ?? "" };
  }
  return { reason: escalation.reason, history: [], taskKey: "" };
}

/** 登记行 → 类型化载荷（纯投影读数——slug/ownerSessionId/taskKey/reason/history 取自 record） */
export function payloadOf(record: LoopRecord): InjectionPayload {
  const suspension = record.suspended;
  const narrative = suspension !== undefined ? escalationNarrative(suspension.escalation) : undefined;
  return {
    slug: record.source.slug,
    ownerSessionId: record.ownerSessionId,
    taskKey: narrative?.taskKey ?? record.inFlight?.taskKey ?? "",
    reason: narrative?.reason ?? "",
    history: (narrative?.history ?? []).join("；"),
    completed: 0,
    blocked: 0,
  };
}

/** 占位符插值（模板 + 键值表——`<key>` 逐个替换为目标实际值） */
function interpolate(template: string, values: Record<string, string>): string {
  let text = template;
  for (const [key, value] of Object.entries(values)) {
    text = text.replaceAll(`<${key}>`, value);
  }
  return text;
}

/** 残留占位符检测（`<...>` = 渲染失败——返回告警行；干净 = undefined。导出供模板编写期断言复用） */
export function detectResidualPlaceholder(text: string): string | undefined {
  const residual = /<[^<>\n]+>/.exec(text);
  return residual !== null ? `残留占位符 ${residual[0]}` : undefined;
}

// ── P3 模板正本（直迁——slug 单参措辞：dispatchTask(slug='<slug>', resume: true)）──────

const P3_TEMPLATE = `【任务循环挂起】
**挂起信息**
- 任务 <taskKey> 以 blocked 结束，循环已暂停，等待处理。
- 原因：<reason 全文>
- 已尝试：<history>
**复核要求**
- 以上是 worker 的原始汇报，可能不完整或有误——先分析验证（读相关代码、任务简报、queryTask 记录），形成你自己的判断。
- 处理产物（任务描述、验收标准）应包含你补充的必要信息；不要把原始问题原文直接转为任务。
**处理方式（三选一）**
- 派修复任务：addTask（source_task + blockSource=true，taskDesc 写明复核结论、复现路径与验收标准）。
- 修改任务：updateTask 调整范围或验收标准（适用范围同协作规则）。
- 转交用户决定，得到结论后执行上述任一步。
**续跑**
- 处理完成后重新调用 dispatchTask(slug='<slug>', resume: true)：从暂停处继续，已完成任务不会重跑（未携 resume: true 的触碰不会续接挂起循环）。
- 处理完成前循环不会推进。
- 处置入口：任意会话凭容器 <slug> dispatchTask 认领挂起循环继续处置。`;

/** 占位符键值表（插值单源——slug 单键，source_kind 键退役） */
function placeholderValues(payload: InjectionPayload): Record<string, string> {
  return {
    slug: payload.slug,
    ownerSessionId: payload.ownerSessionId,
    taskKey: payload.taskKey,
    "reason 全文": payload.reason,
    history: payload.history,
    n: String(payload.completed),
    m: String(payload.blocked),
  };
}

/** P3 · 挂起（升级点挂起时；工具响应或 user message，双径同文） */
export function renderP3(payload: InjectionPayload): string {
  return interpolate(P3_TEMPLATE, placeholderValues(payload));
}
