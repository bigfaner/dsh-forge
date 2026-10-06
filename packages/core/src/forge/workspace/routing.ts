// 中央 projects 行路由（任务 2.7；tech-design §Architecture「forge/workspace/ 共享基建」
// ——四域装配共用的 projectId → 工作区锚点解析）。两消费面：
//   · store.resolveDir（projectId → ws_path → deriveTaskStoreDir 单源推导任务库目录）；
//   · docs 路径守卫基准（projectId → forge_dir）。
// 定位：业务（共享基建）；只读 prepared statements，零句柄创建（db/ 唯一落点不变）。
// projectId 未命中中央行 = 调用方数据面错误（RPC 恒显式带 projectId——UI 自带/tool 由 cwd
// 解析后传入，正常流不可能未命中）→ fail-loud 普通 Error（非六码 typed 面，与
// updateProject 未命中同口径；RPC 边界原样上抛）。
import type Database from 'better-sqlite3'

/** 中央行路由面（ws_path 落库口径 = registry canonical——派生目录同基准） */
export interface CentralProjectRouting {
  /** projectId → 中央 projects.ws_path（任务库目录派生输入） */
  wsPath(projectId: string): string
  /** projectId → 中央 projects.forge_dir（文档读域守卫基准） */
  forgeDir(projectId: string): string
}

/** 建路由（prepared statement 复用——恒只读） */
export function createProjectRouting(db: Database.Database): CentralProjectRouting {
  const stmt = db.prepare<unknown[], { ws_path: string; forge_dir: string }>(
    `SELECT ws_path, forge_dir FROM projects WHERE id = ?`,
  )
  const route = (projectId: string): { ws_path: string; forge_dir: string } => {
    const row = stmt.get(projectId)
    if (row === undefined) {
      throw new Error(`projectId 未命中中央 projects 行：${projectId}（工作区锚点不可解析——正常流不经此面）`)
    }
    return row
  }
  return {
    wsPath: (projectId: string): string => route(projectId).ws_path,
    forgeDir: (projectId: string): string => route(projectId).forge_dir,
  }
}
