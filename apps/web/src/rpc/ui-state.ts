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
  // ── M2 15 新码（1.1 扩池承接；3.1 按码精化——tech-design Propagation Strategy）──
  // 读未命中 → 空态（详情/列表面目标缺席 = 无内容可列，与知识域三码同口径）
  ERR_TASK_NOT_FOUND: 'empty-state',
  ERR_FEATURE_NOT_FOUND: 'empty-state',
  ERR_PROPOSAL_NOT_FOUND: 'empty-state',
  // 动词校验失败 → 错误条（表单/动作原地反馈，用户改参重试）
  ERR_INVALID_TRANSITION: 'error-bar',
  ERR_DEPENDENCIES_UNMET: 'error-bar',
  ERR_CYCLE_DETECTED: 'error-bar',
  ERR_CHAIN_DEPTH_EXCEEDED: 'error-bar',
  ERR_REASON_REQUIRED: 'error-bar',
  ERR_SUMMARY_REQUIRED: 'error-bar',
  ERR_TASK_EXISTS: 'error-bar',
  ERR_FEATURE_EXISTS: 'error-bar',
  ERR_WORKSPACE_NOT_REGISTERED: 'error-bar',
  ERR_DOC_PATH_INVALID: 'error-bar',
  // 疑似移动 → 错误条 + 手工指引留场（表单语境，data.guidance 喂点——注册表单单点重试）
  ERR_SUSPECTED_MOVE: 'error-bar',
  // 库不可用 → 工作区隔离态（概览域级横幅——单库腐化不瘫痪全局，其余工作区照常）
  ERR_WORKSPACE_DB_UNAVAILABLE: 'banner',
}

/**
 * UI 消费入口：catch RpcClientError → rpcUiState(error.code) → 选状态组件。
 * 未映射码 → 通用错误条兜底（永无裸 code 泄漏——Record 编译期穷举之外，运行期
 * 版本错配面（主进程新版码 × 旧 renderer 映射表）亦收敛为 error-bar，不 undefined 外溢）。
 */
export function rpcUiState(code: ErrorCode): RpcUiStateKind {
  return RPC_UI_STATE_BY_CODE[code] ?? 'error-bar'
}
