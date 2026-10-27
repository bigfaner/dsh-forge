// notify · 叙述面组装（S4 纯模块——循环驱动器的单一叙述出口；不依赖循环）。
// loop-message-consolidation §2.1 注入面裁剪后职责收敛：notice 铸造径整体退出——循环级/
// 任务级进行事件零消息（仅 forge/progress 事件投影），本面只剩两径——① 结算径（settle 单点
// 唤醒：状态计数 + 下一步动作 + 各任务概要）；② 异常径（blocked-ask-user ⑩ / followup
// 唤醒：最小充分信息集）。另有事件子文件夹落盘委派（incident-log）与 reason 全文机械防线。
import { failSoftNarrationChannel } from './channel.js'
import type { NarrationChannel } from './channel.js'
import { createIncidentStore } from './incident-log.js'
import type { IncidentInput, IncidentStore } from './incident-log.js'
import { localDateTimeLine, summarizeReason } from './skeleton.js'
import { renderNarrative } from './templates.js'
import type { NarrativePayloadMap } from './templates.js'
import type { ForgeLoopNarrationMeta } from '../forge-loop-source.js'

/** 异常径场景（blocked 发射径的 id 域——样例 ⑩；⑦⑧⑧b⑨ 自愈阻塞已静默化，不经本面） */
export type BlockedScenarioId = 'blocked-ask-user'

/** 阻塞族发射的模板字段（reasonSummary/incidentPath 由本面机械填充——调用方不可越过） */
export type BlockedFields<S extends BlockedScenarioId> = Omit<NarrativePayloadMap[S], 'reasonSummary' | 'incidentPath'>

/** 阻塞族发射的事件材料（全文落盘、不进叙述） */
export interface BlockedEmitMeta {
  /** 项目 id（容器目录解析缝载体——透传 incident-log 反向解析，1.11 装配接线收口） */
  readonly projectId?: string
  /** 事件子文件夹任务键（localId 口径——如「3.1」） */
  readonly taskKey: string
  /** 阻塞原因全文（只进 error.log 与裁决问询） */
  readonly reason: string
  /** 结算载荷（settlement.json 原样落盘；缺席不写该件） */
  readonly settlement?: unknown
}

/** 叙述面依赖（channel 必配；incidents 缺席 = 落盘降级——详情行省略） */
export interface NarratorDeps {
  readonly channel: NarrationChannel
  readonly incidents?: IncidentStore
}

/** 叙述面（循环驱动器消费的单出口） */
export interface Narrator {
  /** 终局事件（异常径 followup 通道——完整消息 + 唤醒）；fail-soft。
   * loop = 循环叙述上下文（faces 铸发 source.kind='forge-loop' 的结构化字段） */
  followup(sessionId: string, text: string, loop?: ForgeLoopNarrationMeta): Promise<void>
  /**
   * 结算投递（3b④ settlement 形态——dispatch-loop-hardening 1.11）：循环终局（settled/
   * halted/timeout/stopped）经 settlement 通道投递——持久 user message（source
   * {kind:'dispatch-loop-settled'}）+ 空闲→followup/运行中→steer/失活→必达告警三径由
   * 装配通道兑现；通道缺席回退 followup（向后兼容）。fail-soft 同纪律。
   */
  settle(sessionId: string, text: string): Promise<void>
  /** 异常径发射（⑩ blocked-ask-user——循环无法自行处理的阻塞，唤醒主 agent 分析；裁决仍
   * 走问询 UI）：reason 全文落盘 → 摘要 + 子文件夹路径进叙述 */
  blocked<S extends BlockedScenarioId>(
    sessionId: string,
    scenario: S,
    fields: BlockedFields<S>,
    meta: BlockedEmitMeta,
  ): Promise<void>
  /** 事件子文件夹落盘委派（仓缺席/失败 = undefined——叙述面照发） */
  recordIncident(input: IncidentInput): string | undefined
}

/** 建叙述面（装配单例——与循环同生命周期；零上游依赖，通道由装配方适配注入） */
export function createNarrator(deps: NarratorDeps): Narrator {
  const safe = failSoftNarrationChannel(deps.channel)
  const incidents: IncidentStore = deps.incidents ?? createIncidentStore({ resolveContainerDir: () => undefined })
  return {
    followup(sessionId: string, text: string, loop?: ForgeLoopNarrationMeta): Promise<void> {
      // 唤醒径 = send(nextStep, true) 即时唤醒主 agent（异常径场景族——调用方为表内场景才走本面）。
      return safe.send(sessionId, `${text}\n${localDateTimeLine()}`, {
        form: 'followup',
        wakeup: true,
        ...(loop !== undefined ? { loop } : {}),
      })
    },
    settle(sessionId: string, text: string): Promise<void> {
      // 结算单点唤醒（loop-event-delivery §结算径）：真终局一次 send(nextStep, true)——
      // 结算消息与 next-step 积压在唤醒后的 claim 整批消费；不再运行中 steer 插队。
      return safe.send(sessionId, `${text}\n${localDateTimeLine()}`, { form: 'settle', wakeup: true })
    },
    async blocked<S extends BlockedScenarioId>(
      sessionId: string,
      scenario: S,
      fields: BlockedFields<S>,
      meta: BlockedEmitMeta,
    ): Promise<void> {
      const reasonSummary = summarizeReason(meta.reason)
      const incidentPath = incidents.record({
        projectId: meta.projectId,
        sourceSlug: fields.sourceSlug,
        taskKey: meta.taskKey,
        eventType: 'blocked',
        error: meta.reason,
        ...(meta.settlement !== undefined ? { settlement: meta.settlement } : {}),
      })
      // fields 已被 Omit 剔除两摘要键——此处重组回模板载荷（id↔载荷关联由泛型保持）
      const payload = {
        ...fields,
        reasonSummary,
        ...(incidentPath !== undefined ? { incidentPath } : {}),
      } as NarrativePayloadMap[S]
      const text = renderNarrative(scenario, payload)
      // 异常径恒唤醒（wakeup=true——需人工介入的阻塞径，裁决经问询 UI 回流）
      await safe.send(sessionId, `${text}\n${localDateTimeLine()}`, {
        form: 'followup',
        wakeup: true,
        loop: { task: meta.taskKey, state: scenario },
      })
    },
    recordIncident(input: IncidentInput): string | undefined {
      return incidents.record(input)
    },
  }
}
