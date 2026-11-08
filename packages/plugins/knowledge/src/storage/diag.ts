// 诊断发射面（docs/conventions/diagnostic-emit-discipline.md 正本）：storage 域埋点统一
// 经装配期注入的发射面 + DIAG_EVENT 类型化 emit（contracts 单源——禁裸字符串）。
// 发射面缺席兜底按级分流（error → console.error，其余 → console.warn——expert-squad 口径），
// 不采用「缺席 = 零 emit」。
import type { DiagEventPayload, DiagLevel } from '@dsh-forge/contracts'

/** 迁移事件域（proposal §2.3：start / 里程碑 / cutover / fail） */
export const KNOWLEDGE_MIGRATE_EVENT = 'knowledge-migrate'

/** 索引重建事件域（proposal §2.3：成败 + 静默重建 warn） */
export const KNOWLEDGE_REBUILD_EVENT = 'knowledge-index-rebuild'

/** 注册行读写事件域（proposal §2.3：解析与注册行读写路径——1.15 进表径埋点面） */
export const KNOWLEDGE_REGISTER_EVENT = 'knowledge-register'

/** 条目清理事件域（stage② §2.7：文件亡→记录亡同步删除——unconfirmed=info / confirmed/superseded=warn） */
export const KNOWLEDGE_PURGE_EVENT = 'knowledge-entry-purge'

/** 写入拒收事件域（stage② §2.7 严契约三拒收逐例——info 级） */
export const KNOWLEDGE_WRITE_REJECT_EVENT = 'knowledge-write-reject'

/** 写入成功事件域（stage② §2.7 可观测性——info 级成功里程碑） */
export const KNOWLEDGE_WRITE_EVENT = 'knowledge-write'

/** confirm 升格事件域（stage② §2.7——info 级） */
export const KNOWLEDGE_CONFIRM_EVENT = 'knowledge-confirm'

/** supersedes 回流事件域（stage② §2.7 回流频率——info=误判回流 / warn=震荡回流） */
export const KNOWLEDGE_BACKFLOW_EVENT = 'knowledge-backflow'

/** 归并执行事件域（stage② §2.6 裁决 #8——info=归并/逆向成功里程碑 / warn=CAS 拒与中止） */
export const KNOWLEDGE_SUPERSEDE_EVENT = 'knowledge-supersede'

/** 批量驳回事件域（knowledge-review-ui §2.5——不可逆删除显眼记账，恒 warn 级，actor=human） */
export const KNOWLEDGE_REJECT_EVENT = 'knowledge-reject'

/** 改域事件域（knowledge-review-ui §2.5——info=移动成功 / warn=域校验拒收等失败，actor=human） */
export const KNOWLEDGE_ENTRY_MOVE_EVENT = 'knowledge-entry-move'

/** 元数据编辑事件域（knowledge-review-ui §2.5——info=编辑成功 / warn=YAML 拒收等失败，actor=human） */
export const KNOWLEDGE_META_EDIT_EVENT = 'knowledge-meta-edit'

/** 域简介写径事件域（stage③ §2.2 setDomainDescription——info=写入成功 / warn=校验拒收） */
export const KNOWLEDGE_DOMAIN_UPDATE_EVENT = 'knowledge-domain-update'

/** 会话归因派生事件域（stage④ 1.5——派生 fail-soft 双 NULL 时 warn，禁静默；bug 0520cbaf） */
export const KNOWLEDGE_DERIVE_EVENT = 'knowledge-recall-derive'

/** 召回反馈事件域（stage④ 1.5——全动作含撤销记账，note 原文不入 diag） */
export const KNOWLEDGE_FEEDBACK_EVENT = 'knowledge-recall-feedback'

/** 装配期注入的诊断发射面（host 侧 = ctx.emit(DIAG_EVENT, payload)；storage 域零 cordis 依赖） */
export type DiagEmitter = (payload: DiagEventPayload) => void

/**
 * storage 域埋点单点：emit 在场 → 类型化发射；缺席 → 按级分流 console 兜底
 * （零静默失败——吞没处必有诊断站点，纪律 §静默）。
 */
export function emitStorageDiag(emit: DiagEmitter | undefined, payload: DiagEventPayload): void {
  if (emit !== undefined) {
    emit(payload)
    return
  }
  const line = `[${payload.event}] ${payload.message}`
  if (payload.level === 'error') console.error(line)
  else console.warn(line)
}

/** 便捷构造（就地可得字段面——cwd/计数随调用点携带；process 由发射面落位） */
export function storageDiag(
  level: DiagLevel,
  event: string,
  message: string,
  extra?: Partial<Omit<DiagEventPayload, 'level' | 'event' | 'message' | 'process'>>,
): DiagEventPayload {
  return { level, event, message, process: 'main', ...extra }
}
