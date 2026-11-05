// session-bind scoped 注册接线（定位：业务——stage③ C2 / 提案 §2.2 裁决 #9）。
// 机制：AssembleContext 无会话信息，绑定决策不能在装配期解析——改走官方 scoped
// section 注册缝（dsh-scope 不透明身份键 + systemPrompt scope 过滤装配）：
//   · 根 scope 订阅官方 agent/created（session-bind 时刻），经 payload.agent.ctx
//    （agent-scoped context）在该会话 scope 注册 forge:knowledge / forge:knowledge-domains
//     两段——text 闭包捕获 ws_path，每 turn 实时求值；
//   · 未绑定（cwd 无绑定行）/无注册库 → 不注册（同生同退的自然退场面）；
//   · 重绑 = 新 agent 新 scope，旧 scope 注册随生命周期 unwind（零手写清理）。
// fail-soft：agent.ctx / systemPrompt 结构面缺席或 handler 抛 = 该会话零注册不炸链路。
import {
  KNOWLEDGE_DOMAINS_SECTION_NAME,
  KNOWLEDGE_DOMAINS_SECTION_ORDER,
  KNOWLEDGE_SECTION_NAME,
  KNOWLEDGE_SECTION_ORDER,
  renderKnowledgeDomainsSection,
  renderKnowledgeStaticSection,
} from '../prompt/index.js'
import type { AgentCreatedSubscribeFace, SystemPromptSectionFace } from '../tools/faces.js'
import type { TopDomainStat } from './internal.js'

/** scoped 段注册供数面（实时求值两函数——闭包捕获 ws_path 后每 turn 现取） */
export interface KnowledgePromptBindDeps {
  /** 注册库在场判定（registry.findByWsPath ≠ undefined——静态/动态两段同生同退的门） */
  isRegistered(wsPath: string): boolean
  /** 顶域实时聚合（topDomainIndexOf——计数/简介每 turn 现算，非注册时点冻结） */
  topDomains(wsPath: string): readonly TopDomainStat[]
}

/** agent/created 订阅面（官方 cordis ctx.on 同型——返回注销器） */
export type AgentCreatedOn = AgentCreatedSubscribeFace

/**
 * 在一个会话 scope 注册两段（text 函数化）：
 * · 静态段：注册库在场返固定文本，缺席空返 ''（段整体退场）；
 * · 动态段：注册库在场返实时顶域清单（空清单空返 ''），缺席空返 ''。
 * 两段同生同退：注册时点同注册（绑定才有），每 turn 求值时点同门（isRegistered）。
 */
export function bindKnowledgePromptSections(
  systemPrompt: SystemPromptSectionFace,
  deps: KnowledgePromptBindDeps,
  wsPath: string,
): () => void {
  const disposeStatic = systemPrompt.section({
    name: KNOWLEDGE_SECTION_NAME,
    order: KNOWLEDGE_SECTION_ORDER,
    text: () => (deps.isRegistered(wsPath) ? renderKnowledgeStaticSection() : ''),
  })
  const disposeDomains = systemPrompt.section({
    name: KNOWLEDGE_DOMAINS_SECTION_NAME,
    order: KNOWLEDGE_DOMAINS_SECTION_ORDER,
    text: () => (deps.isRegistered(wsPath) ? renderKnowledgeDomainsSection(deps.topDomains(wsPath)) : ''),
  })
  return () => {
    disposeStatic()
    disposeDomains()
  }
}

/** scoped 接线总入参（装配方注入：事件订阅 + 两级解析 + 供数面） */
export interface ScopedPromptWiringInput extends KnowledgePromptBindDeps {
  /** 官方 agent/created 订阅缝（根 scope 监听全局事件） */
  on: AgentCreatedOn
  /** cwd → projectId（config 静态绑定表第一级） */
  resolveProjectId(cwd: string): string | undefined
  /** projectId → wsPath（两级解析第一级反向） */
  resolveWsPath(projectId: string): string | undefined
}

/**
 * session-bind scoped 注册接线：订阅 agent/created，绑定会话（cwd 命中绑定行且注册库
 * 在场）在该会话 scope 注册两段。返回订阅注销器（并入插件 disposers；各会话 scope 内
 * 注册随 agent scope 生命周期自然 unwind，无跨会话手写清理）。
 */
export function registerKnowledgeScopedPrompt(input: ScopedPromptWiringInput): () => void {
  return input.on('agent/created', ({ agent }) => {
    try {
      const systemPrompt = agent.ctx?.systemPrompt
      if (systemPrompt === undefined) return // 结构面缺席 = 该会话零注册（fail-soft）
      const session = agent.session
      const cwd = session?.header?.cwd ?? session?.cwd
      if (typeof cwd !== 'string' || cwd === '') return // 无会话工作区 = 未绑定不注册
      const projectId = input.resolveProjectId(cwd)
      const wsPath = projectId === undefined ? undefined : input.resolveWsPath(projectId)
      if (wsPath === undefined || !input.isRegistered(wsPath)) return // 未绑定/无注册库 = 不注册
      bindKnowledgePromptSections(systemPrompt, input, wsPath)
    } catch {
      // 单会话接线失败不炸事件链（fail-soft）——其余会话照常
    }
  })
}
