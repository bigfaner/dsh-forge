/**
 * The forge-workbench dictionary, Chinese half. The typed locale registration
 * enforces bilingual balance (zh/en carry the identical key set); a locale
 * missing a key falls back through the chain to the English half.
 */
import type { WorkbenchKey } from './en'

/** Chinese copy. */
export const zh: Record<WorkbenchKey, string> = {
  'panel': '工作台',
  'shell.title': 'forge 工作台',
  'shell.placeholder': '工作台壳 — 任务看板、详情与 feature 视图由 M2 5.x 填充',
  'view.session': '会话',
  'rail.label': '主视图切换',
  'tabs.label': '工作台视图',
  'tab.overview': '概览',
  'tab.tasks': '任务',
  'tab.features': 'feature',
}
