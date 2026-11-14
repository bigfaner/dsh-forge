// knowledge 插件自有 locale 词典（knowledge-plugin-migration 1.4 子提交 a——词条随迁：
// 'panel.knowledge' / 'view.recall' 两词条自 project 词典（FORGE_PROJECT_LOCALE_NS）
// 迁入本 NS；project 词典同步退役两词条）。与壳侧 '@dsh-forge/web-client' FORGE_LOCALE_NS
// 及 project 'dsh-forge.project' NS 三方分立——官方 locale 服务 register 对同 ns+locale
// 重复登记抛错，各 bundle 各持词典项各按 NS；绑定走官方 LocaleFace 同径（ui-trajectory 先例）。

/** knowledge 插件侧词典登记键（与 project 'dsh-forge.project' NS 分立——见头注） */
export const FORGE_KNOWLEDGE_LOCALE_NS = 'dsh-forge.knowledge'

/** 官方 locale 服务消费切片（dsh-client-locale LocaleFace 结构同型镜像——bundle 自含纪律） */
export interface LocaleServiceFace {
  /** 登记命名空间词典（同 ns+locale 重复登记抛错——一次登记面）；返回撤销器 */
  register(ns: string, dicts: Readonly<Record<string, Readonly<Record<string, string>>>>): () => void
  /** 绑定命名空间翻译器（label thunk 消费——active locale 切换逐读生效） */
  bind(ns: string): (key: string) => string
}

/** knowledge 插件词典（词条随迁自 project 词典——1.42 knowledge 族两词条，字面逐字保留） */
export const FORGE_KNOWLEDGE_LOCALE_DICTS = {
  zh: {
    'panel.knowledge': '知识库',
    'view.recall': '知识召回',
  },
  en: {
    'panel.knowledge': 'Knowledge',
    'view.recall': 'Recall',
  },
} as const
