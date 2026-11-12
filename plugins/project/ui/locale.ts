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

/** 插件侧词典（迁移面词条归集单源——1.40 remote.entry；1.41 dispatchTask 工具行族；1.42 knowledge 族；1.45 dock tab 族） */
export const FORGE_PROJECT_LOCALE_DICTS = {
  zh: {
    'remote.entry': '手机远程',
    // dock tab 族（1.45 自壳侧 'dsh-forge' NS 迁入——概览页型标题 + guide 入口卡描述）
    'tab.overview': '项目概览',
    'guide.overview.desc': 'feature · 任务 · 提案与文档——管线接管工作台',
    'panel.knowledge': '知识库',
    'view.recall': '知识召回',
    // dispatchTask 对话工具行（toolview 行内 t 座——文案对齐官方通用行用词）
    'tool.dispatchTask.title': '工具调用',
    'tool.dispatchTask.preparing': '正在准备调用',
    'tool.dispatchTask.running': '运行中',
    'tool.dispatchTask.failed': '失败',
    'tool.dispatchTask.input': '输入',
    'tool.dispatchTask.output': '输出',
    'tool.dispatchTask.inspect': '查看',
  },
  en: {
    'remote.entry': 'Mobile Remote',
    'tab.overview': 'Overview',
    'guide.overview.desc': 'Features, tasks, proposals and docs',
    'panel.knowledge': 'Knowledge',
    'view.recall': 'Recall',
    'tool.dispatchTask.title': 'Tool call',
    'tool.dispatchTask.preparing': 'Preparing call',
    'tool.dispatchTask.running': 'Running',
    'tool.dispatchTask.failed': 'Failed',
    'tool.dispatchTask.input': 'Input',
    'tool.dispatchTask.output': 'Output',
    'tool.dispatchTask.inspect': 'Inspect',
  },
} as const
