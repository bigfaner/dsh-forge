// gate 族模板（定位：业务——AC3：走查步骤[编号] / 检查项[checklist——随最近 gate 全过勾选]；
// 场景由块首「目标」承载——ui-design 块一表）。gate 载荷 = 最近 submit 记录 gate_json
//（四项布尔 → M/N 计数——detail-model gateSummary，与现状条「质量门 M/N」同源）。
import type { ReactNode } from 'react'
import type { TaskDetail } from '@dsh-forge/contracts'
import { gateSummary, latestSubmitGateOf, varsList } from '../detail-model.js'
import { Checklist, StepsList, SubTitle } from './parts.js'

/** gate 族模板（vars: steps / checks） */
export function GateTemplate({
  detail,
  vars,
}: {
  readonly detail: TaskDetail
  readonly vars: Readonly<Record<string, string>>
}): ReactNode {
  const steps = varsList(vars, 'steps')
  const checks = varsList(vars, 'checks')
  const gate = latestSubmitGateOf(detail.records)
  const summary = gate !== undefined ? gateSummary(gate) : undefined
  const allDone = summary !== undefined && summary.total > 0 && summary.passed === summary.total
  return (
    <>
      {steps.length > 0 ? (
        <>
          <SubTitle>走查步骤</SubTitle>
          <StepsList items={steps} />
        </>
      ) : null}
      {checks.length > 0 ? (
        <>
          <SubTitle>检查项</SubTitle>
          <Checklist items={checks} allDone={allDone} />
        </>
      ) : null}
    </>
  )
}
