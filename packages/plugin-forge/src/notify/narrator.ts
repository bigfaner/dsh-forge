// notify · 叙述面组装（S4 纯模块——循环驱动器的单一叙述出口；不依赖循环）。
// 三职责：① 通道委派（notice/followup 两法——#28 分流的调用点表述，fail-soft 在此
// 机械保证：注入任何故障静默降级，SC7「注入失败循环照常结束」）；② 事件子文件夹落盘
// 委派（incident-log）；③ 阻塞族发射径（blocked——reason 全文的机械防线：全文只进
// 落盘与裁决问询，叙述经 summarizeReason 只带摘要 + 事件子文件夹路径，decisions #24）。
import { failSoftNarrationChannel } from './channel.js'
import type { NarrationChannel } from './channel.js'
import { createIncidentStore } from './incident-log.js'
import type { IncidentInput, IncidentStore } from './incident-log.js'
import { localDateTimeLine, summarizeReason } from './skeleton.js'
import { renderHeadline, renderNarrative } from './templates.js'
import type { NarrativePayloadMap } from './templates.js'

/** 阻塞族五场景（blocked 发射径的 id 域——样例 ⑦-⑧b-⑩；泛型约束即编译期封闭） */
export type BlockedScenarioId = 'blocked-with-fix' | 'blocked-auto-fixed' | 'blocked-split' | 'blocked-wait-external' | 'blocked-ask-user'

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
  /** 常规进行事件（样例 ①-⑫）——notice 通道（inject·零模型回合）；fail-soft。
   * headline = 预构建场景单行摘要（renderHeadline 产物——折叠位不再整段截断；缺席 = 回退截断） */
  notice(sessionId: string, text: string, headline?: string): Promise<void>
  /** 终局事件（样例 ⑬-⑰，每循环 1–2 条）——followup 通道（完整消息）；fail-soft */
  followup(sessionId: string, text: string): Promise<void>
  /** 阻塞族发射（⑦-⑨ 中段 notice 零模型注入；⑩ 终局 followup 唤醒主 agent 分析——裁决仍
   * 走问询 UI，decisions #16）：reason 全文落盘 → 摘要 + 子文件夹路径进叙述 */
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
    notice(sessionId: string, text: string, headline?: string): Promise<void> {
      // 时间行统一追加（2026-10-12 用户裁决「注入消息内容要完整：时间使用 LocalDateTime」——
      // 骨架收尾行，本地时区完整日期时间；headline 不变）
      return safe.notice(sessionId, `${text}\n${localDateTimeLine()}`, headline)
    },
    followup(sessionId: string, text: string): Promise<void> {
      return safe.followup(sessionId, `${text}\n${localDateTimeLine()}`)
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
      // ⑩ blocked-ask-user 是终局事件（无法自动处理→人工裁决）：走 followup 新回合唤醒主
      // agent——阻塞上下文进会话触发分析（2026-10-13 用户定罪「收到阻塞上下文未触发主
      // agent 分析」；与 ⑬-⑰ 终局族通道对齐）；裁决仍走问询 UI（decisions #16 不变——
      // 分析入会话，裁决不经会话）。⑦-⑨ 循环中段场景保持 notice 零模型注入（fix 链续领/
      // 外部等待，循环未终——不逐事件烧模型回合）。
      if (scenario === 'blocked-ask-user') {
        await safe.followup(sessionId, `${text}\n${localDateTimeLine()}`)
        return
      }
      // 折叠摘要 = 场景专用单行摘要（S4 增强——同源载荷事实，替代整段截断）
      await safe.notice(sessionId, text, renderHeadline(scenario, payload))
    },
    recordIncident(input: IncidentInput): string | undefined {
      return incidents.record(input)
    },
  }
}
