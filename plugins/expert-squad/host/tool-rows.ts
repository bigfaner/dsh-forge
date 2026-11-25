// tool-rows —— 专家 preset 子树的模型工具行常量（agent/created 白名单通道的「供给半」）。
//
// 为什么需要行常量：官方组合模型下子会话工具面 = global 层 ∪ 所选 preset 子树声明的行
// （dsh-tools view(scope)：沿 scope 父链汇总 inherited）。专家 preset 只挂 persona 时，档案
// 声明的 read/write/grep/pwsh 全部缺席（真机 2026-11-25：子会话仅 3 个 knowledge_*）。
// 要让专家拿到模型工具，子树必须声明对应官方工具包的行——行是挂载的唯一输入，去不掉。
//
// 为什么全部专家挂全部行、不按档案挑：行只能整包装载（官方工具包入口只导出整体 apply，
// 不导出单工具定义——read 与 write 同包），按档案挑行需要「工具名 → 包」映射表且换不来
// 更细的粒度。全部挂 + agent/created 上按档案 restrict 裁剪（可见性声明，非调用期拦截）
// = 工具级精确，零映射表。
//
// 值来源：name 为 @deepseek-ai/* 官方包（任何 dsh 宿主具备）；config/disabled 对齐官方
// web-app 预设现行写法（packages/bundle/web-app/presets/standard.patch.yml——上游事实转录，
// 非 forge 引用：expert-squad 不依赖 forge，单装形态同样成立）。
//
// 维护：官方新增工具包且档案需要时加一行。漏行的后果是该工具不可用（N0 求交时被剔除，
// diag 可见）——软失败，不炸。

/** preset 行类型（官方 PresetDefinition.plugins 元素——完整 Cordis EntryOptions）。 */
export type ExpertPresetRow = import("@deepseek-ai/dsh-agent-preset-registry").PresetDefinition["plugins"][number];

const isWin32 = process.platform === "win32";

/**
 * 专家 preset 子树的模型工具行全集（顺序即挂载序）。
 * 平台条件在模块加载期求值一次——专家 preset 不跨平台热切换，布尔足够。
 */
export const EXPERT_TOOL_ROWS: readonly ExpertPresetRow[] = [
  { id: "tool-bash", name: "@deepseek-ai/dsh-tool-bash", disabled: isWin32 },
  { id: "tool-pwsh", name: "@deepseek-ai/dsh-tool-pwsh", disabled: !isWin32 },
  { id: "tool-fs", name: "@deepseek-ai/dsh-tool-fs", config: { applyPatch: false } },
  {
    id: "tool-fs-search",
    name: "@deepseek-ai/dsh-tool-fs-search",
    config: { sampleOverCapGlobResults: false },
  },
  { id: "tool-jobs", name: "@deepseek-ai/dsh-tool-jobs" },
  { id: "tool-todo", name: "@deepseek-ai/dsh-tool-todo", config: { allowParallelInProgress: true } },
  { id: "tool-web", name: "@deepseek-ai/dsh-tool-web", config: { fetch: true, searchTimeoutMs: 60000 } },
];
