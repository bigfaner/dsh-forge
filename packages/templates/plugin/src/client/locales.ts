/**
 * The locale posture: one namespace, two built-in locales, every key present
 * in both (the typed locale registration enforces bilingual balance).
 * Template params use the framework's `{name}` interpolation. Rename the
 * namespace in src/client/index.ts and the key union to your own vocabulary.
 */

/** Dictionary key union of the template's namespace (LocaleNamespaceMap merge target). */
export type TemplateKey =
  | 'greet'
  | 'action'
  | 'counter'
  | 'panelDefault'

/** English copy. */
export const en: Record<TemplateKey, string> = {
  greet: 'Hello — a panel from your dsh plugin (built from the template)',
  action: 'Say hello',
  counter: 'Hellos: {count}',
  panelDefault: 'Default content: other plugins can register into this sub-slot',
}

/** Chinese copy. */
export const zh: Record<TemplateKey, string> = {
  greet: '你好 — 来自模板新建的 dsh 插件面板',
  action: '打个招呼',
  counter: '招呼数：{count}',
  panelDefault: '默认内容：其他插件可注册注入此子槽位',
}
