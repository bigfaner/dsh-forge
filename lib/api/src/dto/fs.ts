// forge:fs/* 浏览面 DTO（UF-3 文件浏览器数据源；任务 2.8 Hard Rules——本机目录读取经 RPC，
// renderer 不开 Node fs 通道）。定位铁律：纯类型，零逻辑零依赖。

/** forge:fs/listDir 请求（dirPath 缺省 = 用户主目录——浏览器起始态） */
export interface ListDirRequest {
  /** 目标目录绝对路径（host 侧 canonical 化 = path.resolve） */
  dirPath?: string
}

/** 目录条目（仅真实子目录——符号链接目录不入列（P1 口径）；文件不入列） */
export interface DirEntry {
  /** 目录名（不含路径） */
  name: string
  /** 绝对路径（canonical 化） */
  path: string
}

/** forge:fs/listDir 响应（只读列举，零写入面） */
export interface DirListing {
  /** 实际列举的目录（canonical 化——调用方以此为对账基准，不信输入原样） */
  path: string
  /** 上一级目录（盘符根 / UNC 根 = null——「上一级」禁用判据） */
  parentPath: string | null
  /** 子目录条目（名称序） */
  entries: DirEntry[]
}
