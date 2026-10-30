// forge 域 typed errors（tech-design §Error Handling 表前三行——code 字面量锚定 @dsh-forge/contracts
// ERROR_CODES，类名/name 手写字面量——contracts 不持运行期名映射，fix-34 后表 Name 列为文档性对照）。
// RPC 边界（2.4）序列化为 RpcErrorPayload { code, message, data }，
// UI 按 code 映射状态；dsh 面异常经 cause 原样透传（dsh 域归 dsh）。
import type { CompensatedInfo } from '@dsh-forge/contracts'
import { errMessage } from '../util.js'

/** forge 域错误附载（RpcErrorPayload.data 的形状：标识 + 失败原因 + 处置结果） */
export interface ForgeErrorData {
  workspaceId?: string
  wsPath?: string
  /** ④ 补偿已执行信息（存在即「补偿已执行」——UI 失败反馈口径；挂接/中止路径无此字段） */
  compensated?: CompensatedInfo
  [key: string]: unknown
}

/** ② registry.create 失败（注册中止，无补偿需要） */
export class WorkspaceCreateError extends Error {
  readonly code = 'ERR_WORKSPACE_CREATE' as const
  readonly data: ForgeErrorData

  constructor(wsPath: string, cause: unknown) {
    super(`dsh 工作区创建失败（注册中止，无补偿需要）：${wsPath}`, { cause })
    this.name = 'WorkspaceCreateError'
    this.data = { wsPath }
  }
}

/** ③ 应用库写入失败（触发 ④ 补偿；data.compensated 存在 = 补偿已执行，dsh 侧零孤儿） */
export class ProjectWriteError extends Error {
  readonly code = 'ERR_PROJECT_WRITE' as const
  readonly data: ForgeErrorData

  constructor(data: ForgeErrorData, cause: unknown) {
    super(
      data.compensated
        ? `应用库 projects 行写入失败（registry.delete 补偿已执行，dsh 侧零孤儿）：${String(data.wsPath ?? '')}`
        : `应用库 projects 行写入失败（未补偿：挂接既有受 ownership 保护，或补偿不适用）：${String(data.wsPath ?? '')}`,
      { cause },
    )
    this.name = 'ProjectWriteError'
    this.data = data
  }
}

/** ④ registry.delete 补偿失败（已 app_key_logs 记账；孤儿工作区交启动对账提示，不自动删） */
export class CompensationError extends Error {
  readonly code = 'ERR_COMPENSATION' as const
  readonly data: ForgeErrorData

  constructor(data: ForgeErrorData, writeCause: unknown, deleteCause: unknown) {
    super(`registry.delete 补偿失败（已 app_key_logs 记账，孤儿交启动对账提示、不自动删）：${String(data.wsPath ?? '')}`, {
      cause: deleteCause,
    })
    this.name = 'CompensationError'
    this.data = { ...data, writeError: errMessage(writeCause), deleteError: errMessage(deleteCause) }
  }
}

/** ERR_PROJECT_SORT_INVALID data 载荷（project-manual-order：sortOrders 全量预检拒绝清单——写前零副作用） */
export interface ProjectSortInvalidData extends ForgeErrorData {
  /** sortOrders 中未命中 projects 行的项目 id 清单 */
  missingProjectIds?: string[]
  /** 非法值清单（projectId → 原值——非有限安全整数） */
  invalidOrders?: Array<{ projectId: string; order: unknown }>
}

/**
 * patch.sortOrders 批量排序写面校验拒绝（project-manual-order 1.1）：空 map / 含未注册
 * 项目 id / 非法值（非安全整数）——全量预检于事务前抛出，零行写入（无半写）。
 */
export class ProjectSortOrderInvalidError extends Error {
  readonly code = 'ERR_PROJECT_SORT_INVALID' as const
  readonly data: ProjectSortInvalidData

  constructor(data: ProjectSortInvalidData) {
    const parts: string[] = []
    if (data.missingProjectIds?.length) parts.push(`未注册项目 id：${data.missingProjectIds.join(', ')}`)
    if (data.invalidOrders?.length)
      parts.push(`非法 order 值：${data.invalidOrders.map((v) => `${v.projectId}=${String(v.order)}`).join(', ')}`)
    super(`sortOrders 校验拒绝（全量预检，零写入）：${parts.join('；') || '空 map'}`)
    this.name = 'ProjectSortOrderInvalidError'
    this.data = data
  }
}
