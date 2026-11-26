// 任务日志目录派生单点（bug 26dff330——两套口径收口）：容器目录 + slug + localId →
// {containerDir}/{slug}/{localId}（= 注册表 task_loop.task_dir：任务循环运行时目录
// task_loop.runtime_dir 下的 {localId}）。三处消费位共用本函数，任一改用别的派生即口径漂移：
//   ① worker 简报锚点（domain/tasks/worker-context.ts——{task_loop.task_dir} 值）
//   ② 回收钩子注入（assembly/tool-family.ts taskLogsDir——与 forgeResolvePath(taskLogs)
//      的 taskLogsDirOf(join(taskHome,slug,localId)) 同形同值）
//   ③ 事故台账缺省目录（notify/incident-log.ts）
// 注册侧正本 = plugins/project/host/dirs/anchors.ts taskLogsDirOf（本插件零依赖不 import，
// 形状逐字节等价——tests/assembly/task-logs-dir-guard.test.ts 把守两侧一致）。
import { join } from "node:path";
import { assertValidDirParam } from "@dsh-forge/lib-path";

/** 容器目录 → 任务执行日志目录（= task_loop.task_dir；join 单源拼接，平台拼写随容器目录）。
 *  落盘前参数校验（forge-dirs-unification §2.2——lib/path 校验函数单源：slug/localId 须匹配
 *  `^[A-Za-z0-9][A-Za-z0-9._-]*$`，不含路径分隔符与 `..`；不合法 fail-loud 点名参数）。 */
export function taskLogsDirOf(containerDir: string, slug: string, localId: string): string {
  assertValidDirParam("slug", slug);
  assertValidDirParam("localId", localId);
  return join(containerDir, slug, localId);
}
