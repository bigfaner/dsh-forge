// coding 族模板（定位：业务——AC3/AC4：参考文档 → 改动范围（预期 ↔ 实际双列 + 差异摘要）→
// 验收标准；顺序锚 ui-design v14（覆盖率/备注归块组装尾部——index.tsx））。
// 参考文档 = detail.refs 水化（core taskDetail——vars/taskDesc 声明锚点 → docRel 匹配）；
// 改动范围预期 = vars.scope 声明；实际 = detail.actualFiles（files_json → commit 查找回填，
// git 失败回退记录语由 core 填入——单元素审计行直接呈现）。
import type { ReactNode } from 'react'
import type { TaskDetail } from '@dsh-forge/contracts'
import { actualScopeOf, isTerminalStatus, scopeDiff, varsList } from '../detail-model.js'
import { Checklist, RefChips, SubTitle } from './parts.js'

/** 改动范围 · 预期 ↔ 实际双列（AC4——文件路径完整展示：换行不断链） */
function ScopeDual({ detail, expected }: { readonly detail: TaskDetail; readonly expected: readonly string[] }): ReactNode {
  const actual = actualScopeOf(detail)
  const diff = scopeDiff(expected, actual.kind === 'files' ? actual.files : [])
  const expectedSet = new Set(expected)
  return (
    <>
      <SubTitle>改动范围</SubTitle>
      <div className="dswf-td-scope">
        <div className="dswf-td-scope-g">
          <span className="dswf-td-scope-k">{`预期(${expected.length})`}</span>
          {expected.map((file) => (
            <div className="dswf-td-file-row" key={file}>
              <span className="dswf-td-file" title={file}>
                {file}
              </span>
              {actual.kind === 'files' ? (
                actual.files.includes(file) ? (
                  <span className="dswf-td-file-badge is-hit">✓ 已提交</span>
                ) : (
                  <span className="dswf-td-file-badge">未涉及</span>
                )
              ) : null}
            </div>
          ))}
        </div>
        <div className="dswf-td-scope-g">
          <span className="dswf-td-scope-k">{actual.kind === 'files' ? `实际(${actual.files.length})` : '实际'}</span>
          {actual.kind === 'files' ? (
            <>
              {actual.commitHashes.length > 0 ? (
                <div className="dswf-td-commits">
                  {actual.commitHashes.map((hash) => (
                    <span className="dswf-td-commit" key={hash} data-dswf-td-commit={hash}>
                      {hash}
                    </span>
                  ))}
                </div>
              ) : null}
              {actual.files.map((file) => (
                <div className="dswf-td-file-row" key={file}>
                  <span className="dswf-td-file" title={file}>
                    {file}
                  </span>
                  {expectedSet.has(file) ? null : <span className="dswf-td-file-badge is-extra">+ 计划外</span>}
                </div>
              ))}
              <div className="dswf-td-scope-sum">{scopeSummary(diff)}</div>
            </>
          ) : (
            <div className="dswf-td-li">{actual.text}</div>
          )}
        </div>
      </div>
    </>
  )
}

/** 差异摘要语（预期 N · 实际 M · 预期内 H · 计划外 +E · 未涉及 X——零段省略） */
function scopeSummary(diff: ReturnType<typeof scopeDiff>): string {
  const parts = [`预期 ${diff.expected}`, `实际 ${diff.actual}`, `预期内 ${diff.hit}`]
  if (diff.extra > 0) parts.push(`计划外 +${diff.extra}`)
  if (diff.miss > 0) parts.push(`未涉及 ${diff.miss}`)
  return parts.join(' · ')
}

/** coding 族模板（refs → scope → acceptance；v14 顺序） */
export function CodingTemplate({
  detail,
  vars,
  onOpenDoc,
}: {
  readonly detail: TaskDetail
  readonly vars: Readonly<Record<string, string>>
  readonly onOpenDoc: (docRel: string) => void
}): ReactNode {
  const expected = varsList(vars, 'scope')
  const acceptance = varsList(vars, 'acceptance')
  return (
    <>
      {detail.refs.length > 0 ? (
        <>
          <SubTitle>参考文档</SubTitle>
          <RefChips refs={detail.refs} onOpenDoc={onOpenDoc} />
        </>
      ) : null}
      {expected.length > 0 || detail.actualFiles.length > 0 ? <ScopeDual detail={detail} expected={expected} /> : null}
      {acceptance.length > 0 ? (
        <>
          <SubTitle>验收标准</SubTitle>
          <Checklist items={acceptance} allDone={isTerminalStatus(detail.taskStatus)} />
        </>
      ) : null}
    </>
  )
}
