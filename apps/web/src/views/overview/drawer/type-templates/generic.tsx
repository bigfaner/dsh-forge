// generic 回退模板（定位：业务——AC3：未注册类型走通用键值回退——键值行 + 数组列表；
// TaskType 词汇封闭 20 值全数命中六族，本族 = 词汇外字符串的防御面）。
import type { ReactNode } from 'react'
import { varsList, varsText } from '../detail-model.js'
import { KvRow, PlainList, SubTitle } from './parts.js'

/** generic 模板（vars 全键遍历：多元素值 → 子标题 + 列表；单值 → 键值行） */
export function GenericTemplate({ vars }: { readonly vars: Readonly<Record<string, string>> }): ReactNode {
  return (
    <>
      {Object.keys(vars)
        .sort()
        .map((key) => {
          const list = varsList(vars, key)
          if (list.length > 1) {
            return (
              <div key={key}>
                <SubTitle>{key}</SubTitle>
                <PlainList items={list} />
              </div>
            )
          }
          return (
            <KvRow k={key} key={key}>
              {varsText(vars, key) ?? ''}
            </KvRow>
          )
        })}
    </>
  )
}
