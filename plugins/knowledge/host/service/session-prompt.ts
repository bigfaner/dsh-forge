// forge:knowledge-domains 段的每步求值函数（定位：业务——stage③ C2 / 提案 §2.2 裁决 #9）。
// 规则段 forge:knowledge 为静态全局注册（插件工厂），不经本文件。
// 机制：动态段同样全局注册一处，text(context) 每步按官方装配上下文现取会话
//（dsh-agent assembleContextFor 恒携 agent——forge:pipeline / forge:dispatch-loop 同机制）：
// cwd → projectId → wsPath → 注册库在场门控 → 域树实时聚合。段随插件 fiber 注销，
// 会话 scope 上不留任何闭包（插件卸载后旧会话不再持有已关库的求值函数）。
// fail-soft：agent 缺席 / cwd 为空 / 未绑定 / 注册库缺席 → 空串（空段在官方装配渲染期
// 自然退场）；求值抛错 → 诊断留痕后空串，不炸整轮装配。
import { renderKnowledgeDomainsSection } from '../prompt/index.js'
import type { DomainIndexRow } from './internal.js'

/** 供数面（实时求值——解析与查库均每步现做，不缓存会话绑定） */
export interface KnowledgePromptBindDeps {
  /** cwd → projectId（config 静态绑定表第一级 + 注册表回退） */
  resolveProjectId(cwd: string): string | undefined
  /** projectId → wsPath（两级解析第一级反向） */
  resolveWsPath(projectId: string): string | undefined
  /** 注册库在场判定（turn 期门控） */
  isRegistered(wsPath: string): boolean
  /** 域树实时聚合（domainTreeIndexOf——计数/简介每步现算，非注册时点冻结） */
  topDomains(wsPath: string): readonly DomainIndexRow[]
}

/** 官方 AssembleContext 运行期子面（dsh-agent assembleContextFor 携带 agent；agent.session.header.cwd = 会话工作区根） */
export interface KnowledgeAssembleContext {
  readonly agent?: {
    readonly session?: { readonly header?: { readonly cwd?: unknown }; readonly cwd?: unknown }
  }
}

/** 构造动态段 text 求值函数（onError = 求值抛错的诊断留痕缝，缺席 = 静默空返） */
export function createKnowledgeDomainsText(
  deps: KnowledgePromptBindDeps,
  onError?: (cause: unknown) => void,
): (context: KnowledgeAssembleContext) => string {
  return (context) => {
    try {
      const session = context?.agent?.session
      const cwd = session?.header?.cwd ?? session?.cwd
      if (typeof cwd !== 'string' || cwd === '') return ''
      const projectId = deps.resolveProjectId(cwd)
      const wsPath = projectId === undefined ? undefined : deps.resolveWsPath(projectId)
      if (wsPath === undefined || !deps.isRegistered(wsPath)) return ''
      return renderKnowledgeDomainsSection(deps.topDomains(wsPath))
    } catch (cause) {
      onError?.(cause)
      return ''
    }
  }
}
