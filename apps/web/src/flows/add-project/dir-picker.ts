// 官方原生目录选取桥消费面（定位：业务——fix-14 UF-3 段一主路径 + 表单「浏览…」同桥复用）。
// 契约 pin = @deepseek-ai/dsh-client-ui-directory-picker-native lib/client.js:62-76（结构同型
// 镜像，运行期边界禁 import 官方/host 源码）：桥在场（Electron 桌面 preload 暴露
// globalThis.__DSH_DIRECTORY_PICKER__）→ pick() = 系统 OS 目录对话框（盘符/快速访问/网络
// 位置全 OS 原生——dsh 原生优先哲学）；桥缺席（非 Electron 载体/单测/e2e 回退口径）→
// undefined → 回退内嵌浏览器（官方 -browse 双面同型：同一对槽位两可互换）。
/** 官方 __DSH_DIRECTORY_PICKER__ 桥形状（pick 语义：resolve 选中绝对路径 / 取消 null / reject 错误面） */
export interface DshDirectoryPickerBridge {
  pick(): Promise<string | null>
}

/** globalThis 的桥切片（结构同型镜像——host preload-api.ts 形状权威） */
interface GlobalWithPicker {
  readonly __DSH_DIRECTORY_PICKER__?: { readonly pick?: unknown }
}

/**
 * 桥探测：pick 为函数才算在场（防御畸形暴露面——缺席/非对象/缺 pick 一律回退浏览器）。
 * 入参 unknown（缺省 globalThis）——transport.ts 同款 globalThis 切片转型口径。
 */
export function directoryPickerBridgeOf(globalLike: unknown = globalThis): DshDirectoryPickerBridge | undefined {
  const picker = (globalLike as GlobalWithPicker | null | undefined)?.__DSH_DIRECTORY_PICKER__
  if (typeof picker !== 'object' || picker === null || typeof picker.pick !== 'function') return undefined
  return picker as DshDirectoryPickerBridge
}

/** 原生选取源（桥真身/测试桩同型——取消 null / 选中路径 / reject 错误） */
export type NativePickSource = () => Promise<string | null>

/** 已注册路径集合零态（共享常量，fix-36 收敛——DirectoryBrowser/RegisterForm/AddProjectFlow/
 * flow-actions 四消费面同引用：缺省注入值 = 空集不标记） */
export const EMPTY_REGISTERED: ReadonlySet<string> = new Set()

/**
 * 原生选取源解析（纯函数，fix-36 收敛——RegisterForm/AddProjectFlow 两装配壳同判据）：
 * 显式注入优先（undefined = 探测桥；null = 强制回退内嵌浏览器面——回退面测试口径）；
 * 桥在场包一层 `() => bridge.pick()`（探测一次，非每调用探测）。
 */
export function resolveNativePickSource(
  nativePicker: NativePickSource | null | undefined,
): NativePickSource | null {
  if (nativePicker !== undefined) return nativePicker
  const bridge = directoryPickerBridgeOf()
  return bridge === undefined ? null : () => bridge.pick()
}
