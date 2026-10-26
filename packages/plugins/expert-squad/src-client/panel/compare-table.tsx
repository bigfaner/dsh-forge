// panel/compare-table —— 两两对比共享组件（1.61 裁决③⑤⑥）：生效卡 vs 单一对比对象
// 的字段对齐表（差异格 warn 高亮）、来源选择 chips 单选行。供聚组展开对比
//（expert-panel）与 Dialog 两两对比（detail-dialog）同构消费——禁三列并排的唯一点。

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

/** 来源选择 chips 单选行（⑤ 两两口径：点选切换对比对象；data-cmp-selected 标注当前）。 */
export function CompareChips({
  shadows,
  selectedOrigin,
  onSelect,
}: {
  readonly shadows: readonly ExpertView[];
  readonly selectedOrigin: string;
  readonly onSelect: (origin: string) => void;
}): ReactNode {
  return (
    <div className="dswf-cmp-pick" role="radiogroup" aria-label="对比对象">
      <span className="dswf-cmp-pick-lead">对比对象：</span>
      {shadows.map((shadow) => (
        <button
          key={shadow.origin}
          type="button"
          role="radio"
          className={`dswf-cmp-chip origin-${shadow.origin}`}
          data-cmp-chip={shadow.origin}
          data-cmp-selected={shadow.origin === selectedOrigin ? "true" : "false"}
          aria-checked={shadow.origin === selectedOrigin}
          onClick={() => onSelect(shadow.origin)}
        >
          {originLabel(shadow.origin)}
        </button>
      ))}
      <span className="dswf-cmp-pick-note">两两对比 · 点选切换</span>
    </div>
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
                <span className={`origin-badge origin-${shadow.origin}`}>
                  {originLabel(shadow.origin)}
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
