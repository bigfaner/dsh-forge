// @dsh-forge/md-mermaid/validate —— 校验面（零 React 纯逻辑，Node shim）。
// 占位导出（骨架任务）：后续任务在此实现引擎适配器（DOM shim + loose + parse 归一）、
// 引擎注册表 Record<format, adapter>、fence 提取正则、首行头词探测与裁决归一形状。
export const MD_MERMAID_VALIDATE_FENCE_RE = /```mermaid\r?\n([\s\S]*?)```/g
