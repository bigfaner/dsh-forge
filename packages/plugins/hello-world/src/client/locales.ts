/**
 * The hello-world dictionary: one namespace, two built-in locales, every key
 * present in both (the typed locale registration enforces bilingual balance).
 * Template params use the framework's `{name}` interpolation.
 */

/** Dictionary key union of the hello-world namespace (LocaleNamespaceMap merge target). */
export type HelloWorldKey =
  | 'greet'
  | 'increment'
  | 'counter'
  | 'panelDefault'

/** English copy. */
export const en: Record<HelloWorldKey, string> = {
  greet: 'Hello, world — a panel from the dsh-forge hello-world plugin',
  increment: 'Say hello',
  counter: 'Hellos: {count}',
  panelDefault: 'Default content: third-party plugins can inject into this sub-slot',
}

/** Chinese copy. */
export const zh: Record<HelloWorldKey, string> = {
  greet: '你好，世界 — 来自 dsh-forge hello-world 插件的面板',
  increment: '打个招呼',
  counter: '招呼数：{count}',
  panelDefault: '默认内容：第三方插件可注入此子槽位',
}
