// 任务日志目录派生单点（bug 26dff330——两套口径收口）：容器目录 + slug + localId →
// {containerDir}/logs/{slug}/{localId}。三处消费位共用本函数，任一改用别的派生即口径漂移：
//   ① worker 简报锚点（domain/tasks/worker-context.ts——{forge.task_logs_dir} 值）
//   ② 回收钩子注入（assembly/tool-family.ts taskLogsDir——与 forgeResolvePath(taskLogs)
//      的 taskLogsDirOf(join(taskHome,'logs',slug,localId)) 同形同值）
//   ③ 事故台账缺省目录（notify/incident-log.ts）
// 注册侧正本 = plugins/project/host/dirs/anchors.ts taskLogsDirOf（本插件零依赖不 import，
// 形状逐字节等价——tests/assembly/task-logs-dir-guard.test.ts 把守两侧一致）。
import { join } from "node:path";

/** 容器目录 → 任务执行日志目录（= forge.task_logs_dir；join 单源拼接，平台拼写随容器目录）。 */
export function taskLogsDirOf(containerDir: string, slug: string, localId: string): string {
  return join(containerDir, "logs", slug, localId);
}
