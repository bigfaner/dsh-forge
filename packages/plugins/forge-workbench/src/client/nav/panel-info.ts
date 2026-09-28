/**
 * The panellist「项目」row model (M4 task 1.6; tech-design §Integration #4 +
 * page-map 项目工作台 View Key + ui-design Navigation & View Keys):
 * the project workbench's global-panel row — FIRST in the list (order 首项,
 * before upstream `plugins` at 0 and the M1 `workbench` escape-hatch row at
 * 10), clicking it selects the CONVERSATION panel (`selectPanel(null)` — the
 * `project` workbench IS the native conversation panel under 裁决 T1), and
 * its selected state is `activePanelId == null`.
 *
 * How a null-addressed row rides the upstream shell unchanged: the sidebar
 * shell owns every row button (SidebarRoot PanelRow) — click calls
 * `selectPanel(id)` and active reads `activePanelId === id` with the row's
 * own id. The slots registry's list validation rejects only an UNDEFINED id
 * (`options.id === void 0` throws; SlotCore 0.1.6-alpha.2), so registering
 * with `id: null` passes the contract and makes the upstream row do EXACTLY
 * `selectPanel(null)` / `activePanelId === null` — the AC's verbatim
 * semantics through the native row, zero upstream modification (Hard Rule:
 * vendored 零修改; the upstream `PanelRow key={id}` renders a null key, a
 * benign dev-mode React key warning unique to this row — recorded in the
 * task notes).
 *
 * `MainPanelId` is a branded string, so the null address is expressed as a
 * documented cast — the ONE place the convention lives.
 */
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'

/**
 * The project workbench's panel address: `null` — the conversation panel is
 * the project workbench (裁决 T1: 启动默认即首屏, `selectPanel(null)`).
 * Cast, not a string: see the module doc for why the null id is the row's
 * address and how the upstream shell projects it.
 */
export const PROJECT_PANEL_ID = null as unknown as MainPanelId

/**
 * Row order: 首项 (order 首项注册) — below `plugins` (upstream, order 0) and
 * the M1 `workbench` row (order 10), both untouched (AC2: 既有行不受影响).
 */
export const PROJECT_PANEL_ORDER = -100

/**
 * The row's selected-state predicate (AC2: 选中态 = activePanelId==null).
 * The upstream PanelRow computes `activePanelId === id` with the row's null
 * id — this helper is the same predicate named, for the seat's chrome, the
 * e2e assertions, and the unit specs.
 * @param activePanelId - the layout service's active panel id (null = the
 *   conversation/project workbench shows).
 * @returns whether the project workbench is the presenting panel.
 */
export function isProjectPanelActive(activePanelId: MainPanelId | null): boolean {
  return activePanelId === null
}
