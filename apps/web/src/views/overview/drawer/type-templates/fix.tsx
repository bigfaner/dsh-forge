// fix 族模板（定位：业务——AC3：症状 / 修复步骤[编号] / 验证命令；族成员 = coding-fix
// [doc-fix 词汇外防御路由]；链元数据[来源/根因/源文件/测试脚本]织入时间线「创建」事件——timeline.tsx）。
import type { ReactNode } from 'react'
import { varsList, varsText } from '../detail-model.js'
import { CodeSpan, KvRow, StepsList, SubTitle } from './parts.js'

/** fix 族模板（vars: symptom / steps / verify） */
export function FixTemplate({ vars }: { readonly vars: Readonly<Record<string, string>> }): ReactNode {
  const symptom = varsText(vars, 'symptom')
  const steps = varsList(vars, 'steps')
  const verify = varsText(vars, 'verify')
  return (
    <>
      {symptom !== undefined ? <KvRow k="症状">{symptom}</KvRow> : null}
      {steps.length > 0 ? (
        <>
          <SubTitle>修复步骤</SubTitle>
          <StepsList items={steps} />
        </>
      ) : null}
      {verify !== undefined ? (
        <KvRow k="验证">
          <CodeSpan>{verify}</CodeSpan>
        </KvRow>
      ) : null}
    </>
  )
}
