// eval 族模板（定位：业务——AC3：评估对象 / 评分表[rubric 键+分值着色] / 结论 + 空态注记；
// 族成员 = eval-contract / eval-journey / validation-code / validation-ux。得分由「结果·实际」
// 承载（index.tsx 结果投影）；空态注记 = AC3「eval 类空态注记——M2 无技能写入」——
// vars.score 缺席（无结构化得分）时呈现，M3 eval 技能接管时结构化[tech-design]）。
import type { ReactNode } from 'react'
import type { TaskDetail } from '@dsh-forge/contracts'
import { evalScoreOf, varsRubric, varsText } from '../detail-model.js'
import { CodeSpan, KvRow, SubTitle } from './parts.js'

/** 评分表行分值着色档（≥70 达标 / ≥40 中位 / 其余低位——原型 rubric 口径；类位吃状态令牌） */
function rubricClass(score: number): string {
  if (score >= 70) return 'is-pass'
  if (score >= 40) return 'is-mid'
  return 'is-low'
}

/** eval 族模板（vars: target / rubric / conclusion / score[结果承载]） */
export function EvalTemplate({
  detail,
  vars,
}: {
  readonly detail: TaskDetail
  readonly vars: Readonly<Record<string, string>>
}): ReactNode {
  const target = varsText(vars, 'target')
  const rubric = varsRubric(vars, 'rubric')
  const conclusion = varsText(vars, 'conclusion')
  const hasScore = evalScoreOf(detail) !== undefined
  return (
    <>
      {target !== undefined ? (
        <KvRow k="评估对象">
          <CodeSpan>{target}</CodeSpan>
        </KvRow>
      ) : null}
      {rubric.length > 0 ? (
        <>
          <SubTitle>评分表</SubTitle>
          <div className="dswf-td-rubric">
            {rubric.map((entry) => (
              <div className="dswf-td-kvrow" key={entry.k}>
                <span className="dswf-td-kv-k">{entry.k}</span>
                <span className="dswf-td-kv-v">
                  <span className={`dswf-td-score ${rubricClass(entry.s)}`}>{entry.s}</span>
                  <span className="dswf-td-score-total">/100</span>
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {conclusion !== undefined ? <KvRow k="结论">{conclusion}</KvRow> : null}
      {hasScore ? null : (
        <div className="dswf-td-eval-empty" data-dswf-td-eval-empty="">
          M2 无评估技能写入——结果由记录摘要承载
        </div>
      )}
    </>
  )
}
