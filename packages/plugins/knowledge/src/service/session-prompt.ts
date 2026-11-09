// session-bind scoped 注册接线（定位：业务——stage③ C2 / 提案 §2.2 裁决 #9）。
// 机制：AssembleContext 无会话信息，绑定决策不能在装配期解析——改走官方 scoped
// section 注册缝（dsh-scope 不透明身份键 + systemPrompt scope 过滤装配）：
//   · 根 scope 订阅官方 agent/created（session-bind 时刻），经 payload.agent.ctx
//    （agent-scoped context）在该会话 scope 注册 forge:knowledge-domains 动态段
//     ——text 闭包捕获 ws_path，每 turn 实时求值，现求 isRegistered 门控（无注册库
//     空返退场）；
//   · 静态段 forge:knowledge 不走 scoped 缝：能力性指引固定文本零会话信息，按 fix-11
//     裁决 B 侧 Interface 3 静态注册（name/order/text 无门控）在插件工厂（plugin load
//     时点）全局注册——scoped 注册晚于会话首轮装配（agent/created 缝的装配时序判例
//     bug be4bac44：首个请求提示词不含后注册段），全局注册先于一切会话装配保首轮在场；
//   · 未绑定（cwd 无绑定行）→ 动态段不注册；
//   · 重绑 = 新 agent 新 scope，旧 scope 注册随生命周期 unwind（零手写清理）。
// fail-soft：agent.ctx / systemPrompt 结构面缺席或 handler 抛 = 该会话零注册不炸链路。
import {
  KNOWLEDGE_DOMAINS_SECTION_NAME,
  KNOWLEDGE_DOMAINS_SECTION_ORDER,
  renderKnowledgeDomainsSection,
} from '../prompt/index.js'
import type { AgentCreatedSubscribeFace, SystemPromptSectionFace } from '../tools/faces.js'
import type { DomainIndexRow } from './internal.js'

/** scoped 段注册供数面（实时求值两函数——闭包捕获 ws_path 后每 turn 现取） */
export interface KnowledgePromptBindDeps {
  /** 注册库在场判定（动态段 turn 期门控） */
  isRegistered(wsPath: string): boolean
  /** 域树实时聚合（domainTreeIndexOf——计数/简介每 turn 现算，非注册时点冻结） */
  topDomains(wsPath: string): readonly DomainIndexRow[]
}

/** agent/created 订阅面（官方 cordis ctx.on 同型——返回注销器） */
export type AgentCreatedOn = AgentCreatedSubscribeFace

/**
 * 在一个会话 scope 注册动态段（text 函数化）：注册库在场返实时顶域清单（空清单空返 ''），
 * 缺席空返 ''（空段在官方装配渲染期自然退场）。静态段归插件工厂全局注册（见文件头注记），
 * 不经本缝——避免双注入。
 */
export function bindKnowledgePromptSections(
  systemPrompt: SystemPromptSectionFace,
  deps: KnowledgePromptBindDeps,
  wsPath: string,
): () => void {
  const disposeDomains = systemPrompt.section({
    name: KNOWLEDGE_DOMAINS_SECTION_NAME,
    order: KNOWLEDGE_DOMAINS_SECTION_ORDER,
    text: () => (deps.isRegistered(wsPath) ? renderKnowledgeDomainsSection(deps.topDomains(wsPath)) : ''),
  })
  return disposeDomains
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
 * session-bind scoped 注册接线：订阅 agent/created，绑定会话（cwd 命中绑定行）在该会话
 * scope 注册 forge:knowledge-domains 动态段（每 turn 现求 isRegistered 门控，无注册库空返
 * '' 空段自然退场）。返回订阅注销器（并入插件 disposers；各会话 scope 内注册随 agent
 * scope 生命周期自然 unwind，无跨会话手写清理）。
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
      if (wsPath === undefined) return // 未绑定 = 不注册
      bindKnowledgePromptSections(systemPrompt, input, wsPath)
    } catch {
      // 单会话接线失败不炸事件链（fail-soft）——其余会话照常
    }
  })
}
