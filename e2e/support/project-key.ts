// 任务域归属键派生（e2e 侧单源）：lib-path deriveDirName(wsDir)——与 task-loop db
// project_key 写点同源（plugins/task-loop/host/db/repositories/project-key.ts 单源函数）。
// tests/e2e 树无 workspace dep 解析径，经插件侧 node_modules 显式文件路径 ESM 动态 import
// （tests/task-loop/task-loop-mainline 同判例同型）。
import { join } from 'node:path'
import { ROOT } from './launch.js'

const { deriveDirName } = (await import(
  join(ROOT, 'plugins', 'project', 'node_modules', '@dsh-forge', 'lib-path', 'dist', 'index.js')
)) as { deriveDirName(workspaceDir: string): string }

/** 工作区目录 → 任务域 projectKey（slug 直键契约的归属键——addTask/claimTask/submitTask
 *  与 forge:tasks/* 读通道共消费； forging 主链 deriveProjectKey 同函数同值） */
export function projectKeyOf(wsDir: string): string {
  return deriveDirName(wsDir)
}
