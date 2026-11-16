// fix-predicate——fix 判别单源谓词（圆桌处方 5：claim/T3/settle/checkpoints 四消费点共用）。
// 独立单点模块：settlement-repo（db 层）运行时消费本谓词——若经 query.ts 即形成
// domain⇄db 运行时环（arch 终审 HIGH 判例）；本模块对 query 仅 type-only 反向，运行时零边。
import type { TaskStorageRow } from "./query.js";

/** isFixTask——fix 判别单源谓词（SQL 面 = fix_of_task_id IS NOT NULL） */
export function isFixTask(row: Pick<TaskStorageRow, "fix_of_task_id">): boolean {
  return row.fix_of_task_id !== null;
}
