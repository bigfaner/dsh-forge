// task-loop 插件 bundle 自有 locale 命名空间（1.13 六组件自 @dsh-forge/project ui/ 迁包落位）：
// 官方 locale 服务 register 对同 ns+locale 重复登记抛错，双 bundle 各持词典须各持 NS；
// 登记/绑定走官方 LocaleFace 同径（ui-trajectory 先例）。

/** 插件侧词典登记键（与 project bundle 'dsh-forge.project' NS 分立——见头注） */
export const FORGE_TASK_LOOP_LOCALE_NS = "dsh-forge.task-loop";

/** 官方 locale 服务消费切片（dsh-client-locale LocaleFace 结构同型镜像——bundle 自含纪律） */
export interface LocaleServiceFace {
  /** 登记命名空间词典（同 ns+locale 重复登记抛错——一次登记面）；返回撤销器 */
  register(ns: string, dicts: Readonly<Record<string, Readonly<Record<string, string>>>>): () => void;
  /** 绑定命名空间翻译器（label thunk 消费——active locale 切换逐读生效） */
  bind(ns: string): (key: string) => string;
}

/** 插件侧词典（迁移面词条归集单源——dispatchTask 工具行族；概览页型 + guide 入口卡） */
export const FORGE_TASK_LOOP_LOCALE_DICTS = {
  zh: {
    // dispatchTask 对话工具行（toolview 行内 t 座——文案对齐官方通用行用词）
    "tool.dispatchTask.title": "工具调用",
    "tool.dispatchTask.preparing": "正在准备调用",
    "tool.dispatchTask.running": "运行中",
    "tool.dispatchTask.failed": "失败",
    "tool.dispatchTask.input": "输入",
    "tool.dispatchTask.output": "输出",
    "tool.dispatchTask.inspect": "查看",
    // 概览 dock tab（页型标题 + guide 入口卡描述——提案/feature 子块已摘，任务域接管）
    "tab.overview": "任务概览",
    "guide.overview.desc": "任务与文档——任务环接管工作台",
  },
  en: {
    "tool.dispatchTask.title": "Tool call",
    "tool.dispatchTask.preparing": "Preparing call",
    "tool.dispatchTask.running": "Running",
    "tool.dispatchTask.failed": "Failed",
    "tool.dispatchTask.input": "Input",
    "tool.dispatchTask.output": "Output",
    "tool.dispatchTask.inspect": "Inspect",
    "tab.overview": "Task Overview",
    "guide.overview.desc": "Tasks and docs — task-loop workbench",
  },
} as const;
