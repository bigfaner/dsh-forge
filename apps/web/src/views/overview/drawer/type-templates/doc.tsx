// doc 族模板（定位：业务——AC3：大纲[编号] / 交付物 / 读者；族成员 = doc / doc-consolidate /
// doc-drift / doc-review / doc-summary）。内容负载 = vars 具体化（outline / deliverable / readers）。
import type { ReactNode } from 'react'
import { varsList, varsText } from '../detail-model.js'
import { CodeSpan, KvRow, StepsList, SubTitle } from './parts.js'

/** doc 族模板 */
export function DocTemplate({ vars }: { readonly vars: Readonly<Record<string, string>> }): ReactNode {
  const outline = varsList(vars, 'outline')
  const deliverable = varsText(vars, 'deliverable')
  const readers = varsText(vars, 'readers')
  return (
    <>
      {outline.length > 0 ? (
        <>
          <SubTitle>大纲</SubTitle>
          <StepsList items={outline} />
        </>
      ) : null}
      {deliverable !== undefined ? (
        <KvRow k="交付物">
          <CodeSpan>{deliverable}</CodeSpan>
        </KvRow>
      ) : null}
      {readers !== undefined ? <KvRow k="读者">{readers}</KvRow> : null}
    </>
  )
}
