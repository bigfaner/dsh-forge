// forge:fs/* 浏览面 DTO（UF-3 文件浏览器数据源；任务 2.8 Hard Rules——本机目录读取经 RPC，
// renderer 不开 Node fs 通道）。定位铁律：纯类型，零逻辑零依赖。

/** forge:fs/listDir 请求（dirPath 缺省 = 用户主目录——浏览器起始态） */
export interface ListDirRequest {
  /** 目标目录绝对路径（host 侧 canonical 化 = path.resolve） */
  dirPath?: string
}

/** 目录条目（真实子目录 + 纯文件混合入列——符号链接目录不入列（P1 口径）） */
export interface DirEntry {
  /** 目录名（不含路径） */
  name: string
  /** 绝对路径（canonical 化） */
  path: string
  /**
   * 条目类型（dir = 子目录 / file = 纯文件）。
   * 可选 + 缺席按 dir 解释——向后兼容：既有消费面（目录浏览器等）零改动不破坏；
   * host 侧 listDir 实现恒携带本字段（新消费面按 kind 分流）。
   */
  kind?: "dir" | "file"
}

/** forge:fs/listDir 响应（只读列举，零写入面） */
export interface DirListing {
  /** 实际列举的目录（canonical 化——调用方以此为对账基准，不信输入原样） */
  path: string
  /** 上一级目录（盘符根 / UNC 根 = null——「上一级」禁用判据） */
  parentPath: string | null
  /** 条目（子目录 + 文件混合——名称序；类型经 DirEntry.kind 区分） */
  entries: DirEntry[]
}
