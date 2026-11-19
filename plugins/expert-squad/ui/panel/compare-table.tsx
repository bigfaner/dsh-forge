// panel/compare-table —— 两两对比表（1.61 裁决③⑥；差异承载面裁决 2026-10-26）：
// 生效卡 vs 单一对比对象的字段对齐表（差异格 warn 高亮），唯一消费面 = 详情 Dialog
// 对比态（聚组内联对比退役——点被遮蔽行直开 Dialog 对比）。
// 去外边框（Dialog body 已有容器框架）；差异格高亮增强（warn 底 + 主标签色）。

import { useState, type ReactNode } from "react";
import {
  COMPARE_FIELDS,
  diffFields,
  fieldDiffers,
  originLabel,
  type ExpertView,
} from "./filter.js";

/** 字段值对比单元（数组 → chips；标量 → 文本；差异格 diff 高亮）。 */
function CompareCell({ value, diff }: { readonly value: unknown; readonly diff: boolean }): ReactNode {
  return (
    <td className={diff ? "diff" : undefined}>
      {Array.isArray(value)
        ? value.map((item) => (
            <span key={item} className="chip">
              {item}
            </span>
          ))
        : String(value ?? "")}
    </td>
  );
}

/**
 * 两两对比表（③⑥）：生效卡 vs 单一对象两列；差异默认（仅差异行 + 高亮）由
 * showAllFields 切换；完全一致空态（差异默认下零差异 → 空态文案）。
 */
export function PairCompareTable({
  effective,
  shadow,
  showAllFields,
  projectName,
}: {
  readonly effective: ExpertView;
  readonly shadow: ExpertView;
  readonly showAllFields: boolean;
  readonly projectName?: string;
}): ReactNode {
  const diffs = diffFields(effective, shadow);
  const rows = COMPARE_FIELDS.filter(
    ({ field }) => showAllFields || diffs.includes(field),
  );
  return (
    <div className="dswf-xcompare">
      {rows.length === 0 ? (
        <div className="dswf-cmp-empty">两来源字段完全一致</div>
      ) : (
        <table className="cmp-table">
          <thead>
            <tr>
              <th>字段</th>
              <th className="cmp-eff">
                <span className={`origin-badge origin-${effective.origin}`}>
                  {originLabel(effective.origin, projectName)}
                </span>
                <span className="eff-badge">生效</span>
              </th>
              <th className="cmp-tgt">
                {/* bug f4020406 ③：右列表头补传 projectName——project 被遮蔽时与左列具名一致 */}
                <span className={`origin-badge origin-${shadow.origin}`}>
                  {originLabel(shadow.origin, projectName)}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ field, label }) => (
              <tr key={field}>
                <th>{label}</th>
                <CompareCell value={effective[field] as unknown} diff={fieldDiffers(field, effective, shadow)} />
                <CompareCell value={shadow[field] as unknown} diff={fieldDiffers(field, effective, shadow)} />
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="cmp-note">
        与生效卡不同的字段已高亮（{diffs.length} 项）· 被遮蔽卡只读
      </div>
    </div>
  );
}

/** 差异默认切换行（⑥：现状「仅显示差异项（N）」+ 动作钮「显示全部字段」切换）。 */
export function DiffOnlyToggle({
  showAll,
  diffCount,
  onToggle,
}: {
  readonly showAll: boolean;
  readonly diffCount: number;
  readonly onToggle: () => void;
}): ReactNode {
  return (
    <div className="dswf-cmp-toggle-row">
      <span className="dswf-cmp-toggle-state">仅显示差异项（{diffCount}）</span>
      <button type="button" className="dswf-cmp-toggle" onClick={onToggle}>
        {showAll ? "收起为差异项" : "显示全部字段"}
      </button>
    </div>
  );
}

/** 对比态差异默认切换（showAll 本地视图态钩子——Dialog/聚组共用）。 */
export function useDiffOnly(): { readonly showAll: boolean; readonly toggle: () => void } {
  const [showAll, setShowAll] = useState(false);
  return { showAll, toggle: () => setShowAll((v) => !v) };
}
