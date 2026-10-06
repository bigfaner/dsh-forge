// 单元测试覆盖率组件（定位：业务——AC4：实际 N% / 预期 ≥M% + 进度条[填充=实际] +
// 阈值刻度线[位置=预期] + 判定徽标[✓达标/未达标/未执行]；coding 族呈现、fix 族不展示——
// 呈现门控归 ../index.tsx 块组装）。小数(0–1) → 百分比 = contracts 口径（coverage REAL
// 阈值小数 + gate_json coverage 小数）；实际值源 = 最近 submit 记录 gate（v9 修订沿袭）。
import type { ReactNode } from 'react'
import type { TaskDetail } from '@dsh-forge/contracts'
import { latestSubmitGateOf } from './detail-model.js'

/** 判定（pass = ✓达标 / fail = 未达标 / none = 未执行——无实际值） */
export type CoverageVerdict = 'pass' | 'fail' | 'none'

/** 覆盖率视图（实际/预期百分比 + 判定；undefined = 该侧缺席） */
export interface CoverageView {
  readonly actualPct: number | undefined
  readonly expectedPct: number | undefined
  readonly verdict: CoverageVerdict
}

/** 小数 → 百分比（四舍五入） */
export function coveragePct(value: number): number {
  return Math.round(value * 100)
}

/** 覆盖率投影：预期 = TaskDetail.coverage（阈值）；实际 = 最近 submit gate.coverage；
 *  判定 = v9 原型口径（无实际 → 未执行；实际 ≥ 预期 → 达标；含预期缺席时不达标档） */
export function coverageViewOf(detail: TaskDetail): CoverageView {
  const expectedPct = detail.coverage !== undefined ? coveragePct(detail.coverage) : undefined
  const gate = latestSubmitGateOf(detail.records)
  const actualPct = gate?.coverage !== undefined ? coveragePct(gate.coverage) : undefined
  let verdict: CoverageVerdict = 'none'
  if (actualPct !== undefined) {
    verdict = expectedPct !== undefined && actualPct >= expectedPct ? 'pass' : 'fail'
  }
  return { actualPct, expectedPct, verdict }
}

/** 判定徽标文案与类位 */
function verdictBadge(view: CoverageView): { readonly text: string; readonly cls: string } {
  if (view.verdict === 'pass') return { text: '✓ 达标', cls: 'is-pass' }
  if (view.verdict === 'fail') return { text: '未达标', cls: 'is-fail' }
  return { text: '未执行', cls: 'is-none' }
}

/** 覆盖率组件（AC4 渲染面——进度条 + 刻度线 + 数值行 + 判定徽标） */
export function CoverageBar({ view }: { readonly view: CoverageView }): ReactNode {
  const badge = verdictBadge(view)
  const fill = view.actualPct ?? 0
  return (
    <div className="dswf-td-cov" data-dswf-td-cov="">
      <div className="dswf-td-tck" data-dswf-td-tck="">
        单元测试覆盖率
      </div>
      <div className="dswf-td-cov-line">
        <div className="dswf-td-cov-bar">
          <div className={`dswf-td-cov-fill ${badge.cls}`} style={{ width: `${fill}%` }} />
          {view.expectedPct !== undefined ? (
            <span className="dswf-td-cov-mark" style={{ left: `${view.expectedPct}%` }} />
          ) : null}
        </div>
        <span className="dswf-td-cov-nums">
          实际 <b className={`dswf-td-cov-actual ${badge.cls}`}>{view.actualPct !== undefined ? `${view.actualPct}%` : '—'}</b> / 预期{' '}
          {view.expectedPct !== undefined ? `≥${view.expectedPct}%` : '—'}
        </span>
        <span className={`dswf-td-cov-badge ${badge.cls}`} data-dswf-td-cov-verdict={view.verdict}>
          {badge.text}
        </span>
      </div>
    </div>
  )
}
