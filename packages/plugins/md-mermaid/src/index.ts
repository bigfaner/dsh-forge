// @dsh-forge/md-mermaid —— 插件入口（Node，cordis loader 装载面）。
// 占位导出（骨架任务）：后续任务在此实现 apply + ctx.tools.register(validateMermaid)
// 自注册（ctx 结构化窄类型，faces.ts 模式，零 dsh 运行时依赖）。
export const MD_MERMAID_PLUGIN_NAME = 'md-mermaid' as const
