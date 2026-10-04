// ProjectService 方法签名与 DTO（tech-design §Interface 1 逐项对照，不自行增删字段）。
// 字段形状依据 design/er-diagram.md PROJECTS 实体（SQLite INTEGER 0/1 → boolean，TEXT ISO-8601 → string）。
// 定位铁律：纯类型，零逻辑零依赖。

/** projects 行的应用层形状（查询/更新返回体） */
export interface Project {
  /** 应用生成 uuid */
  id: string
  /** dsh workspace uuid（外键引用；账本本体在 dsh registry） */
  workspaceId: string
  /** canonical path（启动对账钥匙） */
  wsPath: string
  /** 展示名（默认取文件夹名，可改） */
  name: string
  /** 文档位置 = forge 目录（绝对路径；external 自动推导结果缓存于 forgeDirExternal） */
  forgeDir: string
  /** 0 = 仓内 / 1 = 仓外（由路径关系自动推导） */
  forgeDirExternal: boolean
  /** 知识库目录（绝对路径，默认 `<工作区>/.knowledge`） */
  knowledgeDir: string
  /** 归档态（P1 仅承载字段） */
  archived: boolean
  /** ISO-8601 */
  createdAt: string
  /** ISO-8601 */
  updatedAt: string
}

/** listProjects 返回体（左栏项目列表：标识 + 展示 + archived 过滤口径；会话按 workspaceId 关联 dsh 面数据） */
export interface ProjectSummary {
  id: string
  workspaceId: string
  name: string
  wsPath: string
  archived: boolean
}

/** registerProject 入参（文件浏览器选定 + 表单确认；workspaceDir 为 canonical 化后路径） */
export interface RegisterProjectInput {
  /** 文件浏览器选定（canonical 化后） */
  workspaceDir: string
  /** 默认取文件夹名 */
  name: string
  /** 文档位置（绝对路径；external 自动推导） */
  forgeDir: string
  /** 知识库目录（绝对路径） */
  knowledgeDir: string
}

/**
 * 补偿已执行信息（fix-33：RegisterResult 死字段 compensated 删除——成功径永不置位，
 * 补偿语义实际载体 = ProjectWriteError.data.compensated（RpcErrorPayload.data 附载，
 * UI 失败反馈口径））。保留本形状供 core 错误附载消费。
 */
export interface CompensatedInfo {
  /** 被补偿删除的本次新建工作区 */
  workspaceId: string
  /** 触发补偿的原因（③ 写入失败 / 流程窗口内取消） */
  reason: string
}

/** registerProject 返回体（纯成功径；补偿信息不入返回体——失败径经 RpcErrorPayload.data.compensated） */
export interface RegisterResult {
  projectId: string
  workspaceId: string
  /** true = ① 预检命中既有工作区（挂接，不登记补偿） */
  attachedToExisting: boolean
}

/** updateProject patch 面（仅 name / archived） */
export type ProjectPatch = Partial<Pick<Project, 'name' | 'archived'>>

/** getProject 入参 */
export interface GetProjectRequest {
  id: string
}

/** updateProject 入参 */
export interface UpdateProjectRequest {
  id: string
  patch: ProjectPatch
}

/** 对账单项修引用记录（交互三：失配按 ws_path 找回 / 找不回幂等重建，均单向修应用侧引用） */
export interface ReconcileRepair {
  projectId: string
  /** 修正后的 workspace 引用 */
  workspaceId: string
  /** relinked = 按 ws_path 找回既有；recreated = create(ws_path) 幂等重建 */
  action: 'relinked' | 'recreated'
}

/** 孤儿工作区提示数据（dsh 有、应用无——只提示不自动删） */
export interface ReconcileOrphan {
  workspaceId: string
  wsPath: string
}

/** reconcileAtStartup 返回体（ws_path 失配找回 / 孤儿工作区提示数据；关键异常降级 app_key_logs 永不抛断启动） */
export interface ReconcileReport {
  repaired: ReconcileRepair[]
  orphans: ReconcileOrphan[]
}

/** Interface 1：core · forge 域服务面（ctx.forgeProjects） */
export interface ProjectService {
  /**
   * 四步补偿链内聚：① registry.list() 预检（命中 = 挂接，attachedToExisting=true，不登记补偿）
   * ② registry.create(wsPath) ③ 事务写 projects 行 ④ 失败 → registry.delete 补偿（保目录保日志，幂等）。
   */
  registerProject(input: RegisterProjectInput): Promise<RegisterResult>
  /** 含 archived 过滤口径 */
  listProjects(): Promise<ProjectSummary[]>
  getProject(id: string): Promise<Project | null>
  updateProject(id: string, patch: ProjectPatch): Promise<Project>
  /** ws_path 失配找回 / 孤儿工作区提示数据 */
  reconcileAtStartup(): Promise<ReconcileReport>
}
