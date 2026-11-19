// 插件 bundle 自有 locale 命名空间（1.40 随「手机远程入口」注册面迁入建立）：
// 与壳侧 '@dsh-forge/web-client' 的 FORGE_LOCALE_NS（'dsh-forge'）分立——官方 locale
// 服务 register 对同 ns+locale 重复登记抛错，双 bundle 各持词典须各持 NS；词条随迁移
// 面逐批归集（壳侧对应键同步退役）。登记/绑定走官方 LocaleFace 同径（ui-trajectory 先例）。

/** 插件侧词典登记键（与壳 'dsh-forge' NS 分立——见头注） */
export const FORGE_PROJECT_LOCALE_NS = 'dsh-forge.project'

/** 官方 locale 服务消费切片（dsh-client-locale LocaleFace 结构同型镜像——bundle 自含纪律） */
export interface LocaleServiceFace {
  /** 登记命名空间词典（同 ns+locale 重复登记抛错——一次登记面）；返回撤销器 */
  register(ns: string, dicts: Readonly<Record<string, Readonly<Record<string, string>>>>): () => void
  /** 绑定命名空间翻译器（label thunk 消费——active locale 切换逐读生效） */
  bind(ns: string): (key: string) => string
}

/** 插件侧词典（迁移面词条归集单源——1.40 remote.entry。1.13 迁移退役：dispatchTask 工具行族 + dock tab 族两词条迁 @dsh-forge/task-loop NS（FORGE_TASK_LOOP_LOCALE_NS）；knowledge 族两词条已随迁 knowledge 插件 NS——1.4） */
export const FORGE_PROJECT_LOCALE_DICTS = {
  zh: {
    'remote.entry': '手机远程',
  },
  en: {
    'remote.entry': 'Mobile Remote',
  },
} as const
