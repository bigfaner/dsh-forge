/**
 * 官方 workspace 路径/标题纯函数结构同型镜像（official-chatview 复制件本地支撑面）。
 *
 * PROVENANCE：官方源位
 *   - packages/client/util/workspace-path/src/index.ts（workspaceTitleOf——
 *     @deepseek-ai/dsh-util-workspace-path，monorepo 内部包、npm 不可达）
 *   - packages/client/api/workspace-controller/src/default-workspace.ts（workspaceDisplayTitle /
 *     DEFAULT_WORKSPACE_DIRECTORY——@deepseek-ai/dsh-api-workspace-controller/default-workspace，
 *     同上不可达）
 * 逐字同文复制（纯函数、零 import），re-copy 时对照官方源覆盖。官方版本锚 0.2.0-rc.2
 *（repo f059f01ce367748392d8f665c0705fb4302a626b，2026-10-22）。
 */

/** 官方 DEFAULT_WORKSPACE_DIRECTORY 同文。 */
export const DEFAULT_WORKSPACE_DIRECTORY = 'default-workspace'

/** 官方 workspaceDisplayTitle 逐字同文。 */
export function workspaceDisplayTitle(title: string, localizedDefault: string): string {
  return title === DEFAULT_WORKSPACE_DIRECTORY ? localizedDefault : title
}

/** 官方 workspaceTitleOf 逐字同文。 */
export function workspaceTitleOf(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '')
  const separator = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return trimmed.slice(separator + 1)
}
