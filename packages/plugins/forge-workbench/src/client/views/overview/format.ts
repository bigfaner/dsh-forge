/**
 * The overview page's pure presentation helpers (task 5.3): deterministic
 * timestamp + path rendering. Both are ISO-in → string-out with ZERO
 * environment reads (no `Date.now()`, no host locale) — the UI-build tests
 * stay green on any clock/zone, and the full ISO original always rides along
 * as the element's `title` so nothing is lost to truncation.
 */

/**
 * Render an Interface 1 ISO-8601 UTC timestamp for the card/meta secondary
 * line: `YYYY-MM-DD HH:mm` in UTC — a fixed, locale/zone-neutral shape (the
 * locale-polished display is an assembly-time refinement; determinism is the
 * build-stage requirement).
 * @param iso - Interface 1 timestamp (e.g. `2026-09-22T06:40:00.000Z`).
 * @returns `YYYY-MM-DD HH:mm`; the input verbatim when unparseable (never a
 *   rendered `Invalid Date`).
 */
export function formatTimestamp(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso)
  return match === null ? iso : `${match[1]} ${match[2]}:${match[3]}`
}

/**
 * Middle-ellipsis a path, 保尾段 (ui-design UF1 元信息行: 路径超长中段省略
 * `…`, keep the tail — the tail is what disambiguates sibling directories).
 * @param path - the full path (already an absolute, normalized codeRoot).
 * @param maxLength - the rendered budget, default 48.
 * @returns the path verbatim when it fits; `head…tail` otherwise, total
 *   length ≤ maxLength (the ellipsis character included).
 */
export function middleEllipsis(path: string, maxLength = 48): string {
  if (path.length <= maxLength) return path
  // At least 8 visible characters per side, even for aggressive budgets.
  const budget = Math.max(8, Math.floor((maxLength - 1) / 2))
  return `${path.slice(0, budget)}…${path.slice(path.length - budget)}`
}

/**
 * Fill a locale template's `{slot}` placeholders (shared since task 5.5 —
 * the board's count/sync/announce copies parametrize the same way the
 * overview's toasts do). Unknown slots stay verbatim (a missing value is a
 * visible `{slot}`, never a silently dropped token).
 * @param template - the locale string, e.g. `'{visible} of {total} tasks'`.
 * @param values - the slot values.
 * @returns the template with every known slot substituted.
 */
export function fillTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? values[name]! : match)
}
