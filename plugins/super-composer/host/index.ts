// @dsh-forge/super-composer —— host 入口（Node，cordis loader 装载面）。
// 纯 client 包（proposal 裁决：main=无 host 行为，空载合法，input-history 判例同构）：
// cordis.patch.yml 组合行仍引用本包为插件条目，loader 只认 default 导出，故落最小
// Plugin.Function 空载体——零副作用、零注入；功能全在浏览器半（./client = 自注册
// CJS bundle）：全屏感知/替身挂载由后续任务在 client face 移植。

export const SUPER_COMPOSER_PLUGIN_NAME = 'super-composer' as const

/** 空载 host face（Plugin.Function）：纯 client 包，宿主侧零行为。 */
export default function superComposerPlugin(): void {}
