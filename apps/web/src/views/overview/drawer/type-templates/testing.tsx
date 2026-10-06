// test 族模板（定位：业务——AC3：命令 / 采集指标 / 基线；族成员 = test-run / test-gen-*）。
// Surface（surfaceKey/surfaceType 行字段）呈现在块二现状条（timeline.tsx——六型条件之一）。
import type { ReactNode } from 'react'
import { varsList, varsText } from '../detail-model.js'
import { CodeSpan, KvRow, PlainList, SubTitle } from './parts.js'

/** test 族模板（vars: command / metrics / baseline） */
export function TestTemplate({ vars }: { readonly vars: Readonly<Record<string, string>> }): ReactNode {
  const command = varsText(vars, 'command')
  const metrics = varsList(vars, 'metrics')
  const baseline = varsText(vars, 'baseline')
  return (
    <>
      {command !== undefined ? (
        <KvRow k="命令">
          <CodeSpan>{command}</CodeSpan>
        </KvRow>
      ) : null}
      {metrics.length > 0 ? (
        <>
          <SubTitle>采集指标</SubTitle>
          <PlainList items={metrics} />
        </>
      ) : null}
      {baseline !== undefined ? <KvRow k="基线">{baseline}</KvRow> : null}
    </>
  )
}
