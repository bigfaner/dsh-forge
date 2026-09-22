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
}
