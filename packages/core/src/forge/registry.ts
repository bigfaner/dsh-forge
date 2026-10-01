// dsh ctx.workspaceRegistry 消费面（定位：业务——补偿链的 dsh 官方依赖形状）。
// 语义锚定 G1 pin 第 4 项（上游 dsh-workspace 源码核实）：
//   create 幂等（同 canonical path 返回既有实体且不改标题）/ list 同步投影 / delete 保目录保日志、
//   未知 id 幂等 no-op（false）。core 不依赖 dsh 运行时包（profile 装配期注入 Cordis 服务），
//   此处仅以结构化最小面锚定本域消费的官方面——真实现（WorkspaceRegistry）结构兼容。

/** 工作区只读投影（dsh Workspace 的本域消费子面：id=稳定 uuid，path=canonical 不可重写） */
export interface WorkspaceLike {
  readonly id: string
  readonly path: string
}

/** registry 官方面子集（仅补偿链消费的方法；2.3 对账 get/create 复用同面） */
export interface WorkspaceRegistryPort {
  /** 同步工作区投影（durable registry order，无持久化读） */
  list(): readonly WorkspaceLike[]
  /** 为既有目录创建或复用工作区（幂等：同 canonical path 返回既有实体） */
  create(path: string, title?: string): Promise<WorkspaceLike>
  /** 删除注册记录（保留目录与全部会话日志）；未知 id 幂等 no-op 返回 false */
  delete(id: string): Promise<boolean>
}
