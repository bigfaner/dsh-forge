// files_json v2 读面归一（core forge/tasks/files.ts 直迁——读面单源：{created, modified} →
// 平铺并集，created 序优先）。
import type { TaskScope } from "./types.js";

/** files 分组归一（读面单源） */
export function taskFilesUnion(payload: TaskScope): string[] {
  const union: string[] = [];
  for (const f of [...(payload.created ?? []), ...(payload.modified ?? [])]) {
    if (!union.includes(f)) union.push(f);
  }
  return union;
}
