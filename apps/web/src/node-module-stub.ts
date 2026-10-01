// node:module 浏览器替身（官方 apps/web 母本同款）：已发布 cordis-plugin-loader 的唯一
// Node import；浏览器路径不可达 createRequire，若被走到即 fail-loud（母本同语义）。

/** 浏览器引导触达 Node 模块装载器即抛（装配错误的表现面，非静默降级）。 */
export const createRequire = (): never => {
  throw new Error('node:module is not available in the browser')
}

/** 类型面 peer（母本同款）。 */
export type LoadHookContext = never
