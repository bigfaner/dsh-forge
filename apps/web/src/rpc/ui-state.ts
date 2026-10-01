// 错误码 → UI 状态映射（AC5：UI 按 code 映射状态的最简消费约定——可执行化 + README 表）。
// 三态口径出自 tech-design Propagation Strategy：「UI 按 code 映射状态（空态/错误条/横幅）」。
// Record<ErrorCode,…> 全码穷举：contracts 增码即编译红（映射不失约）。

import type { ErrorCode } from '@dsh-forge/contracts'

/** UI 状态三态（组件选型：EmptyState / 表单/面板错误条 / 应用级横幅） */
export type RpcUiStateKind = 'error-bar' | 'banner' | 'empty-state'

/** code → 状态（约定本体；理由逐行见 rpc/README.md 消费约定表） */
export const RPC_UI_STATE_BY_CODE: Readonly<Record<ErrorCode, RpcUiStateKind>> = {
  // 注册流程内失败（create 中止 / ③ 写失败，含补偿已执行口径）——表单错误条，用户原地重试
  ERR_WORKSPACE_CREATE: 'error-bar',
  ERR_PROJECT_WRITE: 'error-bar',
  // 补偿失败留孤儿（已 app_key_logs 记账 + 启动对账提示）——应用级横幅，超出单表单语境
  ERR_COMPENSATION: 'banner',
  // 条目漂移 / 索引静默重建中——详情与浏览面退空态
  ERR_ENTRY_NOT_FOUND: 'empty-state',
  ERR_INDEX_STALE: 'empty-state',
  // 知识目录不可达——浏览面空态 + 提示（无内容可列）
  ERR_INVALID_KNOWLEDGE_DIR: 'empty-state',
}

/** UI 消费入口：catch RpcClientError → rpcUiState(error.code) → 选状态组件 */
export function rpcUiState(code: ErrorCode): RpcUiStateKind {
  return RPC_UI_STATE_BY_CODE[code]
}
